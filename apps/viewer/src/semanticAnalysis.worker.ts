import type { RobustSceneBounds } from "@kairo/core";
import type { ScenePackage } from "@kairo/schema";
import { computeLayoutSemantics, type LayoutSemantics } from "./semantic/layoutSemantics";

type SemanticAnalysisWorkerRequest = {
  id: number;
  scenePackage: ScenePackage;
  robustBounds: RobustSceneBounds;
};

type SemanticAnalysisWorkerSuccess = {
  id: number;
  ok: true;
  semantics: LayoutSemantics;
  elapsedMs: number;
};

type SemanticAnalysisWorkerFailure = {
  id: number;
  ok: false;
  error: {
    message: string;
    name?: string;
    stack?: string;
  };
};

export type SemanticAnalysisWorkerResponse = SemanticAnalysisWorkerSuccess | SemanticAnalysisWorkerFailure;

self.onmessage = (event: MessageEvent<SemanticAnalysisWorkerRequest>) => {
  const { id, scenePackage, robustBounds } = event.data;
  const startedAt = performance.now();

  try {
    const semantics = computeLayoutSemantics(scenePackage, robustBounds);
    self.postMessage({
      id,
      ok: true,
      semantics,
      elapsedMs: Math.max(0, performance.now() - startedAt)
    } satisfies SemanticAnalysisWorkerSuccess);
  } catch (error: unknown) {
    self.postMessage({
      id,
      ok: false,
      error: {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : undefined,
        stack: error instanceof Error ? error.stack : undefined
      }
    } satisfies SemanticAnalysisWorkerFailure);
  }
};
