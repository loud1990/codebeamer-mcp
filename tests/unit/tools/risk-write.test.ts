import { describe, expect, it } from "vitest";
import { buildHarmCreateData } from "../../../src/tools/risk-write.js";

describe("create_harm", () => {
  it("uses configurable field IDs for harm custom fields", () => {
    const data = buildHarmCreateData({
      name: "Synthetic harm",
      description: "Synthetic harm description",
      imdrfCode: "SYNTHETIC_IMDRF",
      severity: 3,
      imdrfCodeFieldId: 20000,
      severityFieldId: 20001,
    });

    expect(data).toEqual({
      name: "Synthetic harm",
      description: "Synthetic harm description",
      customFields: [
        { fieldId: 20000, type: "TextFieldValue", value: "SYNTHETIC_IMDRF" },
        { fieldId: 20001, type: "IntegerFieldValue", value: 3 },
      ],
    });
  });
});

