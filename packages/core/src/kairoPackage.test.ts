import { describe, expect, it } from "vitest";
import { scenePackageSchema, type ScenePackage } from "@kairo/schema";
import { createKairoPackage, readKairoPackage } from "./kairoPackage";
import { identityMatrix } from "./index";

function samplePackage(): ScenePackage {
  return scenePackageSchema.parse({
    manifest: {
      format: "kairo-neutral-scene",
      version: "0.1.0",
      units: "millimeter",
      axisSystem: { up: "Z", handedness: "right" },
      rootSceneFile: "scene.json",
      createdBy: { name: "kairo-test", version: "0.1.0" },
      source: { format: "DXF", path: "sample.dxf" }
    },
    scene: {
      rootNodeId: "node-root",
      nodes: [
        {
          id: "node-root",
          displayName: "Sample",
          type: "scene",
          children: ["node-curves"],
          localTransform: identityMatrix()
        },
        {
          id: "node-curves",
          displayName: "Curves",
          type: "drawing",
          children: [],
          localTransform: identityMatrix(),
          geometryRefs: ["geom-main-curves"],
          layerId: "layer-main"
        }
      ]
    },
    geometry: [
      {
        geometries: [
          {
            id: "geom-main-curves",
            kind: "curve-set",
            layerId: "layer-main",
            entities: [
              {
                id: "line-1",
                type: "line",
                start: [0, 0, 0],
                end: [10, 0, 0],
                layerId: "layer-main"
              }
            ]
          }
        ]
      }
    ],
    layers: {
      layers: [
        {
          id: "layer-main",
          name: "Main",
          visible: true
        }
      ]
    },
    materials: { materials: [] },
    sourceMap: {
      sources: [
        {
          id: "src-dxf-file",
          path: "sample.dxf",
          format: "DXF"
        }
      ]
    }
  });
}

describe("Kairo package archive", () => {
  it("round-trips a scene package through a compressed .kairo archive", () => {
    const scenePackage = samplePackage();
    const archive = createKairoPackage(scenePackage, { createdBy: "unit-test" });
    const loaded = readKairoPackage(archive);

    expect(loaded.packageIndex).toMatchObject({
      format: "kairo-package",
      version: "0.1.0",
      createdBy: "unit-test",
      scene: {
        manifest: "manifest.json",
        scene: "scene.json",
        layers: "layers.json",
        materials: "materials.json",
        sourceMap: "source-map.json",
        geometry: ["geometry/geom-main-curves.json"]
      }
    });
    expect(loaded.scenePackage).toEqual(scenePackage);
  });

  it("rejects archives without geometry documents", () => {
    const scenePackage = samplePackage();
    const archive = createKairoPackage({ ...scenePackage, geometry: [] });

    expect(() => readKairoPackage(archive)).toThrow("geometry");
  });
});
