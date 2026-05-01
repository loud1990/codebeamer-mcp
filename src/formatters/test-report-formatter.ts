import type {
  CbItem,
  CbProject,
  CbTracker,
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

export interface DailyTestReport {
  date: string;
  timezone?: string;
  dateField: string;
  start: string;
  end: string;
  projects: ProjectDailyTestReport[];
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

