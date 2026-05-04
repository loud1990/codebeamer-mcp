import type {
  CbEditableField,
  CbItem,
  CbProject,
  CbTracker,
  CbTrackerField,
} from "../client/codebeamer-client.js";

export interface TestStepResult {
  action?: string;
  expected?: string;
  critical?: string;
  actual?: string;
  result?: string;
}

export interface TestReportNode {
  item: CbItem;
  parentId?: number;
  depth: number;
  result?: string;
  stepResults: TestStepResult[];
  children: TestReportNode[];
}

export interface ProjectDailyTestReport {
  project: CbProject;
  tracker?: CbTracker;
  testRuns: TestReportNode[];
  warnings: string[];
}

export interface DailyTestReportDiagnostics {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  projectsScanned: number;
  trackersScanned: number;
  testRunsFound: number;
  nodesFetched: number;
  childListsFetched: number;
  searchPagesFetched: number;
  maxDepth: number;
  pageSize: number;
  maxTestRuns?: number;
  queries: Array<{
    trackerId: number;
    query: string;
    pages: number;
    results: number;
    durationMs: number;
    limited?: boolean;
  }>;
  events: string[];
}

export interface DailyTestReport {
  date: string;
  timezone?: string;
  dateField: string;
  start: string;
  end: string;
  projects: ProjectDailyTestReport[];
  diagnostics?: DailyTestReportDiagnostics;
}

export interface ObservedTestLogField {
  fieldId: number;
  name: string;
  type?: string;
  exampleItemIds: number[];
  sampleValue?: unknown;
  sampleValues?: unknown[];
}

export interface TestLogSchemaAnalysis {
  tracker: CbTracker;
  fields: CbTrackerField[];
  observedFields: ObservedTestLogField[];
  requiredFields: CbTrackerField[];
  suggestedCustomFields: Array<{
    fieldId: number;
    type: string;
    value?: unknown;
    values?: unknown[];
  }>;
  warnings: string[];
}

interface Counts {
  testRuns: number;
  childItems: number;
  passed: number;
  failed: number;
  blocked: number;
  notRun: number;
  other: number;
}

function escapeCell(value: unknown): string {
  if (value === undefined || value === null || value === "") return "-";
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function normalizeResult(result?: string): keyof Omit<Counts, "testRuns" | "childItems"> {
  const normalized = result?.trim().toUpperCase().replace(/[\s_-]+/g, "");
  if (!normalized) return "other";
  if (["PASS", "PASSED", "SUCCESSFUL", "OK"].includes(normalized)) return "passed";
  if (["FAIL", "FAILED", "ERROR"].includes(normalized)) return "failed";
  if (["BLOCK", "BLOCKED"].includes(normalized)) return "blocked";
  if (["NOTRUN", "NOTEXECUTED", "UNRUN", "SKIPPED", "TODO"].includes(normalized)) return "notRun";
  return "other";
}

function countNode(node: TestReportNode, counts: Counts, isRoot: boolean): void {
  if (isRoot) counts.testRuns += 1;
  else counts.childItems += 1;

  counts[normalizeResult(node.result)] += 1;

  for (const child of node.children) {
    countNode(child, counts, false);
  }
}

function countProject(project: ProjectDailyTestReport): Counts {
  const counts: Counts = {
    testRuns: 0,
    childItems: 0,
    passed: 0,
    failed: 0,
    blocked: 0,
    notRun: 0,
    other: 0,
  };

  for (const testRun of project.testRuns) {
    countNode(testRun, counts, true);
  }

  return counts;
}

function addNodeRows(node: TestReportNode, rows: string[]): void {
  rows.push(
    `| ${node.depth} | ${node.item.id} | ${node.parentId ?? "-"} | ${escapeCell(node.item.name)} | ${escapeCell(node.item.status?.name)} | ${escapeCell(node.result)} |`,
  );

  for (const child of node.children) {
    addNodeRows(child, rows);
  }
}

function addStepRows(node: TestReportNode, rows: string[]): void {
  node.stepResults.forEach((step, index) => {
    rows.push(
      `| ${node.item.id} | ${index + 1} | ${escapeCell(step.action)} | ${escapeCell(step.expected)} | ${escapeCell(step.actual)} | ${escapeCell(step.result)} |`,
    );
  });

  for (const child of node.children) {
    addStepRows(child, rows);
  }
}

export function formatDailyTestReport(report: DailyTestReport): string {
  const lines: string[] = [
    `# Daily Test Report - ${report.date}`,
    "",
    `- **Date window:** ${report.start} to ${report.end}`,
    `- **Date field:** ${report.dateField}`,
  ];

  if (report.timezone) {
    lines.push(`- **Timezone:** ${report.timezone}`);
  }

  if (report.diagnostics) {
    const diagnostics = report.diagnostics;
    lines.push(
      "",
      "## Diagnostics",
      "",
      `- **Started:** ${diagnostics.startedAt}`,
      `- **Finished:** ${diagnostics.finishedAt}`,
      `- **Duration:** ${diagnostics.durationMs} ms`,
      `- **Projects scanned:** ${diagnostics.projectsScanned}`,
      `- **Trackers scanned:** ${diagnostics.trackersScanned}`,
      `- **Test runs found:** ${diagnostics.testRunsFound}`,
      `- **Nodes fetched:** ${diagnostics.nodesFetched}`,
      `- **Child lists fetched:** ${diagnostics.childListsFetched}`,
      `- **Search pages fetched:** ${diagnostics.searchPagesFetched}`,
      `- **Max depth:** ${diagnostics.maxDepth}`,
      `- **Page size:** ${diagnostics.pageSize}`,
    );
    if (diagnostics.maxTestRuns !== undefined) {
      lines.push(`- **Max test runs:** ${diagnostics.maxTestRuns}`);
    }
    if (diagnostics.queries.length > 0) {
      lines.push("", "### Queries", "");
      lines.push("| Tracker | Results | Pages | Duration | Query |");
      lines.push("|---:|---:|---:|---:|---|");
      for (const query of diagnostics.queries) {
        lines.push(
          `| ${query.trackerId} | ${query.results}${query.limited ? " (limited)" : ""} | ${query.pages} | ${query.durationMs} ms | ${escapeCell(query.query)} |`,
        );
      }
    }
    if (diagnostics.events.length > 0) {
      lines.push("", "### Events", "");
      for (const event of diagnostics.events) {
        lines.push(`- ${event}`);
      }
    }
  }

  const projectCounts = report.projects.map((project) => ({
    project,
    counts: countProject(project),
  }));

  lines.push(
    "",
    "## Summary",
    "",
    "| Project | Test Runs | Child Items | Passed | Failed | Blocked | Not Run | Other |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
  );

  for (const { project, counts } of projectCounts) {
    lines.push(
      `| ${escapeCell(project.project.name)} (${project.project.id}) | ${counts.testRuns} | ${counts.childItems} | ${counts.passed} | ${counts.failed} | ${counts.blocked} | ${counts.notRun} | ${counts.other} |`,
    );
  }

  for (const { project } of projectCounts) {
    lines.push("", `## ${project.project.name} (${project.project.id})`, "");

    if (project.tracker) {
      lines.push(`Test Run tracker: ${project.tracker.name} (${project.tracker.id})`, "");
    }

    if (project.warnings.length > 0) {
      lines.push("### Warnings", "");
      for (const warning of project.warnings) {
        lines.push(`- ${warning}`);
      }
      lines.push("");
    }

    if (project.testRuns.length === 0) {
      lines.push("_No test runs found for this date window._");
      continue;
    }

    for (const testRun of project.testRuns) {
      lines.push(
        `### Test Run ${testRun.item.id}: ${testRun.item.name}`,
        "",
        `- **Status:** ${testRun.item.status?.name ?? "?"}`,
        `- **Priority:** ${testRun.item.priority?.name ?? "?"}`,
        `- **Assigned to:** ${testRun.item.assignedTo?.map((u) => u.name).join(", ") || "unassigned"}`,
        `- **Created:** ${testRun.item.createdAt ?? "?"}`,
        `- **Updated:** ${testRun.item.updatedAt ?? "?"}`,
        `- **Result:** ${testRun.result ?? "-"}`,
        "",
        "| Depth | ID | Parent | Name | Status | Result |",
        "|---:|---:|---:|---|---|---|",
      );

      const nodeRows: string[] = [];
      addNodeRows(testRun, nodeRows);
      lines.push(...nodeRows);

      const stepRows: string[] = [];
      addStepRows(testRun, stepRows);
      if (stepRows.length > 0) {
        lines.push(
          "",
          "#### Test Step Results",
          "",
          "| Item | Step | Action | Expected | Actual | Result |",
          "|---:|---:|---|---|---|---|",
          ...stepRows,
        );
      }

      lines.push("");
    }
  }

  return lines.join("\n").trimEnd();
}

function formatSampleValue(field: ObservedTestLogField): string {
  const value = field.sampleValues ?? field.sampleValue;
  if (value === undefined || value === null) return "-";
  if (Array.isArray(value)) return value.map((entry) => escapeCell(describeUnknown(entry))).join(", ");
  return escapeCell(describeUnknown(value));
}

function describeUnknown(value: unknown): string {
  if (value === undefined || value === null || value === "") return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(describeUnknown).join(", ");
  if (typeof value === "object" && "name" in value) {
    const ref = value as { id?: unknown; name?: unknown; type?: unknown };
    return `[${ref.id ?? "?"}] ${ref.name ?? "?"}${ref.type ? ` (${ref.type})` : ""}`;
  }
  return JSON.stringify(value);
}

function fieldType(field: CbTrackerField, observed?: ObservedTestLogField): string {
  return observed?.type ?? field.valueModel ?? field.type ?? "-";
}

function suggestedPayloadJson(analysis: TestLogSchemaAnalysis): string {
  return JSON.stringify({ customFields: analysis.suggestedCustomFields }, null, 2);
}

export function formatTestLogSchemaAnalysis(analysis: TestLogSchemaAnalysis): string {
  const observedById = new Map(
    analysis.observedFields.map((field) => [field.fieldId, field]),
  );
  const lines: string[] = [
    `# Test Log Schema Analysis - ${analysis.tracker.name} (${analysis.tracker.id})`,
    "",
    `- **Project:** ${analysis.tracker.project?.name ?? "?"} (${analysis.tracker.project?.id ?? "?"})`,
    `- **Tracker type:** ${analysis.tracker.type?.name ?? "?"}`,
    `- **Required fields found:** ${analysis.requiredFields.length}`,
    `- **Observed custom fields:** ${analysis.observedFields.length}`,
  ];

  if (analysis.warnings.length > 0) {
    lines.push("", "## Warnings", "");
    for (const warning of analysis.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  lines.push(
    "",
    "## Fields",
    "",
    "| Field ID | Name | Type | Required | Tracker item field | Legacy REST name | Observed in examples | Sample value |",
    "|---:|---|---|---|---|---|---|---|",
  );

  for (const field of analysis.fields) {
    const observed = observedById.get(field.fieldId);
    lines.push(
      `| ${field.fieldId} | ${escapeCell(field.name)} | ${escapeCell(fieldType(field, observed))} | ${field.required ? "Yes" : "No"} | ${escapeCell(field.trackerItemField)} | ${escapeCell(field.legacyRestName)} | ${observed ? observed.exampleItemIds.join(", ") : "-"} | ${observed ? formatSampleValue(observed) : "-"} |`,
    );
  }

  lines.push(
    "",
    "## Suggested Create Payload Fragment",
    "",
    "Use this as the `customFields` input for `create_daily_test_log`, then adjust values for the target date/report.",
    "",
    "```json",
    suggestedPayloadJson(analysis),
    "```",
  );

  return lines.join("\n");
}

export function flattenItemFields(fields: CbEditableField[]): ObservedTestLogField[] {
  return fields.map((field) => ({
    fieldId: field.fieldId,
    name: field.name,
    type: field.type,
    exampleItemIds: [],
    sampleValue: field.value,
    sampleValues: field.values,
  }));
}
