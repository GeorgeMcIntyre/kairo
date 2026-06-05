import type { Bounds3, Vec3 } from "@kairo/core";
import { describe, expect, it } from "vitest";
import type { Device, Station } from "../advancedEngineering/advancedLayout";
import { buildLayoutValidationIssues } from "./layoutRules";

function bounds(minX: number, minY: number, maxX: number, maxY: number): Bounds3 {
  return { min: [minX, minY, 0], max: [maxX, maxY, 0] };
}

function station(id: string, stationBounds: Bounds3 = bounds(0, 0, 1000, 1000)): Station {
  return {
    id,
    lineId: "line-7b",
    stationNumber: "020",
    side: "L",
    processName: "LOAD",
    anchorTextIds: [`text-${id}`],
    deviceIds: [],
    annotationIds: [],
    bounds: stationBounds,
    position: [stationBounds.min[0], stationBounds.min[1], 0] as Vec3,
    confidence: 0.95,
    evidence: [`station ${id}`]
  };
}

function device(id: string, patch: Partial<Device> = {}): Device {
  const footprint = patch.footprintBounds ?? bounds(0, 0, 100, 100);
  return {
    id,
    kind: "robot",
    primaryLabel: id,
    equipmentTypeId: "robot.generic",
    equipmentDisplayName: "Generic industrial robot",
    bomCategory: "robot",
    equipmentRequiresReview: true,
    displayText: id,
    stationId: "7B-020L",
    sourceTextIds: [`text-${id}`],
    linkedEntityIds: [`geom-${id}`],
    geometryGroupId: `group-${id}`,
    bounds: footprint,
    centroid: [50, 50, 0],
    footprintBounds: footprint,
    clearanceBounds: patch.clearanceBounds ?? bounds(-10, -10, 110, 110),
    paddedBounds: patch.paddedBounds ?? bounds(-20, -20, 120, 120),
    footprintSource: "geometry-bounds",
    clearanceReason: "test clearance",
    paddingMm: 10,
    associationStatus: "linked",
    confidence: 0.95,
    evidence: ["test device"],
    ...patch
  };
}

describe("layout validation rules", () => {
  it("emits review issues for unlinked, ambiguous, unmapped, and low-confidence devices", () => {
    const issues = buildLayoutValidationIssues(
      [
        device("unlinked", {
          associationStatus: "unlinked",
          confidence: 0.5,
          equipmentTypeId: undefined,
          linkedEntityIds: [],
          footprintSource: "library-default"
        }),
        device("ambiguous", {
          associationStatus: "ambiguous"
        })
      ],
      [station("7B-020L")]
    );

    expect(issues.map((issue) => issue.ruleId)).toEqual(
      expect.arrayContaining([
        "DEVICE_UNLINKED_GEOMETRY",
        "DEVICE_AMBIGUOUS_GEOMETRY",
        "MISSING_EQUIPMENT_LIBRARY_MATCH",
        "LOW_CONFIDENCE_BOM_ROW"
      ])
    );
    expect(issues.find((issue) => issue.ruleId === "DEVICE_UNLINKED_GEOMETRY")).toMatchObject({
      severity: "warning",
      deviceIds: ["unlinked"]
    });
  });

  it("emits critical footprint overlap before clearance overlap for the same pair", () => {
    const issues = buildLayoutValidationIssues(
      [
        device("left", { footprintBounds: bounds(0, 0, 100, 100), clearanceBounds: bounds(-20, -20, 120, 120) }),
        device("right", { footprintBounds: bounds(50, 50, 150, 150), clearanceBounds: bounds(30, 30, 170, 170) })
      ],
      [station("7B-020L")],
      { overlapToleranceMm: 1 }
    );

    expect(issues.map((issue) => issue.ruleId)).toContain("FOOTPRINT_OVERLAP");
    expect(issues.map((issue) => issue.ruleId)).not.toContain("CLEARANCE_OVERLAP");
    expect(issues.find((issue) => issue.ruleId === "FOOTPRINT_OVERLAP")).toMatchObject({
      severity: "critical",
      deviceIds: ["left", "right"]
    });
  });

  it("emits clearance overlap when footprint envelopes do not overlap", () => {
    const issues = buildLayoutValidationIssues(
      [
        device("left", { footprintBounds: bounds(0, 0, 100, 100), clearanceBounds: bounds(-20, -20, 160, 160) }),
        device("right", { footprintBounds: bounds(120, 0, 220, 100), clearanceBounds: bounds(100, -20, 240, 120) })
      ],
      [station("7B-020L")],
      { overlapToleranceMm: 1 }
    );

    expect(issues.find((issue) => issue.ruleId === "CLEARANCE_OVERLAP")).toMatchObject({
      severity: "warning",
      deviceIds: ["left", "right"]
    });
  });

  it("emits a station-neighborhood issue only when assigned equipment is far from its station", () => {
    const issues = buildLayoutValidationIssues(
      [
        device("near", { footprintBounds: bounds(100, 100, 200, 200) }),
        device("far", { footprintBounds: bounds(100000, 100000, 100100, 100100) })
      ],
      [station("7B-020L")],
      { stationNeighborhoodRadiusMm: 1000 }
    );

    expect(issues.filter((issue) => issue.ruleId === "OUTSIDE_STATION_NEIGHBORHOOD")).toHaveLength(1);
    expect(issues.find((issue) => issue.ruleId === "OUTSIDE_STATION_NEIGHBORHOOD")?.deviceIds).toEqual(["far"]);
  });
});
