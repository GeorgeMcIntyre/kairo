import { scenePackageSchema, type GeometryDocument, type SceneDocument, type ScenePackage } from "@kairo/schema";
import { readKairoPackage } from "@kairo/core";
import type { DxfImportResult, DxfImportTimingStage } from "@kairo/importer-dxf/browser";
import type { DxfImportWorkerResponse } from "./dxfImport.worker";
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

export type SceneLoadProgressPhase =
  | "file-read"
  | "importer-module-load"
  | "dxf-import"
  | "dxf-package-import"
  | "kairo-package-read"
  | "public-scene-read";

export type SceneLoadProgress = {
  phase: SceneLoadProgressPhase;
  label: string;
  percent?: number;
};

export type SceneLoadOptions = {
  onProgress?: (progress: SceneLoadProgress) => void;
  useWorker?: boolean;
  largeDxfPackageThresholdBytes?: number;
  packageImportEndpoint?: string;
  packageImportFetch?: typeof fetch;
};

const dxfFilePattern = /\.dxf$/i;
const kairoFilePattern = /\.kairo$/i;
const defaultLargeDxfPackageThresholdBytes = 200 * 1024 * 1024;
const defaultPackageImportEndpoint = "/api/kairo/import-dxf-package";
const browserWorkerAvailable = () => typeof Worker !== "undefined";
let dxfImportRequestId = 0;

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

export async function loadPublicScenePackage(
  basePath: string,
  fetcher: FetchLike = fetch,
  options: SceneLoadOptions = {}
): Promise<ScenePackage> {
  options.onProgress?.({ phase: "public-scene-read", label: "Loading scene manifest", percent: 20 });
  const [manifestDocument, sceneDocument, layersDocument, materialsDocument, sourceMapDocument] = await Promise.all([
    fetchJson(fetcher, `${basePath}/manifest.json`),
    fetchJson(fetcher, `${basePath}/scene.json`),
    fetchJson(fetcher, `${basePath}/layers.json`),
    fetchJson(fetcher, `${basePath}/materials.json`),
    fetchJson(fetcher, `${basePath}/source-map.json`)
  ]);

  const sceneData = sceneDocument as SceneDocument;
  options.onProgress?.({ phase: "public-scene-read", label: "Loading scene geometry", percent: 70 });
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

export async function loadDxfFileScenePackage(file: File, options: SceneLoadOptions = {}): Promise<DxfImportResult> {
  const packageThreshold = options.largeDxfPackageThresholdBytes ?? defaultLargeDxfPackageThresholdBytes;
  if (file.size >= packageThreshold) {
    const packaged = await loadLargeDxfViaLocalPackageImport(file, options);
    return {
      scenePackage: packaged.scenePackage,
      warnings: [],
      summary: {
        supportedEntityCount: packaged.supportedEntityCount,
        unsupportedEntityCount: packaged.unsupportedEntityCount,
        layerCount: packaged.scenePackage.layers.layers.length,
        warningCount: packaged.warningCount
      },
      coverage: {
        totalSourceInstances: packaged.supportedEntityCount + packaged.unsupportedEntityCount,
        coveredInstances: packaged.supportedEntityCount,
        failedInstances: packaged.unsupportedEntityCount,
        conversionPercent: packaged.conversionPercent,
        failures: [],
        byEntityType: {},
        byFailureCode: {}
      },
      preCleanReport: {
        enabled: false,
        removedAcadReactorsCount: 0,
        removedAcadReactorsLineRanges: [],
        appendedMissingEof: false,
        originalLineCount: 0,
        cleanedLineCount: 0,
        warnings: []
      },
      packageCacheKey: packaged.packageCacheKey,
      packageCacheStatus: packaged.packageCacheStatus,
      timing: packaged.timing
    } as DxfImportResult & {
      packageCacheKey?: string;
      packageCacheStatus?: "hit" | "miss";
    };
  }

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
  options.onProgress?.({ phase: "file-read", label: "Reading file", percent: 10 });
  const text = await file.text();
  recordStage("file-read", fileReadStartedAt);

  const useWorker = options.useWorker ?? browserWorkerAvailable();
  const moduleLoadStartedAt = performance.now();
  options.onProgress?.({
    phase: "importer-module-load",
    label: useWorker ? "Starting DXF worker" : "Loading DXF importer",
    percent: 30
  });
  const importer = useWorker ? undefined : await import("@kairo/importer-dxf/browser");
  recordStage("importer-module-load", moduleLoadStartedAt);

  const importStartedAt = performance.now();
  options.onProgress?.({
    phase: "dxf-import",
    label: useWorker ? "Importing DXF in worker" : "Importing DXF",
    percent: 75
  });
  const result = useWorker
    ? await importDxfTextWithWorker(fileName, text)
    : await importer!.importDxfTextToKairo(fileName, text, { createdBy: "kairo viewer upload" });
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

async function loadLargeDxfViaLocalPackageImport(file: File, options: SceneLoadOptions = {}) {
  const startedAt = performance.now();
  const fileName = file.name.trim() || "uploaded.dxf";
  const endpoint = options.packageImportEndpoint ?? defaultPackageImportEndpoint;
  const fetcher = options.packageImportFetch ?? fetch;

  options.onProgress?.({
    phase: "dxf-package-import",
    label: "Preparing large DXF package",
    percent: 10
  });

  let response: Response;
  try {
    response = await fetcher(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/dxf",
        "X-Kairo-File-Name": encodeURIComponent(fileName),
        "X-Kairo-File-Size": String(file.size),
        "X-Kairo-File-Last-Modified": String(file.lastModified)
      },
      body: file
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Large DXF import requires the local Kairo dev server package endpoint. ${reason}`);
  }

  if (!response.ok) {
    let reason = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { message?: string };
      if (body.message) reason = body.message;
    } catch {
      // Keep HTTP status when the response is not JSON.
    }
    throw new Error(`Large DXF package import failed: ${reason}`);
  }

  options.onProgress?.({
    phase: "kairo-package-read",
    label: "Opening generated Kairo package",
    percent: 85
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  const scenePackage = readKairoPackage(bytes).scenePackage;
  const warningCount = Number(response.headers.get("X-Kairo-Warning-Count") ?? 0);
  const supportedEntityCount = Number(response.headers.get("X-Kairo-Supported-Entities") ?? 0);
  const unsupportedEntityCount = Number(response.headers.get("X-Kairo-Unsupported-Entities") ?? 0);
  const conversionPercent = Number(response.headers.get("X-Kairo-Conversion-Percent") ?? 100);
  const cacheStatus = response.headers.get("X-Kairo-Cache");
  const packageCacheKey = response.headers.get("X-Kairo-Cache-Key") ?? undefined;

  return {
    scenePackage,
    warningCount: Number.isFinite(warningCount) ? warningCount : 0,
    supportedEntityCount: Number.isFinite(supportedEntityCount) ? supportedEntityCount : 0,
    unsupportedEntityCount: Number.isFinite(unsupportedEntityCount) ? unsupportedEntityCount : 0,
    conversionPercent: Number.isFinite(conversionPercent) ? conversionPercent : 100,
    packageCacheKey,
    packageCacheStatus: cacheStatus === "hit" ? "hit" : cacheStatus === "miss" ? "miss" : undefined,
    timing: [
      {
        stage: cacheStatus === "hit" ? "local-dxf-package-cache-hit-total" : "local-dxf-package-import-total",
        ms: Math.max(0, performance.now() - startedAt)
      }
    ]
  };
}

export async function loadKairoPackageFileScenePackage(file: File, options: SceneLoadOptions = {}): Promise<ScenePackage> {
  const fileName = file.name.trim() || "uploaded.kairo";
  if (!kairoFilePattern.test(fileName)) {
    throw new Error("Only .kairo files can be opened as Kairo packages.");
  }

  options.onProgress?.({ phase: "kairo-package-read", label: "Opening Kairo package", percent: 75 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  return readKairoPackage(bytes).scenePackage;
}

export type LocalSceneFileLoadResult =
  | {
      kind: "dxf";
      scenePackage: ScenePackage;
      warningCount: number;
      largeSceneMode: boolean;
      packageCacheKey?: string;
      analysisCacheKey?: string;
      packageCacheStatus?: "hit" | "miss";
      timing?: DxfImportTimingStage[];
    }
  | {
      kind: "kairo-package";
      scenePackage: ScenePackage;
      warningCount: 0;
      largeSceneMode: boolean;
      packageCacheKey?: string;
      analysisCacheKey?: string;
      timing?: DxfImportTimingStage[];
    };

export async function loadLocalSceneFilePackage(file: File, options: SceneLoadOptions = {}): Promise<LocalSceneFileLoadResult> {
  const fileName = file.name.trim();
  if (dxfFilePattern.test(fileName)) {
    const result = await loadDxfFileScenePackage(file, options);
    const packageMetadata = result as DxfImportResult & {
      packageCacheKey?: string;
      packageCacheStatus?: "hit" | "miss";
    };
    return {
      kind: "dxf",
      scenePackage: result.scenePackage,
      warningCount: result.summary.warningCount,
      largeSceneMode: file.size >= (options.largeDxfPackageThresholdBytes ?? defaultLargeDxfPackageThresholdBytes),
      packageCacheKey: packageMetadata.packageCacheKey,
      analysisCacheKey: packageMetadata.packageCacheKey
        ? `large-dxf:${packageMetadata.packageCacheKey}:analysis-v1`
        : undefined,
      packageCacheStatus: packageMetadata.packageCacheStatus,
      timing: result.timing
    };
  }

  if (kairoFilePattern.test(fileName)) {
    const startedAt = performance.now();
    return {
      kind: "kairo-package",
      scenePackage: await loadKairoPackageFileScenePackage(file, options),
      warningCount: 0,
      largeSceneMode: file.size >= 50 * 1024 * 1024,
      analysisCacheKey: `kairo-file:${fileName}:${file.size}:${file.lastModified}:analysis-v1`,
      timing: [{ stage: "kairo-package-read", ms: Math.max(0, performance.now() - startedAt) }]
    };
  }

  throw new Error("Only .dxf and .kairo files can be opened.");
}

function importDxfTextWithWorker(fileName: string, text: string): Promise<DxfImportResult> {
  const id = ++dxfImportRequestId;
  const worker = new Worker(new URL("./dxfImport.worker.ts", import.meta.url), { type: "module" });

  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<DxfImportWorkerResponse>) => {
      if (event.data.id !== id) return;
      worker.terminate();
      if (event.data.ok) {
        resolve(event.data.result);
        return;
      }

      const error = new Error(event.data.error.message);
      error.name = event.data.error.name ?? "DxfImportWorkerError";
      if (event.data.error.stack) error.stack = event.data.error.stack;
      reject(error);
    };

    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "DXF import worker failed."));
    };

    worker.postMessage({ id, fileName, text });
  });
}
