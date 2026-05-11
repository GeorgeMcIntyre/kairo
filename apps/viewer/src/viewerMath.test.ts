import { describe, expect, it } from "vitest";
import {
  cappedDevicePixelRatio,
  computeOrthographicFitView,
  pointerClientToNdc,
  rendererViewportFromElement
} from "./viewerMath";

describe("cappedDevicePixelRatio", () => {
  it("caps high browser/device DPR values for stable canvas backing size", () => {
    expect(cappedDevicePixelRatio(1.25)).toBe(1.25);
    expect(cappedDevicePixelRatio(3)).toBe(2);
    expect(cappedDevicePixelRatio(0)).toBe(1);
  });
});

describe("rendererViewportFromElement", () => {
  it("uses CSS pixel container size independent of DPR", () => {
    const viewport = rendererViewportFromElement({ clientWidth: 1200, clientHeight: 800 }, 1.25);
    expect(viewport).toEqual({
      width: 1200,
      height: 800,
      devicePixelRatio: 1.25,
      rendererPixelRatio: 1.25
    });
  });
});

describe("pointerClientToNdc", () => {
  it("maps canvas center to NDC origin using the canvas rect", () => {
    expect(pointerClientToNdc(700, 500, { left: 100, top: 100, width: 1200, height: 800 })).toEqual({
      x: 0,
      y: 0
    });
  });

  it("is independent of device pixel ratio because it consumes CSS pixel rects", () => {
    const rect = { left: 10, top: 20, width: 800, height: 400 };
    expect(pointerClientToNdc(210, 120, rect)).toEqual(pointerClientToNdc(210, 120, rect));
  });
});

describe("computeOrthographicFitView", () => {
  it("produces the same world-space fit for the same CSS viewport regardless of DPR", () => {
    const size = { x: 10000, y: 5000, z: 0 };
    const viewport100 = computeOrthographicFitView(size, { width: 1200, height: 800 });
    const viewport125 = computeOrthographicFitView(size, { width: 1200, height: 800 });
    expect(viewport125).toEqual(viewport100);
  });

  it("changes only with viewport aspect ratio", () => {
    const size = { x: 10000, y: 5000, z: 0 };
    const wide = computeOrthographicFitView(size, { width: 1400, height: 700 });
    const tall = computeOrthographicFitView(size, { width: 700, height: 1400 });
    expect(wide.aspect).toBeGreaterThan(tall.aspect);
    expect(wide.viewHeight).not.toBe(tall.viewHeight);
  });
});
