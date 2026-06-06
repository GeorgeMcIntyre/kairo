import type { DrawingEntity, ScenePackage } from "@kairo/schema";
import { describe, expect, it } from "vitest";
import { buildAdvancedLayoutModel } from "../advancedEngineering/advancedLayout";
import { buildSemanticReviewArtifact, buildSemanticSummary, computeLayoutSemantics } from "@kairo/semantic";
import { buildLayoutPackage } from "../layoutLibrary/layoutPackage";
import {
  buildBlankLayoutReviewPack,
  mergeReviewedTrainingTruth,
  type LayoutReviewPack
} from "../layoutLibrary/layoutReviewPack";
import { buildReviewedLayoutLibrary } from "../layoutLibrary/reviewedLayoutLibrary";
import {
  buildKairoProject,
  exportKairoProjectJson,
  parseKairoProjectJson
} from "./kairoProject";

function scenePackage(): ScenePackage {
  return {
    manifest: {
      format: "kairo-neutral-scene",
      version: "0.1.0",
      units: "millimeter",
      axisSystem: { up: "Z", handedness: "right" },
      rootSceneFile: "scene.json",
      createdBy: { name: "test", version: "0.1.0" },
      source: { format: "dxf", path: "C:\\layouts\\p736-layout.dxf" }
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
    layers: {
      layers: [
        { id: "layer-text", name: "G-ANNO-TEXT", visible: true },
        { id: "layer-equipment", name: "0-Q-EQUIP", visible: true }
      ]
    },
    materials: { materials: [] },
    sourceMap: { sources: [] },
    geometry: []
  };
}

function textDrawingEntity(id: string, text: string, x: number, y: number): DrawingEntity {
  return {
    id,
    type: "text",
    text,
    position: [x, y, 0],
    rotationDeg: 0,
    height: 100,
    origin: "TEXT",
    layerId: "layer-text"
  };
}

function lineDrawingEntity(id: string, x: number, y: number, sourceRef?: string): DrawingEntity {
  return {
    id,
    type: "line",
    start: [x - 100, y - 100, 0],
    end: [x + 100, y + 100, 0],
    layerId: "layer-equipment",
    sourceRef
  };
}

function p736ScenePackage(): ScenePackage {
  return {
    ...scenePackage(),
    geometry: [
      {
        geometries: [
          {
            id: "curves",
            kind: "curve-set",
            layerId: "layer-equipment",
            entities: [
              textDrawingEntity("p736-robot-label", "7B-020L-04", 0, 0),
              lineDrawingEntity("p736-robot-geom", 120, 0, "src-dxf-insert-R1-block-robot-child-L1"),
              textDrawingEntity("p736-dn1-label", "7B-070L-DN1", 5000, 0),
              lineDrawingEntity("p736-dn1-geom", 5120, 0, "src-dxf-insert-DN1-block-dunnage-child-L1"),
              textDrawingEntity("p736-dn2-label", "7B-070L-DN2", 10000, 0),
              lineDrawingEntity("p736-dn2-geom", 10120, 0, "src-dxf-insert-DN2-block-dunnage-child-L1"),
              textDrawingEntity("p736-nest-label", "7B-060L-1N", 15000, 0),
              lineDrawingEntity("p736-nest-geom", 15120, 0, "src-dxf-insert-N1-block-nest-child-L1")
            ]
          }
        ]
      }
    ]
  };
}

function p736Project() {
  const scene = p736ScenePackage();
  const semantics = computeLayoutSemantics(scene);
  const advancedLayout = buildAdvancedLayoutModel(scene, semantics);
  const layoutPackage = buildLayoutPackage(scene, semantics, advancedLayout);
  const semanticSummary = buildSemanticSummary(semantics, scene.manifest.source.path);
  return { scene, semantics, advancedLayout, layoutPackage, semanticSummary };
}

describe("KairoProject", () => {
  it("builds a project with correct schema and version", () => {
    const { layoutPackage, semanticSummary } = p736Project();
    const project = buildKairoProject({
      source: layoutPackage.source,
      semanticSummary,
      layoutPackage
    });

    expect(project.schema).toBe("kairo-project");
    expect(project.schemaVersion).toBe(1);
    expect(project.source.displayName).toBe("p736-layout.dxf");
    expect(project.layoutPackage.schema).toBe("kairo-layout-library-package");
    expect(project.semanticSummary.counts.devices).toBe(4);
    expect(project.createdAt).toBe("1970-01-01T00:00:00.000Z");
    expect(project.updatedAt).toBe("1970-01-01T00:00:00.000Z");
  });

  it("round-trips export/import with deep equality (timestamps are deterministic)", () => {
    const { layoutPackage, semanticSummary, semantics } = p736Project();
    const semanticReviewArtifact = buildSemanticReviewArtifact(semantics, {}, layoutPackage.source.path);
    const reviewPack = buildBlankLayoutReviewPack(layoutPackage);

    const project = buildKairoProject({
      source: layoutPackage.source,
      semanticSummary,
      layoutPackage,
      semanticReviewArtifact,
      layoutReviewPack: reviewPack
    });

    const json = exportKairoProjectJson(project);
    const result = parseKairoProjectJson(json);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project).toEqual(project);
  });

  it("updates review status and propagates through pipeline (accepted → trainable)", () => {
    const { layoutPackage } = p736Project();
    const reviewPack = buildBlankLayoutReviewPack(layoutPackage);

    const firstRecord = reviewPack.records[0];
    expect(firstRecord).toBeDefined();

    const updatedPack: LayoutReviewPack = {
      ...reviewPack,
      records: reviewPack.records.map((r) =>
        r.id === firstRecord.id ? { ...r, reviewStatus: "accepted" as const } : r
      )
    };

    const truth = mergeReviewedTrainingTruth(layoutPackage, updatedPack);
    const updated = truth.records.find((r) => r.detectedItemId === firstRecord.detectedItemId);
    expect(updated).toBeDefined();
    expect(updated?.reviewStatus).toBe("accepted");
    expect(updated?.trainingUse).toBe("trainable");
  });

  it("reviewed library excludes rejected and uncertain records", () => {
    const { layoutPackage } = p736Project();
    const reviewPack = buildBlankLayoutReviewPack(layoutPackage);

    const rejectedPack: LayoutReviewPack = {
      ...reviewPack,
      records: reviewPack.records.map((r, i) =>
        i === 0 ? { ...r, reviewStatus: "rejected" as const } :
        i === 1 ? { ...r, reviewStatus: "uncertain" as const } :
        { ...r, reviewStatus: "accepted" as const }
      )
    };

    const truth = mergeReviewedTrainingTruth(layoutPackage, rejectedPack);
    const library = buildReviewedLayoutLibrary(layoutPackage, truth);

    expect(library.summary.excludedRecords).toBeGreaterThanOrEqual(1);
    expect(library.items.length).toBeLessThan(reviewPack.records.length);
    const labels = library.items.map((item) => item.label);
    expect(labels).not.toContain(rejectedPack.records[0].detectedLabel);
  });

  it("parseKairoProjectJson returns errors for missing schema", () => {
    const result = parseKairoProjectJson(JSON.stringify({ schemaVersion: 1 }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.path === "schema")).toBe(true);
  });

  it("parseKairoProjectJson returns errors for wrong schema version", () => {
    const result = parseKairoProjectJson(
      JSON.stringify({ schema: "kairo-project", schemaVersion: 99, layoutPackage: {}, semanticSummary: {}, source: {}, createdAt: "", updatedAt: "" })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.path === "schemaVersion")).toBe(true);
  });

  it("parseKairoProjectJson returns errors when layoutPackage is missing", () => {
    const result = parseKairoProjectJson(
      JSON.stringify({ schema: "kairo-project", schemaVersion: 1, source: {}, semanticSummary: {}, createdAt: "", updatedAt: "" })
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.path === "layoutPackage")).toBe(true);
  });

  it("parseKairoProjectJson returns error for invalid JSON", () => {
    const result = parseKairoProjectJson("not valid json {{");
    expect(result.ok).toBe(false);
  });

  it("optional fields are omitted when not provided", () => {
    const { layoutPackage, semanticSummary } = p736Project();
    const project = buildKairoProject({ source: layoutPackage.source, semanticSummary, layoutPackage });

    expect("semanticReviewArtifact" in project).toBe(false);
    expect("layoutReviewPack" in project).toBe(false);
    expect("reviewedLayoutLibrary" in project).toBe(false);
  });
});
