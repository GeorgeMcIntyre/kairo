import type { DrawingEntity, ScenePackage } from "@kairo/schema";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

export type TextOverlayItem = {
  entityId: string;
  text: string;
  position: [number, number, number];
  rotationDeg: number;
  height: number;
  origin: "TEXT" | "ATTDEF";
  layerId?: string;
};

export type TextOverlayCamera = THREE.OrthographicCamera | THREE.PerspectiveCamera;

const MIN_FONT_PX = 3;
const MAX_FONT_PX = 48;

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
          position: [entity.position[0], entity.position[1], entity.position[2]],
          rotationDeg: entity.rotationDeg,
          height: entity.height,
          origin: entity.origin,
          layerId: entity.layerId ?? geometry.layerId
        });
      }
    }
  }
  return items;
}

function computePixelsPerWorldUnit(camera: TextOverlayCamera, host: HTMLElement): number {
  if (camera instanceof THREE.OrthographicCamera) {
    const worldHeight = (camera.top - camera.bottom) / camera.zoom;
    const pixelHeight = host.clientHeight || 1;
    return pixelHeight / Math.max(worldHeight, 1e-6);
  }
  // Perspective: use distance from camera to (0,0,0) as a reasonable proxy for now.
  const distance = camera.position.length();
  const fovRad = (camera.fov * Math.PI) / 180;
  const worldHeight = 2 * Math.tan(fovRad / 2) * Math.max(distance, 1e-6);
  const pixelHeight = host.clientHeight || 1;
  return pixelHeight / Math.max(worldHeight, 1e-6);
}

export function SceneTextOverlay({
  items,
  camera,
  host,
  hiddenLayerIds,
  rafTick
}: {
  items: TextOverlayItem[];
  camera: TextOverlayCamera | null;
  host: HTMLElement | null;
  hiddenLayerIds: Set<string>;
  rafTick: number;
}) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const labelRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const projectVec = useMemo(() => new THREE.Vector3(), []);

  // Mutate DOM imperatively when ticked. React renders the items once.
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || !camera || !host) return;
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (width <= 0 || height <= 0) return;

    const pxPerUnit = computePixelsPerWorldUnit(camera, host);

    let visibleCount = 0;
    let belowThresholdCount = 0;
    for (const item of items) {
      const el = labelRefs.current.get(item.entityId);
      if (!el) continue;

      if (item.layerId && hiddenLayerIds.has(item.layerId)) {
        el.style.display = "none";
        continue;
      }

      const fontPx = item.height * pxPerUnit;
      if (fontPx < MIN_FONT_PX) {
        el.style.display = "none";
        belowThresholdCount += 1;
        continue;
      }
      const clampedPx = Math.min(fontPx, MAX_FONT_PX);

      projectVec.set(item.position[0], item.position[1], item.position[2]);
      projectVec.project(camera);
      // Cull labels behind/outside the frustum.
      if (projectVec.z < -1 || projectVec.z > 1) {
        el.style.display = "none";
        continue;
      }
      const screenX = (projectVec.x + 1) * 0.5 * width;
      const screenY = (1 - projectVec.y) * 0.5 * height;

      el.style.display = "";
      el.style.fontSize = `${clampedPx.toFixed(2)}px`;
      el.style.transform = `translate(${screenX.toFixed(2)}px, ${screenY.toFixed(2)}px) rotate(${(-item.rotationDeg).toFixed(2)}deg)`;
      visibleCount += 1;
    }

    const meta = import.meta as { env?: { DEV?: boolean } };
    if (meta.env?.DEV) {
      // eslint-disable-next-line no-console
      console.debug(
        `[SceneTextOverlay] items=${items.length} visible=${visibleCount} belowThreshold=${belowThresholdCount} pxPerUnit=${pxPerUnit.toFixed(4)}`
      );
    }
  }, [items, camera, host, hiddenLayerIds, rafTick, projectVec]);

  return (
    <div ref={overlayRef} className="text-overlay">
      {items.map((item) => (
        <div
          key={item.entityId}
          ref={(node) => {
            if (node) labelRefs.current.set(item.entityId, node);
            else labelRefs.current.delete(item.entityId);
          }}
          className={`text-overlay-label${item.origin === "ATTDEF" ? " attdef" : ""}`}
          style={{ display: "none" }}
        >
          {item.text}
        </div>
      ))}
    </div>
  );
}
