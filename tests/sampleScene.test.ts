import { describe, expect, it } from "vitest";
import { scenePackageSchema } from "@kairo/schema";
import { validateScenePackage, ValidationCode } from "@kairo/validator";
import { sampleScenePackage } from "../packages/validator/test-fixtures/invalidScenes";

describe("sample scene validation", () => {
  it("passes schema validation on the included sample", () => {
    expect(() => scenePackageSchema.parse(sampleScenePackage())).not.toThrow();
  });

  it("passes semantic validation on the included sample", () => {
    const report = validateScenePackage(sampleScenePackage());

    expect(report).toEqual({
      valid: true,
      summary: {
        errors: 0,
        warnings: 0,
        infos: 0
      },
      findings: []
    });
  });

  it("preserves the golden scene tree and references", () => {
    const subject = sampleScenePackage();
    const nodeIds = subject.scene.nodes.map((node) => node.id);
    const root = subject.scene.nodes.find((node) => node.id === subject.scene.rootNodeId);
    const meshGeometry = subject.geometry[0].geometries[0];
    const curveGeometry = subject.geometry[1].geometries[0];
    const layerIds = subject.layers.layers.map((layer) => layer.id);
    const materialIds = subject.materials.materials.map((material) => material.id);
    const sourcePaths = subject.sourceMap.sources.map((source) => source.path);

    expect(subject.scene.rootNodeId).toBe("node-root");
    expect(nodeIds).toEqual(["node-root", "node-bracket", "node-outline"]);
    expect(root?.children).toEqual(["node-bracket", "node-outline"]);
    expect(subject.scene.nodes[1].geometryRefs).toEqual(["geom-bracket-body"]);
    expect(subject.scene.nodes[2].geometryRefs).toEqual(["geom-reference-outline"]);
    expect(subject.scene.nodes[1].layerId).toBe("layer-solids");
    expect(subject.scene.nodes[2].layerId).toBe("layer-reference");
    expect(meshGeometry).toMatchObject({
      id: "geom-bracket-body",
      kind: "mesh",
      materialId: "mat-aluminium",
      layerId: "layer-solids",
      sourceRef: "src-bracket"
    });
    expect(curveGeometry).toMatchObject({
      id: "geom-reference-outline",
      kind: "curve-set",
      layerId: "layer-reference",
      sourceRef: "src-outline"
    });
    expect(layerIds).toEqual(["layer-solids", "layer-reference"]);
    expect(materialIds).toEqual(["mat-aluminium"]);
    expect(sourcePaths).toEqual([
      "examples/source/bracket-demo.jt",
      "examples/source/bracket-demo.jt",
      "examples/source/bracket-reference.dxf",
      "examples/source/bracket-reference.dxf",
      "examples/source/bracket-reference.dxf",
      "examples/source/bracket-reference.dxf"
    ]);
  });

  it("fails on duplicate node ids", () => {
    const subject = sampleScenePackage();
    subject.scene.nodes.push({
      ...structuredClone(subject.scene.nodes[1]),
      displayName: "Duplicate Bracket Body"
    });

    const report = validateScenePackage(subject);

    expect(report.valid).toBe(false);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: ValidationCode.DUPLICATE_ID,
          severity: "error"
        })
      ])
    );
  });

  it("fails on missing geometry references", () => {
    const subject = sampleScenePackage();
    subject.scene.nodes[1].geometryRefs = ["missing-geometry"];

    const report = validateScenePackage(subject);

    expect(report.valid).toBe(false);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: ValidationCode.MISSING_GEOMETRY_REF,
          severity: "error"
        })
      ])
    );
  });

  it("fails on circular tree references", () => {
    const subject = sampleScenePackage();
    subject.scene.nodes[1].children = [subject.scene.rootNodeId];

    const report = validateScenePackage(subject);

    expect(report.valid).toBe(false);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: ValidationCode.NODE_CYCLE,
          severity: "error"
        })
      ])
    );
  });

  it("returns deterministic validation reports", () => {
    const subject = sampleScenePackage();
    subject.scene.nodes[1].geometryRefs = ["missing-geometry"];
    subject.scene.nodes[2].layerId = "missing-layer";

    expect(validateScenePackage(subject)).toEqual(validateScenePackage(subject));
  });
});
