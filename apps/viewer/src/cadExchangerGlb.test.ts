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
      lineSegments: 92,
      meshTriangles: 12,
      primitiveModes: ["LINES", "TRIANGLES"]
    });

    const gltf = readGlbJson(result.bytes) as {
      asset: { extras: { outputUnits: string } };
      meshes: Array<{ primitives: Array<{ mode: number }> }>;
      extras: typeof result.stats;
    };
    expect(gltf.asset.extras.outputUnits).toBe("meter");
    expect(gltf.meshes[0]?.primitives.map((primitive) => primitive.mode)).toEqual([1, 4]);
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
});
