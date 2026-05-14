import type { ScenePackage } from "@kairo/schema";
import { describe, expect, it } from "vitest";
import { exportScenePackageToCadExchangerGlb } from "./cadExchangerGlb";

function parseGlbJson(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)).trim());
}

function scenePackage(): ScenePackage {
  return {
    manifest: {
      format: "kairo-neutral-scene",
      version: "0.1.0",
      units: "millimeter",
      axisSystem: { up: "Z", handedness: "right" },
      rootSceneFile: "scene.json",
      createdBy: { name: "test", version: "0" },
      source: {
        format: "DXF",
        path: "C:\\Users\\georgem\\Downloads\\ScottLayouts\\problem.dxf"
      }
    },
    scene: {
      rootNodeId: "root",
      nodes: [
        {
          id: "root",
          displayName: "problem.dxf",
          type: "scene",
          children: [],
          localTransform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
          geometryRefs: ["geom"]
        }
      ]
    },
    geometry: [
      {
        geometries: [
          {
            id: "geom",
            kind: "curve-set",
            layerId: "layer-cut",
            entities: [
              { id: "line-1", type: "line", layerId: "layer-cut", sourceRef: "src-line-1", start: [0, 0, 0], end: [1000, 0, 0] },
              {
                id: "text-1",
                type: "text",
                layerId: "layer-text",
                sourceRef: "src-text-1",
                text: "7B-020L GEO & SPAC",
                position: [0, 100, 5],
                rotationDeg: 0,
                height: 457.2,
                origin: "TEXT"
              }
            ]
          }
        ]
      }
    ],
    layers: {
      layers: [
        { id: "layer-cut", name: "CUT", visible: true },
        { id: "layer-text", name: "TEXT", visible: true }
      ]
    },
    materials: { materials: [] },
    sourceMap: {
      sources: [
        { id: "src-file", path: "C:\\Users\\georgem\\Downloads\\ScottLayouts\\problem.dxf", format: "DXF", entityType: "FILE" },
        { id: "src-line-1", path: "problem.dxf", format: "DXF", entityType: "LINE", entityId: "1" },
        { id: "src-text-1", path: "problem.dxf", format: "DXF", entityType: "TEXT", entityId: "2" }
      ]
    }
  };
}

describe("viewer CAD Exchanger GLB export", () => {
  it("creates a redacted deterministic GLB with text styling scaled to meters", () => {
    const first = exportScenePackageToCadExchangerGlb(scenePackage());
    const second = exportScenePackageToCadExchangerGlb(scenePackage());

    expect(first.filename).toBe("problem.pro.ribbons-keytext.glb");
    expect(first.reportFilename).toBe("problem.cadex-report.md");
    expect(first.reportJson).toBe(second.reportJson);
    expect(first.reportJson).not.toContain("C:\\Users\\");
    expect(first.report.sourceFile).toBe("problem.dxf");
    expect(first.report.coordinateScale).toBe(0.001);
    expect(first.report.text.textZLift).toBe(0.003);
    expect(first.report.text.suspiciousLargeTextHeights[0]).toMatchObject({
      label: "7B-020L",
      sourceHeight: 457.2,
      exportedTextHeight: 0.4572,
      capHeight: 0.15,
      z: 0.008
    });

    const gltf = parseGlbJson(first.bytes);
    expect(gltf.asset.generator).toBe("Kairo viewer CAD Exchanger GLB export");
    expect(gltf.extras.source).toBe("problem.dxf");
    expect(gltf.extras.coordinateScale).toBe(0.001);
    expect(gltf.extras.textStyle).toBe("filtered 5x7 ribbon stroke text");
    expect(gltf.meshes[0].primitives.length).toBeGreaterThan(1);
  });
});
