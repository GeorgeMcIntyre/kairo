import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateScenePackage } from "@kairo/validator";
import { importDxfToKairo, writeScenePackage } from ".";

const fixturesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "test-fixtures");

describe("importDxfToKairo", () => {
  it("imports one LINE entity into a valid Kairo scene", async () => {
    const result = await importDxfToKairo(path.join(fixturesDir, "one-line.dxf"));

    expect(result.summary).toEqual({
      supportedEntityCount: 1,
      unsupportedEntityCount: 0,
      layerCount: 1,
      warningCount: 0
    });
    expect(validateScenePackage(result.scenePackage).valid).toBe(true);
    expect(result.scenePackage.scene.rootNodeId).toBe("node-dxf-root");
    expect(result.scenePackage.layers.layers).toEqual([
      expect.objectContaining({
        id: "layer-cut",
        name: "CUT"
      })
    ]);
    expect(result.scenePackage.geometry[0].geometries[0]).toMatchObject({
      id: "geom-layer-cut-curves",
      kind: "curve-set",
      layerId: "layer-cut",
      entities: [
        {
          id: "dxf-line-20",
          type: "line",
          start: [0, 0, 0],
          end: [25, 10, 0],
          layerId: "layer-cut",
          sourceRef: "src-dxf-20"
        }
      ]
    });
  });

  it("maps multiple DXF layers and LWPOLYLINE geometry", async () => {
    const result = await importDxfToKairo(path.join(fixturesDir, "multi-layer-basic.dxf"));

    expect(result.summary.supportedEntityCount).toBe(2);
    expect(result.scenePackage.layers.layers.map((layer) => [layer.id, layer.name])).toEqual([
      ["layer-cut", "CUT"],
      ["layer-reference", "REFERENCE"]
    ]);
    expect(result.scenePackage.scene.nodes[0].children).toEqual(["node-layer-cut", "node-layer-reference"]);
    expect(result.scenePackage.geometry.map((document) => document.geometries[0].id)).toEqual([
      "geom-layer-cut-curves",
      "geom-layer-reference-curves"
    ]);

    const referenceGeometry = result.scenePackage.geometry[1].geometries[0];
    expect(referenceGeometry.kind).toBe("curve-set");
    if (referenceGeometry.kind === "curve-set") {
      expect(referenceGeometry.entities[0]).toMatchObject({
        id: "dxf-polyline-21",
        type: "polyline",
        closed: true,
        points: [
          [0, 0, 0],
          [10, 0, 0],
          [10, 10, 0],
          [0, 10, 0]
        ]
      });
    }
  });

  it("imports CIRCLE and ARC entities", async () => {
    const result = await importDxfToKairo(path.join(fixturesDir, "circle-arc-basic.dxf"));
    const geometry = result.scenePackage.geometry[0].geometries[0];

    expect(result.summary.supportedEntityCount).toBe(2);
    expect(geometry.kind).toBe("curve-set");
    if (geometry.kind === "curve-set") {
      expect(geometry.entities).toEqual([
        expect.objectContaining({
          id: "dxf-arc-31",
          type: "arc",
          center: [15, 5, 0],
          radius: 4,
          startAngleDeg: 0,
          endAngleDeg: 90
        }),
        expect.objectContaining({
          id: "dxf-circle-30",
          type: "circle",
          center: [5, 5, 0],
          radius: 3
        })
      ]);
    }
  });

  it("creates deterministic warnings for unsupported TEXT and INSERT", async () => {
    const result = await importDxfToKairo(path.join(fixturesDir, "unsupported-entity-warning.dxf"));

    expect(validateScenePackage(result.scenePackage).valid).toBe(true);
    expect(result.summary).toEqual({
      supportedEntityCount: 0,
      unsupportedEntityCount: 2,
      layerCount: 1,
      warningCount: 2
    });
    expect(result.warnings).toEqual([
      {
        code: "DXF_BLOCK_INSERT_UNSUPPORTED",
        message: "DXF BLOCK/INSERT expansion is not supported yet; entity was reported but not imported.",
        entityType: "INSERT",
        handle: "41"
      },
      {
        code: "DXF_ENTITY_UNSUPPORTED",
        message: "DXF entity type TEXT is not supported by the minimal importer.",
        entityType: "TEXT",
        handle: "40"
      }
    ]);
  });

  it("writes an exploded scene folder that the CLI loader and validator can read", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "kairo-dxf-import-"));
    try {
      const outputDir = path.join(tempDir, "scene");
      const result = await importDxfToKairo(path.join(fixturesDir, "one-line.dxf"));
      await writeScenePackage(outputDir, result.scenePackage);

      const validationReport = JSON.parse(await readFile(path.join(outputDir, "validation-report.json"), "utf8")) as { valid: boolean };
      expect(validationReport.valid).toBe(true);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
