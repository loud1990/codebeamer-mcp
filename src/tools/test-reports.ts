import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  CbItem,
  CbProject,
  CbReference,
  CbTracker,
  CbTrackerField,
  CodebeamerClient,
} from "../client/codebeamer-client.js";
import { formatItem } from "../formatters/item-formatter.js";
import {
  formatDailyTestReport,
  formatTestLogSchemaAnalysis,
  type DailyTestReport,
  type ObservedTestLogField,
  type ProjectDailyTestReport,
  type TestLogSchemaAnalysis,
  type TestReportNode,
  type TestStepResult,
} from "../formatters/test-report-formatter.js";

interface TestLogCustomFieldInput {
  fieldId: number;
  type: string;
  value?: unknown;
  values?: unknown[];
}

interface CreatedDailyTestLog {
  item: CbItem;
  readback: CbItem;
  missingFieldIds: number[];
  mismatchedFieldIds: number[];
}

interface DateWindow {
  start: string;
  end: string;
}

function nextDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + 1));
  return utc.toISOString().slice(0, 10);
}

function dateWindow(date: string): DateWindow {
  return {
    start: `${date}T00:00:00`,
    end: `${nextDay(date)}T00:00:00`,
  };
}

function isTestRunTracker(tracker: CbTracker): boolean {
  const type = tracker.type?.name?.toLowerCase();
  const name = tracker.name.toLowerCase();
  const key = tracker.keyName?.toLowerCase();
  return (
    type === "testrun" ||
    name === "test runs" ||
    name === "test run" ||
    key === "testrun"
  );
}

function findFieldValue(item: CbItem, names: string[]): unknown {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const field = item.customFields?.find((customField) =>
    wanted.has(customField.name.toLowerCase()),
  );
  if (!field) return undefined;
  if (field.value !== undefined) return field.value;
  if (field.values && field.values.length > 0) return field.values;
  return undefined;
}

function formatUnknownValue(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map(formatUnknownValue).filter(Boolean).join(", ") || undefined;
  }
  if (typeof value === "object" && "name" in value) {
    return String((value as { name: unknown }).name);
  }
  return String(value);
}

function fieldHasValue(field: { value?: unknown; values?: unknown[] }): boolean {
  if (field.values !== undefined) return field.values.length > 0;
  if (field.value === undefined || field.value === null) return false;
  if (typeof field.value === "string") return field.value.trim().length > 0;
  return true;
}

function comparableJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function fieldValueMatches(
  expected: TestLogCustomFieldInput,
  actual: { value?: unknown; values?: unknown[] },
): boolean {
  if (expected.values !== undefined) {
    return comparableJson(actual.values) === comparableJson(expected.values);
  }
  if (expected.value !== undefined) {
    return comparableJson(actual.value) === comparableJson(expected.value);
  }
  return true;
}

function extractResult(item: CbItem): string | undefined {
  return (
    formatUnknownValue(findFieldValue(item, ["Result", "Test Run Result", "Verdict"])) ??
    item.status?.name
  );
}

function getColumn(row: unknown[], name: string): string | undefined {
  const column = row.find((entry) => {
    if (!entry || typeof entry !== "object") return false;
    return (entry as { name?: unknown }).name === name;
  });
  if (!column || typeof column !== "object") return undefined;
  return formatUnknownValue((column as { value?: unknown }).value);
}

function extractStepResults(item: CbItem): TestStepResult[] {
  const fields = item.customFields ?? [];
  const stepField = fields.find((field) => {
    const name = field.name.toLowerCase();
    return name === "test step results" || name === "test steps";
  });

  const rows = Array.isArray(stepField?.values) ? stepField.values : [];
  return rows
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => ({
      action: getColumn(row, "Action"),
      expected: getColumn(row, "Expected result"),
      critical: getColumn(row, "Critical"),
      actual: getColumn(row, "Actual result"),
      result: getColumn(row, "Result"),
    }));
}

async function listAllProjects(
  client: CodebeamerClient,
  pageSize: number,
): Promise<CbProject[]> {
  const projects: CbProject[] = [];
  for (let page = 1; ; page += 1) {
    const chunk = await client.listProjects(page, pageSize);
    projects.push(...chunk);
    if (chunk.length < pageSize) return projects;
  }
}

async function listAllTrackers(
  client: CodebeamerClient,
  projectId: number,
  pageSize: number,
): Promise<CbTracker[]> {
  const trackers: CbTracker[] = [];
  for (let page = 1; ; page += 1) {
    const chunk = await client.listTrackers(projectId, page, pageSize);
    trackers.push(...chunk);
    if (chunk.length < pageSize) return trackers;
  }
}

async function searchAllItems(
  client: CodebeamerClient,
  query: string,
  pageSize: number,
): Promise<CbItem[]> {
  const items: CbItem[] = [];
  for (let page = 1; ; page += 1) {
    const chunk = await client.searchItems(query, page, pageSize);
    items.push(...chunk);
    if (chunk.length < pageSize) return items;
  }
}

async function getAllItemChildren(
  client: CodebeamerClient,
  itemId: number,
  pageSize: number,
): Promise<CbReference[]> {
  const children: CbReference[] = [];
  for (let page = 1; ; page += 1) {
    const chunk = await client.getItemChildren(itemId, page, pageSize);
    children.push(...chunk);
    if (chunk.length < pageSize) return children;
  }
}

async function buildNode(
  client: CodebeamerClient,
  itemRef: CbReference,
  parentId: number | undefined,
  depth: number,
  maxDepth: number,
  pageSize: number,
  visited: Set<number>,
): Promise<TestReportNode> {
  const item = await client.getItem(itemRef.id);
  const node: TestReportNode = {
    item,
    parentId,
    depth,
    result: extractResult(item),
    stepResults: extractStepResults(item),
    children: [],
  };

  if (depth >= maxDepth || visited.has(item.id)) {
    return node;
  }

  visited.add(item.id);
  const children = await getAllItemChildren(client, item.id, pageSize);
  for (const child of children) {
    node.children.push(
      await buildNode(client, child, item.id, depth + 1, maxDepth, pageSize, visited),
    );
  }

  return node;
}

async function resolveProjectReports(
  client: CodebeamerClient,
  projectIds: number[] | undefined,
  testRunTrackerIds: number[] | undefined,
  pageSize: number,
): Promise<Array<{ project: CbProject; trackers: CbTracker[]; warnings: string[] }>> {
  if (testRunTrackerIds && testRunTrackerIds.length > 0) {
    const trackers = await Promise.all(testRunTrackerIds.map((id) => client.getTracker(id)));
    const projectMap = new Map<number, { project: CbProject; trackers: CbTracker[]; warnings: string[] }>();

    for (const tracker of trackers) {
      const projectRef = tracker.project;
      const projectId = projectRef?.id ?? 0;
      if (projectIds && projectRef?.id && !projectIds.includes(projectRef.id)) continue;
      const entry = projectMap.get(projectId) ?? {
        project: {
          id: projectId,
          name: projectRef?.name ?? `Project ${projectId || "unknown"}`,
        },
        trackers: [],
        warnings: [],
      };
      entry.trackers.push(tracker);
      projectMap.set(projectId, entry);
    }

    return [...projectMap.values()];
  }

  const projects = projectIds
    ? await Promise.all(projectIds.map((id) => client.getProject(id)))
    : await listAllProjects(client, pageSize);

  const reports: Array<{ project: CbProject; trackers: CbTracker[]; warnings: string[] }> = [];
  for (const project of projects) {
    const trackers = await listAllTrackers(client, project.id, pageSize);
    const testRunTrackers = trackers.filter(isTestRunTracker);
    const warnings = testRunTrackers.length === 0
      ? [`No Test Run tracker found for project ${project.name} (${project.id}).`]
      : [];
    reports.push({ project, trackers: testRunTrackers, warnings });
  }

  return reports;
}

export async function generateDailyTestReport(
  client: CodebeamerClient,
  options: {
    date: string;
    timezone?: string;
    projectIds?: number[];
    testRunTrackerIds?: number[];
    dateField: string;
    maxDepth: number;
    pageSize: number;
  },
): Promise<DailyTestReport> {
  const window = dateWindow(options.date);
  const projectInputs = await resolveProjectReports(
    client,
    options.projectIds,
    options.testRunTrackerIds,
    options.pageSize,
  );

  const projects: ProjectDailyTestReport[] = [];
  for (const projectInput of projectInputs) {
    const projectReport: ProjectDailyTestReport = {
      project: projectInput.project,
      tracker: projectInput.trackers[0],
      testRuns: [],
      warnings: [...projectInput.warnings],
    };

    if (projectInput.trackers.length > 1) {
      projectReport.warnings.push(
        `Multiple Test Run trackers included: ${projectInput.trackers.map((tracker) => `${tracker.name} (${tracker.id})`).join(", ")}.`,
      );
    }

    for (const tracker of projectInput.trackers) {
      const query =
        `tracker.id IN (${tracker.id}) AND ` +
        `${options.dateField} >= "${window.start}" AND ` +
        `${options.dateField} < "${window.end}"`;
      const testRuns = await searchAllItems(client, query, options.pageSize);
      for (const testRun of testRuns) {
        projectReport.testRuns.push(
          await buildNode(
            client,
            testRun,
            undefined,
            0,
            options.maxDepth,
            options.pageSize,
            new Set<number>(),
          ),
        );
      }
    }

    projects.push(projectReport);
  }

  return {
    date: options.date,
    timezone: options.timezone,
    dateField: options.dateField,
    start: window.start,
    end: window.end,
    projects,
  };
}

function mergeObservedField(
  observedById: Map<number, ObservedTestLogField>,
  exampleItemId: number,
  field: { fieldId: number; name: string; type?: string; value?: unknown; values?: unknown[] },
): void {
  const existing = observedById.get(field.fieldId);
  if (existing) {
    existing.exampleItemIds.push(exampleItemId);
    if (existing.sampleValue === undefined && field.value !== undefined) {
      existing.sampleValue = field.value;
    }
    if (existing.sampleValues === undefined && field.values !== undefined) {
      existing.sampleValues = field.values;
    }
    return;
  }

  observedById.set(field.fieldId, {
    fieldId: field.fieldId,
    name: field.name,
    type: field.type,
    exampleItemIds: [exampleItemId],
    sampleValue: field.value,
    sampleValues: field.values,
  });
}

function suggestedType(field: CbTrackerField, observed?: ObservedTestLogField): string {
  return observed?.type ?? field.valueModel ?? field.type ?? "TextFieldValue";
}

function createSuggestedCustomFields(
  fields: CbTrackerField[],
  observedFields: ObservedTestLogField[],
): TestLogCustomFieldInput[] {
  const observedById = new Map(observedFields.map((field) => [field.fieldId, field]));
  const supported = fields.filter((field) => field.trackerItemField === "customFields" || field.fieldId >= 1000);
  return supported
    .filter((field) => field.required || observedById.has(field.fieldId))
    .map((field) => {
      const observed = observedById.get(field.fieldId);
      const customField: TestLogCustomFieldInput = {
        fieldId: field.fieldId,
        type: suggestedType(field, observed),
      };
      if (observed?.sampleValues !== undefined) customField.values = observed.sampleValues;
      else if (observed?.sampleValue !== undefined) customField.value = observed.sampleValue;
      return customField;
    });
}

export async function analyzeTestLogSchema(
  client: CodebeamerClient,
  options: {
    testLogTrackerId: number;
    exampleItemIds: number[];
  },
): Promise<TestLogSchemaAnalysis> {
  const [tracker, fields] = await Promise.all([
    client.getTracker(options.testLogTrackerId),
    client.getTrackerFields(options.testLogTrackerId),
  ]);
  const observedById = new Map<number, ObservedTestLogField>();

  for (const exampleItemId of options.exampleItemIds) {
    const fieldPage = await client.getItemFields(exampleItemId);
    const allFields = [
      ...(fieldPage.editableFields ?? []),
      ...(fieldPage.readOnlyFields ?? []),
      ...(fieldPage.fields ?? []),
    ];
    for (const field of allFields) {
      if (field.fieldId <= 0) continue;
      if (!fieldHasValue(field)) continue;
      mergeObservedField(observedById, exampleItemId, field);
    }
  }

  const observedFields = [...observedById.values()].sort((a, b) => a.fieldId - b.fieldId);
  const requiredFields = fields.filter((field) => field.required);
  const observedFieldIds = new Set(observedFields.map((field) => field.fieldId));
  const warnings = requiredFields
    .filter((field) => !observedFieldIds.has(field.fieldId))
    .map((field) => `Required field ${field.name} (${field.fieldId}) was not populated in the example items.`);

  return {
    tracker,
    fields,
    observedFields,
    requiredFields,
    suggestedCustomFields: createSuggestedCustomFields(fields, observedFields),
    warnings,
  };
}

export async function createDailyTestLog(
  client: CodebeamerClient,
  options: {
    projectId: number;
    testLogTrackerId: number;
    date: string;
    reportMarkdown: string;
    name?: string;
    statusId?: number;
    priorityId?: number;
    assignedToIds?: number[];
    parentId?: number;
    customFields?: TestLogCustomFieldInput[];
  },
): Promise<CreatedDailyTestLog> {
  const project = await client.getProject(options.projectId);
  const item = await client.createItem(
    options.testLogTrackerId,
    {
      name: options.name ?? `Daily Test Log - ${options.date} - ${project.name}`,
      description: options.reportMarkdown,
      ...(options.statusId !== undefined ? { status: { id: options.statusId } } : {}),
      ...(options.priorityId !== undefined ? { priority: { id: options.priorityId } } : {}),
      ...(options.assignedToIds !== undefined
        ? { assignedTo: options.assignedToIds.map((id) => ({ id })) }
        : {}),
      ...(options.customFields !== undefined ? { customFields: options.customFields } : {}),
    },
    options.parentId,
  );
  const readback = await client.getItem(item.id);
  const readbackFieldsById = new Map(
    readback.customFields?.map((field) => [field.fieldId, field]) ?? [],
  );
  const missingFieldIds = (options.customFields ?? [])
    .map((field) => field.fieldId)
    .filter((fieldId) => !readbackFieldsById.has(fieldId));
  const mismatchedFieldIds = (options.customFields ?? [])
    .filter((field) => {
      const readbackField = readbackFieldsById.get(field.fieldId);
      return readbackField !== undefined && !fieldValueMatches(field, readbackField);
    })
    .map((field) => field.fieldId);
  return { item, readback, missingFieldIds, mismatchedFieldIds };
}

export function registerTestReportTools(
  server: McpServer,
  client: CodebeamerClient,
): void {
  server.registerTool(
    "generate_daily_test_report",
    {
      title: "Generate Daily Test Report",
      description:
        "Generate a read-only daily test report from Test Run tracker items. " +
        "Finds Test Run trackers, searches runs for the date window, recursively fetches child run items, and formats a Markdown report.",
      inputSchema: {
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .describe("Report date in YYYY-MM-DD format"),
        timezone: z
          .string()
          .optional()
          .describe("Timezone label for the report, e.g. America/New_York"),
        projectIds: z
          .array(z.number().int().positive())
          .optional()
          .describe("Optional project IDs. If omitted, all projects are scanned."),
        testRunTrackerIds: z
          .array(z.number().int().positive())
          .optional()
          .describe("Optional explicit Test Run tracker IDs. Overrides tracker discovery."),
        dateField: z
          .string()
          .regex(/^[A-Za-z][A-Za-z0-9_.]*$/)
          .default("modifiedAt")
          .describe("cbQL date field used for the daily window, default modifiedAt"),
        maxDepth: z
          .number()
          .int()
          .min(0)
          .max(20)
          .default(5)
          .describe("Maximum child recursion depth"),
        pageSize: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(50)
          .describe("Items per page for searches and child traversal"),
      },
    },
    async ({ date, timezone, projectIds, testRunTrackerIds, dateField, maxDepth, pageSize }) => {
      const report = await generateDailyTestReport(client, {
        date,
        timezone,
        projectIds,
        testRunTrackerIds,
        dateField,
        maxDepth,
        pageSize,
      });
      return {
        content: [{ type: "text", text: formatDailyTestReport(report) }],
      };
    },
  );

  server.registerTool(
    "analyze_test_log_schema",
    {
      title: "Analyze Test Log Schema",
      description:
        "Analyze a Test Log tracker and manually created example Test Log items. " +
        "Returns required fields, observed populated fields, and a suggested customFields payload for create_daily_test_log.",
      inputSchema: {
        testLogTrackerId: z
          .number()
          .int()
          .positive()
          .describe("Tracker ID of the Test Log tracker"),
        exampleItemIds: z
          .array(z.number().int().positive())
          .min(1)
          .describe("Known-good manually created Test Log item IDs to use as examples"),
      },
    },
    async ({ testLogTrackerId, exampleItemIds }) => {
      const analysis = await analyzeTestLogSchema(client, {
        testLogTrackerId,
        exampleItemIds,
      });
      return {
        content: [{ type: "text", text: formatTestLogSchemaAnalysis(analysis) }],
      };
    },
  );

  server.registerTool(
    "create_daily_test_log",
    {
      title: "Create Daily Test Log",
      description:
        "Create a Test Log tracker item from a reviewed daily test report. " +
        "This tool writes to Codebeamer and does not regenerate the report.",
      inputSchema: {
        projectId: z
          .number()
          .int()
          .positive()
          .describe("Project ID the log belongs to; used for the default title"),
        testLogTrackerId: z
          .number()
          .int()
          .positive()
          .describe("Tracker ID where the Test Log item should be created"),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .describe("Report date in YYYY-MM-DD format"),
        reportMarkdown: z
          .string()
          .min(1)
          .describe("Markdown report body to store as the item description"),
        name: z
          .string()
          .min(1)
          .optional()
          .describe("Optional item title override"),
        statusId: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Optional initial status ID"),
        priorityId: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Optional priority ID"),
        assignedToIds: z
          .array(z.number().int().positive())
          .optional()
          .describe("Optional user IDs to assign"),
        parentId: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Optional parent item ID for nesting"),
        customFields: z
          .array(
            z.object({
              fieldId: z.number().int().positive(),
              type: z.string().min(1),
              value: z.unknown().optional(),
              values: z.array(z.unknown()).optional(),
            }),
          )
          .optional()
          .describe("Optional Codebeamer custom field payloads. Use analyze_test_log_schema to discover field IDs and value models."),
      },
    },
    async ({ projectId, testLogTrackerId, date, reportMarkdown, name, statusId, priorityId, assignedToIds, parentId, customFields }) => {
      const result = await createDailyTestLog(client, {
        projectId,
        testLogTrackerId,
        date,
        reportMarkdown,
        name,
        statusId,
        priorityId,
        assignedToIds,
        parentId,
        customFields,
      });
      const verificationMessages: string[] = [];
      if (result.missingFieldIds.length > 0) {
        verificationMessages.push(`Missing custom field IDs on readback: ${result.missingFieldIds.join(", ")}`);
      }
      if (result.mismatchedFieldIds.length > 0) {
        verificationMessages.push(`Custom field values differed on readback: ${result.mismatchedFieldIds.join(", ")}`);
      }
      const verification = verificationMessages.length === 0
        ? "All provided custom field IDs and values were present on readback."
        : verificationMessages.join(" ");
      return {
        content: [
          {
            type: "text",
            text: `${formatItem(result.readback)}\n\n---\n**Readback verification:** ${verification}`,
          },
        ],
      };
    },
  );
}
