import { describe, it, expect } from "vitest";
import { HttpClient } from "../../../src/client/http-client.js";
import { CodebeamerClient } from "../../../src/client/codebeamer-client.js";
import {
  analyzeTestLogSchema,
  createDailyTestLog,
  generateDailyTestReport,
} from "../../../src/tools/test-reports.js";
import {
  formatDailyTestReport,
  formatTestLogSchemaAnalysis,
} from "../../../src/formatters/test-report-formatter.js";

const BASE = "https://test-cb.example.com/v3";

function makeClient() {
  const http = new HttpClient({
    baseUrl: BASE,
    username: "testuser",
    password: "testpass",
  });
  return new CodebeamerClient(http);
}

describe("generate_daily_test_report", () => {
  it("generates a daily report with recursive child details and step results", async () => {
    const client = makeClient();
    const report = await generateDailyTestReport(client, {
      date: "2026-05-01",
      timezone: "America/New_York",
      projectIds: [77],
      testRunTrackerIds: [300],
      dateField: "modifiedAt",
      maxDepth: 5,
      pageSize: 50,
    });
    const text = formatDailyTestReport(report);

    expect(text).toContain("# Daily Test Report - 2026-05-01");
    expect(text).toContain("Daily Test Project");
    expect(text).toContain("Test Run tracker: Test Runs (300)");
    expect(text).toContain("Daily regression run");
    expect(text).toContain("| 1 | 901 | 900 | TC-01 Login succeeds | Passed | Passed |");
    expect(text).toContain("#### Test Step Results");
    expect(text).toContain("Open login page");
    expect(text).toContain("Login form appears");
  });

  it("discovers Test Run trackers from the project when tracker IDs are omitted", async () => {
    const client = makeClient();
    const report = await generateDailyTestReport(client, {
      date: "2026-05-01",
      projectIds: [77],
      dateField: "modifiedAt",
      maxDepth: 1,
      pageSize: 50,
    });

    expect(report.projects[0].tracker?.id).toBe(300);
    expect(report.projects[0].testRuns).toHaveLength(1);
  });
});

describe("analyze_test_log_schema", () => {
  it("uses manual Test Log examples to suggest custom field payloads", async () => {
    const client = makeClient();
    const analysis = await analyzeTestLogSchema(client, {
      testLogTrackerId: 301,
      exampleItemIds: [950],
    });
    const text = formatTestLogSchemaAnalysis(analysis);

    expect(analysis.requiredFields).toHaveLength(4);
    expect(analysis.suggestedCustomFields).toEqual([
      { fieldId: 1000, type: "DateFieldValue", value: "2026-05-01" },
      { fieldId: 1001, type: "IntegerFieldValue", value: 12 },
      { fieldId: 1002, type: "IntegerFieldValue", value: 1 },
      {
        fieldId: 1003,
        type: "ChoiceFieldValue",
        values: [{ id: 11, name: "Failed", type: "ChoiceOptionReference" }],
      },
    ]);
    expect(text).toContain("Run Date");
    expect(text).toContain("Suggested Create Payload Fragment");
  });
});

describe("create_daily_test_log", () => {
  it("creates a Test Log item with a default daily title", async () => {
    const client = makeClient();
    const result = await createDailyTestLog(client, {
      projectId: 77,
      testLogTrackerId: 301,
      date: "2026-05-01",
      reportMarkdown: "# Daily Test Report\n\nEverything passed.",
      customFields: [
        { fieldId: 1000, type: "DateFieldValue", value: "2026-05-01" },
        { fieldId: 1001, type: "IntegerFieldValue", value: 12 },
        { fieldId: 1002, type: "IntegerFieldValue", value: 0 },
        {
          fieldId: 1003,
          type: "ChoiceFieldValue",
          values: [{ id: 10, name: "Passed", type: "ChoiceOptionReference" }],
        },
      ],
    });

    expect(result.item.id).toBe(600);
    expect(result.readback.name).toBe("Daily Test Log - 2026-05-01 - Daily Test Project");
    expect(result.readback.description).toBe("# Daily Test Report\n\nEverything passed.");
    expect(result.missingFieldIds).toEqual([]);
  });
});
