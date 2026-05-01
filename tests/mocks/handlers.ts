import { http, HttpResponse } from "msw";
import { makeProject } from "./fixtures/projects.js";
import { makeTracker, makeTrackerField, makeDetailedTrackerField } from "./fixtures/trackers.js";
import { makeItem, makeItemChild, makeItemRelationsPage, makeComment, makeTestCaseItem } from "./fixtures/items.js";
import { makeUser } from "./fixtures/users.js";

const BASE = "https://test-cb.example.com/v3";

export const handlers = [
  // Projects
  http.get(`${BASE}/projects`, () =>
    HttpResponse.json([makeProject(), makeProject({ id: 2, name: "Second Project", keyName: "SEC" })]),
  ),

  http.get(`${BASE}/projects/:id`, ({ params }) => {
    const id = Number(params.id);
    if (id === 77) {
      return HttpResponse.json(makeProject({ id, name: "Daily Test Project", keyName: "DTP" }));
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
          project: { id: 77, name: "Daily Test Project" },
        }),
        makeTracker({
          id: 301,
          name: "Test Logs",
          keyName: "TESTLOG",
          type: { id: 200, name: "Task", type: "TrackerTypeReference" },
          project: { id: 77, name: "Daily Test Project" },
        }),
      ]);
    }
    return HttpResponse.json([makeTracker()]);
  }),

  http.get(`${BASE}/trackers/:id/fields/:fieldId`, ({ params }) =>
    HttpResponse.json(makeDetailedTrackerField({ fieldId: Number(params.fieldId) })),
  ),

  http.get(`${BASE}/trackers/:id/fields`, () =>
    HttpResponse.json([
      makeTrackerField(),
      makeTrackerField({ fieldId: 2, name: "Description", type: "WikiTextFieldValue", required: false }),
    ]),
  ),

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
          project: { id: 77, name: "Daily Test Project" },
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
          project: { id: 77, name: "Daily Test Project" },
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
            project: { id: 77, name: "Daily Test Project" },
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

  http.get(`${BASE}/items/:id/fields`, () =>
    HttpResponse.json({
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
    }),
  ),

  http.get(`${BASE}/items/:id`, ({ params }) => {
    const id = Number(params.id);
    if (id === 700) return HttpResponse.json(makeTestCaseItem());
    if (id === 900) {
      return HttpResponse.json(
        makeItem({
          id,
          name: "Daily regression run",
          tracker: { id: 300, name: "Test Runs" },
          project: { id: 77, name: "Daily Test Project" },
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
          project: { id: 77, name: "Daily Test Project" },
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
    return HttpResponse.json(makeItem({ id }));
  }),

  // Users
  http.get(`${BASE}/users/:id`, ({ params }) =>
    HttpResponse.json(makeUser({ id: Number(params.id) })),
  ),

  // --- Write operations ---

  // Create item
  http.post(`${BASE}/trackers/:trackerId/items`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      makeItem({
        id: 600,
        name: body.name as string,
        description: body.description as string | undefined,
        status: body.status as { id: number; name: string } | undefined,
        priority: body.priority as { id: number; name: string } | undefined,
        storyPoints: body.storyPoints as number | undefined,
      }),
      { status: 201 },
    );
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
