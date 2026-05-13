import type { ScenePackage } from "@kairo/schema";
import { validateScenePackage } from "@kairo/validator";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { importDxfTextToKairo, type DxfImportOptions, type DxfImportResult } from "./importerCore";

export * from "./importerCore";
export { analyzeDxfBlocks, renderDxfBlockInventoryMarkdown, writeDxfBlockInventoryReports } from "./analyzeDxfBlocks";
export type {
  DxfBlockDefinitionSummary,
  DxfBlockExpansionClassification,
  DxfBlockInsertInventory,
  DxfBlockTransformComplexity,
  DxfInsertedBlockSummary
} from "./analyzeDxfBlocks";

const stableJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

export async function importDxfToKairo(inputPath: string, options: DxfImportOptions = {}): Promise<DxfImportResult> {
  const absolutePath = path.resolve(inputPath);
  const startedAt = performance.now();
  const content = await readFile(absolutePath, "utf8");
  const fileReadMs = Math.max(0, performance.now() - startedAt);
  const result = await importDxfTextToKairo(absolutePath, content, options);
  return {
    ...result,
    timing: [{ stage: "file-read", ms: fileReadMs }, ...(result.timing ?? [])]
  };
}

export async function writeScenePackage(outputDir: string, scenePackage: ScenePackage): Promise<void> {
  const absoluteOutputDir = path.resolve(outputDir);
  const geometryDir = path.join(absoluteOutputDir, "geometry");
  await mkdir(absoluteOutputDir, { recursive: true });
  await rm(geometryDir, { recursive: true, force: true });
  await mkdir(geometryDir, { recursive: true });

  await Promise.all([
    writeFile(path.join(absoluteOutputDir, "manifest.json"), stableJson(scenePackage.manifest)),
    writeFile(path.join(absoluteOutputDir, "scene.json"), stableJson(scenePackage.scene)),
    writeFile(path.join(absoluteOutputDir, "layers.json"), stableJson(scenePackage.layers)),
    writeFile(path.join(absoluteOutputDir, "materials.json"), stableJson(scenePackage.materials)),
    writeFile(path.join(absoluteOutputDir, "source-map.json"), stableJson(scenePackage.sourceMap)),
    writeFile(path.join(absoluteOutputDir, "validation-report.json"), stableJson(validateScenePackage(scenePackage)))
  ]);

  await Promise.all(
    scenePackage.geometry.map((document, index) => {
      const firstGeometryId = document.geometries[0]?.id ?? `geometry-${index}`;
      return writeFile(path.join(geometryDir, `${firstGeometryId}.json`), stableJson(document));
    })
  );
}
