import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateScenePackage } from "@kairo/validator";
import { importDxfToKairo, writeScenePackage } from ".";

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

  it("partially expands block with ATTDEF+LINE: LINE expanded, ATTDEF skipped with partial expand warning", async () => {
    const blockAttdefLine = (lineHandle: string) => [
      "0", "ATTDEF", "5", "AD1", "8", "0", "10", "0", "20", "0", "30", "0", "40", "1", "1", "TAG", "2", "TAG",
      "0", "LINE", "5", lineHandle, "8", "0", "10", "0", "20", "0", "30", "0", "11", "10", "21", "0", "31", "0"
    ];
    const content = blockScene([...blockHeader("MIXEDBLOCK"), ...blockAttdefLine("L1"), ...blockFooter], blockInsert("MIXEDBLOCK", "I1", "CUT"));

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);

      expect(result.summary.supportedEntityCount).toBe(1);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatchObject({
        code: "DXF_BLOCK_PARTIAL_EXPAND",
        message: 'DXF BLOCK "MIXEDBLOCK" was partially expanded; unsupported children skipped: ATTDEF×1.',
        entityType: "INSERT",
        handle: "I1"
      });

      const geometry = result.scenePackage.geometry[0].geometries[0];
      expect(geometry.kind).toBe("curve-set");
      if (geometry.kind === "curve-set") {
        expect(geometry.entities[0]).toMatchObject({
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

  it("partial expand of text-only block yields no geometry and a DXF_BLOCK_PARTIAL_EXPAND warning", async () => {
    const content = blockScene([...blockHeader("TEXTONLY"), ...blockText, ...blockFooter], blockInsert("TEXTONLY", "I1", "CUT"));

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);

      expect(result.summary.supportedEntityCount).toBe(0);
      const partialWarn = result.warnings.find((w) => w.code === "DXF_BLOCK_PARTIAL_EXPAND");
      expect(partialWarn).toMatchObject({
        message: 'DXF BLOCK "TEXTONLY" was partially expanded; unsupported children skipped: TEXT×1.',
        entityType: "INSERT",
        handle: "I1"
      });
    });
  });

  it("skips non-uniform-scale and negative-scale INSERTs; expands z-offset-only INSERT flattened", async () => {
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

      expect(result.summary.supportedEntityCount).toBe(1);
      expect(result.warnings).toEqual([
        {
          code: "DXF_BLOCK_INSERT_TRANSFORM_UNSUPPORTED",
          message: "DXF INSERT transform is not supported by the simple expander (non-uniform scale); entity was skipped.",
          entityType: "INSERT",
          handle: "I1"
        },
        {
          code: "DXF_BLOCK_INSERT_TRANSFORM_UNSUPPORTED",
          message: "DXF INSERT transform is not supported by the simple expander (negative scale); entity was skipped.",
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

  it("still fully skips nested and missing INSERTs; partial-expands text-only block with no geometry", async () => {
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

      expect(result.summary.supportedEntityCount).toBe(0);
      expect(result.warnings).toEqual([
        expect.objectContaining({
          code: "DXF_BLOCK_DEFINITION_MISSING",
          entityType: "INSERT",
          handle: "I2"
        }),
        expect.objectContaining({
          code: "DXF_BLOCK_INSERT_NESTED_UNSUPPORTED",
          entityType: "INSERT",
          handle: "I1"
        }),
        expect.objectContaining({
          code: "DXF_BLOCK_PARTIAL_EXPAND",
          message: 'DXF BLOCK "TEXTBLOCK" was partially expanded; unsupported children skipped: TEXT×1.',
          entityType: "INSERT",
          handle: "I3"
        })
      ]);
    });
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
        code: "DXF_BLOCK_DEFINITION_MISSING",
        message: 'DXF INSERT references missing BLOCK definition "TITLE_BLOCK"; entity was skipped.',
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

  it("still skips INSERT with z-offset AND negative scale", async () => {
    const content = blockScene(
      [...blockHeader("ZNEG"), ...blockLine("L1"), ...blockFooter],
      blockInsert("ZNEG", "I1", "CUT", ["30", "5", "41", "-1", "42", "-1", "43", "-1"])
    );

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);

      expect(result.summary.supportedEntityCount).toBe(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatchObject({
        code: "DXF_BLOCK_INSERT_TRANSFORM_UNSUPPORTED",
        handle: "I1"
      });
      expect(result.warnings[0].message).toContain("negative scale");
    });
  });

  it("still skips INSERT with z-offset when block has nested INSERT", async () => {
    const content = blockScene(
      [...blockHeader("NESTED_Z"), ...blockInsert("CHILD", "BI1"), ...blockFooter],
      blockInsert("NESTED_Z", "I1", "CUT", ["30", "5"])
    );

    await withTempDxf(content, async (filePath) => {
      const result = await importDxfToKairo(filePath);

      expect(result.summary.supportedEntityCount).toBe(0);
      expect(result.warnings.some((w) => w.code === "DXF_BLOCK_INSERT_NESTED_UNSUPPORTED" && w.handle === "I1")).toBe(true);
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
});
