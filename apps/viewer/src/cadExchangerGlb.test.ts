import { describe, expect, it } from "vitest";
import { exportScenePackageToCadExchangerGlb } from "./cadExchangerGlb";
import { sampleScenePackage } from "./sceneLoader";

function readUint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function readGlbJson(bytes: Uint8Array): unknown {
  const jsonLength = readUint32(bytes, 12);
  const jsonType = readUint32(bytes, 16);
  expect(jsonType).toBe(0x4e4f534a);
  const jsonBytes = bytes.slice(20, 20 + jsonLength);
  return JSON.parse(new TextDecoder().decode(jsonBytes).trim());
}

describe("CAD Exchanger GLB export", () => {
  it("writes a binary GLB with line and triangle primitives plus export stats", () => {
    const result = exportScenePackageToCadExchangerGlb(sampleScenePackage);

    expect(result.filename).toBe("bracket-demo.cadex-handoff.glb");
    expect(readUint32(result.bytes, 0)).toBe(0x46546c67);
    expect(readUint32(result.bytes, 4)).toBe(2);
    expect(readUint32(result.bytes, 8)).toBe(result.bytes.byteLength);
    expect(result.stats).toMatchObject({
      sourceUnits: "millimeter",
      outputUnits: "meter",
      coordinateScale: 0.001,
      curveSets: 1,
      curveEntities: 4,
      includeNormals: false,
      lineSegments: 92,
      meshTriangles: 12,
      primitiveModes: ["LINES", "TRIANGLES"],
      visibleTextEntities: 0,
      visibleTextSegments: 0
    });

    const gltf = readGlbJson(result.bytes) as {
      asset: { extras: { includeNormals: boolean; outputUnits: string } };
      meshes: Array<{ primitives: Array<{ attributes: Record<string, number>; indices?: number; mode: number }> }>;
      extras: typeof result.stats;
    };
    expect(gltf.asset.extras.outputUnits).toBe("meter");
    expect(gltf.asset.extras.includeNormals).toBe(false);
    expect(gltf.meshes[0]?.primitives.map((primitive) => primitive.mode)).toEqual([1, 4]);
    const trianglePrimitive = gltf.meshes[0]?.primitives.find((primitive) => primitive.mode === 4);
    expect(trianglePrimitive?.indices).toBeTypeOf("number");
    expect(trianglePrimitive?.attributes.NORMAL).toBeUndefined();
    expect(gltf.extras.lineSegments).toBe(92);
  });

  it("exports all supported source units to meter-scaled GLB coordinates", () => {
    const inchScene = {
      ...sampleScenePackage,
      manifest: {
        ...sampleScenePackage.manifest,
        units: "inch" as const
      }
    };

    const result = exportScenePackageToCadExchangerGlb(inchScene);

    expect(result.stats).toMatchObject({
      sourceUnits: "inch",
      outputUnits: "meter",
      coordinateScale: 0.0254
    });
  });

  it("can export Process Simulate ribbon geometry with layer nodes and embedded settings", () => {
    const result = exportScenePackageToCadExchangerGlb(sampleScenePackage, {
      geometryMode: "ribbons",
      layerTree: true,
      presetName: "process-simulate",
      ribbonWidthMm: 0.1
    });

    expect(result.stats).toMatchObject({
      geometryMode: "ribbons",
      layerTree: true,
      ribbonWidthMm: 0.1,
      lineSegments: 92,
      meshTriangles: 196,
      primitiveModes: ["TRIANGLES"]
    });

    const gltf = readGlbJson(result.bytes) as {
      asset: {
        extras: {
          cadExchangerIndexedTriangles: boolean;
          geometryMode: string;
          includeNormals: boolean;
          layerTree: boolean;
          presetName: string;
          ribbonWidthMm: number;
        };
      };
      nodes: Array<{ children?: number[]; extras?: { layerId?: string; primitiveMode?: string } }>;
      meshes: Array<{ primitives: Array<{ indices?: number; mode: number }> }>;
    };
    expect(gltf.asset.extras).toMatchObject({
      cadExchangerIndexedTriangles: true,
      geometryMode: "ribbons",
      includeNormals: false,
      layerTree: true,
      presetName: "process-simulate",
      ribbonWidthMm: 0.1
    });
    expect(gltf.nodes[0]?.children?.length).toBeGreaterThan(0);
    expect(gltf.nodes.some((node) => node.extras?.primitiveMode === "TRIANGLES")).toBe(true);
    expect(gltf.meshes.every((mesh) => mesh.primitives.every((primitive) => primitive.mode === 4))).toBe(true);
    expect(gltf.meshes.every((mesh) => mesh.primitives.every((primitive) => typeof primitive.indices === "number"))).toBe(true);
  });

  it("can export visible CAD Exchanger text as indexed ribbon geometry", () => {
    const visibleTextScene = {
      ...sampleScenePackage,
      geometry: sampleScenePackage.geometry.map((document) => ({
        ...document,
        geometries: document.geometries.map((geometry) =>
          geometry.kind === "curve-set"
            ? {
                ...geometry,
                entities: [
                  ...geometry.entities,
                  {
                    id: "visible-text",
                    type: "text" as const,
                    text: "7B-010L",
                    position: [0, 0, 0] as [number, number, number],
                    height: 12,
                    rotationDeg: 0,
                    origin: "TEXT" as const,
                    layerId: geometry.layerId,
                    sourceRef: "src-visible-text"
                  }
                ]
              }
            : geometry
        )
      }))
    };
    const result = exportScenePackageToCadExchangerGlb(visibleTextScene, {
      geometryMode: "ribbons",
      textMode: "visible",
      ribbonWidthMm: 1
    });

    expect(result.stats.visibleTextEntities).toBeGreaterThan(0);
    expect(result.stats.visibleTextSegments).toBeGreaterThan(0);
    expect(result.stats.textMetadataEntities).toBeGreaterThan(0);

    const gltf = readGlbJson(result.bytes) as {
      meshes: Array<{ primitives: Array<{ indices?: number; mode: number }> }>;
    };
    expect(gltf.meshes.every((mesh) => mesh.primitives.every((primitive) => primitive.mode === 4))).toBe(true);
    expect(gltf.meshes.every((mesh) => mesh.primitives.every((primitive) => typeof primitive.indices === "number"))).toBe(true);
  });
});
