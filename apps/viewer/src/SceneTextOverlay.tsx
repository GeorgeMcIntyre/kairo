import type { DrawingEntity, ScenePackage } from "@kairo/schema";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { MAX_TEXT_OVERLAY_CHARS, normalizeDxfText, safeDisplayText } from "./textSafety";

export type TextOverlayItem = {
  entityId: string;
  text: string;
  displayText: string;
  position: [number, number, number];
  rotationDeg: number;
  height: number;
  origin: "TEXT" | "ATTDEF";
  layerId?: string;
  hAlign?: number;
  vAlign?: number;
  attachmentPoint?: number;
};

export type TextOverlayCamera = THREE.OrthographicCamera | THREE.PerspectiveCamera;

export type LabelDensityMode = "auto" | "all" | "off";

export const MIN_DISPLAY_PX = 2;
export const MAX_DISPLAY_PX = 48;
export const AUTO_HIDE_BELOW_PX = 5;

function textOverlayDomKey(item: TextOverlayItem, index: number): string {
  return `${item.entityId}:${index}`;
}

export type TextOverlayMetrics = {
  itemCount: number;
  domLabelCount: number;
  visibleCount: number;
  clampedUpCount: number;
  frustumCulledCount: number;
  layerHiddenCount: number;
  densityHiddenCount: number;
  pxPerUnit: number;
  cameraReady: boolean;
  hostReady: boolean;
  densityMode: LabelDensityMode;
};

export function collectTextItems(scenePackage: ScenePackage): TextOverlayItem[] {
  const items: TextOverlayItem[] = [];
  for (const document of scenePackage.geometry) {
    for (const geometry of document.geometries) {
      if (geometry.kind !== "curve-set") continue;
      for (const entity of geometry.entities as DrawingEntity[]) {
        if (entity.type !== "text") continue;
        if (!entity.text || entity.text.trim().length === 0) continue;
        items.push({
          entityId: entity.id,
          text: entity.text,
          // TODO: DXF text width factor/rotation/aspect fidelity needs a dedicated pass.
          displayText: safeDisplayText(entity.text, MAX_TEXT_OVERLAY_CHARS),
          position: [entity.position[0], entity.position[1], entity.position[2]],
          rotationDeg: entity.rotationDeg,
          height: entity.height,
          origin: entity.origin,
          layerId: entity.layerId ?? geometry.layerId,
          hAlign: entity.hAlign,
          vAlign: entity.vAlign,
          attachmentPoint: entity.attachmentPoint
        });
      }
    }
  }
  return items;
}

export function computePixelsPerWorldUnit(camera: TextOverlayCamera, host: { clientHeight: number }): number {
  const pixelHeight = host.clientHeight || 1;
  if (camera instanceof THREE.OrthographicCamera) {
    const worldHeight = (camera.top - camera.bottom) / camera.zoom;
    return pixelHeight / Math.max(worldHeight, 1e-6);
  }
  // Perspective: use distance from camera to (0,0,0) as a reasonable proxy for now.
  const distance = camera.position.length();
  const fovRad = (camera.fov * Math.PI) / 180;
  const worldHeight = 2 * Math.tan(fovRad / 2) * Math.max(distance, 1e-6);
  return pixelHeight / Math.max(worldHeight, 1e-6);
}

// Normalize a DXF rotation in degrees to (-180, 180].
export function normalizeRotation(deg: number): number {
  const wrapped = ((deg % 360) + 360) % 360;
  return wrapped > 180 ? wrapped - 360 : wrapped;
}

// True when the rotation, applied to text reading along +X, would make the text
// appear upside-down to a top-down viewer (90 < rot mod 360 < 270, exclusive).
export function isUpsideDown(rotationDeg: number): boolean {
  const wrapped = ((rotationDeg % 360) + 360) % 360;
  return wrapped > 90 && wrapped < 270;
}

// Compute the CSS rotation (degrees, CW positive) for a DXF rotation
// (CCW positive in world space, +Y world maps to -Y screen). Optionally flip
// 180° to keep the text readable when readableOrientation is true.
export function cssRotationFor(rotationDeg: number, readableOrientation: boolean): number {
  let css = -rotationDeg;
  if (readableOrientation && isUpsideDown(rotationDeg)) {
    css += 180;
  }
  // Normalize -0 to 0 so callers (and tests) get a stable sign.
  return css === 0 ? 0 : css;
}

export type ProjectedLabel = {
  inFrustum: boolean;
  screenX: number;
  screenY: number;
  ndcZ: number;
};

const projectionScratch = new THREE.Vector3();

export function projectLabel(
  position: readonly [number, number, number],
  camera: TextOverlayCamera,
  width: number,
  height: number,
  scratch: THREE.Vector3 = projectionScratch
): ProjectedLabel {
  scratch.set(position[0], position[1], position[2]);
  scratch.project(camera);
  const inFrustum = scratch.z >= -1 && scratch.z <= 1;
  return {
    inFrustum,
    screenX: (scratch.x + 1) * 0.5 * width,
    screenY: (1 - scratch.y) * 0.5 * height,
    ndcZ: scratch.z
  };
}

export type DisplayDecision =
  | { display: false; reason: "layer" | "frustum" | "density" }
  | { display: true; fontPx: number; clampedUp: boolean };

export type DensityContext = {
  // World-height threshold above which a label is always shown in auto mode,
  // regardless of how many on-screen pixels it would occupy. Computed per-scene
  // from the height distribution so the largest title-block headers survive
  // fit-scene zoom on layouts that span tens of metres.
  largeLabelWorldHeight: number;
};

export function decideDisplay(
  worldFontPx: number,
  worldHeight: number,
  inFrustum: boolean,
  layerHidden: boolean,
  densityMode: LabelDensityMode,
  context: DensityContext
): DisplayDecision {
  if (densityMode === "off") return { display: false, reason: "density" };
  if (layerHidden) return { display: false, reason: "layer" };
  if (!inFrustum) return { display: false, reason: "frustum" };
  if (densityMode === "auto") {
    const isLargeLabel = worldHeight >= context.largeLabelWorldHeight;
    const isLegibleOnScreen = worldFontPx >= AUTO_HIDE_BELOW_PX;
    if (!isLargeLabel && !isLegibleOnScreen) {
      return { display: false, reason: "density" };
    }
  }
  const clampedUp = worldFontPx < MIN_DISPLAY_PX;
  const fontPx = Math.max(MIN_DISPLAY_PX, Math.min(worldFontPx, MAX_DISPLAY_PX));
  return { display: true, fontPx, clampedUp };
}

// Compute the per-scene "large label" threshold using the 90th percentile of
// world heights. Labels at or above this height are always shown in auto mode
// even when they project to a single pixel, so title-block headers stay
// visible at fit-scene.
export function computeLargeLabelWorldHeight(items: ReadonlyArray<{ height: number }>): number {
  if (items.length === 0) return Number.POSITIVE_INFINITY;
  const sorted = items.map((item) => item.height).sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.9);
  return sorted[Math.min(idx, sorted.length - 1)];
}

// Returns [xPct, yPct] for CSS transform-origin based on DXF TEXT alignment.
// hAlign: 0=Left, 1=Center, 2=Right. vAlign: 0=Baseline, 1=Bottom, 2=Middle, 3=Top.
export function textAnchorPercent(hAlign?: number, vAlign?: number): [number, number] {
  const x = hAlign === 1 ? 50 : hAlign === 2 ? 100 : 0;
  const y = vAlign === 3 ? 0 : vAlign === 2 ? 50 : 100;
  return [x, y];
}

// Returns [xPct, yPct] for CSS transform-origin based on MTEXT attachment point.
// Attachment 1-9: rows top/middle/bottom, cols left/center/right. Default: top-left (1).
export function mtextAnchorPercent(attachmentPoint?: number): [number, number] {
  const pt = attachmentPoint ?? 1;
  if (pt < 1 || pt > 9) return [0, 0];
  const col = (pt - 1) % 3;
  const row = Math.floor((pt - 1) / 3);
  return [col === 0 ? 0 : col === 1 ? 50 : 100, row === 0 ? 0 : row === 1 ? 50 : 100];
}

export function SceneTextOverlay({
  items,
  camera,
  host,
  hiddenLayerIds,
  hiddenEntityIds,
  rafTick,
  densityMode,
  readableOrientation,
  onMetrics
}: {
  items: TextOverlayItem[];
  camera: TextOverlayCamera | null;
  host: HTMLElement | null;
  hiddenLayerIds: Set<string>;
  hiddenEntityIds?: ReadonlySet<string>;
  rafTick: number;
  densityMode: LabelDensityMode;
  readableOrientation: boolean;
  onMetrics?: (metrics: TextOverlayMetrics) => void;
}) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const labelRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const projectVec = useMemo(() => new THREE.Vector3(), []);
  const onMetricsRef = useRef(onMetrics);
  onMetricsRef.current = onMetrics;
  const densityContext = useMemo<DensityContext>(
    () => ({ largeLabelWorldHeight: computeLargeLabelWorldHeight(items) }),
    [items]
  );

  // Mutate DOM imperatively when ticked. React renders the items once.
  useEffect(() => {
    const overlay = overlayRef.current;
    const cameraReady = camera !== null;
    const hostReady = host !== null;
    if (!overlay || !camera || !host) {
      onMetricsRef.current?.({
        itemCount: items.length,
        domLabelCount: labelRefs.current.size,
        visibleCount: 0,
        clampedUpCount: 0,
        frustumCulledCount: 0,
        layerHiddenCount: 0,
        densityHiddenCount: 0,
        pxPerUnit: 0,
        cameraReady,
        hostReady,
        densityMode
      });
      return;
    }
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (width <= 0 || height <= 0) return;

    const pxPerUnit = computePixelsPerWorldUnit(camera, host);

    let visibleCount = 0;
    let clampedUpCount = 0;
    let frustumCulledCount = 0;
    let layerHiddenCount = 0;
    let densityHiddenCount = 0;
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const el = labelRefs.current.get(textOverlayDomKey(item, index));
      if (!el) continue;

      const layerHidden =
        (item.layerId !== undefined && hiddenLayerIds.has(item.layerId)) || hiddenEntityIds?.has(item.entityId) === true;
      const projected = projectLabel(item.position, camera, width, height, projectVec);
      const worldFontPx = item.height * pxPerUnit;
      const decision = decideDisplay(
        worldFontPx,
        item.height,
        projected.inFrustum,
        layerHidden,
        densityMode,
        densityContext
      );

      if (!decision.display) {
        el.style.display = "none";
        if (decision.reason === "layer") layerHiddenCount += 1;
        else if (decision.reason === "frustum") frustumCulledCount += 1;
        else densityHiddenCount += 1;
        continue;
      }

      if (decision.clampedUp) clampedUpCount += 1;
      const cssRotation = cssRotationFor(item.rotationDeg, readableOrientation);
      const [anchorX, anchorY] =
        item.attachmentPoint !== undefined
          ? mtextAnchorPercent(item.attachmentPoint)
          : textAnchorPercent(item.hAlign, item.vAlign);
      el.style.transformOrigin = `${anchorX}% ${anchorY}%`;
      el.style.display = "";
      el.style.fontSize = `${decision.fontPx.toFixed(2)}px`;
      el.style.transform = `translate(${projected.screenX.toFixed(2)}px, ${projected.screenY.toFixed(2)}px) rotate(${cssRotation.toFixed(2)}deg)`;
      visibleCount += 1;
    }

    onMetricsRef.current?.({
      itemCount: items.length,
      domLabelCount: labelRefs.current.size,
      visibleCount,
      clampedUpCount,
      frustumCulledCount,
      layerHiddenCount,
      densityHiddenCount,
      pxPerUnit,
      cameraReady,
      hostReady,
      densityMode
    });

    const meta = import.meta as { env?: { DEV?: boolean } };
    if (meta.env?.DEV) {
      // eslint-disable-next-line no-console
      console.debug(
        `[SceneTextOverlay] items=${items.length} dom=${labelRefs.current.size} visible=${visibleCount} clampedUp=${clampedUpCount} frustumCulled=${frustumCulledCount} layerHidden=${layerHiddenCount} densityHidden=${densityHiddenCount} pxPerUnit=${pxPerUnit.toFixed(4)} mode=${densityMode} readable=${readableOrientation} cameraReady=${cameraReady} hostReady=${hostReady}`
      );
    }
  }, [
    items,
    camera,
    host,
    hiddenLayerIds,
    hiddenEntityIds,
    rafTick,
    projectVec,
    densityMode,
    readableOrientation,
    densityContext
  ]);

  return (
    <div ref={overlayRef} className="text-overlay">
      {items.map((item, index) => (
        <div
          key={textOverlayDomKey(item, index)}
          ref={(node) => {
            const domKey = textOverlayDomKey(item, index);
            if (node) labelRefs.current.set(domKey, node);
            else labelRefs.current.delete(domKey);
          }}
          className={`text-overlay-label${item.origin === "ATTDEF" ? " attdef" : ""}`}
          style={{ display: "none" }}
          title={item.text !== item.displayText ? normalizeDxfText(item.text) : undefined}
        >
          {item.displayText}
        </div>
      ))}
    </div>
  );
}
