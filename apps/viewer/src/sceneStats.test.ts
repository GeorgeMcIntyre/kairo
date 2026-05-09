import { describe, expect, it } from "vitest";
import { sampleScenePackage } from "./sceneLoader";
import { computeLayerEntityCounts, computeSceneStats } from "./sceneStats";

describe("viewer scene stats", () => {
  it("summarizes scene, geometry, and curve entity counts", () => {
    expect(computeSceneStats(sampleScenePackage)).toEqual({
      nodeCount: 3,
      layerCount: 2,
      geometryDocumentCount: 2,
      geometryCount: 2,
      meshCount: 1,
      curveSetCount: 1,
      curveEntityCount: 4
    });
  });

  it("counts curve entities by effective layer", () => {
    expect(computeLayerEntityCounts(sampleScenePackage)).toEqual([
      {
        id: "layer-solids",
        name: "Solids",
        entityCount: 0,
        geometryCount: 1
      },
      {
        id: "layer-reference",
        name: "DXF Reference",
        entityCount: 4,
        geometryCount: 1
      }
    ]);
  });
});
