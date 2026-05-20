import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importDxfToKairo } from "../packages/importer-dxf/src/index";

const benchmarkFile = process.env.KAIRO_DXF_BENCHMARK_FILE;

describe.skipIf(!benchmarkFile)("DXF load benchmark", () => {
  it("prints import timing for a local DXF", async () => {
    expect(benchmarkFile).toBeTruthy();
    expect(existsSync(benchmarkFile!)).toBe(true);

    const startedAt = performance.now();
    const result = await importDxfToKairo(benchmarkFile!, { createdBy: "kairo dxf benchmark" });
    const totalMs = Math.max(0, performance.now() - startedAt);
    const geometryEntities = result.scenePackage.geometry.reduce(
      (count, document) =>
        count +
        document.geometries.reduce(
          (inner, geometry) => inner + (geometry.kind === "curve-set" ? geometry.entities.length : 0),
          0
        ),
      0
    );
    const warningCodeCounts = result.warnings.reduce<Record<string, number>>((counts, warning) => {
      counts[warning.code] = (counts[warning.code] ?? 0) + 1;
      return counts;
    }, {});
    const warningEntityTypeCounts = result.warnings.reduce<Record<string, number>>((counts, warning) => {
      const entityType = warning.entityType ?? "UNKNOWN";
      counts[entityType] = (counts[entityType] ?? 0) + 1;
      return counts;
    }, {});

    console.log(
      JSON.stringify(
        {
          file: benchmarkFile,
          totalMs: Math.round(totalMs),
          summary: result.summary,
          warningCodeCounts,
          warningEntityTypeCounts,
          timing: result.timing?.map((entry) => ({
            stage: entry.stage,
            ms: Math.round(entry.ms)
          })),
          preCleanReport: {
            removedAcadReactorsCount: result.preCleanReport.removedAcadReactorsCount,
            appendedMissingEof: result.preCleanReport.appendedMissingEof,
            originalLineCount: result.preCleanReport.originalLineCount,
            cleanedLineCount: result.preCleanReport.cleanedLineCount,
            warningCount: result.preCleanReport.warnings.length
          },
          geometryDocuments: result.scenePackage.geometry.length,
          geometryEntities,
          layers: result.scenePackage.layers.layers.length,
          sourceRefs: result.scenePackage.sourceMap.sources.length
        },
        null,
        2
      )
    );

    expect(result.summary.supportedEntityCount).toBeGreaterThan(0);
  }, 120_000);
});
