import { describe, expect, it } from "vitest";
import type { ScenePackage } from "@kairo/schema";
import {
  applyLayoutRotation,
  applyLayoutScale,
  applyLayoutTranslation,
  createJobSessionForScenePackage,
  inferLayoutType,
  layoutLocalToWorld,
  layoutMetadataFromScenePackage,
  setLayoutOrigin,
  updateCoordinateReadout,
  worldToLayoutLocal,
  type JobLayoutTransform
} from "./layoutMap";

const baseLayout: JobLayoutTransform = {
  layoutId: "layout-a",
  fileName: "concept.dxf",
  type: "concept",
  originX: 0,
  originY: 0,
  translationX: 0,
  translationY: 0,
  rotation: 0,
  scale: 1,
  visible: true,
  locked: false
};

function scenePackage(path = "C:\\jobs\\Concept Layout.dxf"): ScenePackage {
  return {
    manifest: {
      format: "kairo-neutral-scene",
      version: "0.1.0",
      units: "millimeter",
      axisSystem: { up: "Z", handedness: "right" },
      rootSceneFile: "scene.json",
      createdBy: { name: "test", version: "0.1.0" },
      source: { format: "dxf", path }
    },
    scene: {
      rootNodeId: "root",
      nodes: [
        {
          id: "root",
          displayName: "Concept Layout.dxf",
          type: "scene",
          children: [],
          localTransform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
        }
      ]
    },
    geometry: [],
    layers: { layers: [] },
    materials: { materials: [] },
    sourceMap: { sources: [] }
  };
}

describe("layout map metadata", () => {
  it("builds default layout metadata from a scene package without mutating scene entities", () => {
    const packageData = scenePackage();
    const layout = layoutMetadataFromScenePackage(packageData);

    expect(layout).toMatchObject({
      layoutId: "layout-concept-layout.dxf",
      fileName: "Concept Layout.dxf",
      type: "concept",
      originX: 0,
      originY: 0,
      translationX: 0,
      translationY: 0,
      rotation: 0,
      scale: 1,
      visible: true,
      locked: false
    });
    expect(packageData.scene.nodes[0].localTransform).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });

  it("creates a one-layout job session with coordinate readout metadata", () => {
    const session = createJobSessionForScenePackage(scenePackage("robot-device-layout.dxf"));

    expect(session.layoutMap.layouts).toHaveLength(1);
    expect(session.layoutMap.activeLayoutId).toBe(session.layoutMap.layouts[0].layoutId);
    expect(session.layoutMap.layouts[0].type).toBe("device");
    expect(session.layoutMap.coordinateReadout).toEqual({
      cursorWorld: null,
      selectedWorld: null,
      selectedLayoutOrigin: { x: 0, y: 0 },
      activeLayoutId: session.layoutMap.layouts[0].layoutId,
      selectedLayoutId: session.layoutMap.layouts[0].layoutId
    });
  });

  it("infers common layout types from file names", () => {
    expect(inferLayoutType("main-concept-layout.dxf")).toBe("concept");
    expect(inferLayoutType("robot_gripper_device.dxf")).toBe("device");
    expect(inferLayoutType("site-foundation.dxf")).toBe("foundation");
    expect(inferLayoutType("xref-background.dxf")).toBe("reference");
    expect(inferLayoutType("misc.dxf")).toBe("unknown");
  });
});

describe("layout transform math", () => {
  it("maps local to world using origin, scale, rotation, and translation", () => {
    const layout = {
      ...baseLayout,
      originX: 10,
      originY: 20,
      translationX: 100,
      translationY: -50,
      rotation: 90,
      scale: 2
    };

    expect(layoutLocalToWorld({ x: 13, y: 24 }, layout)).toEqual({
      x: 102,
      y: -24
    });
  });

  it("round-trips world and local coordinates", () => {
    const layout = {
      ...baseLayout,
      originX: -20,
      originY: 15,
      translationX: 250,
      translationY: 40,
      rotation: -37,
      scale: 0.5
    };
    const local = { x: 123.4, y: -987.6 };
    const world = layoutLocalToWorld(local, layout);
    const roundTrip = worldToLayoutLocal(world, layout);

    expect(roundTrip.x).toBeCloseTo(local.x, 8);
    expect(roundTrip.y).toBeCloseTo(local.y, 8);
  });

  it("applies translation, rotation, scale, and origin as immutable updates", () => {
    const translated = applyLayoutTranslation(baseLayout, 12, -4);
    const rotated = applyLayoutRotation(translated, 45);
    const scaled = applyLayoutScale(rotated, 3);
    const withOrigin = setLayoutOrigin(scaled, 5, 6);

    expect(baseLayout.translationX).toBe(0);
    expect(withOrigin).toMatchObject({
      translationX: 12,
      translationY: -4,
      rotation: 45,
      scale: 3,
      originX: 5,
      originY: 6
    });
  });

  it("rejects zero scale for invertible transforms", () => {
    expect(() => layoutLocalToWorld({ x: 0, y: 0 }, { ...baseLayout, scale: 0 })).toThrow("scale");
    expect(() => worldToLayoutLocal({ x: 0, y: 0 }, { ...baseLayout, scale: 0 })).toThrow("scale");
    expect(() => applyLayoutScale(baseLayout, 0)).toThrow("scale");
  });
});

describe("coordinate readout metadata", () => {
  it("updates readout data on the job session without changing layout transforms", () => {
    const session = createJobSessionForScenePackage(scenePackage());
    const updated = updateCoordinateReadout(session, {
      cursorWorld: { x: 100, y: 200 },
      selectedWorld: { x: 10, y: 20 }
    });

    expect(updated.layoutMap.coordinateReadout.cursorWorld).toEqual({ x: 100, y: 200 });
    expect(updated.layoutMap.coordinateReadout.selectedWorld).toEqual({ x: 10, y: 20 });
    expect(updated.layoutMap.layouts).toEqual(session.layoutMap.layouts);
  });
});
