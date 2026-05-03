import type {
  CbReference,
  CbItem,
  CbItemRelationsPage,
  CbComment,
  CbTrackerItemReview,
  CbTestStep,
  CbEditableField,
  CbItemFieldsPage,
} from "../client/codebeamer-client.js";

function md(value: unknown): string {
  if (value === undefined || value === null || value === "") return "-";
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function formatItemList(items: CbItem[]): string {
  const header = `## Items (${items.length} total)\n`;

  if (items.length === 0) return `${header}\n_No items found._`;

  const rows = items.map(
    (item) =>
      `| ${item.id} | ${md(item.name)} | ${md(item.status?.name)} | ${md(item.priority?.name)} | ${md(item.assignedTo?.map((u) => u.name).join(", "))} |`,
  );

  return [
    header,
    "| ID | Summary | Status | Priority | Assigned To |",
    "|----|---------|--------|----------|-------------|",
    ...rows,
  ].join("\n");
}

export function formatItem(item: CbItem): string {
  const lines: string[] = [
    `## [${item.id}] ${md(item.name)}`,
    "",
    `- **Tracker:** ${item.tracker?.name ?? "?"} (ID: ${item.tracker?.id ?? "?"})`,
    `- **Project:** ${item.project?.name ?? "?"}`,
    `- **Status:** ${item.status?.name ?? "?"}`,
    `- **Priority:** ${item.priority?.name ?? "?"}`,
    `- **Assigned to:** ${item.assignedTo?.map((u) => u.name).join(", ") || "unassigned"}`,
    `- **Created:** ${item.createdAt ?? "?"} by ${item.createdBy?.name ?? "?"}`,
    `- **Updated:** ${item.updatedAt ?? "?"}`,
  ];

  if (item.storyPoints !== undefined) {
    lines.push(`- **Story Points:** ${item.storyPoints}`);
  }

  const description =
    typeof item.description === "string"
      ? item.description
      : item.description?.value ?? item.description?.markup;
  if (description) {
    lines.push("", "### Description", "", description);
  }

  if (item.customFields && item.customFields.length > 0) {
    const isTestStepField = (f: { name?: string; type?: string }) =>
      f.type === "TestStepsFieldValue" ||
      (f.type === "TableFieldValue" && ["Test Steps", "Test Step Results"].includes(f.name ?? ""));

    const regularFields = item.customFields.filter((f) => !isTestStepField(f));
    const testStepFields = item.customFields.filter((f) => isTestStepField(f));

    if (regularFields.length > 0) {
      lines.push("", "### Custom Fields", "");
      for (const field of regularFields) {
        if (field.type === "TableFieldValue") {
          lines.push("", `#### ${field.name}`, "", ...formatTableField(field.values));
        } else {
          const vals = field.values as Array<{ id: number; name?: string }> | undefined;
          const displayValue = vals && vals.length > 0
            ? vals.map((v) => v.name ? `[${v.id}] ${v.name}` : String(v.id)).join(", ")
            : formatFieldValue(field.value);
          lines.push(`- **${field.name}:** ${displayValue}`);
        }
      }
    }

    for (const field of testStepFields) {
      let steps: CbTestStep[];

      if (field.type === "TableFieldValue") {
        // Codebeamer API returns test steps as values: Array<Array<{name, value, ...}>>
        const rows = Array.isArray(field.values) ? field.values : [];
        steps = rows.map((row, idx) => {
          const cols = Array.isArray(row)
            ? (row as Array<{ name: string; value: unknown }>)
            : [];
          const action = cols.find((c) => c.name === "Action")?.value;
          const expected = cols.find((c) => c.name === "Expected result")?.value;
          return {
            index: idx,
            actionDescription: typeof action === "string" ? action : undefined,
            expectedResults: typeof expected === "string" ? expected : undefined,
          };
        });
      } else {
        steps = Array.isArray(field.value) ? (field.value as CbTestStep[]) : [];
      }

      lines.push("", `### ${field.name}`, "");
      if (steps.length === 0) {
        lines.push("_No test steps defined._");
      } else {
        lines.push("| # | Action | Expected Result |");
        lines.push("|---|--------|-----------------|");
        for (const step of steps) {
          const num = (step.index ?? 0) + 1;
          const action = md(step.actionDescription);
          const expected = md(step.expectedResults);
          lines.push(`| ${num} | ${action} | ${expected} |`);
        }
      }
    }
  }

  return lines.join("\n");
}

export function formatItemChildren(children: CbReference[]): string {
  if (children.length === 0) return "_No child items found._";

  const rows = children.map(
    (child) => `| ${child.id} | ${md(child.name)} | ${md(child.type)} |`,
  );

  return [
    `## Child Items (${children.length})`,
    "",
    "| ID | Name | Type |",
    "|----|------|------|",
    ...rows,
  ].join("\n");
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined) return "_empty_";
  if (typeof value === "object" && value !== null && "name" in value) {
    return (value as { name: string }).name;
  }
  if (Array.isArray(value)) {
    return value.map(formatFieldValue).join(", ");
  }
  return String(value);
}

function formatTableField(values: unknown[] | undefined): string[] {
  const rows = Array.isArray(values) ? (values.filter(Array.isArray) as unknown[][]) : [];
  if (rows.length === 0) return ["_No rows._"];

  const columnNames = new Set<string>();
  for (const row of rows) {
    for (const cell of row) {
      if (cell && typeof cell === "object" && "name" in cell) {
        columnNames.add(String((cell as { name: unknown }).name));
      }
    }
  }

  const columns = [...columnNames];
  if (columns.length === 0) return ["_No displayable columns._"];

  return [
    `| ${columns.map(md).join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => {
      const cells = row.filter((cell): cell is { name: string; value?: unknown; values?: unknown[] } =>
        cell !== null && typeof cell === "object" && "name" in cell,
      );
      return `| ${columns.map((column) => {
        const cell = cells.find((candidate) => candidate.name === column);
        if (!cell) return "-";
        if (cell.values && cell.values.length > 0) return md(formatFieldValue(cell.values));
        return md(formatFieldValue(cell.value));
      }).join(" | ")} |`;
    }),
  ];
}

function relationsTable(relations: { id: number; type?: { name?: string }; itemRevision?: { id: number; name: string } }[]): string[] {
  const rows = relations.map(
    (r) => `| ${r.id} | ${md(r.type?.name ?? "?")} | ${r.itemRevision?.id ?? "?"} | ${md(r.itemRevision?.name ?? "?")} |`,
  );
  return [
    "| Relation ID | Type | Target ID | Target Name |",
    "|-------------|------|-----------|-------------|",
    ...rows,
  ];
}

export function formatRelations(page: CbItemRelationsPage): string {
  const outgoing = page.outgoingAssociations ?? [];
  const incoming = page.incomingAssociations ?? [];
  const total = outgoing.length + incoming.length;

  if (total === 0) return "_No associations found._";

  const lines: string[] = [`## Associations (${total})`];

  if (outgoing.length > 0) {
    lines.push("", `### Outgoing (${outgoing.length})`, "", ...relationsTable(outgoing));
  }
  if (incoming.length > 0) {
    lines.push("", `### Incoming (${incoming.length})`, "", ...relationsTable(incoming));
  }

  return lines.join("\n");
}

export function formatReferences(page: CbItemRelationsPage): string {
  const upstream = page.upstreamReferences ?? [];
  const downstream = page.downstreamReferences ?? [];
  const total = upstream.length + downstream.length;

  if (total === 0) return "_No references found._";

  const lines: string[] = [`## References (${total})`];

  if (upstream.length > 0) {
    lines.push("", `### Upstream (${upstream.length})`, "", ...relationsTable(upstream));
  }
  if (downstream.length > 0) {
    lines.push("", `### Downstream (${downstream.length})`, "", ...relationsTable(downstream));
  }

  return lines.join("\n");
}

export function formatReviews(reviews: CbTrackerItemReview[]): string {
  if (reviews.length === 0) return "_No reviews found for this item._";

  const sections = reviews.map((review, idx) => {
    const result = review.result ?? "UNDECIDED";
    const resultEmoji = result === "APPROVED" ? "✅" : result === "REJECTED" ? "❌" : "⏳";
    const lines: string[] = [
      `### Review ${idx + 1} — ${resultEmoji} ${result}`,
      "",
    ];

    if (review.config) {
      const cfg = review.config;
      lines.push("**Config:**");
      if (cfg.requiredApprovals !== undefined) lines.push(`- Required approvals: ${cfg.requiredApprovals}`);
      if (cfg.requiredRejections !== undefined) lines.push(`- Required rejections: ${cfg.requiredRejections}`);
      if (cfg.requiredSignature) lines.push(`- Signature required: ${cfg.requiredSignature}`);
      if (cfg.roleRequired !== undefined) lines.push(`- Role required: ${cfg.roleRequired}`);
      lines.push("");
    }

    const reviewers = review.reviewers ?? [];
    if (reviewers.length > 0) {
      lines.push(`**Reviewers (${reviewers.length}):**`, "");
      lines.push("| Reviewer | Role | Decision | Reviewed At |");
      lines.push("|----------|------|----------|-------------|");
      for (const r of reviewers) {
        const user = r.user?.name ?? "?";
        const role = r.asRole?.name ?? "-";
        const decision = r.decision ?? "UNDECIDED";
        const at = r.reviewedAt ? r.reviewedAt.replace("T", " ").slice(0, 16) : "-";
        lines.push(`| ${md(user)} | ${md(role)} | ${md(decision)} | ${md(at)} |`);
      }
    } else {
      lines.push("_No reviewers assigned._");
    }

    return lines.join("\n");
  });

  return [`## Reviews (${reviews.length})`, "", ...sections].join("\n\n");
}

export function formatComments(comments: CbComment[]): string {
  if (comments.length === 0) return "_No comments found._";

  const formatted = comments.map(
    (c) =>
      `### ${c.createdBy?.name ?? "?"} — ${c.createdAt ?? ""}\n\n${c.comment ?? "_empty_"}`,
  );

  return [`## Comments (${comments.length})`, "", ...formatted].join("\n\n");
}

export function formatItemFields(page: CbItemFieldsPage): string {
  const editable = page.editableFields ?? [];
  const readOnly = page.readOnlyFields ?? [];
  const editableTable = page.editableTableFields ?? [];
  const fields = page.fields ?? [];
  const total = editable.length + readOnly.length + editableTable.length + fields.length;

  if (total === 0) return "_No item fields found._";

  const lines: string[] = [`## Item Fields (${total})`];

  if (editable.length > 0) {
    lines.push("", `### Editable Fields (${editable.length})`, "", ...fieldTable(editable));
  }

  if (readOnly.length > 0) {
    lines.push("", `### Read-Only Fields (${readOnly.length})`, "", ...fieldTable(readOnly));
  }

  if (editableTable.length > 0) {
    lines.push("", `### Editable Table Fields (${editableTable.length})`);
    for (const field of editableTable) {
      lines.push("", `#### ${field.name}`, "", ...formatTableField(field.values));
    }
  }

  if (fields.length > 0) {
    lines.push("", `### Fields (${fields.length})`, "", ...fieldTable(fields));
  }

  return lines.join("\n");
}

function fieldTable(fields: CbEditableField[]): string[] {
  return [
    "| Field ID | Name | Type | Value |",
    "|----------|------|------|-------|",
    ...fields.map(
      (field) =>
        `| ${field.fieldId} | ${md(field.name)} | ${md(field.type)} | ${md(formatEditableFieldValue(field))} |`,
    ),
  ];
}

function formatEditableFieldValue(field: CbEditableField): string {
  if (field.values && field.values.length > 0) {
    return field.values
      .map((v) => {
        if (v && typeof v === "object" && "id" in v) {
          const ref = v as { id: number; name?: string };
          return ref.name ? `[${ref.id}] ${ref.name}` : String(ref.id);
        }
        return formatFieldValue(v);
      })
      .join(", ");
  }

  return formatFieldValue(field.value);
}
