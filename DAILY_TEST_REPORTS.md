# Daily Test Reports from Codebeamer Test Runs

This guide describes how an AI agent should collect all Test Run items for a day, recursively gather their child information, generate a per-project report, and optionally create one Test Log tracker item per project.

The recommended workflow has two phases:

1. Generate a read-only report from Test Run trackers.
2. After review, create a Test Log tracker item containing the report.

Keep these phases separate because report generation is safe and repeatable, while creating Test Log items writes to Codebeamer.

## Date Window

Treat "today" as a bounded date window in the Codebeamer/project timezone.

For example, for May 1, 2026 in `America/New_York`:

```text
2026-05-01T00:00:00 <= test run date < 2026-05-02T00:00:00
```

Do not use "last 24 hours" unless the user explicitly asks for a rolling window.

The best field for filtering depends on how the team uses Codebeamer:

| Field | When to use |
|---|---|
| `modifiedAt` | Best default for "what was run or updated today." |
| `createdAt` | Use when test runs are created and executed on the same day. |
| `submittedAt` | Use when submitted date represents execution date in the instance. |
| custom date field | Use when the Test Run tracker has a dedicated execution/completion date. |

## Discovery Flow

Use the project and tracker tools first:

1. `list_projects`
2. `list_trackers(projectId)`
3. Identify Test Run trackers by tracker type or naming convention.
4. Identify Test Log trackers by tracker name/key convention.

PTC documents Test Run trackers as tracker type `Testrun`. In real instances, names and keys are often customized, so allow explicit tracker IDs when available.

## Collecting Test Runs

For each project:

1. Find the Test Run tracker.
2. Query items in that tracker for the target date window.
3. Fetch each Test Run item.
4. Recursively walk its children with `get_item_children`.
5. Fetch each child item and parse its relevant fields.

Conceptual cbQL:

```text
tracker.id IN (TEST_RUN_TRACKER_ID)
AND modifiedAt >= "2026-05-01T00:00:00"
AND modifiedAt < "2026-05-02T00:00:00"
```

Use pagination for every search and child listing call.

## Recursive Child Collection

Test Run hierarchies can be nested. A generated test run often has test case run children, and those children may have additional detail or grouped children depending on configuration.

For each Test Run:

```text
get_item(testRunId)
get_item_fields(testRunId)
get_item_children(testRunId)

for each child:
  get_item(childId)
  get_item_fields(childId)
  get_item_children(childId)
```

Continue until no children remain or the configured depth limit is reached.

Track visited item IDs and skip repeated IDs.

## Information to Include

At minimum, include:

- project name and ID
- Test Run tracker name and ID
- date window
- total Test Runs
- total child run items
- result totals
- each Test Run ID, name, status, priority, assignee, created/updated timestamps
- each child item ID, name, status, and parsed result
- Test Step Results where available

PTC documents Test Run step results as a table with these columns:

- Action
- Expected result
- Critical
- Actual result
- Result

Parse table fields by column name rather than hardcoding field IDs. Field IDs can differ by instance.

## Suggested MCP Tools

### `generate_daily_test_report`

Read-only tool.

Inputs:

| Input | Purpose |
|---|---|
| `date` | Report date as `YYYY-MM-DD`. |
| `projectIds` | Optional project IDs. If omitted, include all projects. |
| `testRunTrackerIds` | Optional explicit Test Run tracker IDs. |
| `dateField` | Date field for cbQL filtering. Defaults to `modifiedAt`. |
| `timezone` | Informational timezone label for the report. |
| `maxDepth` | Maximum child recursion depth. |
| `pageSize` | Pagination size. |

Output:

- Markdown report grouped by project.
- Project-level and overall counts.
- Test Run IDs included.
- Child tree with parsed result fields where available.

### `create_daily_test_log`

Write tool.

Inputs:

| Input | Purpose |
|---|---|
| `projectId` | Project that owns the Test Log item. |
| `testLogTrackerId` | Tracker where the log item will be created. |
| `date` | Report date for the item title. |
| `reportMarkdown` | Report body to store in the item description. |
| `name` | Optional item name override. |
| `statusId` | Optional initial status. |
| `priorityId` | Optional priority. |
| `assignedToIds` | Optional assignees. |
| `parentId` | Optional parent item for nesting. |

The write tool should not regenerate the report. It should create exactly the report the user reviewed or provided.

## Why Two Tools

Splitting the workflow is safer and easier to audit:

- `generate_daily_test_report` can be run repeatedly without side effects.
- The user can review the exact report before anything is written.
- `create_daily_test_log` has a narrow responsibility and clear write behavior.
- Failures in Test Log creation do not affect report generation.

## Best Implementation Notes

- Prefer explicit tracker IDs when the user provides them.
- Fall back to project tracker discovery when tracker IDs are omitted.
- Match Test Run trackers by `tracker.type.name === "Testrun"` first, then by names such as `Test Runs` or keys such as `TESTRUN`.
- Match Test Log trackers by explicit ID first, then by names or keys such as `Test Log`, `Test Logs`, or `TESTLOG`.
- Use `pageSize: 50` by default.
- Use `modifiedAt` by default for daily execution reports.
- Keep generated reports deterministic: sort projects by name/ID and preserve Codebeamer child order.
- Avoid fetching comments, relations, reviews, or traceability by default. Add those only if the user asks for audit-level detail.

## Report Skeleton

```markdown
# Daily Test Report - 2026-05-01

Timezone: America/New_York
Date field: modifiedAt

## Summary

| Project | Test Runs | Child Items | Passed | Failed | Blocked | Not Run | Other |
|---|---:|---:|---:|---:|---:|---:|---:|

## Project Name

Tracker: Test Runs (ID: 123)

### Test Run 456: Regression Run

- Status: Completed
- Updated: 2026-05-01T18:30:00
- Result: Passed

| Depth | ID | Parent | Name | Status | Result |
|---:|---:|---:|---|---|---|

#### Test Step Results

| Item | Step | Action | Expected | Actual | Result |
|---:|---:|---|---|---|---|
```

