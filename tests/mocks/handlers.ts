import { http, HttpResponse } from "msw";
import { makeProject } from "./fixtures/projects.js";
import { makeTracker, makeTrackerField, makeDetailedTrackerField } from "./fixtures/trackers.js";
import { makeItem, makeItemChild, makeItemRelationsPage, makeComment, makeTestCaseItem } from "./fixtures/items.js";
import { makeUser } from "./fixtures/users.js";

const BASE = "https://test-cb.example.com/v3";
const createdItems = new Map<number, ReturnType<typeof makeItem>>();

export const handlers = [
  // Projects
  http.get(`${BASE}/projects`, () =>
    HttpResponse.json([makeProject(), makeProject({ id: 2, name: "Second Project", keyName: "SEC" })]),
  ),

  http.get(`${BASE}/projects/:id`, ({ params }) => {
    const id = Number(params.id);
    if (id === 77) {
      return HttpResponse.json(makeProject({ id, name: "SYNTHETIC_DAILY_TEST_PROJECT", keyName: "DTP" }));
    }
    return HttpResponse.json(makeProject({ id }));
  }),

  // Trackers
  http.get(`${BASE}/projects/:projectId/trackers`, ({ params }) => {
    const projectId = Number(params.projectId);
    if (projectId === 77) {
      return HttpResponse.json([
        makeTracker({
          id: 300,
          name: "Test Runs",
          keyName: "TESTRUN",
          type: { id: 9, name: "Testrun", type: "TrackerTypeReference" },
          project: { id: 77, name: "SYNTHETIC_DAILY_TEST_PROJECT" },
        }),
        makeTracker({
          id: 301,
          name: "Test Logs",
          keyName: "TESTLOG",
          type: { id: 200, name: "Task", type: "TrackerTypeReference" },
          project: { id: 77, name: "SYNTHETIC_DAILY_TEST_PROJECT" },
        }),
      ]);
    }
    return HttpResponse.json([makeTracker()]);
  }),

  http.get(`${BASE}/trackers/:id/fields/:fieldId`, ({ params }) =>
    HttpResponse.json(makeDetailedTrackerField({ fieldId: Number(params.fieldId) })),
  ),

  http.get(`${BASE}/trackers/:id/fields`, ({ params }) => {
    const id = Number(params.id);
    if (id === 119392) {
      return HttpResponse.json([
        { id: 3, name: "Test Phase", type: "FieldReference", trackerId: 119392 },
        { id: 8, name: "Start Date and Time", type: "FieldReference", trackerId: 119392 },
        { id: 9, name: "End Date and Time", type: "FieldReference", trackerId: 119392 },
        { id: 80, name: "Overall Summary", type: "FieldReference", trackerId: 119392 },
        { id: 10001, name: "Test Location", type: "FieldReference", trackerId: 119392 },
        { id: 10002, name: "System Baseline Identifier", type: "FieldReference", trackerId: 119392 },
        { id: 10003, name: "System Status", type: "FieldReference", trackerId: 119392 },
        { id: 10004, name: "Test Conductor", type: "FieldReference", trackerId: 119392 },
        { id: 10005, name: "Test Participant(s):", type: "FieldReference", trackerId: 119392 },
        { id: 10006, name: "Plan for next Shift", type: "FieldReference", trackerId: 119392 },
        { id: 1000000, name: "PTR List", type: "FieldReference", trackerId: 119392 },
        { id: 2000000, name: "Test Conducted", type: "FieldReference", trackerId: 119392 },
      ]);
    }
    if (id === 301) {
      return HttpResponse.json([
        makeTrackerField({
          fieldId: 1000,
          name: "Run Date",
          type: "DateFieldValue",
          valueModel: "DateFieldValue",
          trackerItemField: "customFields",
          legacyRestName: "runDate",
          required: true,
        }),
        makeTrackerField({
          fieldId: 1001,
          name: "Passed Count",
          type: "IntegerFieldValue",
          valueModel: "IntegerFieldValue",
          trackerItemField: "customFields",
          legacyRestName: "passedCount",
          required: true,
        }),
        makeTrackerField({
          fieldId: 1002,
          name: "Failed Count",
          type: "IntegerFieldValue",
          valueModel: "IntegerFieldValue",
          trackerItemField: "customFields",
          legacyRestName: "failedCount",
          required: true,
        }),
        makeTrackerField({
          fieldId: 1003,
          name: "Overall Result",
          type: "ChoiceFieldValue",
          valueModel: "ChoiceFieldValue",
          trackerItemField: "customFields",
          legacyRestName: "overallResult",
          required: true,
          options: [
            { id: 10, name: "Passed" },
            { id: 11, name: "Failed" },
          ],
        }),
      ]);
    }
    return HttpResponse.json([
      makeTrackerField(),
      makeTrackerField({ fieldId: 2, name: "Description", type: "WikiTextFieldValue", required: false }),
    ]);
  }),

  http.get(`${BASE}/trackers/:id/items`, () =>
    HttpResponse.json([makeItem()]),
  ),

  http.get(`${BASE}/trackers/:id/children`, ({ params }) => {
    const id = Number(params.id);
    if (id === 999) return HttpResponse.json({ itemRefs: [] });
    return HttpResponse.json({
      itemRefs: [
        makeItemChild({ id: 520, name: "Root requirement folder", type: "TrackerItemReference" }),
        makeItemChild({ id: 521, name: "Root test folder", type: "TrackerItemReference" }),
      ],
    });
  }),

  http.get(`${BASE}/trackers/:id`, ({ params }) => {
    const id = Number(params.id);
    if (id === 300) {
      return HttpResponse.json(
        makeTracker({
          id,
          name: "Test Runs",
          keyName: "TESTRUN",
          type: { id: 9, name: "Testrun", type: "TrackerTypeReference" },
          project: { id: 77, name: "SYNTHETIC_DAILY_TEST_PROJECT" },
        }),
      );
    }
    if (id === 301) {
      return HttpResponse.json(
        makeTracker({
          id,
          name: "Test Logs",
          keyName: "TESTLOG",
          type: { id: 200, name: "Task", type: "TrackerTypeReference" },
          project: { id: 77, name: "SYNTHETIC_DAILY_TEST_PROJECT" },
        }),
      );
    }
    if (id === 119392) {
      return HttpResponse.json(
        makeTracker({
          id,
          name: "ABC Test Log",
          keyName: "ABCLog",
          type: { id: 5, name: "Requirement", type: "TrackerTypeReference" },
          project: { id: 16, name: "ABC", type: "ProjectReference" },
        }),
      );
    }
    return HttpResponse.json(makeTracker({ id }));
  }),

  // Items
  http.get(`${BASE}/items/query`, ({ request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get("queryString") ?? "";
    const page = Number(url.searchParams.get("page") ?? "1");
    if (query.includes("tracker.id IN (300)")) {
      if (page > 1) return HttpResponse.json({ items: [] });
      return HttpResponse.json({
        items: [
          makeItem({
            id: 900,
            name: "Daily regression run",
            tracker: { id: 300, name: "Test Runs" },
            project: { id: 77, name: "SYNTHETIC_DAILY_TEST_PROJECT" },
            status: { id: 30, name: "Completed" },
            priority: { id: 2, name: "Normal" },
            updatedAt: "2026-05-01T18:30:00Z",
          }),
        ],
      });
    }
    return HttpResponse.json([makeItem(), makeItem({ id: 501, name: "Another bug" })]);
  }),

  http.get(`${BASE}/items/:id/relations`, () =>
    HttpResponse.json(makeItemRelationsPage()),
  ),

  http.get(`${BASE}/items/:id/children`, ({ params }) => {
    const id = Number(params.id);
    if (id === 900) {
      return HttpResponse.json({
        itemRefs: [
          { id: 901, name: "TC-01 Login succeeds", type: "TrackerItemReference" },
        ],
      });
    }
    if (id === 901) return HttpResponse.json({ itemRefs: [] });
    if (id === 999) return HttpResponse.json({ itemRefs: [] });
    return HttpResponse.json({
      itemRefs: [
        makeItemChild(),
        makeItemChild({ id: 511, name: "Login child test case", type: "TestCaseReference" }),
      ],
    });
  }),

  http.get(`${BASE}/items/:id/comments`, () =>
    HttpResponse.json([makeComment(), makeComment({ id: 301, comment: "Fixed in v2.1", createdBy: { id: 2, name: "jane.smith" } })]),
  ),

  http.get(`${BASE}/items/:id/fields`, ({ params }) => {
    const id = Number(params.id);
    if (id === 950) {
      return HttpResponse.json({
        editableFields: [
          {
            fieldId: 1000,
            name: "Run Date",
            type: "DateFieldValue",
            value: "2026-05-01",
          },
          {
            fieldId: 1001,
            name: "Passed Count",
            type: "IntegerFieldValue",
            value: 12,
          },
          {
            fieldId: 1002,
            name: "Failed Count",
            type: "IntegerFieldValue",
            value: 1,
          },
          {
            fieldId: 1003,
            name: "Overall Result",
            type: "ChoiceFieldValue",
            values: [{ id: 11, name: "Failed", type: "ChoiceOptionReference" }],
          },
        ],
      });
    }
    if (id === 154632) {
      return HttpResponse.json({
        editableFields: [
          { fieldId: 76, name: "Parent", values: [{ id: 142686, name: "SYNTHETIC_PARENT_LOG", type: "TrackerItemReference" }], type: "ChoiceFieldValue" },
          { fieldId: 3, name: "Test Phase", value: "SYNTHETIC_TEST_PHASE", type: "TextFieldValue" },
          { fieldId: 10001, name: "Test Location", value: "SYNTHETIC_LOCATION", type: "TextFieldValue" },
          { fieldId: 8, name: "Start Date and Time", value: "2026-04-15T08:00:00.000", type: "DateFieldValue" },
          { fieldId: 9, name: "End Date and Time", value: "2026-04-15T17:00:00.000", type: "DateFieldValue" },
          { fieldId: 10002, name: "System Baseline Identifier", value: "SYNTHETIC_BASELINE", type: "TextFieldValue" },
          { fieldId: 10003, name: "System Status", value: "SYNTHETIC_SYSTEM_STATUS", type: "TextFieldValue" },
          { fieldId: 10004, name: "Test Conductor", value: "SYNTHETIC_CONDUCTOR", type: "TextFieldValue" },
          { fieldId: 10005, name: "Test Participant(s):", value: "SYNTHETIC_PARTICIPANTS", type: "TextFieldValue" },
          { fieldId: 80, name: "Overall Summary", value: "--", type: "WikiTextFieldValue" },
        ],
        editableTableFields: [
          {
            fieldId: 2000000,
            name: "Test Conducted",
            type: "TableFieldValue",
            values: [
              [
                { fieldId: 2000001, name: "Test Case Number", value: "154584", type: "TextFieldValue" },
                { fieldId: 2000012, name: "Test Run", value: "[ISSUE:154584]", type: "UrlFieldValue" },
                { fieldId: 2000011, name: "Test Case", values: [{ id: 97212, name: "SYNTHETIC_TEST_CASE_NAME", type: "TrackerItemReference" }], type: "ChoiceFieldValue" },
                { fieldId: 2000008, name: "Start Time", value: "14:16", type: "TextFieldValue" },
                { fieldId: 2000009, name: "Stop Time", value: "15:11", type: "TextFieldValue" },
                { fieldId: 2000002, name: "Test Case Titile", value: "SYNTHETIC_TEST_CASE_TITLE", type: "TextFieldValue" },
                { fieldId: 2000003, name: "Test Case Redlines", values: [{ id: 1, name: "Yes", type: "ChoiceOptionReference" }], type: "ChoiceFieldValue" },
                { fieldId: 2000004, name: "Test Case Status", values: [{ id: 3, name: "Incomplete", type: "ChoiceOptionReference" }], type: "ChoiceFieldValue" },
                { fieldId: 2000010, name: "Associated PTR", value: "107614", type: "TextFieldValue" },
                { fieldId: 2000007, name: "Test Case Comments", value: "SYNTHETIC_TEST_COMMENT", type: "WikiTextFieldValue" },
              ],
            ],
          },
          {
            fieldId: 1000000,
            name: "PTR List",
            type: "TableFieldValue",
            values: [
              [
                { fieldId: 1000005, name: "PTR data", values: [{ id: 107614, name: "SYNTHETIC_PTR_TITLE", type: "TrackerItemReference" }], type: "ChoiceFieldValue" },
                { fieldId: 1000001, name: "PTR #", value: "107614", type: "TextFieldValue" },
                { fieldId: 1000002, name: "PTR Title", value: "SYNTHETIC_PTR_TITLE", type: "TextFieldValue" },
                { fieldId: 1000003, name: "PTR Description", value: "SYNTHETIC_PTR_DESCRIPTION", type: "WikiTextFieldValue" },
              ],
            ],
          },
        ],
      });
    }
    return HttpResponse.json({
      editableFields: [
        {
          fieldId: 3,
          name: "Summary",
          type: "TextFieldValue",
          value: "Login button does not respond",
        },
        {
          fieldId: 5,
          name: "Assigned to",
          type: "ChoiceFieldValue",
          values: [{ id: 1, name: "john.doe", type: "UserReference" }],
        },
      ],
      readOnlyFields: [
        {
          fieldId: 0,
          name: "ID",
          type: "IntegerFieldValue",
          value: 500,
        },
      ],
    });
  }),

  http.get(`${BASE}/items/:id`, ({ params }) => {
    const id = Number(params.id);
    const created = createdItems.get(id);
    if (created) return HttpResponse.json(created);
    if (id === 700) return HttpResponse.json(makeTestCaseItem());
    if (id === 900) {
      return HttpResponse.json(
        makeItem({
          id,
          name: "Daily regression run",
          tracker: { id: 300, name: "Test Runs" },
          project: { id: 77, name: "SYNTHETIC_DAILY_TEST_PROJECT" },
          status: { id: 30, name: "Completed" },
          priority: { id: 2, name: "Normal" },
          createdAt: "2026-05-01T08:00:00Z",
          updatedAt: "2026-05-01T18:30:00Z",
          customFields: [
            {
              fieldId: 200,
              name: "Result",
              type: "ChoiceFieldValue",
              value: { id: 1, name: "Passed" },
            },
          ],
        }),
      );
    }
    if (id === 901) {
      return HttpResponse.json(
        makeItem({
          id,
          name: "TC-01 Login succeeds",
          tracker: { id: 300, name: "Test Runs" },
          project: { id: 77, name: "SYNTHETIC_DAILY_TEST_PROJECT" },
          status: { id: 31, name: "Passed" },
          priority: { id: 2, name: "Normal" },
          createdAt: "2026-05-01T08:05:00Z",
          updatedAt: "2026-05-01T08:10:00Z",
          customFields: [
            {
              fieldId: 2000000,
              name: "Test Step Results",
              type: "TableFieldValue",
              values: [
                [
                  { fieldId: 2000001, name: "Action", value: "Open login page", type: "WikiTextFieldValue" },
                  { fieldId: 2000002, name: "Expected result", value: "Login form appears", type: "WikiTextFieldValue" },
                  { fieldId: 2000003, name: "Critical", value: true, type: "BoolFieldValue" },
                  { fieldId: 2000004, name: "Actual result", value: "Login form appears", type: "WikiTextFieldValue" },
                  { fieldId: 2000005, name: "Result", value: "Passed", type: "ChoiceFieldValue" },
                ],
              ],
            },
          ],
        }),
      );
    }
    if (id === 600) {
      return HttpResponse.json(
        makeItem({
          id,
          name: "Daily Test Log - 2026-05-01 - SYNTHETIC_DAILY_TEST_PROJECT",
          tracker: { id: 301, name: "Test Logs" },
          project: { id: 77, name: "SYNTHETIC_DAILY_TEST_PROJECT" },
          description: "# Daily Test Report\n\nEverything passed.",
          customFields: [
            { fieldId: 1000, name: "Run Date", type: "DateFieldValue", value: "2026-05-01" },
            { fieldId: 1001, name: "Passed Count", type: "IntegerFieldValue", value: 12 },
            { fieldId: 1002, name: "Failed Count", type: "IntegerFieldValue", value: 0 },
            {
              fieldId: 1003,
              name: "Overall Result",
              type: "ChoiceFieldValue",
              values: [{ id: 10, name: "Passed", type: "ChoiceOptionReference" }],
            },
          ],
        }),
      );
    }
    if (id === 950) {
      return HttpResponse.json(
        makeItem({
          id,
          name: "Manual Daily Test Log",
          tracker: { id: 301, name: "Test Logs" },
          project: { id: 77, name: "SYNTHETIC_DAILY_TEST_PROJECT" },
          description: "# Manual Daily Test Report",
        }),
      );
    }
    if (id === 154632) {
      return HttpResponse.json(
        makeItem({
          id,
          name: "SYNTHETIC_TEST_PHASE",
          description: "--",
          tracker: { id: 119392, name: "ABC Test Log", type: "TrackerReference" },
          project: { id: 16, name: "ABC" },
          status: { id: 1, name: "New", type: "ChoiceOptionReference" },
          priority: { id: 0, name: "Unset", type: "ChoiceOptionReference" },
          createdAt: "2026-04-15T12:38:28.886",
          updatedAt: "2026-04-16T08:15:22.584",
          customFields: [
            { fieldId: 10001, name: "Test Location", value: "SYNTHETIC_LOCATION", type: "TextFieldValue" },
            { fieldId: 10002, name: "System Baseline Identifier", value: "SYNTHETIC_BASELINE", type: "TextFieldValue" },
            { fieldId: 10003, name: "System Status", value: "SYNTHETIC_SYSTEM_STATUS", type: "TextFieldValue" },
            { fieldId: 10004, name: "Test Conductor", value: "SYNTHETIC_CONDUCTOR", type: "TextFieldValue" },
            { fieldId: 10005, name: "Test Participant(s):", value: "SYNTHETIC_PARTICIPANTS", type: "TextFieldValue" },
          ],
        }),
      );
    }
    return HttpResponse.json(makeItem({ id }));
  }),

  // Users
  http.get(`${BASE}/users/:id`, ({ params }) =>
    HttpResponse.json(makeUser({ id: Number(params.id) })),
  ),

  // --- Write operations ---

  // Create item
  http.post(`${BASE}/trackers/:trackerId/items`, async ({ request }) => {
    const trackerId = Number(request.url.match(/\/trackers\/(\d+)\/items/)?.[1] ?? "0");
    const body = (await request.json()) as Record<string, unknown>;
    const id = trackerId === 119392 ? 154700 : 600;
    const item = makeItem({
        id,
        name: body.name as string,
        description: body.description as string | undefined,
        tracker: trackerId === 119392 ? { id: 119392, name: "ABC Test Log" } : undefined,
        status: body.status as { id: number; name: string } | undefined,
        priority: body.priority as { id: number; name: string } | undefined,
        storyPoints: body.storyPoints as number | undefined,
        customFields: body.customFields as NonNullable<ReturnType<typeof makeItem>["customFields"]> | undefined,
      });
    createdItems.set(id, item);
    return HttpResponse.json(item, { status: 201 });
  }),

  // Update item
  http.put(`${BASE}/items/:id`, async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      makeItem({
        id: Number(params.id),
        ...(body.name != null && { name: body.name as string }),
        ...(body.status != null && { status: body.status as { id: number; name: string } }),
      }),
    );
  }),

  // Add comment (multipart/form-data)
  http.post(`${BASE}/items/:itemId/comments`, async ({ request }) => {
    const fd = await request.formData();
    return HttpResponse.json(
      makeComment({
        id: 350,
        comment: fd.get("comment") as string,
        createdBy: { id: 5, name: "john.doe" },
      }),
      { status: 201 },
    );
  }),

  // Create association
  http.post(`${BASE}/associations`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      {
        id: 400,
        from: body.from,
        to: body.to,
        type: { ...(body.type as Record<string, unknown>), name: "depends on" },
        description: body.description ?? null,
      },
      { status: 201 },
    );
  }),
];
