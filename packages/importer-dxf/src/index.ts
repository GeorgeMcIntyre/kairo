import type { GeometryDocument, ScenePackage } from "@kairo/schema";
import { validateScenePackage } from "@kairo/validator";
import { mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
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
const maxCurveEntitiesPerGeometryFile = 50_000;

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
  const writable = prepareScenePackageForWrite(scenePackage);
  await mkdir(absoluteOutputDir, { recursive: true });
  await rm(geometryDir, { recursive: true, force: true });
  await mkdir(geometryDir, { recursive: true });

  await Promise.all([
    writeFile(path.join(absoluteOutputDir, "manifest.json"), stableJson(writable.manifest)),
    writeFile(path.join(absoluteOutputDir, "scene.json"), stableJson(writable.scene)),
    writeFile(path.join(absoluteOutputDir, "layers.json"), stableJson(writable.layers)),
    writeFile(path.join(absoluteOutputDir, "materials.json"), stableJson(writable.materials)),
    writeSourceMapDocument(path.join(absoluteOutputDir, "source-map.json"), writable.sourceMap),
    writeFile(path.join(absoluteOutputDir, "validation-report.json"), stableJson(validateScenePackage(writable)))
  ]);

  await Promise.all(
    writable.geometry.map((document, index) => {
      const firstGeometryId = document.geometries[0]?.id ?? `geometry-${index}`;
      return writeFile(path.join(geometryDir, `${firstGeometryId}.json`), stableJson(document));
    })
  );
}

export function prepareScenePackageForWrite(scenePackage: ScenePackage): ScenePackage {
  const geometry: GeometryDocument[] = [];
  const replacementRefs = new Map<string, string[]>();

  for (const document of scenePackage.geometry) {
    for (const item of document.geometries) {
      if (item.kind !== "curve-set" || item.entities.length <= maxCurveEntitiesPerGeometryFile) {
        geometry.push({ geometries: [item] });
        replacementRefs.set(item.id, [item.id]);
        continue;
      }

      const partIds: string[] = [];
      for (let start = 0; start < item.entities.length; start += maxCurveEntitiesPerGeometryFile) {
        const partIndex = Math.floor(start / maxCurveEntitiesPerGeometryFile) + 1;
        const partId = `${item.id}-part-${partIndex.toString().padStart(3, "0")}`;
        partIds.push(partId);
        geometry.push({
          geometries: [
            {
              ...item,
              id: partId,
              entities: item.entities.slice(start, start + maxCurveEntitiesPerGeometryFile)
            }
          ]
        });
      }
      replacementRefs.set(item.id, partIds);
    }
  }

  const scene = {
    ...scenePackage.scene,
    nodes: scenePackage.scene.nodes.map((node) => {
      if (!node.geometryRefs) return node;
      return {
        ...node,
        geometryRefs: node.geometryRefs.flatMap((geometryRef) => replacementRefs.get(geometryRef) ?? [geometryRef])
      };
    })
  };

  return {
    ...scenePackage,
    scene,
    geometry
  };
}

async function writeSourceMapDocument(filePath: string, sourceMap: ScenePackage["sourceMap"]) {
  const handle = await open(filePath, "w");
  try {
    await handle.write('{\n  "sources": [\n');
    for (let index = 0; index < sourceMap.sources.length; index += 1) {
      const suffix = index === sourceMap.sources.length - 1 ? "\n" : ",\n";
      await handle.write(`    ${JSON.stringify(sourceMap.sources[index])}${suffix}`);
    }
    await handle.write("  ]\n}\n");
  } finally {
    await handle.close();
  }
}
