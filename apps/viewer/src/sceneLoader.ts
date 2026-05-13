import { scenePackageSchema, type GeometryDocument, type SceneDocument, type ScenePackage } from "@kairo/schema";
import { readKairoPackage } from "@kairo/core";
import type { DxfImportResult, DxfImportTimingStage } from "@kairo/importer-dxf/browser";
import manifest from "../../../examples/example-scene/manifest.json";
import scene from "../../../examples/example-scene/scene.json";
import meshGeometry from "../../../examples/example-scene/geometry/bracket.mesh.json";
import curveGeometry from "../../../examples/example-scene/geometry/drawing.curves.json";
import layers from "../../../examples/example-scene/layers.json";
import materials from "../../../examples/example-scene/materials.json";
import sourceMap from "../../../examples/example-scene/source-map.json";

export const PUBLIC_SCENE_ASSETS_UNAVAILABLE_MESSAGE =
  "Demo scene assets are not included in this slim Cloudflare preview. Use Open DXF / Kairo to load a local drawing file.";

export class PublicSceneAssetLoadError extends Error {
  readonly code = "PUBLIC_SCENE_ASSETS_UNAVAILABLE";

  constructor(
    readonly url: string,
    reason: string
  ) {
    super(`Public scene asset unavailable at ${url}: ${reason}`);
    this.name = "PublicSceneAssetLoadError";
  }
}

export function isPublicSceneAssetLoadError(error: unknown): error is PublicSceneAssetLoadError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "PUBLIC_SCENE_ASSETS_UNAVAILABLE"
  );
}

export type ViewerSceneRequest =
  | {
      kind: "bundled";
    }
  | {
      kind: "public-scene";
      sceneName: string;
      basePath: string;
    };

type FetchLike = (input: string) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

const dxfFilePattern = /\.dxf$/i;
const kairoFilePattern = /\.kairo$/i;

export const sampleScenePackage = scenePackageSchema.parse({
  manifest,
  scene,
  geometry: [meshGeometry, curveGeometry],
  layers,
  materials,
  sourceMap
});

const sceneNamePattern = /^[A-Za-z0-9._-]+$/;

export function resolveViewerSceneRequest(search: string): ViewerSceneRequest {
  const sceneName = new URLSearchParams(search).get("scene")?.trim();
  if (!sceneName) {
    return { kind: "bundled" };
  }

  if (!sceneNamePattern.test(sceneName)) {
    throw new Error("Scene query may only contain letters, numbers, dot, underscore, and dash.");
  }

  return {
    kind: "public-scene",
    sceneName,
    basePath: `/scenes/${sceneName}`
  };
}

async function fetchJson(fetcher: FetchLike, url: string) {
  const response = await fetcher(url);
  if (!response.ok) {
    throw new PublicSceneAssetLoadError(url, `HTTP ${response.status}`);
  }

  try {
    return await response.json();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new PublicSceneAssetLoadError(url, `invalid JSON (${reason})`);
  }
}

function geometryRefsFromScene(sceneDocument: SceneDocument) {
  return [
    ...new Set(sceneDocument.nodes.flatMap((node) => node.geometryRefs ?? []))
  ].sort((a, b) => a.localeCompare(b));
}

export async function loadPublicScenePackage(basePath: string, fetcher: FetchLike = fetch): Promise<ScenePackage> {
  const [manifestDocument, sceneDocument, layersDocument, materialsDocument, sourceMapDocument] = await Promise.all([
    fetchJson(fetcher, `${basePath}/manifest.json`),
    fetchJson(fetcher, `${basePath}/scene.json`),
    fetchJson(fetcher, `${basePath}/layers.json`),
    fetchJson(fetcher, `${basePath}/materials.json`),
    fetchJson(fetcher, `${basePath}/source-map.json`)
  ]);

  const sceneData = sceneDocument as SceneDocument;
  const geometry = await Promise.all(
    geometryRefsFromScene(sceneData).map((geometryRef) => fetchJson(fetcher, `${basePath}/geometry/${encodeURIComponent(geometryRef)}.json`) as Promise<GeometryDocument>)
  );

  return scenePackageSchema.parse({
    manifest: manifestDocument,
    scene: sceneDocument,
    geometry,
    layers: layersDocument,
    materials: materialsDocument,
    sourceMap: sourceMapDocument
  });
}

export async function loadDxfFileScenePackage(file: File): Promise<DxfImportResult> {
  const totalStartedAt = performance.now();
  const timing: DxfImportTimingStage[] = [];
  const recordStage = (stage: string, startedAt: number) => {
    timing.push({ stage, ms: Math.max(0, performance.now() - startedAt) });
  };

  const fileName = file.name.trim() || "uploaded.dxf";
  if (!dxfFilePattern.test(fileName)) {
    throw new Error("Only .dxf files can be opened.");
  }

  const fileReadStartedAt = performance.now();
  const text = await file.text();
  recordStage("file-read", fileReadStartedAt);

  const moduleLoadStartedAt = performance.now();
  const { importDxfTextToKairo } = await import("@kairo/importer-dxf/browser");
  recordStage("importer-module-load", moduleLoadStartedAt);

  const importStartedAt = performance.now();
  const result = await importDxfTextToKairo(fileName, text, { createdBy: "kairo viewer upload" });
  recordStage("dxf-import", importStartedAt);

  return {
    ...result,
    timing: [
      ...timing,
      ...(result.timing ?? []),
      { stage: "browser-dxf-load-total", ms: Math.max(0, performance.now() - totalStartedAt) }
    ]
  };
}

export async function loadKairoPackageFileScenePackage(file: File): Promise<ScenePackage> {
  const fileName = file.name.trim() || "uploaded.kairo";
  if (!kairoFilePattern.test(fileName)) {
    throw new Error("Only .kairo files can be opened as Kairo packages.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  return readKairoPackage(bytes).scenePackage;
}

export type LocalSceneFileLoadResult =
  | {
      kind: "dxf";
      scenePackage: ScenePackage;
      warningCount: number;
      timing?: DxfImportTimingStage[];
    }
  | {
      kind: "kairo-package";
      scenePackage: ScenePackage;
      warningCount: 0;
      timing?: DxfImportTimingStage[];
    };

export async function loadLocalSceneFilePackage(file: File): Promise<LocalSceneFileLoadResult> {
  const fileName = file.name.trim();
  if (dxfFilePattern.test(fileName)) {
    const result = await loadDxfFileScenePackage(file);
    return {
      kind: "dxf",
      scenePackage: result.scenePackage,
      warningCount: result.summary.warningCount,
      timing: result.timing
    };
  }

  if (kairoFilePattern.test(fileName)) {
    const startedAt = performance.now();
    return {
      kind: "kairo-package",
      scenePackage: await loadKairoPackageFileScenePackage(file),
      warningCount: 0,
      timing: [{ stage: "kairo-package-read", ms: Math.max(0, performance.now() - startedAt) }]
    };
  }

  throw new Error("Only .dxf and .kairo files can be opened.");
}
