import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CodebeamerClient } from "../client/codebeamer-client.js";
import { formatItem } from "../formatters/item-formatter.js";

export function buildHarmCreateData(options: {
  name: string;
  description?: string;
  imdrfCode?: string;
  severity?: number;
  imdrfCodeFieldId: number;
  severityFieldId: number;
}) {
  const customFields: Array<{ fieldId: number; type: string; value: unknown }> = [];

  if (options.imdrfCode !== undefined) {
    customFields.push({ fieldId: options.imdrfCodeFieldId, type: "TextFieldValue", value: options.imdrfCode });
  }
  if (options.severity !== undefined) {
    customFields.push({ fieldId: options.severityFieldId, type: "IntegerFieldValue", value: options.severity });
  }

  return {
    name: options.name,
    ...(options.description !== undefined ? { description: options.description } : {}),
    ...(customFields.length > 0 ? { customFields } : {}),
  };
}

export function registerRiskWriteTools(
  server: McpServer,
  client: CodebeamerClient,
): void {
  server.registerTool(
    "create_harm",
    {
      title: "Create Harm",
      description:
        "Create a new item in a Codebeamer RM Harms List tracker. " +
        "Supports setting the IMDRF code (text) and Severity (integer 1–5). " +
        "Use list_trackers to find the Harms List tracker ID for your project.",
      inputSchema: {
        trackerId: z
          .number()
          .int()
          .positive()
          .describe("Numeric tracker ID of the RM Harms List tracker"),
        name: z.string().min(1).describe("Harm name / summary"),
        description: z
          .string()
          .optional()
          .describe("Harm description (plain text or wiki markup)"),
        imdrfCode: z
          .string()
          .optional()
          .describe("IMDRF code for this harm (e.g. 'E0001')"),
        severity: z
          .number()
          .int()
          .min(1)
          .max(5)
          .optional()
          .describe("Severity level (integer 1–5)"),
        imdrfCodeFieldId: z
          .number()
          .int()
          .positive()
          .default(10000)
          .describe("Field ID for IMDRF code. Defaults to 10000 for legacy RM Harms List trackers."),
        severityFieldId: z
          .number()
          .int()
          .positive()
          .default(10001)
          .describe("Field ID for severity. Defaults to 10001 for legacy RM Harms List trackers."),
        parentId: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Parent item ID to nest this harm inside (e.g. a folder)"),
      },
    },
    async ({ trackerId, name, description, imdrfCode, severity, imdrfCodeFieldId, severityFieldId, parentId }) => {
      const data = buildHarmCreateData({
        name,
        description,
        imdrfCode,
        severity,
        imdrfCodeFieldId,
        severityFieldId,
      });

      const item = await client.createItem(trackerId, data, parentId);
      return { content: [{ type: "text", text: formatItem(item) }] };
    },
  );
}
