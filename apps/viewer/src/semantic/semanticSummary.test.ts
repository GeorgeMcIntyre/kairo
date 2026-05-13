import type { LayoutSemantics } from "./layoutSemantics";
import {
  applySemanticDeviceOverrides,
  buildSemanticSummary,
  exportSemanticSummaryJson,
  exportSemanticSummaryMarkdown
} from "./semanticSummary";
import { describe, expect, it } from "vitest";

function semanticsFixture(): LayoutSemantics {
  return {
    textEntities: [
      {
        entityId: "text-a",
        text: "7B-020L-04 (RIVET)\nBASE PLATE",
        normalizedText: "7B-020L-04 (RIVET) BASE PLATE",
        position: [0, 0, 0],
        rotationDeg: 0,
        height: 100,
        sourceKind: "TEXT",
        bounds: { min: [-50, -50, 0], max: [50, 50, 0] }
      }
    ],
    mergedTextLabels: [],
    unknownTextEntities: [],
    geometryGroups: [
      {
        id: "group-a",
        source: "cluster",
        entityIds: ["line-a"],
        sourceRefs: [],
        layerIds: ["layer-a"],
        layerNames: ["A"],
        bounds: { min: [0, 0, 0], max: [10, 10, 0] },
        centroid: [5, 5, 0],
        diagonal: Math.SQRT2 * 10
      },
      {
        id: "group-far",
        source: "cluster",
        entityIds: ["line-far"],
        sourceRefs: [],
        layerIds: ["layer-b"],
        layerNames: ["B"],
        bounds: { min: [1000, 1000, 0], max: [1010, 1010, 0] },
        centroid: [1005, 1005, 0],
        diagonal: Math.SQRT2 * 10
      }
    ],
    stations: [],
    devices: [
      {
        id: "device-a",
        kind: "device_number",
        labelText: "7B-020L-04 (RIVET)\nBASE PLATE",
        normalizedText: "7B-020L-04 (RIVET) BASE PLATE",
        position: [0, 0, 0],
        rotationDeg: 0,
        height: 100,
        bounds: { min: [-50, -50, 0], max: [50, 50, 0] },
        centroid: [0, 0, 0],
        sourceTextEntityIds: ["text-a"],
        nearbyEntityIds: [],
        linkedEntityIds: [],
        stationAssociationMethod: "none",
        confidence: 0.52,
        evidence: ["numeric suffix is a device tag, not a station", "distance to group 120 mm"],
        associationStatus: "unlinked",
        associationConfidence: 0.2,
        associationReason: ["no nearby geometry group found"],
        associationCandidates: []
      }
    ]
  };
}

describe("semantic summary", () => {
  it("applies manual geometry and class overrides without mutating source semantics", () => {
    const original = semanticsFixture();
    const effective = applySemanticDeviceOverrides(original, {
      "device-a": { kind: "nest", geometryGroupId: "group-a" }
    });

    expect(original.devices[0].kind).toBe("device_number");
    expect(effective.devices[0]).toMatchObject({
      kind: "nest",
      associationStatus: "linked",
      linkedEntityIds: ["line-a"],
      centroid: [5, 5, 0]
    });
  });

  it("exports useful markdown counts and devices", () => {
    const summary = buildSemanticSummary(semanticsFixture(), "input.dxf");
    const markdown = exportSemanticSummaryMarkdown(summary);
    const deviceRows = markdown.split("\n").filter((line) => line.startsWith("| 7B-020L-04"));

    expect(summary.counts.devices).toBe(1);
    expect(summary.counts.unlinkedDevices).toBe(1);
    expect(markdown).toContain("Kairo Semantic Summary");
    expect(markdown).toContain("7B-020L-04 (RIVET) BASE PLATE");
    expect(markdown).not.toContain("(RIVET)\nBASE PLATE");
    expect(deviceRows).toHaveLength(1);
    expect(deviceRows[0].split("|")).toHaveLength(9);
  });

  it("exports classification and manual override evidence", () => {
    const effective = applySemanticDeviceOverrides(semanticsFixture(), {
      "device-a": { kind: "nest", geometryGroupId: "group-a" }
    });
    const json = JSON.parse(exportSemanticSummaryJson(buildSemanticSummary(effective, "input.dxf")));
    const reason = json.devices[0].reason.join(" ");

    expect(reason).toContain("numeric suffix is a device tag, not a station");
    expect(reason).toContain("manual class override to nest");
    expect(reason).toContain("manual geometry override to group-a");
  });

  it("merges label and geometry bounds for manual geometry overrides", () => {
    const effective = applySemanticDeviceOverrides(semanticsFixture(), {
      "device-a": { geometryGroupId: "group-far" }
    });

    expect(effective.devices[0].bounds).toEqual({
      min: [-50, -50, 0],
      max: [1010, 1010, 0]
    });
  });
});
