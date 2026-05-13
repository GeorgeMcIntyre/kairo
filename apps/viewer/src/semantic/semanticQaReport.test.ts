import type { Bounds3 } from "@kairo/core";
import { describe, expect, it } from "vitest";
import { parseDeviceText, type DeviceKind } from "./deviceDictionary";
import { parseStationLabel, type DeviceSemantic, type LayoutSemantics } from "./layoutSemantics";
import {
  buildScottSemanticQaReport,
  exportScottSemanticQaMarkdown,
  type SemanticQaRiskMarker
} from "./semanticQaReport";

const emptyBounds: Bounds3 = { min: [0, 0, 0], max: [100, 100, 0] };

function device(
  label: string,
  kind: DeviceKind,
  stationId: string | undefined,
  patch: Partial<DeviceSemantic> = {}
): DeviceSemantic {
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
    geometryGroupSource: associationStatus === "linked" ? "cluster" : undefined,
    stationId,
    stationAssociationMethod: stationId ? "station-id" : "none",
    tagSuffix: label.split("-").at(-1),
    confidence: 0.9,
    evidence: ["station-device suffix pattern"],
    associationStatus,
    associationConfidence: associationStatus === "linked" ? 0.86 : 0.32,
    associationReason: [associationStatus === "linked" ? "nearby geometry cluster" : "no nearby geometry group found"],
    associationCandidates: [
      {
        groupId: `group-${label}`,
        source: "cluster",
        entityIds: [`entity-${label}`],
        bounds: emptyBounds,
        centroid: [50, 50, 0],
        distanceToBounds: 120,
        distanceToCentroid: 180,
        confidence: 0.86,
        reason: ["nearby geometry cluster"]
      }
    ],
    ...patch
  };
}

function semantics(devices: DeviceSemantic[]): LayoutSemantics {
  return {
    textEntities: [],
    mergedTextLabels: [],
    geometryGroups: [],
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
        deviceIds: devices.map((entry) => entry.id),
        confidence: 0.95
      }
    ],
    devices,
    unknownTextEntities: []
  };
}

function markersFor(reportDevices: ReturnType<typeof buildScottSemanticQaReport>["devices"], label: string): SemanticQaRiskMarker[] {
  return reportDevices.find((entry) => entry.label === label)?.riskMarkers ?? [];
}

describe("Scott semantic QA report", () => {
  it("keeps protected Scott label classification expectations explicit", () => {
    expect(parseStationLabel("7B-020L-04")).toBeUndefined();
    expect(parseDeviceText("7B-020L-04")).toMatchObject({ kind: "device_number", parentStationId: "7B-020L" });
    expect(parseDeviceText("7B-070L-DN1")).toMatchObject({ kind: "dunnage", parentStationId: "7B-070L" });
    expect(parseDeviceText("7B-070L-DN2")).toMatchObject({ kind: "dunnage", parentStationId: "7B-070L" });
    expect(parseDeviceText("7B-060L-1N")).toMatchObject({ kind: "nest", parentStationId: "7B-060L" });
  });

  it("reports required Scott labels as found with expected kinds", () => {
    const report = buildScottSemanticQaReport(
      semantics([
        device("7B-020L-04", "device_number", "7B-020L"),
        device("7B-070L-DN1", "dunnage", "7B-070L"),
        device("7B-070L-DN2", "dunnage", "7B-070L"),
        device("7B-060L-1N", "nest", "7B-060L")
      ])
    );

    expect(report.counts.requiredLabelsFound).toBe(4);
    expect(report.counts.requiredLabelsMissing).toBe(0);
    expect(report.requiredLabels.map((entry) => [entry.label, entry.actualKind, entry.riskMarkers])).toEqual([
      ["7B-020L-04", "device_number", ["OK"]],
      ["7B-070L-DN1", "dunnage", ["OK"]],
      ["7B-070L-DN2", "dunnage", ["OK"]],
      ["7B-060L-1N", "nest", ["OK"]]
    ]);
  });

  it("flags missing required labels and risky associations", () => {
    const report = buildScottSemanticQaReport(
      semantics([
        device("7B-020L-04", "station_device_tag", undefined, {
          associationStatus: "unlinked",
          confidence: 0.5,
          linkedEntityIds: [],
          nearbyEntityIds: [],
          associationCandidates: []
        })
      ])
    );

    const requiredDevice = report.requiredLabels.find((entry) => entry.label === "7B-020L-04");
    const missingDunnage = report.requiredLabels.find((entry) => entry.label === "7B-070L-DN1");

    expect(requiredDevice?.riskMarkers).toEqual(
      expect.arrayContaining([
        "UNLINKED",
        "LOW_CONFIDENCE",
        "KIND_MISMATCH",
        "POSSIBLE_STATION_DEVICE_CONFUSION",
        "REVIEW_REQUIRED"
      ])
    );
    expect(missingDunnage?.riskMarkers).toEqual(["MISSING_REQUIRED_LABEL"]);
    expect(markersFor(report.devices, "7B-020L-04")).toEqual(
      expect.arrayContaining(["UNLINKED", "LOW_CONFIDENCE", "POSSIBLE_STATION_DEVICE_CONFUSION"])
    );
  });

  it("flags ambiguous required label associations for reviewer follow-up", () => {
    const report = buildScottSemanticQaReport(
      semantics([
        device("7B-070L-DN1", "dunnage", "7B-070L", {
          associationStatus: "ambiguous",
          associationConfidence: 0.48,
          linkedEntityIds: [],
          associationReason: ["multiple nearby geometry groups scored similarly"]
        })
      ])
    );

    const requiredDunnage = report.requiredLabels.find((entry) => entry.label === "7B-070L-DN1");

    expect(requiredDunnage?.riskMarkers).toEqual(expect.arrayContaining(["AMBIGUOUS", "REVIEW_REQUIRED"]));
    expect(markersFor(report.devices, "7B-070L-DN1")).toEqual(
      expect.arrayContaining(["AMBIGUOUS", "REVIEW_REQUIRED"])
    );
  });

  it("exports reviewer columns, known limits, and no machine-local source path", () => {
    const report = buildScottSemanticQaReport(
      semantics([device("7B-020L-04", "device_number", "7B-020L")]),
      "C:\\Users\\George\\Downloads\\ScottLayouts\\layout.dxf"
    );
    const markdown = exportScottSemanticQaMarkdown(report);

    expect(markdown).toContain("Reviewer result");
    expect(markdown).toContain("Reviewer notes");
    expect(markdown).toContain("## Known Limits");
    expect(markdown).toContain("manual visual QA pending");
    expect(markdown).toContain("local DXF source (path intentionally omitted)");
    expect(markdown).not.toContain("C:\\Users\\George");
    expect(markdown).not.toContain("Downloads\\ScottLayouts");
    expect(markdown).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});
