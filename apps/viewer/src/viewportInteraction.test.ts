import { describe, expect, it } from "vitest";
import {
  isClickLikePointerGesture,
  isLargeSceneInteractionMode,
  rendererPixelRatioForInteraction,
  shouldRunHoverRaycast
} from "./viewportInteraction";

describe("viewport interaction policy", () => {
  it("detects explicit and entity-count large-scene mode", () => {
    expect(isLargeSceneInteractionMode(10, true)).toBe(true);
    expect(isLargeSceneInteractionMode(249_999, false)).toBe(false);
    expect(isLargeSceneInteractionMode(250_000, false)).toBe(true);
  });

  it("keeps click selection separate from drag panning", () => {
    expect(isClickLikePointerGesture({ x: 10, y: 10 }, { x: 13, y: 12 })).toBe(true);
    expect(isClickLikePointerGesture({ x: 10, y: 10 }, { x: 24, y: 12 })).toBe(false);
  });

  it("suppresses hover picking while panning or dragging", () => {
    expect(
      shouldRunHoverRaycast({
        largeSceneMode: true,
        pointerDown: true,
        interacting: false,
        nowMs: 1000,
        lastHoverRaycastMs: 0
      })
    ).toBe(false);
    expect(
      shouldRunHoverRaycast({
        largeSceneMode: true,
        pointerDown: false,
        interacting: true,
        nowMs: 1000,
        lastHoverRaycastMs: 0
      })
    ).toBe(false);
  });

  it("throttles idle hover picking only for large scenes", () => {
    expect(
      shouldRunHoverRaycast({
        largeSceneMode: false,
        pointerDown: false,
        interacting: false,
        nowMs: 10,
        lastHoverRaycastMs: 9
      })
    ).toBe(true);
    expect(
      shouldRunHoverRaycast({
        largeSceneMode: true,
        pointerDown: false,
        interacting: false,
        nowMs: 100,
        lastHoverRaycastMs: 0
      })
    ).toBe(false);
    expect(
      shouldRunHoverRaycast({
        largeSceneMode: true,
        pointerDown: false,
        interacting: false,
        nowMs: 250,
        lastHoverRaycastMs: 0
      })
    ).toBe(true);
  });

  it("temporarily lowers large-scene device pixel ratio during interaction", () => {
    expect(rendererPixelRatioForInteraction(2.5, false, true)).toBe(2);
    expect(rendererPixelRatioForInteraction(2.5, true, false)).toBe(1.25);
    expect(rendererPixelRatioForInteraction(2.5, true, true)).toBe(0.85);
  });
});
