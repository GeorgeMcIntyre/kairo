import type { DxfImportTimingStage } from "@kairo/importer-dxf/browser";
import type { RobustSceneBounds } from "@kairo/core";
import type { ScenePackage } from "@kairo/schema";
import type { LayoutSemantics } from "./semantic/layoutSemantics";
import { computeOutlierSummary } from "./semantic/semanticValidation";
import type { OutlierSummary } from "./semantic/semanticValidation";
import type { SemanticSummary } from "./semantic/semanticSummary";
import type { ViewerAnalysisWorkerRequest, ViewerAnalysisWorkerResponse } from "./viewerAnalysis.worker";

const ANALYSIS_CACHE_DB = "kairo-viewer-analysis";
const ANALYSIS_CACHE_STORE = "analysis";
const ANALYSIS_CACHE_VERSION = 1;
const ANALYSIS_RESULT_VERSION = 1;
const MAX_WORKER_ANALYSIS_CURVE_ENTITIES = 250_000;

let analysisRequestId = 0;

export type ViewerAnalysisCacheStatus = "none" | "hit" | "miss" | "skipped-large-scene";

export type ViewerAnalysisResult = {
  version: typeof ANALYSIS_RESULT_VERSION;
  layoutSemantics: LayoutSemantics;
  semanticSummary: SemanticSummary;
  outlierSummary: OutlierSummary;
  timing: DxfImportTimingStage;
  cachedAt: string;
};

function workerAvailable() {
  return typeof Worker !== "undefined";
}

function curveEntityCountExceeds(scenePackage: ScenePackage, limit: number) {
  let count = 0;
  for (const document of scenePackage.geometry) {
    for (const geometry of document.geometries) {
      if (geometry.kind !== "curve-set") continue;
      count += geometry.entities.length;
      if (count > limit) return true;
    }
  }
  return false;
}

function emptyLayoutSemantics(): LayoutSemantics {
  return {
    textEntities: [],
    mergedTextLabels: [],
    geometryGroups: [],
    stations: [],
    devices: [],
    unknownTextEntities: []
  };
}

function emptySemanticSummary(scenePackage: ScenePackage, warning: string): SemanticSummary {
  return {
    sourcePath: scenePackage.manifest.source.path,
    counts: {
      stations: 0,
      devices: 0,
      linkedDevices: 0,
      ambiguousDevices: 0,
      unlinkedDevices: 0,
      unknownLabels: 0,
      lowConfidenceDevices: 0,
      byKind: {}
    },
    stations: [],
    devices: [],
    warnings: [warning]
  };
}

function skippedLargeSceneAnalysis(scenePackage: ScenePackage, robustBounds: RobustSceneBounds): ViewerAnalysisResult {
  const warning = `Semantic analysis skipped because this scene is larger than the browser worker limit of ${MAX_WORKER_ANALYSIS_CURVE_ENTITIES.toLocaleString()} curve entities.`;
  return {
    version: ANALYSIS_RESULT_VERSION,
    layoutSemantics: emptyLayoutSemantics(),
    semanticSummary: emptySemanticSummary(scenePackage, warning),
    outlierSummary: computeOutlierSummary(robustBounds),
    timing: { stage: "semantic-analysis-skipped-large-scene", ms: 0 },
    cachedAt: new Date().toISOString()
  };
}

function indexedDbAvailable() {
  return typeof indexedDB !== "undefined";
}

function openAnalysisDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ANALYSIS_CACHE_DB, ANALYSIS_CACHE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ANALYSIS_CACHE_STORE)) {
        database.createObjectStore(ANALYSIS_CACHE_STORE);
      }
    };
    request.onerror = () => reject(request.error ?? new Error("Could not open viewer analysis cache."));
    request.onsuccess = () => resolve(request.result);
  });
}

async function readCachedAnalysis(cacheKey: string): Promise<ViewerAnalysisResult | undefined> {
  if (!indexedDbAvailable()) return undefined;
  const database = await openAnalysisDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(ANALYSIS_CACHE_STORE, "readonly");
      const request = transaction.objectStore(ANALYSIS_CACHE_STORE).get(cacheKey);
      request.onerror = () => reject(request.error ?? new Error("Could not read viewer analysis cache."));
      request.onsuccess = () => {
        const value = request.result as ViewerAnalysisResult | undefined;
        resolve(value?.version === ANALYSIS_RESULT_VERSION ? value : undefined);
      };
    });
  } finally {
    database.close();
  }
}

async function writeCachedAnalysis(cacheKey: string, analysis: ViewerAnalysisResult): Promise<void> {
  if (!indexedDbAvailable()) return;
  const database = await openAnalysisDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(ANALYSIS_CACHE_STORE, "readwrite");
      const request = transaction.objectStore(ANALYSIS_CACHE_STORE).put(analysis, cacheKey);
      request.onerror = () => reject(request.error ?? new Error("Could not write viewer analysis cache."));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not commit viewer analysis cache."));
    });
  } finally {
    database.close();
  }
}

function runAnalysisWorker(scenePackage: ScenePackage, robustBounds: RobustSceneBounds): Promise<ViewerAnalysisResult> {
  if (!workerAvailable()) {
    return Promise.reject(new Error("Viewer analysis worker is not available in this browser."));
  }

  const id = ++analysisRequestId;
  const worker = new Worker(new URL("./viewerAnalysis.worker.ts", import.meta.url), { type: "module" });

  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<ViewerAnalysisWorkerResponse>) => {
      if (event.data.id !== id) return;
      worker.terminate();
      if (event.data.ok) {
        resolve({
          version: ANALYSIS_RESULT_VERSION,
          layoutSemantics: event.data.result.layoutSemantics,
          semanticSummary: event.data.result.semanticSummary,
          outlierSummary: event.data.result.outlierSummary,
          timing: { stage: "semantic-analysis-worker", ms: event.data.result.timingMs },
          cachedAt: new Date().toISOString()
        });
        return;
      }

      const error = new Error(event.data.error.message);
      error.name = event.data.error.name ?? "ViewerAnalysisWorkerError";
      if (event.data.error.stack) error.stack = event.data.error.stack;
      reject(error);
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "Viewer analysis worker failed."));
    };
    try {
      worker.postMessage({ id, scenePackage, robustBounds } satisfies ViewerAnalysisWorkerRequest);
    } catch (error) {
      worker.terminate();
      reject(error);
    }
  });
}

export async function computeViewerAnalysis(
  scenePackage: ScenePackage,
  robustBounds: RobustSceneBounds,
  cacheKey?: string
): Promise<{ analysis: ViewerAnalysisResult; cacheStatus: ViewerAnalysisCacheStatus }> {
  if (cacheKey) {
    try {
      const cached = await readCachedAnalysis(cacheKey);
      if (cached) {
        return {
          analysis: {
            ...cached,
            timing: { stage: "semantic-analysis-cache-hit", ms: 0 }
          },
          cacheStatus: "hit"
        };
      }
    } catch {
      // Analysis should still complete when browser storage is unavailable.
    }
  }

  if (curveEntityCountExceeds(scenePackage, MAX_WORKER_ANALYSIS_CURVE_ENTITIES)) {
    return {
      analysis: skippedLargeSceneAnalysis(scenePackage, robustBounds),
      cacheStatus: "skipped-large-scene"
    };
  }

  const analysis = await runAnalysisWorker(scenePackage, robustBounds);
  if (cacheKey) {
    try {
      await writeCachedAnalysis(cacheKey, analysis);
    } catch {
      // Cache writes are opportunistic.
    }
  }
  return { analysis, cacheStatus: cacheKey ? "miss" : "none" };
}
