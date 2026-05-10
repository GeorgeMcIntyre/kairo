import type { ScenePackage } from "@kairo/schema";
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  AUTO_HIDE_BELOW_PX,
  MAX_DISPLAY_PX,
  MIN_DISPLAY_PX,
  collectTextItems,
  computePixelsPerWorldUnit,
  cssRotationFor,
  decideDisplay,
  isUpsideDown,
  normalizeRotation,
  projectLabel
} from "./SceneTextOverlay";

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

describe("normalizeRotation", () => {
  it("wraps to (-180, 180]", () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(90)).toBe(90);
    expect(normalizeRotation(180)).toBe(180);
    expect(normalizeRotation(270)).toBe(-90);
    expect(normalizeRotation(-90)).toBe(-90);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(-450)).toBe(-90);
  });
});

describe("isUpsideDown", () => {
  it("returns true for rotations that flip text upside-down", () => {
    expect(isUpsideDown(91)).toBe(true);
    expect(isUpsideDown(180)).toBe(true);
    expect(isUpsideDown(269)).toBe(true);
    expect(isUpsideDown(540)).toBe(true); // 540 mod 360 = 180
  });

  it("returns false for rotations that read normally", () => {
    expect(isUpsideDown(0)).toBe(false);
    expect(isUpsideDown(45)).toBe(false);
    expect(isUpsideDown(90)).toBe(false);
    expect(isUpsideDown(270)).toBe(false);
    expect(isUpsideDown(315)).toBe(false);
    expect(isUpsideDown(360)).toBe(false);
  });
});

describe("cssRotationFor", () => {
  it("inverts DXF CCW rotation for screen Y-flipped CSS rotate", () => {
    expect(cssRotationFor(0, false)).toBe(0);
    expect(cssRotationFor(90, false)).toBe(-90);
    expect(cssRotationFor(180, false)).toBe(-180);
    expect(cssRotationFor(45, false)).toBe(-45);
  });

  it("flips upside-down labels by 180 when readableOrientation is on", () => {
    expect(cssRotationFor(180, true)).toBe(0); // -180 + 180
    expect(cssRotationFor(135, true)).toBe(45); // -135 + 180
    expect(cssRotationFor(0, true)).toBe(0); // not upside-down
    expect(cssRotationFor(45, true)).toBe(-45); // not upside-down
  });
});

describe("computePixelsPerWorldUnit", () => {
  it("returns pixelHeight / worldHeight for orthographic camera at zoom=1", () => {
    const camera = new THREE.OrthographicCamera(-100, 100, 50, -50, 0.1, 1000);
    const px = computePixelsPerWorldUnit(camera, { clientHeight: 800 });
    // worldHeight = (50 - -50)/1 = 100; px = 800/100 = 8
    expect(px).toBeCloseTo(8, 6);
  });

  it("scales by orthographic camera zoom", () => {
    const camera = new THREE.OrthographicCamera(-100, 100, 50, -50, 0.1, 1000);
    camera.zoom = 2;
    const px = computePixelsPerWorldUnit(camera, { clientHeight: 800 });
    // worldHeight = 100/2 = 50; px = 800/50 = 16
    expect(px).toBeCloseTo(16, 6);
  });

  it("uses camera-to-origin distance and FOV for perspective", () => {
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(0, 0, 100);
    const px = computePixelsPerWorldUnit(camera, { clientHeight: 800 });
    const expectedWorldHeight = 2 * Math.tan((45 * Math.PI) / 180 / 2) * 100;
    expect(px).toBeCloseTo(800 / expectedWorldHeight, 4);
  });

  it("defaults to pixelHeight=1 when host has zero height", () => {
    const camera = new THREE.OrthographicCamera(-100, 100, 50, -50, 0.1, 1000);
    const px = computePixelsPerWorldUnit(camera, { clientHeight: 0 });
    // pixelHeight = 1, worldHeight = 100, px = 0.01
    expect(px).toBeCloseTo(0.01, 6);
  });
});

describe("projectLabel", () => {
  it("projects world origin to screen center under a centred ortho camera", () => {
    const camera = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 1000);
    camera.position.set(0, 0, 200);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    const projected = projectLabel([0, 0, 0], camera, 800, 600);
    expect(projected.inFrustum).toBe(true);
    expect(projected.screenX).toBeCloseTo(400, 4);
    expect(projected.screenY).toBeCloseTo(300, 4);
  });

  it("flags points outside the frustum", () => {
    const camera = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 100);
    camera.position.set(0, 0, 200);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    // Point well behind the camera near-plane → out of frustum
    const projected = projectLabel([0, 0, 1000], camera, 800, 600);
    expect(projected.inFrustum).toBe(false);
  });

  it("flips world +Y to screen -Y", () => {
    const camera = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 1000);
    camera.position.set(0, 0, 200);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    const top = projectLabel([0, 50, 0], camera, 800, 600);
    const bottom = projectLabel([0, -50, 0], camera, 800, 600);
    // World +Y should land in the upper half of screen (smaller screenY).
    expect(top.screenY).toBeLessThan(300);
    expect(bottom.screenY).toBeGreaterThan(300);
  });
});

describe("decideDisplay", () => {
  it("hides everything in 'off' mode", () => {
    expect(decideDisplay(20, true, false, "off")).toEqual({ display: false, reason: "density" });
  });

  it("hides layer-hidden labels regardless of size", () => {
    expect(decideDisplay(20, true, true, "auto")).toEqual({ display: false, reason: "layer" });
    expect(decideDisplay(20, true, true, "all")).toEqual({ display: false, reason: "layer" });
  });

  it("hides out-of-frustum labels", () => {
    expect(decideDisplay(20, false, false, "auto")).toEqual({ display: false, reason: "frustum" });
  });

  it("auto mode hides labels below AUTO_HIDE_BELOW_PX", () => {
    expect(decideDisplay(AUTO_HIDE_BELOW_PX - 0.1, true, false, "auto")).toEqual({
      display: false,
      reason: "density"
    });
    const ok = decideDisplay(AUTO_HIDE_BELOW_PX + 0.1, true, false, "auto");
    expect(ok.display).toBe(true);
    if (ok.display) expect(ok.clampedUp).toBe(false);
  });

  it("all mode clamps tiny labels up to MIN_DISPLAY_PX", () => {
    const tiny = decideDisplay(0.5, true, false, "all");
    expect(tiny).toEqual({ display: true, fontPx: MIN_DISPLAY_PX, clampedUp: true });
  });

  it("clamps very large labels to MAX_DISPLAY_PX", () => {
    const huge = decideDisplay(500, true, false, "all");
    expect(huge).toEqual({ display: true, fontPx: MAX_DISPLAY_PX, clampedUp: false });
  });
});
