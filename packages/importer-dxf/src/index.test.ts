import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Parser } from "@dxfjs/parser";
import { validateScenePackage } from "@kairo/validator";
import { importDxfToKairo, writeScenePackage } from ".";
import { importDxfTextToKairo } from "./browser";

const fixturesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "test-fixtures");

const dxf = (lines: string[]) => `${lines.join("\n")}\n`;
const dxfLayerTable = ["0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "LAYER", "70", "2", "0", "LAYER", "2", "CUT", "70", "0", "62", "1", "6", "CONTINUOUS", "0", "LAYER", "2", "DETAIL", "70", "0", "62", "2", "6", "CONTINUOUS", "0", "ENDTAB", "0", "ENDSEC"];
const blockHeader = (name: string) => ["0", "BLOCK", "5", `${name}-B`, "8", "0", "2", name, "70", "0", "10", "0", "20", "0", "30", "0", "3", name, "1", ""];
const blockFooter = ["0", "ENDBLK", "5", "EB1", "8", "0"];
const blockLine = (handle: string, layer = "0") => ["0", "LINE", "5", handle, "8", layer, "10", "0", "20", "0", "30", "0", "11", "10", "21", "0", "31", "0"];
const blockCircle = (handle: string, layer = "0") => ["0", "CIRCLE", "5", handle, "8", layer, "10", "1", "20", "1", "30", "0", "40", "2"];
const blockArc = (handle: string, layer = "0") => ["0", "ARC", "5", handle, "8", layer, "10", "1", "20", "0", "30", "0", "40", "2", "50", "10", "51", "80"];
const blockLWPolyline = (handle: string, layer = "0") => [
  "0",
  "LWPOLYLINE",
  "5",
  handle,
  "8",
  layer,
  "90",
  "3",
  "70",
  "0",
  "10",
  "0",
  "20",
  "0",
  "10",
  "10",
  "20",
  "0",
  "10",
  "10",
  "20",
  "10"
];
const blockText = ["0", "TEXT", "5", "T1", "8", "0", "10", "0", "20", "0", "30", "0", "40", "1", "1", "LABEL"];
const blockTextAt = (handle: string, x: number, y: number, height = 1, content = "LABEL", layer = "0", rotation?: number) => {
  const base = ["0", "TEXT", "5", handle, "8", layer, "10", String(x), "20", String(y), "30", "0", "40", String(height), "1", content];
  return rotation === undefined ? base : [...base, "50", String(rotation)];
};
const blockAttdef = (handle: string, x: number, y: number, tag: string, value: string, height = 1, layer = "0") => [
  "0",
  "ATTDEF",
  "5",
  handle,
  "8",
  layer,
  "10",
  String(x),
  "20",
  String(y),
  "30",
  "0",
  "40",
  String(height),
  "1",
  value,
  "2",
  tag,
  "3",
  `${tag}_PROMPT`
];
const blockInsert = (blockName: string, handle: string, layer = "CUT", extras: string[] = []) => [
  "0",
  "INSERT",
  "5",
  handle,
  "8",
  layer,
  "2",
  blockName,
  "10",
  "5",
  "20",
  "6",
  "30",
  "0",
  ...extras
];

function blockScene(blocks: string[], entities: string[]) {
  return dxf([
    "0",
    "SECTION",
    "2",
    "HEADER",
    "9",
    "$INSUNITS",
    "70",
    "4",
    "0",
    "ENDSEC",
    ...dxfLayerTable,
    "0",
    "SECTION",
    "2",
    "BLOCKS",
    ...blocks,
    "0",
    "ENDSEC",
    "0",
    "SECTION",
    "2",
    "ENTITIES",
    ...entities,
    "0",
    "ENDSEC",
    "0",
    "EOF"
  ]);
}

async function withTempDxf(content: string, test: (filePath: string) => Promise<void>) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "kairo-dxf-import-"));
  try {
    const filePath = path.join(tempDir, "input.dxf");
    await writeFile(filePath, content);
    await test(filePath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function expectPointClose(actual: number[], expected: number[]) {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((value, index) => {
    expect(actual[index]).toBeCloseTo(value, 6);
  });
}

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

  it("imports DXF text through the browser-safe entrypoint", async () => {
    const content = await readFile(path.join(fixturesDir, "one-line.dxf"), "utf8");
    const result = await importDxfTextToKairo("uploaded.dxf", content);

    expect(validateScenePackage(result.scenePackage).valid).toBe(true);
    expect(result.scenePackage.scene.nodes[0]).toMatchObject({
      displayName: "uploaded.dxf"
    });
    expect(result.scenePackage.manifest.source.path).toBe("uploaded.dxf");
    expect(result.summary.supportedEntityCount).toBe(1);
    expect(result.timing?.map((entry) => entry.stage)).toEqual([
      "pre-clean",
      "dxf-parse",
      "mtext-scan",
      "scene-package-build",
      "validation",
      "total-import"
    ]);
    expect(result.timing?.every((entry) => Number.isFinite(entry.ms) && entry.ms >= 0)).toBe(true);
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

  it("imports simple legacy POLYLINE entities", async () => {
    const result = await importDxfToKairo(path.join(fixturesDir, "legacy-polyline-basic.dxf"));
    const geometry = result.scenePackage.geometry[0].geometries[0];

    expect(result.summary).toEqual({
      supportedEntityCount: 1,
      unsupportedEntityCount: 0,
      layerCount: 1,
      warningCount: 0
    });
    expect(geometry.kind).toBe("curve-set");
    if (geometry.kind === "curve-set") {
      expect(geometry.entities).toEqual([
        expect.objectContaining({
          id: "dxf-polyline-50",
          type: "polyline",
          points: [
            [0, 0, 0],
            [10, 0, 0]
          ],
          closed: false,
          layerId: "layer-cut",
          sourceRef: "src-dxf-50"
        })
      ]);
    }
    expect(result.scenePackage.sourceMap.sources).toContainEqual(
      expect.objectContaining({
        id: "src-dxf-50",
        entityType: "POLYLINE",
        entityId: "50"
      })
    );
  });

  it("preserves closed state for simple legacy POLYLINE entities", async () => {
    const result = await importDxfToKairo(path.join(fixturesDir, "legacy-polyline-closed.dxf"));
    const geometry = result.scenePackage.geometry[0].geometries[0];

    expect(result.summary.supportedEntityCount).toBe(1);
    expect(geometry.kind).toBe("curve-set");
    if (geometry.kind === "curve-set") {
      expect(geometry.entities[0]).toMatchObject({
        id: "dxf-polyline-60",
        type: "polyline",
        closed: true,
        points: [
          [0, 0, 0],
          [10, 0, 0],
          [10, 10, 0]
        ]
      });
    }
  });

  it("warns and skips unsupported legacy POLYLINE mesh modes", async () => {
    const result = await importDxfToKairo(path.join(fixturesDir, "legacy-polyline-mesh-unsupported.dxf"));

    expect(validateScenePackage(result.scenePackage).valid).toBe(true);
    expect(result.summary).toEqual({
      supportedEntityCount: 0,
      unsupportedEntityCount: 1,
      layerCount: 1,
      warningCount: 1
    });
    expect(result.warnings).toEqual([
      {
        code: "DXF_POLYLINE_UNSUPPORTED",
        message: "DXF POLYLINE entity is not a simple vertex chain and was skipped: mesh flag.",
        entityType: "POLYLINE",
        handle: "70"
      }
    ]);
  });

  it("expands a safe block LINE with insert translation and layer inheritance", async () => {
    const content = blockScene([...blockHeader("LINEBLOCK"), ...blockLine("L1", "0"), ...blockFooter], blockInsert("LINEBLOCK", "I1", "DETAIL"));

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);
      const geometry = result.scenePackage.geometry[0].geometries[0];

      expect(result.summary.supportedEntityCount).toBe(1);
      expect(result.summary.unsupportedEntityCount).toBe(0);
      expect(geometry.kind).toBe("curve-set");
      if (geometry.kind === "curve-set") {
        expect(geometry.entities[0]).toMatchObject({
          id: "dxf-line-insert-i1-child-l1",
          type: "line",
          start: [5, 6, 0],
          end: [15, 6, 0],
          layerId: "layer-detail"
        });
      }
      expect(result.scenePackage.sourceMap.sources).toContainEqual(
        expect.objectContaining({
          id: "src-dxf-insert-i1-block-lineblock-child-l1",
          entityType: "LINE",
          entityId: "L1",
          note: "Expanded from INSERT I1, BLOCK LINEBLOCK."
        })
      );
    });
  });

  it("expands a safe block CIRCLE with uniform positive scale", async () => {
    const content = blockScene([...blockHeader("CIRCLEBLOCK"), ...blockCircle("C1"), ...blockFooter], blockInsert("CIRCLEBLOCK", "I1", "CUT", ["41", "2", "42", "2", "43", "2"]));

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);
      const geometry = result.scenePackage.geometry[0].geometries[0];

      expect(result.summary.supportedEntityCount).toBe(1);
      expect(geometry.kind).toBe("curve-set");
      if (geometry.kind === "curve-set") {
        expect(geometry.entities[0]).toMatchObject({
          type: "circle",
          center: [7, 8, 0],
          radius: 4
        });
      }
    });
  });

  it("expands a block LINE rotated 90 degrees", async () => {
    const content = blockScene([...blockHeader("ROTATED"), ...blockLine("L1"), ...blockFooter], blockInsert("ROTATED", "I1", "CUT", ["50", "90"]));

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);
      const geometry = result.scenePackage.geometry[0].geometries[0];

      expect(result.summary.supportedEntityCount).toBe(1);
      expect(result.summary.unsupportedEntityCount).toBe(0);
      expect(geometry.kind).toBe("curve-set");
      if (geometry.kind === "curve-set" && geometry.entities[0].type === "line") {
        expectPointClose(geometry.entities[0].start, [5, 6, 0]);
        expectPointClose(geometry.entities[0].end, [5, 16, 0]);
        expect(geometry.entities[0].layerId).toBe("layer-cut");
        expect(geometry.entities[0].sourceRef).toBe("src-dxf-insert-i1-block-rotated-child-l1");
      }
      expect(result.scenePackage.sourceMap.sources).toContainEqual(
        expect.objectContaining({
          id: "src-dxf-insert-i1-block-rotated-child-l1",
          entityType: "LINE",
          entityId: "L1",
          note: "Expanded from INSERT I1, BLOCK ROTATED."
        })
      );
    });
  });

  it("expands a block LINE rotated 45 degrees", async () => {
    const content = blockScene([...blockHeader("ROTATED45"), ...blockLine("L1"), ...blockFooter], blockInsert("ROTATED45", "I1", "CUT", ["50", "45"]));

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);
      const geometry = result.scenePackage.geometry[0].geometries[0];

      expect(result.summary.supportedEntityCount).toBe(1);
      expect(geometry.kind).toBe("curve-set");
      if (geometry.kind === "curve-set" && geometry.entities[0].type === "line") {
        expectPointClose(geometry.entities[0].start, [5, 6, 0]);
        expectPointClose(geometry.entities[0].end, [12.071067811865476, 13.071067811865476, 0]);
      }
    });
  });

  it("keeps block CIRCLE geometry valid with rotation", async () => {
    const content = blockScene([...blockHeader("CIRCLEROT"), ...blockCircle("C1"), ...blockFooter], blockInsert("CIRCLEROT", "I1", "CUT", ["50", "90"]));

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);
      const geometry = result.scenePackage.geometry[0].geometries[0];

      expect(result.summary.supportedEntityCount).toBe(1);
      expect(geometry.kind).toBe("curve-set");
      if (geometry.kind === "curve-set" && geometry.entities[0].type === "circle") {
        expectPointClose(geometry.entities[0].center, [4, 7, 0]);
        expect(geometry.entities[0].radius).toBe(2);
      }
    });
  });

  it("rotates block ARC center and angles", async () => {
    const content = blockScene([...blockHeader("ARCROT"), ...blockArc("A1"), ...blockFooter], blockInsert("ARCROT", "I1", "CUT", ["50", "90"]));

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);
      const geometry = result.scenePackage.geometry[0].geometries[0];

      expect(result.summary.supportedEntityCount).toBe(1);
      expect(geometry.kind).toBe("curve-set");
      if (geometry.kind === "curve-set" && geometry.entities[0].type === "arc") {
        expectPointClose(geometry.entities[0].center, [5, 7, 0]);
        expect(geometry.entities[0].radius).toBe(2);
        expect(geometry.entities[0].startAngleDeg).toBe(100);
        expect(geometry.entities[0].endAngleDeg).toBe(170);
      }
    });
  });

  it("rotates block LWPOLYLINE points", async () => {
    const content = blockScene([...blockHeader("PLINEROT"), ...blockLWPolyline("P1"), ...blockFooter], blockInsert("PLINEROT", "I1", "DETAIL", ["50", "90"]));

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);
      const geometry = result.scenePackage.geometry[0].geometries[0];

      expect(result.summary.supportedEntityCount).toBe(1);
      expect(geometry.kind).toBe("curve-set");
      if (geometry.kind === "curve-set" && geometry.entities[0].type === "polyline") {
        expect(geometry.entities[0].layerId).toBe("layer-detail");
        expectPointClose(geometry.entities[0].points[0], [5, 6, 0]);
        expectPointClose(geometry.entities[0].points[1], [5, 16, 0]);
        expectPointClose(geometry.entities[0].points[2], [-5, 16, 0]);
      }
    });
  });

  it("expands block with ATTDEF+LINE: LINE and ATTDEF both supported, no partial-expand warning", async () => {
    const blockAttdefLine = (lineHandle: string) => [
      "0", "ATTDEF", "5", "AD1", "8", "0", "10", "0", "20", "0", "30", "0", "40", "1", "1", "TAG", "2", "TAG",
      "0", "LINE", "5", lineHandle, "8", "0", "10", "0", "20", "0", "30", "0", "11", "10", "21", "0", "31", "0"
    ];
    const content = blockScene([...blockHeader("MIXEDBLOCK"), ...blockAttdefLine("L1"), ...blockFooter], blockInsert("MIXEDBLOCK", "I1", "CUT"));

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);

      expect(result.summary.supportedEntityCount).toBe(2);
      expect(result.warnings).toEqual([]);

      const geometry = result.scenePackage.geometry[0].geometries[0];
      expect(geometry.kind).toBe("curve-set");
      if (geometry.kind === "curve-set") {
        const lineEntity = geometry.entities.find((e) => e.type === "line");
        expect(lineEntity).toMatchObject({
          type: "line",
          start: [5, 6, 0],
          end: [15, 6, 0]
        });
      }
    });
  });

  it("partially expands block with SPLINE+CIRCLE: CIRCLE expanded, SPLINE skipped", async () => {
    const blockSplineCircle = [
      "0", "SPLINE", "5", "SP1", "8", "0",
      "0", "CIRCLE", "5", "C1", "8", "0", "10", "1", "20", "1", "30", "0", "40", "2"
    ];
    const content = blockScene([...blockHeader("SPLINEBLOCK"), ...blockSplineCircle, ...blockFooter], blockInsert("SPLINEBLOCK", "I1", "CUT"));

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);

      expect(result.summary.supportedEntityCount).toBe(1);
      const partialWarn = result.warnings.find((w) => w.code === "DXF_BLOCK_PARTIAL_EXPAND");
      expect(partialWarn).toMatchObject({
        message: 'DXF BLOCK "SPLINEBLOCK" was partially expanded; unsupported children skipped: SPLINE×1.',
        entityType: "INSERT",
        handle: "I1"
      });
      const geometry = result.scenePackage.geometry[0].geometries[0];
      expect(geometry.kind).toBe("curve-set");
      if (geometry.kind === "curve-set") {
        expect(geometry.entities[0]).toMatchObject({ type: "circle", radius: 2 });
      }
    });
  });

  it("expands a block TEXT entity through INSERT offset", async () => {
    const content = blockScene([...blockHeader("TEXTONLY"), ...blockText, ...blockFooter], blockInsert("TEXTONLY", "I1", "CUT"));

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);

      expect(result.summary.supportedEntityCount).toBe(1);
      expect(result.warnings.find((w) => w.code === "DXF_BLOCK_PARTIAL_EXPAND")).toBeUndefined();

      const geometry = result.scenePackage.geometry[0].geometries[0];
      expect(geometry.kind).toBe("curve-set");
      if (geometry.kind === "curve-set" && geometry.entities[0].type === "text") {
        expect(geometry.entities[0].text).toBe("LABEL");
        expect(geometry.entities[0].origin).toBe("TEXT");
        expectPointClose(geometry.entities[0].position, [5, 6, 0]);
        expect(geometry.entities[0].rotationDeg).toBeCloseTo(0, 6);
        expect(geometry.entities[0].height).toBeCloseTo(1, 6);
      }
    });
  });

  it("skips non-uniform-scale INSERTs; expands uniform-negative-scale and z-offset INSERTs", async () => {
    const content = blockScene(
      [...blockHeader("TRANSFORMS"), ...blockLine("L1"), ...blockFooter],
      [
        ...blockInsert("TRANSFORMS", "I1", "CUT", ["41", "2", "42", "3", "43", "2"]),
        ...blockInsert("TRANSFORMS", "I2", "CUT", ["41", "-1", "42", "-1", "43", "-1"]),
        ...blockInsert("TRANSFORMS", "I3", "CUT", ["30", "5"])
      ]
    );

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);

      expect(result.summary.supportedEntityCount).toBe(2);
      expect(result.warnings).toEqual([
        {
          code: "DXF_BLOCK_INSERT_TRANSFORM_UNSUPPORTED",
          message: "DXF INSERT transform is not supported by the simple expander (non-uniform scale); entity was skipped.",
          entityType: "INSERT",
          handle: "I1"
        },
        {
          code: "DXF_INSERT_MIRROR_FLATTENED",
          message: "DXF INSERT mirror scale was expanded by flipping output coordinates for 2D layout import.",
          entityType: "INSERT",
          handle: "I2"
        },
        {
          code: "DXF_INSERT_Z_FLATTENED",
          message: "DXF INSERT was expanded with Z offset (5.0000) flattened to 0 for 2D layout import.",
          entityType: "INSERT",
          handle: "I3"
        }
      ]);
    });
  });

  it("skips missing INSERTs but expands TEXT in text-only block", async () => {
    const content = blockScene(
      [
        ...blockHeader("NESTED"),
        ...blockInsert("CHILD", "BI1"),
        ...blockFooter,
        ...blockHeader("TEXTBLOCK"),
        ...blockText,
        ...blockFooter
      ],
      [...blockInsert("NESTED", "I1"), ...blockInsert("MISSING", "I2"), ...blockInsert("TEXTBLOCK", "I3")]
    );

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);

      expect(result.summary.supportedEntityCount).toBe(1);
      expect(result.warnings).toEqual([
        expect.objectContaining({
          code: "DXF_BLOCK_DEFINITION_MISSING",
          message: 'DXF INSERT references missing BLOCK definition "CHILD"; entity was skipped.',
          entityType: "INSERT",
          handle: "BI1"
        }),
        expect.objectContaining({
          code: "DXF_BLOCK_DEFINITION_MISSING",
          entityType: "INSERT",
          handle: "I2"
        })
      ]);
    });
  });

  it("imports direct TEXT entity and skips missing INSERT block", async () => {
    const result = await importDxfToKairo(path.join(fixturesDir, "unsupported-entity-warning.dxf"));

    expect(validateScenePackage(result.scenePackage).valid).toBe(true);
    expect(result.summary).toEqual({
      supportedEntityCount: 1,
      unsupportedEntityCount: 1,
      layerCount: 1,
      warningCount: 1
    });
    expect(result.warnings).toEqual([
      {
        code: "DXF_BLOCK_DEFINITION_MISSING",
        message: 'DXF INSERT references missing BLOCK definition "TITLE_BLOCK"; entity was skipped.',
        entityType: "INSERT",
        handle: "41"
      }
    ]);
  });

  it("pre-cleans ATTDEF ACAD_REACTORS duplicate 330 before parser import", async () => {
    const result = await importDxfToKairo(path.join(fixturesDir, "attdef-acad-reactors.dxf"));

    expect(validateScenePackage(result.scenePackage).valid).toBe(true);
    expect(result.summary).toEqual({
      supportedEntityCount: 0,
      unsupportedEntityCount: 1,
      layerCount: 1,
      warningCount: 1
    });
    expect(result.preCleanReport).toMatchObject({
      enabled: true,
      removedAcadReactorsCount: 1,
      removedAcadReactorsLineRanges: [{ startLine: 49, endLine: 54 }],
      appendedMissingEof: false
    });
    expect(result.warnings).toEqual([
      {
        code: "DXF_ENTITY_UNSUPPORTED",
        message: "DXF entity type ATTDEF is not supported by the minimal importer.",
        entityType: "ATTDEF",
        handle: "103E"
      }
    ]);
  });

  it("imports insert-rotation-basic.dxf fixture: LINE at (100,200) rotated 90 degrees", async () => {
    const result = await importDxfToKairo(path.join(fixturesDir, "insert-rotation-basic.dxf"));

    expect(validateScenePackage(result.scenePackage).valid).toBe(true);
    expect(result.summary).toEqual({
      supportedEntityCount: 1,
      unsupportedEntityCount: 0,
      layerCount: 1,
      warningCount: 0
    });

    const geometry = result.scenePackage.geometry[0].geometries[0];
    expect(geometry.kind).toBe("curve-set");
    if (geometry.kind === "curve-set" && geometry.entities[0].type === "line") {
      expectPointClose(geometry.entities[0].start, [100, 200, 0]);
      expectPointClose(geometry.entities[0].end, [100, 210, 0]);
      expect(geometry.entities[0].layerId).toBe("layer-symbols");
    }

    expect(result.scenePackage.sourceMap.sources).toContainEqual(
      expect.objectContaining({
        id: "src-dxf-insert-i1-block-linesymbol-child-l1",
        entityType: "LINE",
        entityId: "L1",
        note: "Expanded from INSERT I1, BLOCK LINESYMBOL."
      })
    );
  });

  it("expands a block LINE with rotation 90 and uniform scale 2", async () => {
    const content = blockScene([...blockHeader("SCALEDROT"), ...blockLine("L1"), ...blockFooter], blockInsert("SCALEDROT", "I1", "CUT", ["41", "2", "42", "2", "43", "2", "50", "90"]));

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);
      const geometry = result.scenePackage.geometry[0].geometries[0];

      expect(result.summary.supportedEntityCount).toBe(1);
      expect(result.summary.unsupportedEntityCount).toBe(0);
      expect(geometry.kind).toBe("curve-set");
      if (geometry.kind === "curve-set" && geometry.entities[0].type === "line") {
        expectPointClose(geometry.entities[0].start, [5, 6, 0]);
        expectPointClose(geometry.entities[0].end, [5, 26, 0]);
      }
    });
  });

  it("expands z-offset-only INSERT: LINE visible at z=0", async () => {
    const content = blockScene(
      [...blockHeader("ZOFFSET"), ...blockLine("L1"), ...blockFooter],
      blockInsert("ZOFFSET", "I1", "CUT", ["30", "5"])
    );

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);

      expect(result.summary.supportedEntityCount).toBe(1);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toEqual({
        code: "DXF_INSERT_Z_FLATTENED",
        message: "DXF INSERT was expanded with Z offset (5.0000) flattened to 0 for 2D layout import.",
        entityType: "INSERT",
        handle: "I1"
      });

      const geometry = result.scenePackage.geometry[0].geometries[0];
      if (geometry.kind === "curve-set" && geometry.entities[0].type === "line") {
        expectPointClose(geometry.entities[0].start, [5, 6, 0]);
        expectPointClose(geometry.entities[0].end, [15, 6, 0]);
      }
    });
  });

  it("expands z-offset INSERT with rotation 90°: LINE visible at z=0", async () => {
    const content = blockScene(
      [...blockHeader("ZOFFSETROT"), ...blockLine("L1"), ...blockFooter],
      blockInsert("ZOFFSETROT", "I1", "CUT", ["30", "5", "50", "90"])
    );

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);

      expect(result.summary.supportedEntityCount).toBe(1);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe("DXF_INSERT_Z_FLATTENED");

      const geometry = result.scenePackage.geometry[0].geometries[0];
      if (geometry.kind === "curve-set" && geometry.entities[0].type === "line") {
        expectPointClose(geometry.entities[0].start, [5, 6, 0]);
        expectPointClose(geometry.entities[0].end, [5, 16, 0]);
      }
    });
  });

  it("expands z-offset INSERT with uniform scale 2: LINE visible at z=0", async () => {
    const content = blockScene(
      [...blockHeader("ZOFFSETSCALE"), ...blockLine("L1"), ...blockFooter],
      blockInsert("ZOFFSETSCALE", "I1", "CUT", ["30", "5", "41", "2", "42", "2", "43", "2"])
    );

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);

      expect(result.summary.supportedEntityCount).toBe(1);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe("DXF_INSERT_Z_FLATTENED");

      const geometry = result.scenePackage.geometry[0].geometries[0];
      if (geometry.kind === "curve-set" && geometry.entities[0].type === "line") {
        expectPointClose(geometry.entities[0].start, [5, 6, 0]);
        expectPointClose(geometry.entities[0].end, [25, 6, 0]);
      }
    });
  });

  it("still skips INSERT with z-offset AND non-uniform scale", async () => {
    const content = blockScene(
      [...blockHeader("ZNONUNI"), ...blockLine("L1"), ...blockFooter],
      blockInsert("ZNONUNI", "I1", "CUT", ["30", "5", "41", "2", "42", "3", "43", "2"])
    );

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);

      expect(result.summary.supportedEntityCount).toBe(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatchObject({
        code: "DXF_BLOCK_INSERT_TRANSFORM_UNSUPPORTED",
        handle: "I1"
      });
      expect(result.warnings[0].message).toContain("non-uniform scale");
    });
  });

  it("expands INSERT with z-offset AND uniform negative scale: z flattened and mirror applied", async () => {
    const content = blockScene(
      [...blockHeader("ZNEG"), ...blockLine("L1"), ...blockFooter],
      blockInsert("ZNEG", "I1", "CUT", ["30", "5", "41", "-1", "42", "-1", "43", "-1"])
    );

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);

      expect(result.summary.supportedEntityCount).toBe(1);
      expect(result.warnings).toHaveLength(2);
      expect(result.warnings.some((w) => w.code === "DXF_INSERT_MIRROR_FLATTENED" && w.handle === "I1")).toBe(true);
      expect(result.warnings.some((w) => w.code === "DXF_INSERT_Z_FLATTENED" && w.handle === "I1")).toBe(true);
    });
  });

  it("expands z-offset INSERT with nested child: parent z flattened, child missing block reported", async () => {
    const content = blockScene(
      [...blockHeader("NESTED_Z"), ...blockInsert("CHILD", "BI1"), ...blockFooter],
      blockInsert("NESTED_Z", "I1", "CUT", ["30", "5"])
    );

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);

      expect(result.summary.supportedEntityCount).toBe(0);
      expect(result.warnings).toEqual([
        expect.objectContaining({
          code: "DXF_BLOCK_DEFINITION_MISSING",
          message: 'DXF INSERT references missing BLOCK definition "CHILD"; entity was skipped.',
          entityType: "INSERT",
          handle: "BI1"
        }),
        expect.objectContaining({
          code: "DXF_INSERT_Z_FLATTENED",
          message: "DXF INSERT was expanded with Z offset (5.0000) flattened to 0 for 2D layout import.",
          entityType: "INSERT",
          handle: "I1"
        })
      ]);
    });
  });

  it("expands nested LINE via child INSERT: one level deep", async () => {
    const content = blockScene(
      [
        ...blockHeader("PARENT"),
        ...blockInsert("CHILD", "BI1"),
        ...blockFooter,
        ...blockHeader("CHILD"),
        ...blockLine("L1"),
        ...blockFooter
      ],
      blockInsert("PARENT", "I1")
    );

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);

      expect(result.summary.supportedEntityCount).toBe(1);
      expect(result.warnings).toHaveLength(0);

      const geometry = result.scenePackage.geometry[0].geometries[0];
      if (geometry.kind === "curve-set" && geometry.entities[0].type === "line") {
        expectPointClose(geometry.entities[0].start, [10, 12, 0]);
        expectPointClose(geometry.entities[0].end, [20, 12, 0]);
      }
    });
  });

  it("nested LINE with parent rotation 90°: transform composed correctly", async () => {
    const content = blockScene(
      [
        ...blockHeader("PARENT"),
        ...blockInsert("CHILD", "BI1"),
        ...blockFooter,
        ...blockHeader("CHILD"),
        ...blockLine("L1"),
        ...blockFooter
      ],
      blockInsert("PARENT", "I1", "CUT", ["50", "90"])
    );

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);

      expect(result.summary.supportedEntityCount).toBe(1);
      expect(result.warnings).toHaveLength(0);

      const geometry = result.scenePackage.geometry[0].geometries[0];
      if (geometry.kind === "curve-set" && geometry.entities[0].type === "line") {
        expectPointClose(geometry.entities[0].start, [-1, 11, 0]);
        expectPointClose(geometry.entities[0].end, [-1, 21, 0]);
      }
    });
  });

  it("child INSERT z-offset is flattened to 0 when expanding nested geometry", async () => {
    const content = blockScene(
      [
        ...blockHeader("PARENT"),
        ...blockInsert("CHILD", "BI1", "CUT", ["30", "5"]),
        ...blockFooter,
        ...blockHeader("CHILD"),
        ...blockLine("L1"),
        ...blockFooter
      ],
      blockInsert("PARENT", "I1")
    );

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);

      expect(result.summary.supportedEntityCount).toBe(1);
      expect(result.warnings).toEqual([
        expect.objectContaining({
          code: "DXF_INSERT_Z_FLATTENED",
          message: "DXF INSERT was expanded with Z offset (5.0000) flattened to 0 for 2D layout import.",
          entityType: "INSERT",
          handle: "BI1"
        })
      ]);

      const geometry = result.scenePackage.geometry[0].geometries[0];
      if (geometry.kind === "curve-set" && geometry.entities[0].type === "line") {
        expectPointClose(geometry.entities[0].start, [10, 12, 0]);
        expectPointClose(geometry.entities[0].end, [20, 12, 0]);
      }
    });
  });

  it("parent and child both have z-offset: both flattened, both warnings emitted", async () => {
    const content = blockScene(
      [
        ...blockHeader("PARENT"),
        ...blockInsert("CHILD", "BI1", "CUT", ["30", "3"]),
        ...blockFooter,
        ...blockHeader("CHILD"),
        ...blockLine("L1"),
        ...blockFooter
      ],
      blockInsert("PARENT", "I1", "CUT", ["30", "5"])
    );

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);

      expect(result.summary.supportedEntityCount).toBe(1);
      expect(result.warnings).toHaveLength(2);
      expect(result.warnings.some((w) => w.code === "DXF_INSERT_Z_FLATTENED" && w.handle === "I1")).toBe(true);
      expect(result.warnings.some((w) => w.code === "DXF_INSERT_Z_FLATTENED" && w.handle === "BI1")).toBe(true);
    });
  });

  it("cycle detection: self-referential child INSERT emits DXF_BLOCK_INSERT_CYCLE", async () => {
    const content = blockScene(
      [
        ...blockHeader("CYCLE"),
        ...blockInsert("CYCLE", "BI1"),
        ...blockLine("L1"),
        ...blockFooter
      ],
      blockInsert("CYCLE", "I1")
    );

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);

      expect(result.warnings.some((w) => w.code === "DXF_BLOCK_INSERT_CYCLE" && w.handle === "BI1")).toBe(true);
    });
  });

  it("child INSERT with non-uniform scale still skips that child INSERT", async () => {
    const content = blockScene(
      [
        ...blockHeader("PARENT"),
        ...blockInsert("CHILD", "BI1", "CUT", ["41", "2", "42", "3", "43", "2"]),
        ...blockFooter,
        ...blockHeader("CHILD"),
        ...blockLine("L1"),
        ...blockFooter
      ],
      blockInsert("PARENT", "I1")
    );

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);

      expect(result.summary.supportedEntityCount).toBe(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatchObject({
        code: "DXF_BLOCK_INSERT_TRANSFORM_UNSUPPORTED",
        handle: "BI1"
      });
      expect(result.warnings[0].message).toContain("non-uniform scale");
    });
  });

  it("child INSERT with uniform negative scale expands mirrored grandchild geometry", async () => {
    const content = blockScene(
      [
        ...blockHeader("PARENT"),
        ...blockInsert("CHILD", "BI1", "CUT", ["41", "-1", "42", "-1", "43", "-1"]),
        ...blockFooter,
        ...blockHeader("CHILD"),
        ...blockLine("L1"),
        ...blockFooter
      ],
      blockInsert("PARENT", "I1")
    );

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);

      expect(result.summary.supportedEntityCount).toBe(1);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatchObject({
        code: "DXF_INSERT_MIRROR_FLATTENED",
        handle: "BI1"
      });
    });
  });

  it("expands X-mirror INSERT (xScale=-1): LINE reflected in X", async () => {
    const content = blockScene(
      [...blockHeader("XMIRROR"), ...blockLine("L1"), ...blockFooter],
      blockInsert("XMIRROR", "I1", "CUT", ["41", "-1", "42", "1", "43", "1"])
    );

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);
      const geometry = result.scenePackage.geometry[0].geometries[0];

      expect(result.summary.supportedEntityCount).toBe(1);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatchObject({ code: "DXF_INSERT_MIRROR_FLATTENED", handle: "I1" });
      expect(geometry.kind).toBe("curve-set");
      if (geometry.kind === "curve-set" && geometry.entities[0].type === "line") {
        expectPointClose(geometry.entities[0].start, [5, 6, 0]);
        expectPointClose(geometry.entities[0].end, [-5, 6, 0]);
      }
    });
  });

  it("expands X-mirror INSERT with uniform scale -2: LINE reflected and scaled", async () => {
    const content = blockScene(
      [...blockHeader("XMIRSCALE"), ...blockLine("L1"), ...blockFooter],
      blockInsert("XMIRSCALE", "I1", "CUT", ["41", "-2", "42", "2", "43", "2"])
    );

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);
      const geometry = result.scenePackage.geometry[0].geometries[0];

      expect(result.summary.supportedEntityCount).toBe(1);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatchObject({ code: "DXF_INSERT_MIRROR_FLATTENED", handle: "I1" });
      if (geometry.kind === "curve-set" && geometry.entities[0].type === "line") {
        expectPointClose(geometry.entities[0].start, [5, 6, 0]);
        expectPointClose(geometry.entities[0].end, [-15, 6, 0]);
      }
    });
  });

  it("expands X-mirror INSERT with rotation 90°: LINE reflected then rotated", async () => {
    const content = blockScene(
      [...blockHeader("XMIRROT"), ...blockLine("L1"), ...blockFooter],
      blockInsert("XMIRROT", "I1", "CUT", ["41", "-1", "42", "1", "43", "1", "50", "90"])
    );

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);
      const geometry = result.scenePackage.geometry[0].geometries[0];

      expect(result.summary.supportedEntityCount).toBe(1);
      if (geometry.kind === "curve-set" && geometry.entities[0].type === "line") {
        expectPointClose(geometry.entities[0].start, [5, 6, 0]);
        expectPointClose(geometry.entities[0].end, [5, -4, 0]);
      }
    });
  });

  it("expands X-mirror INSERT with z-offset: both DXF_INSERT_MIRROR_FLATTENED and DXF_INSERT_Z_FLATTENED", async () => {
    const content = blockScene(
      [...blockHeader("XMIRZ"), ...blockLine("L1"), ...blockFooter],
      blockInsert("XMIRZ", "I1", "CUT", ["30", "5", "41", "-1", "42", "1", "43", "1"])
    );

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);
      const geometry = result.scenePackage.geometry[0].geometries[0];

      expect(result.summary.supportedEntityCount).toBe(1);
      expect(result.warnings).toHaveLength(2);
      expect(result.warnings.some((w) => w.code === "DXF_INSERT_MIRROR_FLATTENED" && w.handle === "I1")).toBe(true);
      expect(result.warnings.some((w) => w.code === "DXF_INSERT_Z_FLATTENED" && w.handle === "I1")).toBe(true);
      if (geometry.kind === "curve-set" && geometry.entities[0].type === "line") {
        expectPointClose(geometry.entities[0].start, [5, 6, 0]);
        expectPointClose(geometry.entities[0].end, [-5, 6, 0]);
      }
    });
  });

  it("expands Y-mirror INSERT (yScale=-1) with uniform magnitude", async () => {
    const content = blockScene(
      [...blockHeader("YMIRROR"), ...blockLine("L1"), ...blockFooter],
      blockInsert("YMIRROR", "I1", "CUT", ["41", "1", "42", "-1", "43", "1"])
    );

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);

      expect(result.summary.supportedEntityCount).toBe(1);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatchObject({ code: "DXF_INSERT_MIRROR_FLATTENED", handle: "I1" });
    });
  });

  it("still skips non-uniform positive INSERT (magnitudes differ)", async () => {
    const content = blockScene(
      [...blockHeader("NONUNI"), ...blockLine("L1"), ...blockFooter],
      blockInsert("NONUNI", "I1", "CUT", ["41", "2", "42", "3", "43", "2"])
    );

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);

      expect(result.summary.supportedEntityCount).toBe(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatchObject({ code: "DXF_BLOCK_INSERT_TRANSFORM_UNSUPPORTED", handle: "I1" });
      expect(result.warnings[0].message).toContain("non-uniform scale");
    });
  });

  it("still skips non-uniform negative INSERT (magnitudes differ)", async () => {
    const content = blockScene(
      [...blockHeader("NONUNINEG"), ...blockLine("L1"), ...blockFooter],
      blockInsert("NONUNINEG", "I1", "CUT", ["41", "-2", "42", "3", "43", "1"])
    );

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);

      expect(result.summary.supportedEntityCount).toBe(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatchObject({ code: "DXF_BLOCK_INSERT_TRANSFORM_UNSUPPORTED", handle: "I1" });
      expect(result.warnings[0].message).toContain("non-uniform scale");
    });
  });

  it("mirror INSERT expansion preserves non-empty source ref", async () => {
    const content = blockScene(
      [...blockHeader("MIRSRC"), ...blockLine("L1"), ...blockFooter],
      blockInsert("MIRSRC", "I1", "CUT", ["41", "-1", "42", "1", "43", "1"])
    );

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);
      const geometry = result.scenePackage.geometry[0].geometries[0];

      expect(result.summary.supportedEntityCount).toBe(1);
      if (geometry.kind === "curve-set") {
        expect(geometry.entities[0].sourceRef).toBeTruthy();
        expect(geometry.entities[0].sourceRef).toContain("insert-i1");
      }
    });
  });

  it("direct parent geometry AND child INSERT both expand: 2 entities total", async () => {
    const content = blockScene(
      [
        ...blockHeader("PARENT"),
        ...blockLine("PL1"),
        ...blockInsert("CHILD", "BI1"),
        ...blockFooter,
        ...blockHeader("CHILD"),
        ...blockLine("L1"),
        ...blockFooter
      ],
      blockInsert("PARENT", "I1")
    );

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);

      expect(result.summary.supportedEntityCount).toBe(2);
      expect(result.warnings).toHaveLength(0);
    });
  });

  it("depth guard: grandchild nested INSERT emits DXF_BLOCK_INSERT_NESTED_UNSUPPORTED", async () => {
    const content = blockScene(
      [
        ...blockHeader("PARENT"),
        ...blockInsert("CHILD", "BI1"),
        ...blockFooter,
        ...blockHeader("CHILD"),
        ...blockLine("L1"),
        ...blockInsert("GRANDCHILD", "BI2"),
        ...blockFooter,
        ...blockHeader("GRANDCHILD"),
        ...blockLine("GL1"),
        ...blockFooter
      ],
      blockInsert("PARENT", "I1")
    );

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);

      expect(result.summary.supportedEntityCount).toBe(1);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatchObject({
        code: "DXF_BLOCK_INSERT_NESTED_UNSUPPORTED",
        handle: "BI2"
      });
    });
  });

  it("imports a direct TEXT entity", async () => {
    const content = dxf([
      "0",
      "SECTION",
      "2",
      "HEADER",
      "9",
      "$INSUNITS",
      "70",
      "4",
      "0",
      "ENDSEC",
      ...dxfLayerTable,
      "0",
      "SECTION",
      "2",
      "ENTITIES",
      ...blockTextAt("TX1", 12, 34, 2.5, "DIRECT", "CUT", 45),
      "0",
      "ENDSEC",
      "0",
      "EOF"
    ]);
    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);
      expect(result.summary.supportedEntityCount).toBe(1);
      const geometry = result.scenePackage.geometry[0].geometries[0];
      if (geometry.kind === "curve-set" && geometry.entities[0].type === "text") {
        expect(geometry.entities[0].text).toBe("DIRECT");
        expect(geometry.entities[0].origin).toBe("TEXT");
        expectPointClose(geometry.entities[0].position, [12, 34, 0]);
        expect(geometry.entities[0].rotationDeg).toBeCloseTo(45, 6);
        expect(geometry.entities[0].height).toBeCloseTo(2.5, 6);
        expect(geometry.entities[0].layerId).toBe("layer-cut");
      }
    });
  });

  it("expands block TEXT with INSERT rotation 90 deg: position transforms, rotation composes", async () => {
    const content = blockScene(
      [...blockHeader("ROTTEXT"), ...blockTextAt("T1", 10, 0, 1, "ROT"), ...blockFooter],
      blockInsert("ROTTEXT", "I1", "CUT", ["50", "90"])
    );
    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);
      expect(result.summary.supportedEntityCount).toBe(1);
      const geometry = result.scenePackage.geometry[0].geometries[0];
      if (geometry.kind === "curve-set" && geometry.entities[0].type === "text") {
        // (10,0) rotated 90 = (0,10), plus insert (5,6) = (5,16)
        expectPointClose(geometry.entities[0].position, [5, 16, 0]);
        expect(geometry.entities[0].rotationDeg).toBeCloseTo(90, 6);
      }
    });
  });

  it("expands block TEXT with mirrored INSERT: position is mirrored but rotation is not reflected (MIRRTEXT=0)", async () => {
    const content = blockScene(
      [...blockHeader("MTEXT"), ...blockTextAt("T1", 10, 0, 1, "MIR", "0", 30), ...blockFooter],
      blockInsert("MTEXT", "I1", "CUT", ["41", "-1", "42", "1", "43", "1"])
    );
    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);
      expect(result.summary.supportedEntityCount).toBe(1);
      const mirror = result.warnings.find((w) => w.code === "DXF_INSERT_MIRROR_FLATTENED");
      expect(mirror).toBeDefined();
      const geometry = result.scenePackage.geometry[0].geometries[0];
      if (geometry.kind === "curve-set" && geometry.entities[0].type === "text") {
        // (10,0) with X mirror → (-10,0), plus insert (5,6) = (-5,6). Position mirrors.
        expectPointClose(geometry.entities[0].position, [-5, 6, 0]);
        // Rotation does NOT reflect under mirror (AutoCAD MIRRTEXT=0 default semantics).
        expect(geometry.entities[0].rotationDeg).toBeCloseTo(30, 6);
      }
    });
  });

  it("expands ATTDEF with non-empty default value to a text entity", async () => {
    const content = blockScene(
      [...blockHeader("ATTBLOCK"), ...blockAttdef("A1", 0, 0, "PART_NUMBER", "ABC-123"), ...blockFooter],
      blockInsert("ATTBLOCK", "I1", "CUT")
    );
    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);
      expect(result.summary.supportedEntityCount).toBe(1);
      const geometry = result.scenePackage.geometry[0].geometries[0];
      if (geometry.kind === "curve-set" && geometry.entities[0].type === "text") {
        expect(geometry.entities[0].text).toBe("ABC-123");
        expect(geometry.entities[0].origin).toBe("ATTDEF");
        expect(geometry.entities[0].tag).toBe("PART_NUMBER");
        expectPointClose(geometry.entities[0].position, [5, 6, 0]);
      }
    });
  });

  it("expands ATTDEF with empty default value: falls back to tag", async () => {
    const content = blockScene(
      [...blockHeader("ATTBLOCK"), ...blockAttdef("A1", 0, 0, "DESC", ""), ...blockFooter],
      blockInsert("ATTBLOCK", "I1", "CUT")
    );
    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);
      expect(result.summary.supportedEntityCount).toBe(1);
      const geometry = result.scenePackage.geometry[0].geometries[0];
      if (geometry.kind === "curve-set" && geometry.entities[0].type === "text") {
        expect(geometry.entities[0].text).toBe("DESC");
        expect(geometry.entities[0].origin).toBe("ATTDEF");
        expect(geometry.entities[0].tag).toBe("DESC");
      }
    });
  });

  it("block TEXT with layer 0 inherits the INSERT layer", async () => {
    const content = blockScene(
      [...blockHeader("INHERIT"), ...blockTextAt("T1", 0, 0, 1, "INHERIT", "0"), ...blockFooter],
      blockInsert("INHERIT", "I1", "DETAIL")
    );
    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);
      expect(result.summary.supportedEntityCount).toBe(1);
      const documents = result.scenePackage.geometry;
      const allEntities = documents.flatMap((d) => d.geometries.flatMap((g) => (g.kind === "curve-set" ? g.entities : [])));
      const text = allEntities.find((e) => e.type === "text");
      expect(text?.layerId).toBe("layer-detail");
    });
  });

  it("nested child block with TEXT+LINE: both expand at depth-2 with no partial-expand warning", async () => {
    const content = blockScene(
      [
        ...blockHeader("PARENT"),
        ...blockInsert("CHILD", "BI1"),
        ...blockFooter,
        ...blockHeader("CHILD"),
        ...blockText,
        ...blockLine("L1"),
        ...blockFooter
      ],
      blockInsert("PARENT", "I1")
    );

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);

      expect(result.summary.supportedEntityCount).toBe(2);
      expect(result.warnings).toEqual([]);
      const entities = result.scenePackage.geometry[0].geometries[0];
      if (entities.kind === "curve-set") {
        const types = entities.entities.map((e) => e.type).sort();
        expect(types).toEqual(["line", "text"]);
      }
    });
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

  // Phase 10N-A diagnostic: verify @dxfjs/parser exposes VERTEX group 70 flags for spline-fit POLYLINEs.
  // DXF POLYLINE flag=4 = spline-fit.
  // VERTEX flag=8  = "spline vertex created by spline fitting" — points ON the fitted curve; USE these for import.
  // VERTEX flag=16 = "spline frame control point" — original input frame; SKIP these (not on the curve).
  // Phase 10N-B will use flag&8 vertices as a pre-sampled polyline chain (no B-spline math needed).
  it("@dxfjs/parser exposes VERTEX flag (group 70) on spline-fit POLYLINE vertices", async () => {
    const splineFitDxf = dxf([
      "0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "4", "0", "ENDSEC",
      "0", "SECTION", "2", "ENTITIES",
      // POLYLINE with flag=4 (spline-fit)
      "0", "POLYLINE", "5", "P1", "8", "0",
      "66", "1",  // vertices follow flag
      "10", "0", "20", "0", "30", "0",
      "70", "4",  // spline-fit flag
      // VERTEX flag=16: spline frame control points (original input, NOT on the curve — skip these)
      "0", "VERTEX", "5", "V1", "8", "0",
      "10", "0", "20", "0", "30", "0",
      "70", "16",
      "0", "VERTEX", "5", "V2", "8", "0",
      "10", "5", "20", "3", "30", "0",
      "70", "16",
      // VERTEX flag=8: spline vertices pre-sampled on the fitted curve (use these for import)
      "0", "VERTEX", "5", "V3", "8", "0",
      "10", "0", "20", "0", "30", "0",
      "70", "8",
      "0", "VERTEX", "5", "V4", "8", "0",
      "10", "2", "20", "1", "30", "0",
      "70", "8",
      "0", "SEQEND", "5", "SE1", "8", "0",
      "0", "ENDSEC",
      "0", "EOF"
    ]);

    const parser = new Parser();
    const parsed = await parser.parse(splineFitDxf);
    const polyline = parsed.entities.polylines[0];

    // POLYLINE entity exists and has spline-fit flag
    expect(polyline).toBeDefined();
    expect(polyline.flag & 4).toBe(4);

    // All four vertices are parsed
    expect(polyline.vertices).toHaveLength(4);

    // Frame control vertices (flag=16): skip during import — preserved by parser for identification
    const frameVertices = polyline.vertices.filter((v) => (v.flag & 16) === 16);
    expect(frameVertices).toHaveLength(2);
    expect(frameVertices[0].flag).toBe(16);
    expect(frameVertices[1].flag).toBe(16);

    // Spline vertices (flag=8): pre-sampled points on the fitted curve — use these for import
    const splineVertices = polyline.vertices.filter((v) => (v.flag & 8) === 8 && (v.flag & 16) === 0);
    expect(splineVertices).toHaveLength(2);
    expect(splineVertices[0].flag).toBe(8);
    expect(splineVertices[1].flag).toBe(8);

    // Spline vertex coordinates are accessible
    expect(splineVertices[0].x).toBeCloseTo(0, 6);
    expect(splineVertices[0].y).toBeCloseTo(0, 6);
    expect(splineVertices[1].x).toBeCloseTo(2, 6);
    expect(splineVertices[1].y).toBeCloseTo(1, 6);
  });

  describe("spline-fit and curve-fit POLYLINE expansion (Phase 10N-B)", () => {
    const minimalDxfEntities = (entityLines: string[]) =>
      dxf([
        "0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "4", "0", "ENDSEC",
        "0", "SECTION", "2", "ENTITIES",
        ...entityLines,
        "0", "ENDSEC",
        "0", "EOF"
      ]);

    const polylineWithVertices = (handle: string, polyFlag: number, vertices: Array<{ handle: string; x: number; y: number; flag: number }>) => [
      "0", "POLYLINE", "5", handle, "8", "CUT", "66", "1", "70", String(polyFlag), "10", "0", "20", "0", "30", "0",
      ...vertices.flatMap((v) => ["0", "VERTEX", "5", v.handle, "8", "CUT", "10", String(v.x), "20", String(v.y), "30", "0", "70", String(v.flag)]),
      "0", "SEQEND", "5", `SE-${handle}`, "8", "CUT"
    ];

    it("spline-fit POLYLINE uses only flag & 8 vertices, skips flag & 16 frame control vertices", async () => {
      const content = minimalDxfEntities(polylineWithVertices("PL1", 4, [
        { handle: "V1", x: 100, y: 200, flag: 16 }, // frame control — must NOT appear in output
        { handle: "V2", x: 300, y: 400, flag: 16 }, // frame control — must NOT appear in output
        { handle: "V3", x: 0,   y: 0,   flag: 8  }, // fitting vertex — must appear
        { handle: "V4", x: 5,   y: 3,   flag: 8  }, // fitting vertex — must appear
        { handle: "V5", x: 10,  y: 0,   flag: 8  }  // fitting vertex — must appear
      ]));
      await withTempDxf(content, async (filePath) => {
        const result = await importDxfToKairo(filePath);
        expect(result.summary.supportedEntityCount).toBe(1);
        const geometry = result.scenePackage.geometry[0]?.geometries[0];
        expect(geometry?.kind).toBe("curve-set");
        if (geometry?.kind === "curve-set") {
          expect(geometry.entities).toHaveLength(1);
          const polyline = geometry.entities[0];
          expect(polyline.type).toBe("polyline");
          if (polyline.type === "polyline") {
            expect(polyline.points).toHaveLength(3);
            expect(polyline.points[0]).toEqual([0, 0, 0]);
            expect(polyline.points[1]).toEqual([5, 3, 0]);
            expect(polyline.points[2]).toEqual([10, 0, 0]);
          }
        }
        expect(result.warnings.filter((w) => w.code === "DXF_POLYLINE_SPLINE_APPROXIMATED")).toHaveLength(1);
        expect(result.warnings.filter((w) => w.code === "DXF_POLYLINE_UNSUPPORTED")).toHaveLength(0);
      });
    });

    it("spline-fit POLYLINE with only flag & 16 vertices emits DXF_POLYLINE_UNSUPPORTED with no-fitting-vertices message", async () => {
      const content = minimalDxfEntities(polylineWithVertices("PL1", 4, [
        { handle: "V1", x: 1, y: 2, flag: 16 },
        { handle: "V2", x: 3, y: 4, flag: 16 }
      ]));
      await withTempDxf(content, async (filePath) => {
        const result = await importDxfToKairo(filePath);
        expect(result.summary.supportedEntityCount).toBe(0);
        const unsupported = result.warnings.filter((w) => w.code === "DXF_POLYLINE_UNSUPPORTED");
        expect(unsupported).toHaveLength(1);
        expect(unsupported[0].message).toContain("no usable fitting vertices");
        expect(result.warnings.filter((w) => w.code === "DXF_POLYLINE_SPLINE_APPROXIMATED")).toHaveLength(0);
      });
    });

    it("spline-fit POLYLINE with exactly 2 flag & 8 vertices imports (boundary condition)", async () => {
      const content = minimalDxfEntities(polylineWithVertices("PL1", 4, [
        { handle: "V1", x: 1, y: 2, flag: 8 },
        { handle: "V2", x: 3, y: 4, flag: 8 }
      ]));
      await withTempDxf(content, async (filePath) => {
        const result = await importDxfToKairo(filePath);
        expect(result.summary.supportedEntityCount).toBe(1);
        const geometry = result.scenePackage.geometry[0]?.geometries[0];
        if (geometry?.kind === "curve-set") {
          const polyline = geometry.entities[0];
          if (polyline.type === "polyline") {
            expect(polyline.points).toHaveLength(2);
            expect(polyline.points[0]).toEqual([1, 2, 0]);
            expect(polyline.points[1]).toEqual([3, 4, 0]);
          }
        }
        expect(result.warnings.filter((w) => w.code === "DXF_POLYLINE_SPLINE_APPROXIMATED")).toHaveLength(1);
      });
    });

    it("spline-fit POLYLINE with only 1 flag & 8 vertex remains unsupported", async () => {
      const content = minimalDxfEntities(polylineWithVertices("PL1", 4, [
        { handle: "V1", x: 5, y: 5, flag: 8 }
      ]));
      await withTempDxf(content, async (filePath) => {
        const result = await importDxfToKairo(filePath);
        expect(result.summary.supportedEntityCount).toBe(0);
        expect(result.warnings.filter((w) => w.code === "DXF_POLYLINE_UNSUPPORTED")).toHaveLength(1);
        expect(result.warnings.filter((w) => w.code === "DXF_POLYLINE_SPLINE_APPROXIMATED")).toHaveLength(0);
      });
    });

    it("curve-fit POLYLINE (flag=2) uses flag & 1 generated vertices, skips untagged original vertices", async () => {
      const content = minimalDxfEntities(polylineWithVertices("PL1", 2, [
        { handle: "V1", x: 99, y: 99, flag: 0 }, // original untagged — must NOT appear
        { handle: "V2", x: 2,  y: 0,  flag: 1 }, // generated arc-fit — must appear
        { handle: "V3", x: 4,  y: 3,  flag: 1 }  // generated arc-fit — must appear
      ]));
      await withTempDxf(content, async (filePath) => {
        const result = await importDxfToKairo(filePath);
        expect(result.summary.supportedEntityCount).toBe(1);
        const geometry = result.scenePackage.geometry[0]?.geometries[0];
        if (geometry?.kind === "curve-set") {
          const polyline = geometry.entities[0];
          if (polyline.type === "polyline") {
            expect(polyline.points).toHaveLength(2);
            expect(polyline.points[0]).toEqual([2, 0, 0]);
            expect(polyline.points[1]).toEqual([4, 3, 0]);
          }
        }
        expect(result.warnings.filter((w) => w.code === "DXF_POLYLINE_SPLINE_APPROXIMATED")).toHaveLength(1);
        expect(result.warnings.filter((w) => w.code === "DXF_POLYLINE_UNSUPPORTED")).toHaveLength(0);
      });
    });

    it("mesh POLYLINE (flag=16) remains unsupported (regression guard)", async () => {
      const content = minimalDxfEntities(polylineWithVertices("PL1", 16, [
        { handle: "V1", x: 0,  y: 0, flag: 0 },
        { handle: "V2", x: 10, y: 0, flag: 0 }
      ]));
      await withTempDxf(content, async (filePath) => {
        const result = await importDxfToKairo(filePath);
        expect(result.summary.supportedEntityCount).toBe(0);
        expect(result.warnings.filter((w) => w.code === "DXF_POLYLINE_UNSUPPORTED")).toHaveLength(1);
        expect(result.warnings[0].message).toContain("mesh flag");
      });
    });

    it("spline-fit POLYLINE inside block expansion: fitting vertices transformed to world space", async () => {
      // Block SPBLOCK: spline-fit POLYLINE with flag=8 vertices at local (0,0) and (10,0).
      // INSERT at (5,6), rotation=0, scale=1. Expected world points: (5,6) and (15,6).
      const splineBlockPolyline = [
        "0", "POLYLINE", "5", "PL1", "8", "0", "66", "1", "70", "4", "10", "0", "20", "0", "30", "0",
        "0", "VERTEX", "5", "V1", "8", "0", "10", "0", "20", "0", "30", "0", "70", "8",
        "0", "VERTEX", "5", "V2", "8", "0", "10", "10", "20", "0", "30", "0", "70", "8",
        "0", "SEQEND", "5", "SE1", "8", "0"
      ];
      const content = blockScene(
        [...blockHeader("SPBLOCK"), ...splineBlockPolyline, ...blockFooter],
        [...blockInsert("SPBLOCK", "I1")]
      );
      await withTempDxf(content, async (filePath) => {
        const result = await importDxfToKairo(filePath);
        expect(result.summary.supportedEntityCount).toBe(1);
        const allGeometries = result.scenePackage.geometry.flatMap((d) => d.geometries);
        const curveSet = allGeometries.find((g) => g.kind === "curve-set" && g.entities.length > 0);
        expect(curveSet?.kind).toBe("curve-set");
        if (curveSet?.kind === "curve-set") {
          const polyline = curveSet.entities.find((e) => e.type === "polyline");
          expect(polyline).toBeDefined();
          if (polyline?.type === "polyline") {
            expect(polyline.points).toHaveLength(2);
            expect(polyline.points[0][0]).toBeCloseTo(5, 6);
            expect(polyline.points[0][1]).toBeCloseTo(6, 6);
            expect(polyline.points[1][0]).toBeCloseTo(15, 6);
            expect(polyline.points[1][1]).toBeCloseTo(6, 6);
          }
        }
        expect(result.warnings.filter((w) => w.code === "DXF_POLYLINE_UNSUPPORTED")).toHaveLength(0);
      });
    });
  });
});
