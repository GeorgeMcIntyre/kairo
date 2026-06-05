import type { Bounds3 } from "@kairo/core";
import { describe, expect, it } from "vitest";
import type { DeviceSemantic } from "../semantic/layoutSemantics";
import { findEquipmentForDeviceKind } from "./equipmentLibrary";
import { buildEquipmentEnvelope } from "./equipmentEnvelope";

const labelBounds: Bounds3 = { min: [0, 0, 0], max: [100, 100, 0] };
const geometryBounds: Bounds3 = { min: [1000, 2000, 0], max: [2000, 3000, 0] };

function device(patch: Partial<DeviceSemantic> = {}): DeviceSemantic {
  return {
    id: "device-1",
    kind: "robot",
    labelText: "7B-020L-04",
    rawText: "7B-020L-04",
    displayText: "7B-020L-04",
    normalizedText: "7B-020L-04",
    associationText: "7B-020L-04",
    position: [50, 50, 0],
    rotationDeg: 0,
    height: 100,
    bounds: labelBounds,
    centroid: [50, 50, 0],
    sourceTextEntityIds: ["text-1"],
    nearbyEntityIds: [],
    linkedEntityIds: [],
    stationAssociationMethod: "station-id",
    confidence: 0.94,
    evidence: ["known P736 robot tag"],
    associationStatus: "unlinked",
    associationConfidence: 0.2,
    associationReason: ["no nearby geometry group found"],
    associationCandidates: [],
    ...patch
  };
}

describe("equipment envelopes", () => {
  it("uses linked geometry bounds as the footprint when association is linked", () => {
    const envelope = buildEquipmentEnvelope(
      device({
        associationStatus: "linked",
        geometryGroupId: "group-robot",
        linkedEntityIds: ["geom-1"],
        associationCandidates: [
          {
            groupId: "group-robot",
            source: "block-insert",
            entityIds: ["geom-1"],
            bounds: geometryBounds,
            centroid: [1500, 2500, 0],
            distanceToBounds: 0,
            distanceToCentroid: 0,
            confidence: 0.9,
            reason: ["block insert"]
          }
        ]
      }),
      findEquipmentForDeviceKind("robot")
    );

    expect(envelope).toMatchObject({
      footprintSource: "geometry-bounds",
      footprintBounds: geometryBounds,
      clearanceBounds: { min: [0, 1000, 0], max: [3000, 4000, 0] },
      paddedBounds: { min: [-250, 750, 0], max: [3250, 4250, 0] },
      paddingMm: 250
    });
  });

  it("uses the best candidate bounds for ambiguous devices and requires review", () => {
    const envelope = buildEquipmentEnvelope(
      device({
        associationStatus: "ambiguous",
        associationCandidates: [
          {
            groupId: "candidate-a",
            source: "cluster",
            entityIds: ["geom-a"],
            bounds: geometryBounds,
            centroid: [1500, 2500, 0],
            distanceToBounds: 20,
            distanceToCentroid: 50,
            confidence: 0.68,
            reason: ["nearby cluster"]
          }
        ]
      }),
      findEquipmentForDeviceKind("robot")
    );

    expect(envelope.footprintSource).toBe("candidate-geometry-bounds");
    expect(envelope.footprintBounds).toEqual(geometryBounds);
    expect(envelope.requiresReview).toBe(true);
    expect(envelope.evidence.join(" ")).toContain("ambiguous");
  });

  it("uses library fallback dimensions around label bounds for unlinked mapped devices", () => {
    const envelope = buildEquipmentEnvelope(device(), findEquipmentForDeviceKind("dunnage"));

    expect(envelope.footprintSource).toBe("library-default");
    expect(envelope.footprintBounds).toEqual({
      min: [-850, -550, 0],
      max: [950, 650, 0]
    });
    expect(envelope.clearanceBounds).toEqual({
      min: [-1350, -1050, 0],
      max: [1450, 1400, 0]
    });
    expect(envelope.paddedBounds).toEqual({
      min: [-1500, -1200, 0],
      max: [1600, 1550, 0]
    });
  });

  it("falls back to label bounds without clearance when no library match exists", () => {
    const envelope = buildEquipmentEnvelope(device({ kind: "service_drop" }), undefined);

    expect(envelope).toMatchObject({
      footprintSource: "label-bounds",
      footprintBounds: labelBounds,
      clearanceBounds: labelBounds,
      paddedBounds: labelBounds,
      paddingMm: 0,
      requiresReview: true
    });
  });
});
