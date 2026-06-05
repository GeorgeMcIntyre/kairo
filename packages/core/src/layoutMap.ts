import type { ScenePackage } from "@kairo/schema";

export type LayoutType = "concept" | "device" | "foundation" | "reference" | "unknown";

export type LayoutPoint = {
  x: number;
  y: number;
};

export type JobLayoutTransform = {
  layoutId: string;
  fileName: string;
  type: LayoutType;
  originX: number;
  originY: number;
  translationX: number;
  translationY: number;
  rotation: number;
  scale: number;
  visible: boolean;
  locked: boolean;
  parentLayoutId?: string;
};

export type CoordinateReadout = {
  cursorWorld: LayoutPoint | null;
  selectedWorld: LayoutPoint | null;
  selectedLayoutOrigin: LayoutPoint | null;
  activeLayoutId?: string;
  selectedLayoutId?: string;
};

export type JobLayoutMap = {
  version: "0.1";
  activeLayoutId: string;
  layouts: JobLayoutTransform[];
  coordinateReadout: CoordinateReadout;
};

export type KairoJobSession = {
  version: "0.1";
  jobId: string;
  layoutMap: JobLayoutMap;
  metadata: Record<string, string | number | boolean | null>;
};

export type CreateLayoutMetadataOptions = {
  layoutId?: string;
  fileName?: string;
  type?: LayoutType;
  parentLayoutId?: string;
};

function assertFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite.`);
  }
  return value;
}

function assertNonZero(value: number, label: string): number {
  assertFinite(value, label);
  if (value === 0) {
    throw new Error(`${label} must be non-zero.`);
  }
  return value;
}

function pathBaseName(path: string | undefined): string | undefined {
  const trimmed = path?.trim();
  if (!trimmed) return undefined;
  return trimmed.split(/[\\/]/).filter(Boolean).at(-1);
}

function slug(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "layout";
}

export function inferLayoutType(fileName: string): LayoutType {
  const normalized = fileName.toLowerCase().replace(/[_-]+/g, " ");
  if (/\b(concept|process|proposal|quote)\b/.test(normalized)) return "concept";
  if (/\b(robot|device|equipment|tool|fixture|gripper|end[-_ ]?effector)\b/.test(normalized)) return "device";
  if (/\b(foundation|site|floor|civil|base)\b/.test(normalized)) return "foundation";
  if (/\b(reference|xref|background|survey)\b/.test(normalized)) return "reference";
  return "unknown";
}

export function layoutMetadataFromScenePackage(
  scenePackage: ScenePackage,
  options: CreateLayoutMetadataOptions = {}
): JobLayoutTransform {
  const rootNode = scenePackage.scene.nodes.find((node) => node.id === scenePackage.scene.rootNodeId);
  const fileName =
    options.fileName ??
    pathBaseName(scenePackage.manifest.source.path) ??
    rootNode?.displayName ??
    scenePackage.manifest.rootSceneFile;

  return {
    layoutId: options.layoutId ?? `layout-${slug(fileName)}`,
    fileName,
    type: options.type ?? inferLayoutType(fileName),
    originX: 0,
    originY: 0,
    translationX: 0,
    translationY: 0,
    rotation: 0,
    scale: 1,
    visible: true,
    locked: false,
    parentLayoutId: options.parentLayoutId
  };
}

export function createJobSessionForScenePackage(
  scenePackage: ScenePackage,
  options: CreateLayoutMetadataOptions & { jobId?: string } = {}
): KairoJobSession {
  const layout = layoutMetadataFromScenePackage(scenePackage, options);
  return {
    version: "0.1",
    jobId: options.jobId ?? `job-${layout.layoutId}`,
    layoutMap: {
      version: "0.1",
      activeLayoutId: layout.layoutId,
      layouts: [layout],
      coordinateReadout: {
        cursorWorld: null,
        selectedWorld: null,
        selectedLayoutOrigin: { x: layout.originX, y: layout.originY },
        activeLayoutId: layout.layoutId,
        selectedLayoutId: layout.layoutId
      }
    },
    metadata: {
      sourceFileName: layout.fileName,
      sourceFormat: scenePackage.manifest.source.format
    }
  };
}

export function layoutLocalToWorld(point: LayoutPoint, layout: JobLayoutTransform): LayoutPoint {
  const scale = assertNonZero(layout.scale, "layout scale");
  const radians = (assertFinite(layout.rotation, "layout rotation") * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const localX = (assertFinite(point.x, "point x") - layout.originX) * scale;
  const localY = (assertFinite(point.y, "point y") - layout.originY) * scale;

  return {
    x: layout.originX + layout.translationX + localX * cos - localY * sin,
    y: layout.originY + layout.translationY + localX * sin + localY * cos
  };
}

export function worldToLayoutLocal(point: LayoutPoint, layout: JobLayoutTransform): LayoutPoint {
  const scale = assertNonZero(layout.scale, "layout scale");
  const radians = (-assertFinite(layout.rotation, "layout rotation") * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const worldX = assertFinite(point.x, "point x") - layout.originX - layout.translationX;
  const worldY = assertFinite(point.y, "point y") - layout.originY - layout.translationY;

  return {
    x: layout.originX + (worldX * cos - worldY * sin) / scale,
    y: layout.originY + (worldX * sin + worldY * cos) / scale
  };
}

export function applyLayoutTranslation(
  layout: JobLayoutTransform,
  deltaX: number,
  deltaY: number
): JobLayoutTransform {
  return {
    ...layout,
    translationX: layout.translationX + assertFinite(deltaX, "translation delta x"),
    translationY: layout.translationY + assertFinite(deltaY, "translation delta y")
  };
}

export function applyLayoutRotation(layout: JobLayoutTransform, deltaDegrees: number): JobLayoutTransform {
  return {
    ...layout,
    rotation: layout.rotation + assertFinite(deltaDegrees, "rotation delta")
  };
}

export function applyLayoutScale(layout: JobLayoutTransform, scaleFactor: number): JobLayoutTransform {
  return {
    ...layout,
    scale: layout.scale * assertNonZero(scaleFactor, "scale factor")
  };
}

export function setLayoutOrigin(layout: JobLayoutTransform, originX: number, originY: number): JobLayoutTransform {
  return {
    ...layout,
    originX: assertFinite(originX, "origin x"),
    originY: assertFinite(originY, "origin y")
  };
}

export function updateCoordinateReadout(
  session: KairoJobSession,
  patch: Partial<CoordinateReadout>
): KairoJobSession {
  return {
    ...session,
    layoutMap: {
      ...session.layoutMap,
      coordinateReadout: {
        ...session.layoutMap.coordinateReadout,
        ...patch
      }
    }
  };
}
