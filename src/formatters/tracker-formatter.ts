import type {
  CbTracker,
  CbTrackerField,
  CbItem,
  CbReference,
} from "../client/codebeamer-client.js";

export function formatTrackerList(trackers: CbTracker[]): string {
  const header = `## Trackers (${trackers.length} total)\n`;

  if (trackers.length === 0) return `${header}\n_No trackers found._`;

  const rows = trackers.map(
    (t) =>
      `| ${t.id} | ${t.name} | ${t.type?.name ?? "-"} | ${t.keyName ?? "-"} |`,
  );

  return [
    header,
    "| ID | Name | Type | Key |",
    "|----|------|------|-----|",
    ...rows,
  ].join("\n");
}

function extractDescription(desc: CbItem["description"]): string {
  const text =
    typeof desc === "string"
      ? desc
      : desc?.value ?? desc?.markup ?? "";
  return text.length > 120 ? text.slice(0, 120) + "…" : text;
}

export function formatTracker(
  tracker: CbTracker,
  fields: CbTrackerField[],
  items: CbItem[] = [],
): string {
  const lines: string[] = [
    `## ${tracker.name}`,
    "",
    `- **ID:** ${tracker.id}`,
    `- **Type:** ${tracker.type?.name ?? "?"}`,
    `- **Project:** ${tracker.project?.name ?? "?"} (ID: ${tracker.project?.id ?? "?"})`,
  ];

  if (tracker.keyName) {
    lines.push(`- **Key:** ${tracker.keyName}`);
  }
  if (tracker.description) {
    lines.push("", "### Description", "", tracker.description);
  }

  if (fields.length > 0) {
    const visibleFields = fields.filter((f) => !f.hidden);
    lines.push("", "### Fields", "");
    lines.push("| ID | Name | Type | Required |");
    lines.push("|----|------|------|----------|");
    for (const f of visibleFields) {
      lines.push(
        `| ${f.fieldId} | ${f.name} | ${f.type ?? "-"} | ${f.required ? "Yes" : "No"} |`,
      );
    }
  }

  if (items.length > 0) {
    lines.push("", `### Items (${items.length})`, "");
    lines.push("| ID | Name | Status | Type | Description |");
    lines.push("|----|------|--------|------|-------------|");
    for (const item of items) {
      const desc = extractDescription(item.description);
      lines.push(
        `| ${item.id} | ${item.name} | ${item.status?.name ?? "-"} | ${item.tracker?.type ?? tracker.type?.name ?? "-"} | ${desc} |`,
      );
    }
  }

  return lines.join("\n");
}

export function formatTrackerRootChildren(children: CbReference[]): string {
  if (children.length === 0) return "_No root-level outline items found._";

  const rows = children.map(
    (child) => `| ${child.id} | ${child.name} | ${child.type ?? "-"} |`,
  );

  return [
    `## Tracker Root Children (${children.length})`,
    "",
    "| ID | Name | Type |",
    "|----|------|------|",
    ...rows,
  ].join("\n");
}

function formatScalar(value: unknown): string {
  if (value === undefined || value === null || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "-";
  return String(value);
}

function formatReferenceTypes(field: CbTrackerField): string {
  const types = field.referenceTypes ?? (field.referenceType ? [field.referenceType] : []);
  return types.length > 0 ? types.join(", ") : "-";
}

export function formatTrackerField(field: CbTrackerField): string {
  const lines: string[] = [
    `## ${field.name}`,
    "",
    `- **Field ID:** ${field.fieldId}`,
    `- **Type:** ${field.type ?? "?"}`,
    `- **Value model:** ${formatScalar(field.valueModel)}`,
    `- **Tracker item field:** ${formatScalar(field.trackerItemField)}`,
    `- **Legacy REST name:** ${formatScalar(field.legacyRestName)}`,
    `- **Required:** ${formatScalar(field.required)}`,
    `- **Hidden:** ${formatScalar(field.hidden)}`,
    `- **Multiple values:** ${formatScalar(field.multipleValues)}`,
    `- **Reference types:** ${formatReferenceTypes(field)}`,
  ];

  if (field.options && field.options.length > 0) {
    lines.push("", `### Options (${field.options.length})`, "");
    lines.push("| ID | Name |");
    lines.push("|----|------|");
    for (const option of field.options) {
      lines.push(`| ${option.id} | ${option.name} |`);
    }
  }

  if (field.allowedValues && field.allowedValues.length > 0) {
    lines.push("", `### Allowed Values (${field.allowedValues.length})`, "");
    lines.push("| ID | Name | Type |");
    lines.push("|----|------|------|");
    for (const value of field.allowedValues) {
      lines.push(`| ${value.id} | ${value.name ?? "-"} | ${value.type ?? "-"} |`);
    }
  }

  if (field.columns && field.columns.length > 0) {
    lines.push("", `### Columns (${field.columns.length})`, "");
    lines.push("| ID | Name | Type | Value model | Legacy REST name |");
    lines.push("|----|------|------|-------------|------------------|");
    for (const column of field.columns) {
      lines.push(
        `| ${column.fieldId} | ${column.name} | ${column.type ?? "-"} | ${formatScalar(column.valueModel)} | ${formatScalar(column.legacyRestName)} |`,
      );
    }
  }

  return lines.join("\n");
}
