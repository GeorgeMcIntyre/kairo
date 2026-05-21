import { computeOutlierSummary } from "./semantic/semanticValidation";
import { buildSemanticSummary } from "./semantic/semanticSummary";
import { computeLayoutSemantics } from "./semantic/layoutSemantics";
import type { RobustSceneBounds } from "@kairo/core";
import type { ScenePackage } from "@kairo/schema";

export type ViewerAnalysisWorkerRequest = {
  id: number;
  scenePackage: ScenePackage;
  robustBounds: RobustSceneBounds;
};

export type ViewerAnalysisWorkerResponse =
  | {
      id: number;
      ok: true;
      result: {
        layoutSemantics: ReturnType<typeof computeLayoutSemantics>;
        semanticSummary: ReturnType<typeof buildSemanticSummary>;
        outlierSummary: ReturnType<typeof computeOutlierSummary>;
        timingMs: number;
      };
    }
  | {
      id: number;
      ok: false;
      error: {
        name?: string;
        message: string;
        stack?: string;
      };
    };

self.onmessage = (event: MessageEvent<ViewerAnalysisWorkerRequest>) => {
  const { id, scenePackage, robustBounds } = event.data;
  try {
    const startedAt = performance.now();
    const layoutSemantics = computeLayoutSemantics(scenePackage, robustBounds);
    const result = {
      layoutSemantics,
      semanticSummary: buildSemanticSummary(layoutSemantics, scenePackage.manifest.source.path),
      outlierSummary: computeOutlierSummary(robustBounds),
      timingMs: Math.max(0, performance.now() - startedAt)
    };
    self.postMessage({ id, ok: true, result } satisfies ViewerAnalysisWorkerResponse);
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: {
        name: error instanceof Error ? error.name : undefined,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }
    } satisfies ViewerAnalysisWorkerResponse);
  }
};
