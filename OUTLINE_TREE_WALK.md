# Walking a Codebeamer Outline Tree

This guide tells an AI agent how to use the Codebeamer MCP tools to inspect a tracker as an outline tree.

The core idea is:

1. Find the project.
2. Find the tracker.
3. Get the tracker root children.
4. Recursively expand each item with `get_item_children`.
5. Use item detail tools only when more context is needed.

## Tool Roles

Use these tools to locate the outline:

| Tool | Use |
|---|---|
| `list_projects` | Find candidate projects and their project IDs. |
| `get_project` | Confirm project details if the project name is ambiguous. |
| `list_trackers` | Find trackers inside a project. |
| `get_tracker` | Confirm tracker metadata, fields, and sample items. |
| `get_tracker_root_children` | Start walking the outline tree from top-level tracker items. |
| `get_item_children` | Expand one outline node to its immediate children. |

Use these tools to enrich nodes while walking:

| Tool | Use |
|---|---|
| `get_item` | Fetch full item details for a node, including status, priority, description, and test steps. |
| `get_item_fields` | Inspect editable and read-only field values, including field IDs and value model types. |
| `get_item_relations` | Inspect associations such as depends on, blocks, or related links. |
| `get_item_references` | Inspect traceability links such as upstream and downstream references. |
| `get_item_comments` | Read discussion or review context on a node. |
| `get_item_reviews` | Read Review Hub approval state for a node. |
| `get_user` | Resolve user details when item fields reference user IDs. |

Use these tools only when outline walking is not enough:

| Tool | Use |
|---|---|
| `list_tracker_items` | List tracker items without relying on hierarchy. Useful for sanity checks, not tree traversal. |
| `search_items` | Find known items by text or cbQL before locating them in the tree. |

Use write tools only after the user explicitly asks for a change:

| Tool | Use |
|---|---|
| `create_item` | Create a new tracker item, optionally nested under a parent item. |
| `update_item` | Update item fields after identifying the correct node. |
| `add_comment` | Add a comment to a specific item. |
| `create_association` | Add a non-hierarchical association between items. |
| `create_reference` | Add a downstream traceability reference between items. |
| `create_harm` | Create a harm entry in an RM Harms List tracker. |

## Basic Walk

Start from the tracker, not from `list_tracker_items`.

```text
list_projects
  -> choose projectId

list_trackers(projectId)
  -> choose trackerId

get_tracker_root_children(trackerId)
  -> returns root-level outline items

get_item_children(itemId)
  -> returns immediate children of that item
```

`get_tracker_root_children` and `get_item_children` are complementary:

```text
Tracker
|-- Root item A        from get_tracker_root_children(trackerId)
|   |-- Child A1       from get_item_children(rootItemAId)
|   `-- Child A2       from get_item_children(rootItemAId)
|-- Root item B        from get_tracker_root_children(trackerId)
`-- Root item C        from get_tracker_root_children(trackerId)
    `-- Child C1       from get_item_children(rootItemCId)
```

Do not use `list_tracker_items` as the primary traversal tool. It lists items in a tracker but does not reliably describe parent-child outline structure.

## Recommended Agent Algorithm

Use breadth-first traversal when the user asks to map or summarize the outline. It gives useful early results and avoids getting stuck deep in one branch.

1. Ask for or infer the project and tracker.
2. Call `list_projects` if the project ID is unknown.
3. Call `list_trackers(projectId)` if the tracker ID is unknown.
4. Call `get_tracker_root_children(trackerId, page, pageSize)`.
5. For each returned root item, record:
   - item ID
   - name
   - type
   - depth `0`
   - parent `null`
6. Add each root item ID to a queue.
7. While the queue is not empty:
   - Remove the next item ID.
   - Call `get_item_children(itemId, page, pageSize)`.
   - For each child, record its parent item ID and depth.
   - Add each child item ID to the queue.
8. Stop when every queued item has been expanded, or when the user-requested depth limit is reached.

Use depth-first traversal when the user asks to inspect a specific branch in detail.

## Pagination

Both outline tools accept `page` and `pageSize`.

Use `pageSize: 50` for traversal unless the user asks for a smaller sample. If a response returns exactly `pageSize` rows, request the next page because more children may exist.

Example:

```text
get_tracker_root_children({ trackerId: 123, page: 1, pageSize: 50 })
get_tracker_root_children({ trackerId: 123, page: 2, pageSize: 50 })

get_item_children({ itemId: 456, page: 1, pageSize: 50 })
get_item_children({ itemId: 456, page: 2, pageSize: 50 })
```

If a response returns fewer than `pageSize` rows, treat that page as the last page for that parent.

## When to Fetch Item Details

Do not call `get_item` for every node by default in large trackers. First build the tree from references, then enrich only the nodes needed for the user's task.

Call `get_item` when the user needs:

- descriptions
- statuses
- priorities
- assignees
- timestamps
- test steps
- project or tracker metadata on the item

Call `get_item_fields` when the user needs:

- field IDs
- raw editable field values
- read-only field values
- value model types for later updates

Call `get_item_relations` or `get_item_references` only when the user asks about links, dependencies, coverage, traceability, or impact.

## Suggested Output Shape

For a compact tree, use indentation:

```text
- 100 Root requirement folder [TrackerItemReference]
  - 101 Login requirements [TrackerItemReference]
    - 102 Login button behavior [TrackerItemReference]
  - 103 Password reset requirements [TrackerItemReference]
- 200 Test cases [TrackerItemReference]
  - 201 TC-01: Login succeeds [TestCaseReference]
```

For analysis output, include columns:

| Depth | ID | Parent ID | Name | Type |
|---:|---:|---:|---|---|
| 0 | 100 | - | Root requirement folder | TrackerItemReference |
| 1 | 101 | 100 | Login requirements | TrackerItemReference |
| 2 | 102 | 101 | Login button behavior | TrackerItemReference |

If details were enriched, add columns only for fields the user asked for, such as status, priority, owner, review result, or last updated date.

## Avoiding Common Mistakes

- Do not start tree traversal with `get_item_children` unless the user already gave a parent item ID.
- Do not assume tracker items without parents will appear in `list_tracker_items` in outline root order.
- Do not recurse indefinitely. Track visited item IDs and skip any repeated IDs.
- Do not fetch comments, relations, references, reviews, and fields for every node unless the user asks for a full audit.
- Do not use write tools while walking the tree unless the user clearly asks to modify Codebeamer data.
- Do not confuse outline children with traceability references. Outline children come from `get_tracker_root_children` and `get_item_children`; traceability comes from `get_item_references`.
- Do not confuse outline children with associations. Associations come from `get_item_relations`.

## Example Task Flows

### Map a Tracker Outline

1. `list_projects`
2. `list_trackers(projectId)`
3. `get_tracker_root_children(trackerId, page: 1, pageSize: 50)`
4. `get_item_children(itemId, page: 1, pageSize: 50)` for each discovered node
5. Return an indented tree with IDs and types

### Summarize a Specific Branch

1. Use `search_items` if the branch root is known by name but not ID.
2. Call `get_item` for the branch root.
3. Call `get_item_children` for the branch root.
4. Expand children to the requested depth.
5. Call `get_item` only for nodes included in the summary.

### Check Traceability for a Branch

1. Walk the branch with `get_item_children`.
2. For each relevant node, call `get_item_references`.
3. Report upstream and downstream coverage separately from outline hierarchy.

### Add a New Child Under a Known Parent

Only do this after explicit user approval.

1. Walk or search until the correct parent item is identified.
2. Call `get_item_fields` or `get_tracker_field` if field payload details are needed.
3. Call `create_item` with the target `trackerId` and parent item ID.
4. Call `get_item_children(parentItemId)` to verify the new child appears.

## Minimal Traversal Pseudocode

```text
visited = set()
queue = []
tree = []

roots = get_tracker_root_children(trackerId, page: 1, pageSize: 50)
for root in roots:
  tree.add({ id: root.id, parentId: null, depth: 0, name: root.name, type: root.type })
  queue.push({ id: root.id, depth: 0 })

while queue is not empty:
  current = queue.pop_front()
  if current.id in visited:
    continue
  visited.add(current.id)

  children = get_item_children(current.id, page: 1, pageSize: 50)
  for child in children:
    tree.add({
      id: child.id,
      parentId: current.id,
      depth: current.depth + 1,
      name: child.name,
      type: child.type
    })
    queue.push({ id: child.id, depth: current.depth + 1 })
```

For real traversal, repeat each tool call across pages until the returned row count is less than `pageSize`.
