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

interface TestConductedRowInput {
  testCaseNumber?: string;
  testRunItemId?: number;
  testRunUrl?: string;
  testCaseId?: number;
  testCaseName?: string;
  startTime?: string;
  stopTime?: string;
  title?: string;
  redlinesOptionId?: number;
  redlinesOptionName?: string;
  statusOptionId?: number;
  statusOptionName?: string;
  associatedPtr?: string;
  comments?: string;
}

interface PtrRowInput {
  ptrItemId?: number;
  ptrTitle?: string;
  ptrNumber?: string;
  requirement?: string;
  description?: string;
}

interface AbcTestLogDetailsInput {
  testPhase?: string;
  testLocation?: string;
  startDateTime?: string;
  endDateTime?: string;
  systemBaselineIdentifier?: string;
  systemStatus?: string;
  testConductor?: string;
  testParticipants?: string;
  overallSummary?: string;
  planForNextShift?: string;
  ptrRows?: PtrRowInput[];
  testConductedRows?: TestConductedRowInput[];
}

interface CreatedDailyTestLog {
  item: CbItem;
  readback: CbItem;
  missingFieldIds: number[];
  mismatchedFieldIds: number[];
}

const ABC_TEST_LOG_FIELDS = {
  testPhase: 3,
  startDateTime: 8,
  endDateTime: 9,
  overallSummary: 80,
  testLocation: 10001,
  systemBaselineIdentifier: 10002,
  systemStatus: 10003,
  testConductor: 10004,
  testParticipants: 10005,
  planForNextShift: 10006,
  ptrList: 1000000,
  testConducted: 2000000,
} as const;

const ABC_PTR_COLUMNS = {
  ptrNumber: 1000001,
  ptrTitle: 1000002,
  ptrDescription: 1000003,
  requirement: 1000004,
  ptrData: 1000005,
} as const;

const ABC_TEST_CONDUCTED_COLUMNS = {
  testCaseNumber: 2000001,
  title: 2000002,
  redlines: 2000003,
  status: 2000004,
  comments: 2000007,
  startTime: 2000008,
  stopTime: 2000009,
  associatedPtr: 2000010,
  testCase: 2000011,
  testRun: 2000012,
} as const;

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
    start: `${date} 00:00:00`,
    end: `${nextDay(date)} 00:00:00`,
  };
}

function cbqlDateLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
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

function textField(fieldId: number, name: string, value: string | undefined, type = "TextFieldValue"): TestLogCustomFieldInput | undefined {
  if (value === undefined || value === "") return undefined;
  return { fieldId, type, value };
}

function choiceValue(id: number | undefined, name: string | undefined): Array<{ id: number; name?: string; type: string }> | undefined {
  if (id === undefined) return undefined;
  return [{ id, ...(name !== undefined ? { name } : {}), type: "ChoiceOptionReference" }];
}

function trackerItemValue(id: number | undefined, name: string | undefined): Array<{ id: number; name?: string; type: string }> | undefined {
  if (id === undefined) return undefined;
  return [{ id, ...(name !== undefined ? { name } : {}), type: "TrackerItemReference" }];
}

function tableCell(
  fieldId: number,
  name: string,
  type: string,
  value: string | undefined,
): { fieldId: number; name: string; type: string; value: string } | undefined {
  if (value === undefined || value === "") return undefined;
  return { fieldId, name, type, value };
}

function tableChoiceCell(
  fieldId: number,
  name: string,
  values: unknown[] | undefined,
): { fieldId: number; name: string; type: string; values: unknown[] } | undefined {
  if (values === undefined || values.length === 0) return undefined;
  return { fieldId, name, type: "ChoiceFieldValue", values };
}

function buildPtrListField(rows: PtrRowInput[] | undefined): TestLogCustomFieldInput | undefined {
  if (!rows || rows.length === 0) return undefined;
  return {
    fieldId: ABC_TEST_LOG_FIELDS.ptrList,
    type: "TableFieldValue",
    values: rows.map((row) => [
      tableChoiceCell(
        ABC_PTR_COLUMNS.ptrData,
        "PTR data",
        trackerItemValue(row.ptrItemId, row.ptrTitle),
      ),
      tableCell(ABC_PTR_COLUMNS.ptrNumber, "PTR #", "TextFieldValue", row.ptrNumber ?? (row.ptrItemId !== undefined ? String(row.ptrItemId) : undefined)),
      tableCell(ABC_PTR_COLUMNS.ptrTitle, "PTR Title", "TextFieldValue", row.ptrTitle),
      tableCell(ABC_PTR_COLUMNS.requirement, "Requirement", "TextFieldValue", row.requirement),
      tableCell(ABC_PTR_COLUMNS.ptrDescription, "PTR Description", "WikiTextFieldValue", row.description),
    ].filter((cell) => cell !== undefined)),
  };
}

function buildTestConductedField(rows: TestConductedRowInput[] | undefined): TestLogCustomFieldInput | undefined {
  if (!rows || rows.length === 0) return undefined;
  return {
    fieldId: ABC_TEST_LOG_FIELDS.testConducted,
    type: "TableFieldValue",
    values: rows.map((row) => [
      tableCell(ABC_TEST_CONDUCTED_COLUMNS.testCaseNumber, "Test Case Number", "TextFieldValue", row.testCaseNumber ?? (row.testRunItemId !== undefined ? String(row.testRunItemId) : undefined)),
      tableCell(ABC_TEST_CONDUCTED_COLUMNS.testRun, "Test Run", "UrlFieldValue", row.testRunUrl ?? (row.testRunItemId !== undefined ? `[ISSUE:${row.testRunItemId}]` : undefined)),
      tableChoiceCell(
        ABC_TEST_CONDUCTED_COLUMNS.testCase,
        "Test Case",
        trackerItemValue(row.testCaseId, row.testCaseName),
      ),
      tableCell(ABC_TEST_CONDUCTED_COLUMNS.startTime, "Start Time", "TextFieldValue", row.startTime),
      tableCell(ABC_TEST_CONDUCTED_COLUMNS.stopTime, "Stop Time", "TextFieldValue", row.stopTime),
      tableCell(ABC_TEST_CONDUCTED_COLUMNS.title, "Test Case Titile", "TextFieldValue", row.title ?? row.testCaseName),
      tableChoiceCell(
        ABC_TEST_CONDUCTED_COLUMNS.redlines,
        "Test Case Redlines",
        choiceValue(row.redlinesOptionId, row.redlinesOptionName),
      ),
      tableChoiceCell(
        ABC_TEST_CONDUCTED_COLUMNS.status,
        "Test Case Status",
        choiceValue(row.statusOptionId, row.statusOptionName),
      ),
      tableCell(ABC_TEST_CONDUCTED_COLUMNS.associatedPtr, "Associated PTR", "TextFieldValue", row.associatedPtr),
      tableCell(ABC_TEST_CONDUCTED_COLUMNS.comments, "Test Case Comments", "WikiTextFieldValue", row.comments),
    ].filter((cell) => cell !== undefined)),
  };
}

function buildAbcTestLogCustomFields(details: AbcTestLogDetailsInput | undefined): TestLogCustomFieldInput[] {
  if (!details) return [];
  return [
    textField(ABC_TEST_LOG_FIELDS.testPhase, "Test Phase", details.testPhase),
    textField(ABC_TEST_LOG_FIELDS.testLocation, "Test Location", details.testLocation),
    textField(ABC_TEST_LOG_FIELDS.startDateTime, "Start Date and Time", details.startDateTime, "DateFieldValue"),
    textField(ABC_TEST_LOG_FIELDS.endDateTime, "End Date and Time", details.endDateTime, "DateFieldValue"),
    textField(ABC_TEST_LOG_FIELDS.systemBaselineIdentifier, "System Baseline Identifier", details.systemBaselineIdentifier),
    textField(ABC_TEST_LOG_FIELDS.systemStatus, "System Status", details.systemStatus),
    textField(ABC_TEST_LOG_FIELDS.testConductor, "Test Conductor", details.testConductor),
    textField(ABC_TEST_LOG_FIELDS.testParticipants, "Test Participant(s):", details.testParticipants),
    textField(ABC_TEST_LOG_FIELDS.overallSummary, "Overall Summary", details.overallSummary, "WikiTextFieldValue"),
    textField(ABC_TEST_LOG_FIELDS.planForNextShift, "Plan for next Shift", details.planForNextShift, "WikiTextFieldValue"),
    buildPtrListField(details.ptrRows),
    buildTestConductedField(details.testConductedRows),
  ].filter((field) => field !== undefined);
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
        `${options.dateField} >= ${cbqlDateLiteral(window.start)} AND ` +
        `${options.dateField} < ${cbqlDateLiteral(window.end)}`;
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
  return fields
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
      ...(fieldPage.editableTableFields ?? []),
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
    abcTestLogDetails?: AbcTestLogDetailsInput;
  },
): Promise<CreatedDailyTestLog> {
  const project = await client.getProject(options.projectId);
  const customFields = [
    ...buildAbcTestLogCustomFields(options.abcTestLogDetails),
    ...(options.customFields ?? []),
  ];
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
      ...(customFields.length > 0 ? { customFields } : {}),
    },
    options.parentId,
  );
  const readback = await client.getItem(item.id);
  const readbackFieldsById = new Map(
    readback.customFields?.map((field) => [field.fieldId, field]) ?? [],
  );
  const missingFieldIds = customFields
    .map((field) => field.fieldId)
    .filter((fieldId) => !readbackFieldsById.has(fieldId));
  const mismatchedFieldIds = customFields
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
        abcTestLogDetails: z
          .object({
            testPhase: z.string().optional(),
            testLocation: z.string().optional(),
            startDateTime: z.string().optional(),
            endDateTime: z.string().optional(),
            systemBaselineIdentifier: z.string().optional(),
            systemStatus: z.string().optional(),
            testConductor: z.string().optional(),
            testParticipants: z.string().optional(),
            overallSummary: z.string().optional(),
            planForNextShift: z.string().optional(),
            ptrRows: z
              .array(
                z.object({
                  ptrItemId: z.number().int().positive().optional(),
                  ptrTitle: z.string().optional(),
                  ptrNumber: z.string().optional(),
                  requirement: z.string().optional(),
                  description: z.string().optional(),
                }),
              )
              .optional(),
            testConductedRows: z
              .array(
                z.object({
                  testCaseNumber: z.string().optional(),
                  testRunItemId: z.number().int().positive().optional(),
                  testRunUrl: z.string().optional(),
                  testCaseId: z.number().int().positive().optional(),
                  testCaseName: z.string().optional(),
                  startTime: z.string().optional(),
                  stopTime: z.string().optional(),
                  title: z.string().optional(),
                  redlinesOptionId: z.number().int().positive().optional(),
                  redlinesOptionName: z.string().optional(),
                  statusOptionId: z.number().int().positive().optional(),
                  statusOptionName: z.string().optional(),
                  associatedPtr: z.string().optional(),
                  comments: z.string().optional(),
                }),
              )
              .optional(),
          })
          .optional()
          .describe("Optional high-level ABC Test Log fields mapped to the known Test Log schema, including PTR List and Test Conducted table rows."),
      },
    },
    async ({ projectId, testLogTrackerId, date, reportMarkdown, name, statusId, priorityId, assignedToIds, parentId, customFields, abcTestLogDetails }) => {
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
        abcTestLogDetails,
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
