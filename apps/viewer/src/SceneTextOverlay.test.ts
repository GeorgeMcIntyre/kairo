import type { ScenePackage } from "@kairo/schema";
import { describe, expect, it } from "vitest";
import { collectTextItems } from "./SceneTextOverlay";

function makeScenePackage(): ScenePackage {
  return {
    manifest: {
      format: "kairo-neutral-scene",
      version: "0.1.0",
      units: "millimeter",
      axisSystem: { up: "Z", handedness: "right" },
      rootSceneFile: "scene.json",
      createdBy: { name: "test", version: "0.1.0" },
      source: { format: "DXF" }
    },
    scene: {
      rootNodeId: "root",
      nodes: [{ id: "root", displayName: "root", type: "drawing", children: [], localTransform: new Array(16).fill(0).map((_, i) => (i % 5 === 0 ? 1 : 0)) }]
    },
    geometry: [
      {
        geometries: [
          {
            id: "g1",
            kind: "curve-set",
            layerId: "layer-cut",
            entities: [
              {
                id: "line-1",
                type: "line",
                start: [0, 0, 0],
                end: [10, 0, 0]
              },
              {
                id: "text-1",
                type: "text",
                text: "STATION A",
                position: [5, 5, 0],
                rotationDeg: 0,
                height: 2.5,
                origin: "TEXT",
                layerId: "layer-cut"
              },
              {
                id: "text-empty",
                type: "text",
                text: "",
                position: [0, 0, 0],
                rotationDeg: 0,
                height: 1,
                origin: "ATTDEF",
                tag: "TAG"
              }
            ]
          }
        ]
      }
    ],
    layers: { layers: [{ id: "layer-cut", name: "CUT", visible: true }] },
    materials: { materials: [] },
    sourceMap: { sources: [] }
  };
}

describe("collectTextItems", () => {
  it("extracts text entities from curve-sets", () => {
    const items = collectTextItems(makeScenePackage());
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      entityId: "text-1",
      text: "STATION A",
      origin: "TEXT",
      height: 2.5,
      layerId: "layer-cut"
    });
  });

  it("skips empty text strings", () => {
    const items = collectTextItems(makeScenePackage());
    expect(items.find((i) => i.entityId === "text-empty")).toBeUndefined();
  });

  it("inherits layerId from geometry when entity has none", () => {
    const pkg = makeScenePackage();
    const geom = pkg.geometry[0].geometries[0];
    if (geom.kind === "curve-set") {
      const text = geom.entities.find((e) => e.id === "text-1");
      if (text && text.type === "text") {
        delete (text as { layerId?: string }).layerId;
      }
    }
    const items = collectTextItems(pkg);
    expect(items).toHaveLength(1);
    expect(items[0].layerId).toBe("layer-cut");
  });
});
