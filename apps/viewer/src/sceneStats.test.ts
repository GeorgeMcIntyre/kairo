import { describe, expect, it } from "vitest";
import { sampleScenePackage } from "./sceneLoader";
import { computeLayerEntityCounts, computeSceneStats, filterLayerEntityCounts, type LayerEntityCount } from "./sceneStats";

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

  it("filters layers by case-insensitive name or id substring", () => {
    const layers: LayerEntityCount[] = [
      { id: "0-ROBOTS", name: "0-ROBOTS", entityCount: 12, geometryCount: 1 },
      { id: "0-CONVEYORS", name: "0-CONVEYORS", entityCount: 20, geometryCount: 1 },
      { id: "layer-reference", name: "DXF Reference", entityCount: 4, geometryCount: 1 }
    ];

    expect(filterLayerEntityCounts(layers, "robot").map((layer) => layer.id)).toEqual(["0-ROBOTS"]);
    expect(filterLayerEntityCounts(layers, " reference ").map((layer) => layer.id)).toEqual(["layer-reference"]);
    expect(filterLayerEntityCounts(layers, "missing")).toEqual([]);
    expect(filterLayerEntityCounts(layers, "").map((layer) => layer.id)).toEqual([
      "0-ROBOTS",
      "0-CONVEYORS",
      "layer-reference"
    ]);
  });
});
