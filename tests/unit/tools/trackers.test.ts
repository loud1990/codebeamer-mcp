import { describe, it, expect } from "vitest";
import { HttpClient } from "../../../src/client/http-client.js";
import { CodebeamerClient } from "../../../src/client/codebeamer-client.js";
import {
  formatTrackerList,
  formatTracker,
  formatTrackerField,
  formatTrackerRootChildren,
} from "../../../src/formatters/tracker-formatter.js";

const BASE = "https://test-cb.example.com/v3";

function makeClient() {
  const http = new HttpClient({
    baseUrl: BASE,
    username: "testuser",
    password: "testpass",
  });
  return new CodebeamerClient(http);
}

describe("list_trackers", () => {
  it("returns formatted tracker list", async () => {
    const client = makeClient();
    const result = await client.listTrackers(1, 1, 25);
    const text = formatTrackerList(result);

    expect(text).toContain("## Trackers");
    expect(text).toContain("1 total");
    expect(text).toContain("Bug Tracker");
    expect(text).toContain("100");
  });
});

describe("get_tracker", () => {
  it("returns formatted tracker with fields and items", async () => {
    const client = makeClient();
    const [tracker, fields, { items }] = await Promise.all([
      client.getTracker(100),
      client.getTrackerFields(100),
      client.listTrackerItems(100, 1, 100),
    ]);
    const text = formatTracker(tracker, fields, items);

    expect(text).toContain("Bug Tracker");
    expect(text).toContain("Summary");
    expect(text).toContain("Description");
    expect(text).toContain("TextFieldValue");
    expect(text).toContain("### Items");
    expect(text).toContain("Direct tracker item");
    expect(text).toContain("Open");
  });
});

describe("get_tracker_root_children", () => {
  it("returns formatted root-level outline item references", async () => {
    const client = makeClient();
    const children = await client.getTrackerRootChildren(100, 1, 25);
    const text = formatTrackerRootChildren(children);

    expect(text).toContain("## Tracker Root Children (2)");
    expect(text).toContain("| 520 | Root requirement folder | TrackerItemReference |");
    expect(text).toContain("| 521 | Root test folder | TrackerItemReference |");
  });

  it("returns an empty message when there are no root children", async () => {
    const client = makeClient();
    const children = await client.getTrackerRootChildren(999, 1, 25);
    const text = formatTrackerRootChildren(children);

    expect(text).toBe("_No root-level outline items found._");
  });
});

describe("get_tracker_field", () => {
  it("returns formatted tracker field details used for write payloads", async () => {
    const client = makeClient();
    const field = await client.getTrackerField(100, 7);
    const text = formatTrackerField(field);

    expect(field.fieldId).toBe(7);
    expect(text).toContain("Detected in release");
    expect(text).toContain("ChoiceFieldValue");
    expect(text).toContain("detectedInRelease");
    expect(text).toContain("customFields");
    expect(text).toContain("ReleaseReference");
    expect(text).toContain("### Options");
    expect(text).toContain("Release 1.0");
    expect(text).toContain("### Columns");
    expect(text).toContain("Expected result");
  });
});
