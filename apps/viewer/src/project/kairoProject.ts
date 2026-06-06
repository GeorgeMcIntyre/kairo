import type { SemanticReviewArtifact, SemanticSummary } from "@kairo/semantic";
import type { LayoutPackage, SourceDxfMetadata } from "../layoutLibrary/layoutPackage";
import type { LayoutReviewPack } from "../layoutLibrary/layoutReviewPack";
import type { ReviewedLayoutLibraryPackage } from "../layoutLibrary/reviewedLayoutLibrary";

export type KairoProjectSchema = "kairo-project";
export type KairoProjectSchemaVersion = 1;

export type KairoProject = {
  schema: KairoProjectSchema;
  schemaVersion: KairoProjectSchemaVersion;
  // Scene source metadata only — full ScenePackage is NOT embedded (too large; reload requires original DXF)
  source: SourceDxfMetadata;
  semanticSummary: SemanticSummary;
  layoutPackage: LayoutPackage;
  semanticReviewArtifact?: SemanticReviewArtifact;
  layoutReviewPack?: LayoutReviewPack;
  reviewedLayoutLibrary?: ReviewedLayoutLibraryPackage;
  // Epoch constant for determinism — same pattern as REVIEW_PACK_TIMESTAMP
  createdAt: string;
  updatedAt: string;
};

export type KairoProjectValidationError = {
  path: string;
  message: string;
};

export type KairoProjectParseResult =
  | { ok: true; project: KairoProject }
  | { ok: false; errors: KairoProjectValidationError[] };

export type KairoProjectBuildParams = {
  source: SourceDxfMetadata;
  semanticSummary: SemanticSummary;
  layoutPackage: LayoutPackage;
  semanticReviewArtifact?: SemanticReviewArtifact;
  layoutReviewPack?: LayoutReviewPack;
  reviewedLayoutLibrary?: ReviewedLayoutLibraryPackage;
};

const PROJECT_SCHEMA: KairoProjectSchema = "kairo-project";
const PROJECT_SCHEMA_VERSION: KairoProjectSchemaVersion = 1;
const PROJECT_TIMESTAMP = "1970-01-01T00:00:00.000Z";

export function buildKairoProject(params: KairoProjectBuildParams): KairoProject {
  return {
    schema: PROJECT_SCHEMA,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    source: params.source,
    semanticSummary: params.semanticSummary,
    layoutPackage: params.layoutPackage,
    ...(params.semanticReviewArtifact !== undefined && { semanticReviewArtifact: params.semanticReviewArtifact }),
    ...(params.layoutReviewPack !== undefined && { layoutReviewPack: params.layoutReviewPack }),
    ...(params.reviewedLayoutLibrary !== undefined && { reviewedLayoutLibrary: params.reviewedLayoutLibrary }),
    createdAt: PROJECT_TIMESTAMP,
    updatedAt: PROJECT_TIMESTAMP
  };
}

export function exportKairoProjectJson(project: KairoProject): string {
  return JSON.stringify(project, null, 2);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseKairoProjectJson(json: string): KairoProjectParseResult {
  const errors: KairoProjectValidationError[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    return { ok: false, errors: [{ path: "", message: "Invalid JSON: could not parse." }] };
  }

  if (!isObject(parsed)) {
    return { ok: false, errors: [{ path: "", message: "Project JSON must be an object." }] };
  }

  if (parsed.schema !== PROJECT_SCHEMA) {
    errors.push({ path: "schema", message: `Expected schema "${PROJECT_SCHEMA}", got "${String(parsed.schema)}".` });
  }
  if (parsed.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    errors.push({ path: "schemaVersion", message: `Expected schemaVersion ${PROJECT_SCHEMA_VERSION}, got ${String(parsed.schemaVersion)}.` });
  }

  if (!isObject(parsed.source)) {
    errors.push({ path: "source", message: "source must be an object." });
  }
  if (!isObject(parsed.semanticSummary)) {
    errors.push({ path: "semanticSummary", message: "semanticSummary must be an object." });
  }
  if (!isObject(parsed.layoutPackage)) {
    errors.push({ path: "layoutPackage", message: "layoutPackage must be an object." });
  } else if (parsed.layoutPackage.schema !== "kairo-layout-library-package") {
    errors.push({ path: "layoutPackage.schema", message: "layoutPackage must have schema \"kairo-layout-library-package\"." });
  }

  if (!isString(parsed.createdAt)) {
    errors.push({ path: "createdAt", message: "createdAt must be a string." });
  }
  if (!isString(parsed.updatedAt)) {
    errors.push({ path: "updatedAt", message: "updatedAt must be a string." });
  }

  if (errors.length > 0) return { ok: false, errors };

  const project: KairoProject = {
    schema: PROJECT_SCHEMA,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    source: parsed.source as SourceDxfMetadata,
    semanticSummary: parsed.semanticSummary as SemanticSummary,
    layoutPackage: parsed.layoutPackage as LayoutPackage,
    createdAt: isString(parsed.createdAt) ? parsed.createdAt : PROJECT_TIMESTAMP,
    updatedAt: isString(parsed.updatedAt) ? parsed.updatedAt : PROJECT_TIMESTAMP
  };

  if (isObject(parsed.semanticReviewArtifact)) {
    project.semanticReviewArtifact = parsed.semanticReviewArtifact as SemanticReviewArtifact;
  }
  if (isObject(parsed.layoutReviewPack)) {
    project.layoutReviewPack = parsed.layoutReviewPack as LayoutReviewPack;
  }
  if (isObject(parsed.reviewedLayoutLibrary)) {
    project.reviewedLayoutLibrary = parsed.reviewedLayoutLibrary as ReviewedLayoutLibraryPackage;
  }

  return { ok: true, project };
}
