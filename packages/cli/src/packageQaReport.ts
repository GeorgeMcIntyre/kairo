import { createKairoPackage, flattenCurveEntities, flattenGeometry, readKairoPackage, type KairoPackageIndex } from "@kairo/core";
import type { ScenePackage, ValidationReport } from "@kairo/schema";

export type PackageFingerprint = {
  rootName: string;
  units: string;
  nodeCount: number;
  geometryDocumentCount: number;
  geometryCount: number;
  entityCount: number;
  lineCount: number;
  polylineCount: number;
  circleCount: number;
  arcCount: number;
  textCount: number;
  layerCount: number;
  materialCount: number;
  sourceMapRows: number;
};

export type PackageQaResult = {
  packageBytes: number;
  sourcePathMode: "preserved" | "redacted";
  packageIndex?: KairoPackageIndex;
  originalValidation: ValidationReport;
  packagedValidation: ValidationReport;
  original: PackageFingerprint;
  packaged: PackageFingerprint;
  countsMatch: boolean;
  localPathCount: number;
};

function sourceFileName(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).at(-1) ?? value;
}

function stableJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function looksLikeLocalPath(value: string | undefined): boolean {
  if (!value) return false;
  return /^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value) || value.includes("\\Users\\") || value.includes("/Users/");
}

export function redactScenePackageSourcePaths(scenePackage: ScenePackage): ScenePackage {
  const clone = JSON.parse(stableJson(scenePackage)) as ScenePackage;
  const sourceFile = sourceFileName(clone.manifest.source.path);
  if (sourceFile) clone.manifest.source.path = sourceFile;
  clone.sourceMap.sources = clone.sourceMap.sources.map((source) => ({
    ...source,
    path: sourceFileName(source.path) ?? source.path
  }));
  return clone;
}

export function fingerprintScenePackage(scenePackage: ScenePackage): PackageFingerprint {
  const root = scenePackage.scene.nodes.find((node) => node.id === scenePackage.scene.rootNodeId);
  const entities = flattenCurveEntities(scenePackage.geometry);
  return {
    rootName: root?.displayName ?? scenePackage.scene.rootNodeId,
    units: scenePackage.manifest.units,
    nodeCount: scenePackage.scene.nodes.length,
    geometryDocumentCount: scenePackage.geometry.length,
    geometryCount: flattenGeometry(scenePackage).length,
    entityCount: entities.length,
    lineCount: entities.filter((entity) => entity.type === "line").length,
    polylineCount: entities.filter((entity) => entity.type === "polyline").length,
    circleCount: entities.filter((entity) => entity.type === "circle").length,
    arcCount: entities.filter((entity) => entity.type === "arc").length,
    textCount: entities.filter((entity) => entity.type === "text").length,
    layerCount: scenePackage.layers.layers.length,
    materialCount: scenePackage.materials.materials.length,
    sourceMapRows: scenePackage.sourceMap.sources.length
  };
}

export function countLocalSourcePaths(scenePackage: ScenePackage): number {
  const values = [
    scenePackage.manifest.source.path,
    ...scenePackage.sourceMap.sources.map((source) => source.path)
  ];
  return values.filter(looksLikeLocalPath).length;
}

function fingerprintCountsMatch(left: PackageFingerprint, right: PackageFingerprint): boolean {
  return stableJson(left) === stableJson(right);
}

function markdownRow(values: readonly unknown[]): string {
  return `| ${values.map((value) => String(value ?? "").replace(/\|/g, "\\|")).join(" | ")} |`;
}

export function createPackageQaArchive(scenePackage: ScenePackage, redactSourcePaths: boolean) {
  const packageScene = redactSourcePaths ? redactScenePackageSourcePaths(scenePackage) : scenePackage;
  const archive = createKairoPackage(packageScene, { createdBy: "kairo package qa" });
  const loaded = readKairoPackage(archive);
  return { archive, packageScene, loaded };
}

export function buildPackageQaResult(
  originalScenePackage: ScenePackage,
  packagedScenePackage: ScenePackage,
  originalValidation: ValidationReport,
  packagedValidation: ValidationReport,
  archiveBytes: number,
  packageIndex: KairoPackageIndex | undefined,
  sourcePathMode: "preserved" | "redacted"
): PackageQaResult {
  const original = fingerprintScenePackage(sourcePathMode === "redacted" ? redactScenePackageSourcePaths(originalScenePackage) : originalScenePackage);
  const packaged = fingerprintScenePackage(packagedScenePackage);
  return {
    packageBytes: archiveBytes,
    sourcePathMode,
    packageIndex,
    originalValidation,
    packagedValidation,
    original,
    packaged,
    countsMatch: fingerprintCountsMatch(original, packaged),
    localPathCount: countLocalSourcePaths(packagedScenePackage)
  };
}

export function renderPackageQaMarkdown(result: PackageQaResult): string {
  const lines = [
    "# Kairo Package QA",
    "",
    "This report verifies that a `.kairo` package can be created, read back, validated, and compared to the source scene by machine-checkable counts.",
    "",
    "Manual browser open/drop confirmation is still pending.",
    "",
    "## Result",
    "",
    `- Machine QA: ${result.originalValidation.valid && result.packagedValidation.valid && result.countsMatch && result.localPathCount === 0 ? "PASS" : "REVIEW"}`,
    `- Source path mode: ${result.sourcePathMode}`,
    `- Package bytes: ${result.packageBytes}`,
    `- Original validation: ${result.originalValidation.summary.errors} errors, ${result.originalValidation.summary.warnings} warnings, ${result.originalValidation.summary.infos} infos`,
    `- Packaged validation: ${result.packagedValidation.summary.errors} errors, ${result.packagedValidation.summary.warnings} warnings, ${result.packagedValidation.summary.infos} infos`,
    `- Counts match: ${result.countsMatch}`,
    `- Local source paths in packaged scene: ${result.localPathCount}`,
    `- Package geometry entries: ${result.packageIndex?.scene.geometry.length ?? 0}`,
    "",
    "## Fingerprint",
    "",
    markdownRow(["Metric", "Original", "Packaged"]),
    "|---|---:|---:|",
    ...Object.keys(result.original).map((key) =>
      markdownRow([
        key,
        result.original[key as keyof PackageFingerprint],
        result.packaged[key as keyof PackageFingerprint]
      ])
    ),
    "",
    "## Notes",
    "",
    "- The package is a ZIP-backed `.kairo` neutral scene package.",
    "- Redacted source path mode keeps source file names and removes local directory paths.",
    "- This does not embed semantic review JSON in the package.",
    "- This does not prove visual correctness; use the viewer for final browser confirmation.",
    ""
  ];
  return lines.join("\n");
}
