import type { Bounds3 } from "@kairo/core";
import { describe, expect, it } from "vitest";
import { parseDeviceText } from "./deviceDictionary";
import { parseStationLabel, type DeviceSemantic, type LayoutSemantics, type SemanticTextEntity } from "./layoutSemantics";
import {
  buildSemanticQaReport,
  exportSemanticQaReportJson,
  exportSemanticQaReportMarkdown
} from "./semanticQaReport";

const emptyBounds: Bounds3 = { min: [0, 0, 0], max: [100, 100, 0] };

function text(entityId: string, value: string): SemanticTextEntity {
  return {
    entityId,
    text: value,
    rawText: value,
    displayText: value,
    normalizedText: value,
    associationText: value,
    position: [0, 0, 0],
    rotationDeg: 0,
    height: 100,
    sourceKind: "TEXT",
    bounds: emptyBounds
  };
}

function device(label: string, kind: DeviceSemantic["kind"], stationId: string, patch: Partial<DeviceSemantic> = {}): DeviceSemantic {
  const associationStatus = patch.associationStatus ?? "linked";
  return {
    id: `device-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    kind,
    labelText: label,
    rawText: label,
    displayText: label,
    normalizedText: label,
    associationText: label,
    position: [0, 0, 0],
    rotationDeg: 0,
    height: 100,
    bounds: emptyBounds,
    centroid: [50, 50, 0],
    sourceTextEntityIds: [`text-${label}`],
    nearbyEntityIds: associationStatus === "linked" ? [`entity-${label}`] : [],
    linkedEntityIds: associationStatus === "linked" ? [`entity-${label}`] : [],
    geometryGroupId: associationStatus === "linked" ? `group-${label}` : undefined,
    geometryGroupSource: associationStatus === "linked" ? "block-insert" : undefined,
    stationId,
    stationAssociationMethod: "station-id",
    tagSuffix: label.split("-").at(-1),
    confidence: 0.94,
    evidence: ["station-device suffix pattern"],
    associationStatus,
    associationConfidence: associationStatus === "linked" ? 0.82 : 0.25,
    associationReason: [associationStatus === "linked" ? "block insert provenance match" : "no nearby geometry group found"],
    associationCandidates: [
      {
        groupId: `group-${label}`,
        source: "block-insert",
        entityIds: [`entity-${label}`],
        bounds: emptyBounds,
        centroid: [50, 50, 0],
        distanceToBounds: 20,
        distanceToCentroid: 40,
        confidence: 0.82,
        reason: ["block insert provenance match"]
      }
    ],
    ...patch
  };
}

function semanticsFixture(): LayoutSemantics {
  const requiredDevices = [
    device("7B-020L-04", "robot", "7B-020L"),
    device("7B-070L-DN1", "dunnage", "7B-070L"),
    device("7B-070L-DN2", "dunnage", "7B-070L"),
    device("7B-060L-1N", "nest", "7B-060L")
  ];

  return {
    textEntities: [
      ...requiredDevices.map((entry) => text(entry.sourceTextEntityIds[0], entry.labelText)),
      text("unknown-1", "CHECK NOTE"),
      text("duplicate-a", "ROBOT CONTROLLER"),
      text("duplicate-b", "ROBOT CONTROLLER")
    ],
    mergedTextLabels: [],
    geometryGroups: requiredDevices.map((entry) => ({
      id: entry.geometryGroupId ?? `group-${entry.labelText}`,
      source: "block-insert",
      entityIds: entry.linkedEntityIds,
      sourceRefs: [`src-dxf-insert-H${entry.labelText}-block-${entry.kind}-child-C1`],
      layerIds: ["layer-robot"],
      layerNames: ["0-Q-GENRO"],
      insertHandle: `H${entry.labelText}`,
      blockName: entry.kind,
      bounds: emptyBounds,
      centroid: [50, 50, 0],
      diagonal: 100
    })),
    stations: [
      {
        stationId: "7B-020L",
        linePrefix: "7B",
        stationNumber: "020",
        side: "L",
        processName: "GEO & SPAC",
        labelText: "7B-020L GEO & SPAC",
        position: [0, 0, 0],
        rotationDeg: 0,
        height: 100,
        bounds: emptyBounds,
        sourceTextEntityIds: ["station-7B-020L"],
        nearbyEntityIds: [],
        candidateDevices: [],
        deviceIds: requiredDevices.map((entry) => entry.id),
        confidence: 0.95
      }
    ],
    devices: requiredDevices,
    unknownTextEntities: [text("unknown-1", "CHECK NOTE")]
  };
}

describe("semantic QA report", () => {
  it("keeps protected Scott labels classified as device/dunnage/nest, not stations", () => {
    expect(parseStationLabel("7B-020L-04")).toBeUndefined();
    expect(parseDeviceText("7B-020L-04")).toMatchObject({ kind: "robot", parentStationId: "7B-020L" });
    expect(parseDeviceText("7B-070L-DN1")).toMatchObject({ kind: "dunnage", parentStationId: "7B-070L" });
    expect(parseDeviceText("7B-070L-DN2")).toMatchObject({ kind: "dunnage", parentStationId: "7B-070L" });
    expect(parseDeviceText("7B-060L-1N")).toMatchObject({ kind: "nest", parentStationId: "7B-060L" });
  });

  it("builds the required Scott checklist with associated geometry and block metadata", () => {
    const report = buildSemanticQaReport(semanticsFixture(), "C:\\layouts\\scott.dxf");

    expect(report.source).toBe("scott.dxf");
    expect(report.status).toBe("manual-review-pending");
    expect(report.counts.requiredLabelsFound).toBe(4);
    expect(report.requiredLabels.map((entry) => [entry.label, entry.actualKind, entry.classificationCorrect])).toEqual([
      ["7B-020L-04", "robot", true],
      ["7B-070L-DN1", "dunnage", true],
      ["7B-070L-DN2", "dunnage", true],
      ["7B-060L-1N", "nest", true]
    ]);
    expect(report.requiredLabels[0].geometry).toMatchObject({
      status: "linked",
      groupId: "group-7B-020L-04",
      blockName: "robot",
      insertHandle: "H7B-020L-04",
      linkedEntityIds: ["entity-7B-020L-04"]
    });
  });

  it("exports deterministic Markdown with detected, unknown, duplicate, and manual-review sections", () => {
    const report = buildSemanticQaReport(semanticsFixture(), "C:\\Users\\George\\Downloads\\layout.dxf");
    const first = exportSemanticQaReportMarkdown(report);
    const second = exportSemanticQaReportMarkdown(report);

    expect(first).toBe(second);
    expect(first).toContain("# Kairo Semantic QA Report");
    expect(first).toContain("Source: layout.dxf");
    expect(first).toContain("manual visual review pending");
    expect(first).toContain("## Detected Semantic Labels");
    expect(first).toContain("## Unknown / Unclassified Labels");
    expect(first).toContain("## Duplicate Labels");
    expect(first).toContain("ROBOT CONTROLLER");
    expect(first).toContain("ISSUE-019 remains manual-review pending");
    expect(first).not.toContain("C:\\Users\\George");
    expect(first).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("exports a stable JSON structure", () => {
    const json = JSON.parse(exportSemanticQaReportJson(buildSemanticQaReport(semanticsFixture(), "layout.dxf")));

    expect(json.schema).toBe("kairo-semantic-qa-report");
    expect(json.schemaVersion).toBe(1);
    expect(json.counts.unknownLabels).toBe(1);
    expect(json.unknownLabels[0]).toMatchObject({ label: "CHECK NOTE", detectedType: "unknown" });
    expect(json.duplicateLabels[0]).toMatchObject({
      normalizedLabel: "ROBOT CONTROLLER",
      count: 2,
      sourceTextEntityIds: ["duplicate-a", "duplicate-b"]
    });
  });
});
