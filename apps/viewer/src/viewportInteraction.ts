import { cappedDevicePixelRatio } from "./viewerMath";

export const LARGE_SCENE_CURVE_COUNT = 250_000;
export const LARGE_SCENE_HOVER_RAYCAST_INTERVAL_MS = 200;
export const POINTER_CLICK_MOVE_TOLERANCE_PX = 4;
export const LARGE_SCENE_INTERACTION_IDLE_MS = 120;
export const LARGE_SCENE_STATIC_DPR_CAP = 1.25;
export const LARGE_SCENE_INTERACTIVE_DPR_CAP = 0.85;

export type PointerStart = {
  x: number;
  y: number;
};

export function isLargeSceneInteractionMode(curveEntityCount: number, explicitLargeSceneMode = false): boolean {
  return explicitLargeSceneMode || curveEntityCount >= LARGE_SCENE_CURVE_COUNT;
}

export function pointerMoveDistancePx(start: PointerStart, current: PointerStart): number {
  return Math.hypot(current.x - start.x, current.y - start.y);
}

export function isClickLikePointerGesture(
  start: PointerStart,
  current: PointerStart,
  tolerancePx = POINTER_CLICK_MOVE_TOLERANCE_PX
): boolean {
  return pointerMoveDistancePx(start, current) <= tolerancePx;
}

export function shouldRunHoverRaycast(options: {
  largeSceneMode: boolean;
  pointerDown: boolean;
  interacting: boolean;
  nowMs: number;
  lastHoverRaycastMs: number;
  intervalMs?: number;
}): boolean {
  if (options.pointerDown || options.interacting) return false;
  if (!options.largeSceneMode) return true;
  const interval = options.intervalMs ?? LARGE_SCENE_HOVER_RAYCAST_INTERVAL_MS;
  return options.nowMs - options.lastHoverRaycastMs >= interval;
}

export function rendererPixelRatioForInteraction(
  devicePixelRatio: number,
  largeSceneMode: boolean,
  interacting: boolean
): number {
  if (!largeSceneMode) return cappedDevicePixelRatio(devicePixelRatio);
  return cappedDevicePixelRatio(
    devicePixelRatio,
    interacting ? LARGE_SCENE_INTERACTIVE_DPR_CAP : LARGE_SCENE_STATIC_DPR_CAP
  );
}
