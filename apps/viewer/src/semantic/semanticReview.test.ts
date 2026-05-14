import type { ScenePackage } from "@kairo/schema";
import type { LayoutSemantics } from "./layoutSemantics";
import { describe, expect, it } from "vitest";
import { buildSemanticSummary } from "./semanticSummary";
import {
  buildSemanticReviewDocument,
  buildSemanticReviewFingerprint,
  exportSemanticReviewJson,
  parseSemanticReviewDocument,
  reconcileSemanticReviewDocument
} from "./semanticReview";

const bounds = { min: [0, 0, 0] as [number, number, number], max: [100, 100, 0] as [number, number, number] };

function scenePackage(): ScenePackage {
  return {
    manifest: {
      format: "kairo-neutral-scene",
      version: "0.1.0",
      units: "millimeter",
      axisSystem: { up: "Z", handedness: "right" },
      rootSceneFile: "scene.json",
      createdBy: { name: "test", version: "0.1.0" },
      source: {
        format: "DXF",
        path: "C:\\Users\\georgem\\Downloads\\ScottLayouts\\layout.dxf"
      }
    },
    scene: {
      rootNodeId: "root",
      nodes: [
        {
          id: "root",
          displayName: "root",
          type: "scene",
          children: [],
          localTransform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
        }
      ]
    },
    layers: { layers: [{ id: "layer-a", name: "A", visible: true }] },
    materials: { materials: [] },
    sourceMap: { sources: [{ id: "text-a", path: "source.dxf", format: "DXF" }] },
    geometry: [
      {
        geometries: [
          {
            id: "curves",
            kind: "curve-set",
            entities: []
          }
        ]
      }
    ]
  };
}

function semantics(): LayoutSemantics {
  return {
    textEntities: [
      {
        entityId: "text-a",
        text: "7B-070L-DN1",
        normalizedText: "7B-070L-DN1",
        position: [0, 0, 0],
        rotationDeg: 0,
        height: 100,
        sourceKind: "TEXT",
        bounds
      }
    ],
    mergedTextLabels: [],
    geometryGroups: [
      {
        id: "group-a",
        source: "cluster",
        entityIds: ["line-a"],
        sourceRefs: [],
        layerIds: ["layer-a"],
        layerNames: ["A"],
        bounds,
        centroid: [50, 50, 0],
        diagonal: Math.hypot(100, 100)
      }
    ],
    stations: [],
    devices: [
      {
        id: "device-a",
        kind: "dunnage",
        labelText: "7B-070L-DN1",
        normalizedText: "7B-070L-DN1",
        associationText: "7B-070L-DN1",
        position: [0, 0, 0],
        rotationDeg: 0,
        height: 100,
        bounds,
        centroid: [50, 50, 0],
        sourceTextEntityIds: ["text-a"],
        nearbyEntityIds: [],
        linkedEntityIds: [],
        stationId: "7B-070L",
        stationAssociationMethod: "station-id",
        confidence: 0.91,
        evidence: ["station-device suffix pattern"],
        associationStatus: "ambiguous",
        associationConfidence: 0.68,
        associationReason: ["multiple nearby geometry groups score similarly"],
        associationCandidates: [
          {
            groupId: "group-a",
            source: "cluster",
            entityIds: ["line-a"],
            bounds,
            centroid: [50, 50, 0],
            distanceToBounds: 0,
            distanceToCentroid: 70,
            confidence: 0.68,
            reason: ["nearby geometry cluster"]
          }
        ]
      }
    ],
    unknownTextEntities: []
  };
}

function reviewDocument() {
  const currentScene = scenePackage();
  const currentSemantics = semantics();
  return buildSemanticReviewDocument({
    scenePackage: currentScene,
    semantics: currentSemantics,
    devices: buildSemanticSummary(currentSemantics, currentScene.manifest.source.path).devices,
    requiredLabels: [],
    overrides: { "device-a": { geometryGroupId: "group-a" } },
    review: {
      "device-a": {
        classificationStatus: "confirmed",
        geometryStatus: "confirmed",
        needsOverride: false,
        notes: "Looks correct in the viewer."
      }
    },
    decision: "pass"
  });
}

describe("semantic review JSON", () => {
  it("exports a deterministic full device snapshot without timestamps or local paths", () => {
    const document = reviewDocument();
    const json = exportSemanticReviewJson(document);

    expect(json).toBe(exportSemanticReviewJson(document));
    expect(document.devices).toHaveLength(1);
    expect(document.devices[0]).toMatchObject({
      deviceId: "device-a",
      label: "7B-070L-DN1",
      kind: "dunnage"
    });
    expect(json).not.toContain("C:\\Users\\georgem");
    expect(json).not.toContain("Downloads\\ScottLayouts");
    expect(json).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("parses and reconciles matching overrides and review state", () => {
    const currentScene = scenePackage();
    const currentSemantics = semantics();
    const parsed = parseSemanticReviewDocument(JSON.parse(exportSemanticReviewJson(reviewDocument())));
    const reconciled = reconcileSemanticReviewDocument(
      parsed,
      buildSemanticReviewFingerprint(currentScene, currentSemantics),
      currentSemantics.devices.map((device) => device.id)
    );

    expect(reconciled.overrides).toEqual({ "device-a": { geometryGroupId: "group-a" } });
    expect(reconciled.review["device-a"]).toMatchObject({
      classificationStatus: "confirmed",
      geometryStatus: "confirmed",
      notes: "Looks correct in the viewer."
    });
    expect(reconciled.warnings).toEqual([]);
  });

  it("warns but does not apply stale review device ids", () => {
    const parsed = parseSemanticReviewDocument(JSON.parse(exportSemanticReviewJson(reviewDocument())));
    parsed.sceneFingerprint.deviceCount = 2;
    parsed.overrides["stale-device"] = { unlink: true };
    parsed.review["stale-device"] = {
      classificationStatus: "incorrect",
      geometryStatus: "incorrect",
      needsOverride: true,
      notes: "old"
    };

    const reconciled = reconcileSemanticReviewDocument(parsed, buildSemanticReviewFingerprint(scenePackage(), semantics()), [
      "device-a"
    ]);

    expect(reconciled.overrides["device-a"]).toBeDefined();
    expect(reconciled.overrides["stale-device"]).toBeUndefined();
    expect(reconciled.review["stale-device"]).toBeUndefined();
    expect(reconciled.warnings.join(" ")).toContain("fingerprint");
    expect(reconciled.warnings.join(" ")).toContain("not found");
  });

  it("rejects unsupported review files", () => {
    expect(() => parseSemanticReviewDocument({ format: "other", version: "0.1.0" })).toThrow(
      "Unsupported semantic review format/version"
    );
  });
});
