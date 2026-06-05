import type { Bounds3, Vec3 } from "@kairo/core";
import type { LayoutSemantics } from "./layoutSemantics";
import {
  buildSemanticReviewArtifact,
  exportSemanticReviewArtifactJson,
  parseSemanticReviewArtifactJson,
  semanticOverridesFromReviewArtifact
} from "./semanticReviewArtifact";
import { describe, expect, it } from "vitest";

function bounds(x: number, y: number, width = 100, height = 100): Bounds3 {
  return { min: [x, y, 0], max: [x + width, y + height, 0] };
}

function center(bound: Bounds3): Vec3 {
  return [(bound.min[0] + bound.max[0]) / 2, (bound.min[1] + bound.max[1]) / 2, 0];
}

function device(label: string, kind: LayoutSemantics["devices"][number]["kind"], patch: Partial<LayoutSemantics["devices"][number]>) {
  const deviceBounds = patch.bounds ?? bounds(0, 0);
  return {
    id: `device-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    kind,
    labelText: label,
    rawText: label,
    displayText: label,
    normalizedText: label,
    associationText: label,
    position: center(deviceBounds),
    rotationDeg: 0,
    height: 120,
    bounds: deviceBounds,
    centroid: center(deviceBounds),
    sourceTextEntityIds: [`text-${label}`],
    nearbyEntityIds: patch.linkedEntityIds ?? [],
    linkedEntityIds: patch.linkedEntityIds ?? [],
    geometryGroupId: patch.geometryGroupId,
    geometryGroupSource: patch.geometryGroupSource,
    stationId: label.slice(0, 7),
    stationAssociationMethod: "station-id" as const,
    tagSuffix: label.split("-").at(-1),
    confidence: patch.confidence ?? 0.94,
    evidence: patch.evidence ?? [`known P736 ${kind} tag`],
    associationStatus: patch.associationStatus ?? "linked",
    associationConfidence: patch.associationConfidence ?? 0.9,
    associationReason: patch.associationReason ?? ["test association"],
    associationCandidates: patch.associationCandidates ?? []
  };
}

function p736Semantics(): LayoutSemantics {
  return {
    textEntities: [],
    mergedTextLabels: [],
    stations: [],
    unknownTextEntities: [],
    geometryGroups: [
      {
        id: "group-robot",
        source: "cluster",
        entityIds: ["robot-line"],
        sourceRefs: [],
        layerIds: ["robot-layer"],
        layerNames: ["Robot"],
        bounds: bounds(0, 0, 500, 500),
        centroid: [250, 250, 0],
        diagonal: Math.hypot(500, 500)
      },
      {
        id: "group-nest",
        source: "cluster",
        entityIds: ["nest-line"],
        sourceRefs: [],
        layerIds: ["nest-layer"],
        layerNames: ["Nest"],
        bounds: bounds(1200, 0, 400, 400),
        centroid: [1400, 200, 0],
        diagonal: Math.hypot(400, 400)
      }
    ],
    devices: [
      device("7B-020L-04", "robot", {
        geometryGroupId: "group-robot",
        geometryGroupSource: "cluster",
        linkedEntityIds: ["robot-line"],
        bounds: bounds(0, 0)
      }),
      device("7B-070L-DN1", "dunnage", {
        geometryGroupId: "group-dn1",
        linkedEntityIds: ["dn1-line"],
        bounds: bounds(600, 0)
      }),
      device("7B-070L-DN2", "dunnage", {
        associationStatus: "ambiguous",
        associationConfidence: 0.51,
        associationCandidates: [
          {
            groupId: "candidate-a",
            source: "cluster",
            entityIds: ["a"],
            bounds: bounds(900, 100),
            centroid: [950, 150, 0],
            distanceToBounds: 100,
            distanceToCentroid: 120,
            confidence: 0.51,
            reason: ["candidate a"]
          },
          {
            groupId: "candidate-b",
            source: "cluster",
            entityIds: ["b"],
            bounds: bounds(900, 200),
            centroid: [950, 250, 0],
            distanceToBounds: 120,
            distanceToCentroid: 150,
            confidence: 0.49,
            reason: ["candidate b"]
          }
        ],
        linkedEntityIds: [],
        bounds: bounds(900, 0)
      }),
      device("7B-060L-1N", "nest", {
        geometryGroupId: "group-nest",
        geometryGroupSource: "cluster",
        linkedEntityIds: ["nest-line"],
        bounds: bounds(1200, 0)
      })
    ]
  };
}

describe("semantic review artifact", () => {
  it("exports P736 semantic review records with accepted, corrected, rejected, and uncertain statuses", () => {
    const artifact = buildSemanticReviewArtifact(
      p736Semantics(),
      {
        "device-7b-020l-04": { kind: "robot_model", geometryGroupId: "group-robot" },
        "device-7b-070l-dn1": { unlink: true }
      },
      "layouts/P736.dxf"
    );
    const byLabel = new Map(artifact.records.map((record) => [record.detectedLabel, record]));

    expect(artifact.schema).toBe("kairo-semantic-review-artifact");
    expect(artifact.source).toMatchObject({ name: "P736.dxf", path: "layouts/P736.dxf" });
    expect(artifact.summary).toEqual({
      totalRecords: 4,
      acceptedRecords: 1,
      correctedRecords: 1,
      rejectedRecords: 1,
      uncertainRecords: 1,
      overrideRecords: 2
    });
    expect(byLabel.get("7B-020L-04")).toMatchObject({
      detectedDeviceType: "robot",
      correctedDeviceType: "robot_model",
      correctedGeometryGroupId: "group-robot",
      reviewStatus: "corrected"
    });
    expect(byLabel.get("7B-070L-DN1")).toMatchObject({ detectedDeviceType: "dunnage", unlink: true, reviewStatus: "rejected" });
    expect(byLabel.get("7B-070L-DN2")).toMatchObject({ detectedDeviceType: "dunnage", reviewStatus: "uncertain" });
    expect(byLabel.get("7B-060L-1N")).toMatchObject({ detectedDeviceType: "nest", reviewStatus: "accepted" });
  });

  it("imports a valid reviewed artifact and returns only trainable override decisions", () => {
    const semantics = p736Semantics();
    const artifact = buildSemanticReviewArtifact(
      semantics,
      {
        "device-7b-020l-04": { kind: "robot_model", geometryGroupId: "group-robot" },
        "device-7b-070l-dn1": { unlink: true }
      },
      "layouts/P736.dxf"
    );

    const result = parseSemanticReviewArtifactJson(exportSemanticReviewArtifactJson(artifact), semantics);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(semanticOverridesFromReviewArtifact(result.artifact)).toEqual({
      "device-7b-020l-04": { kind: "robot_model", geometryGroupId: "group-robot" },
      "device-7b-070l-dn1": { unlink: true }
    });
  });

  it("fails clearly when a reviewed artifact references stale current-scene IDs", () => {
    const semantics = p736Semantics();
    const artifact = buildSemanticReviewArtifact(
      semantics,
      { "device-7b-020l-04": { kind: "robot_model", geometryGroupId: "group-robot" } },
      "layouts/P736.dxf"
    );
    artifact.records[0] = {
      ...artifact.records[0],
      deviceId: "missing-device",
      correctedGeometryGroupId: "missing-group"
    };

    const result = parseSemanticReviewArtifactJson(JSON.stringify(artifact), semantics);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((error) => `${error.path}: ${error.message}`)).toContain(
      "records[0].deviceId: deviceId 'missing-device' does not exist in the current semantics."
    );
    expect(result.errors.map((error) => `${error.path}: ${error.message}`)).toContain(
      "records[0].correctedGeometryGroupId: correctedGeometryGroupId 'missing-group' does not exist in the current semantics."
    );
  });

  it("rejects malformed corrected and rejected records with actionable messages", () => {
    const artifact = buildSemanticReviewArtifact(p736Semantics(), {}, "layouts/P736.dxf");
    artifact.records[0] = {
      ...artifact.records[0],
      reviewStatus: "corrected",
      correctedDeviceType: undefined,
      correctedGeometryGroupId: undefined
    };
    artifact.records[1] = {
      ...artifact.records[1],
      reviewStatus: "rejected",
      unlink: false
    };

    const result = parseSemanticReviewArtifactJson(JSON.stringify(artifact), p736Semantics());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((error) => `${error.path}: ${error.message}`)).toContain(
      "records[0].reviewStatus: corrected records must include correctedDeviceType or correctedGeometryGroupId."
    );
    expect(result.errors.map((error) => `${error.path}: ${error.message}`)).toContain(
      "records[1].unlink: rejected records must set unlink to true."
    );
  });
});
