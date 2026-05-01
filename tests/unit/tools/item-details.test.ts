import { describe, it, expect } from "vitest";
import { HttpClient } from "../../../src/client/http-client.js";
import { CodebeamerClient } from "../../../src/client/codebeamer-client.js";
import {
  formatItemChildren,
  formatRelations,
  formatReferences,
  formatComments,
  formatItemFields,
} from "../../../src/formatters/item-formatter.js";

const BASE = "https://test-cb.example.com/v3";

function makeClient() {
  const http = new HttpClient({
    baseUrl: BASE,
    username: "testuser",
    password: "testpass",
  });
  return new CodebeamerClient(http);
}

describe("get_item_children", () => {
  it("returns formatted immediate child references", async () => {
    const client = makeClient();
    const children = await client.getItemChildren(500, 1, 25);
    const text = formatItemChildren(children);

    expect(text).toContain("## Child Items (2)");
    expect(text).toContain("| 510 | Login child requirement | TrackerItemReference |");
    expect(text).toContain("| 511 | Login child test case | TestCaseReference |");
  });

  it("returns an empty message when there are no children", async () => {
    const client = makeClient();
    const children = await client.getItemChildren(999, 1, 25);
    const text = formatItemChildren(children);

    expect(text).toBe("_No child items found._");
  });
});

describe("get_item_fields", () => {
  it("returns formatted editable and read-only fields", async () => {
    const client = makeClient();
    const fields = await client.getItemFields(500);
    const text = formatItemFields(fields);

    expect(text).toContain("## Item Fields (3)");
    expect(text).toContain("### Editable Fields (2)");
    expect(text).toContain("| 3 | Summary | TextFieldValue | Login button does not respond |");
    expect(text).toContain("| 5 | Assigned to | ChoiceFieldValue | [1] john.doe |");
    expect(text).toContain("### Read-Only Fields (1)");
    expect(text).toContain("| 0 | ID | IntegerFieldValue | 500 |");
  });
});

describe("get_item_relations", () => {
  it("returns formatted associations", async () => {
    const client = makeClient();
    const page = await client.getItemRelations(500);
    const text = formatRelations(page);

    expect(text).toContain("## Associations");
    expect(text).toContain("Outgoing");
    expect(text).toContain("depends on");
    expect(text).toContain("501");
    expect(text).toContain("Incoming");
    expect(text).toContain("blocks");
  });
});

describe("get_item_references", () => {
  it("returns formatted upstream and downstream references", async () => {
    const client = makeClient();
    const page = await client.getItemRelations(500);
    const text = formatReferences(page);

    expect(text).toContain("## References");
    expect(text).toContain("Upstream");
    expect(text).toContain("derived from");
    expect(text).toContain("REQ-42");
    expect(text).toContain("Downstream");
    expect(text).toContain("covers");
    expect(text).toContain("TC-10");
  });
});

describe("get_item_comments", () => {
  it("returns formatted comments", async () => {
    const client = makeClient();
    const comments = await client.getItemComments(500);
    const text = formatComments(comments);

    expect(text).toContain("## Comments (2)");
    expect(text).toContain("john.doe");
    expect(text).toContain("Chrome 120");
    expect(text).toContain("Fixed in v2.1");
    expect(text).toContain("jane.smith");
  });
});
