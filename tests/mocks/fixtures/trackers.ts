import type {
  CbTracker,
  CbTrackerField,
} from "../../../src/client/codebeamer-client.js";

export function makeTracker(overrides: Partial<CbTracker> = {}): CbTracker {
  return {
    id: 100,
    name: "Bug Tracker",
    type: { id: 1, name: "Bug" },
    project: { id: 1, name: "Demo Project" },
    description: "Track software defects",
    keyName: "BUG",
    ...overrides,
  };
}

export function makeTrackerField(
  overrides: Partial<CbTrackerField> = {},
): CbTrackerField {
  return {
    fieldId: 1,
    name: "Summary",
    type: "TextFieldValue",
    required: true,
    hidden: false,
    ...overrides,
  };
}

export function makeDetailedTrackerField(
  overrides: Partial<CbTrackerField> = {},
): CbTrackerField {
  return makeTrackerField({
    fieldId: 7,
    name: "Detected in release",
    type: "ChoiceFieldValue",
    required: false,
    hidden: false,
    valueModel: "ChoiceFieldValue",
    trackerItemField: "customFields",
    legacyRestName: "detectedInRelease",
    multipleValues: true,
    referenceTypes: ["ReleaseReference", "TrackerItemReference"],
    options: [
      { id: 10, name: "Release 1.0" },
      { id: 11, name: "Release 2.0" },
    ],
    columns: [
      {
        fieldId: 8,
        name: "Step action",
        type: "WikiTextFieldValue",
        valueModel: "WikiTextFieldValue",
        legacyRestName: "action",
      },
      {
        fieldId: 9,
        name: "Expected result",
        type: "WikiTextFieldValue",
        valueModel: "WikiTextFieldValue",
        legacyRestName: "expectedResult",
      },
    ],
    ...overrides,
  });
}
