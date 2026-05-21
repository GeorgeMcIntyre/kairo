import { createKairoPackage, flattenGeometry, readKairoPackage } from "@kairo/core";
import {
  analyzeDxfBlocks,
  importDxfToKairo,
  prepareScenePackageForWrite,
  writeDxfBlockInventoryReports,
  writeScenePackage
} from "@kairo/importer-dxf";
import type { DrawingEntity, Geometry, GeometryDocument, ScenePackage, ValidationReport } from "@kairo/schema";
import { scenePackageSchema } from "@kairo/schema";
import { validateScenePackage } from "@kairo/validator";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeOutlierBlockSummary, findOutliers, flattenCurveEntities } from "./sceneOutliers";

type CliIo = {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
};

type CliError = {
  code: string;
  message: string;
  path?: string;
};

const defaultIo: CliIo = {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text)
};

const stableJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

async function readJsonFile<T>(filePath: string): Promise<T> {
  const text = await readFile(filePath, "utf8");
  return JSON.parse(text) as T;
}

async function resolveSceneDirectory(inputPath: string): Promise<string> {
  const absolutePath = path.resolve(inputPath);
  const inputStat = await stat(absolutePath);

  if (inputStat.isDirectory()) {
    return absolutePath;
  }

  if (inputStat.isFile() && path.basename(absolutePath) === "manifest.json") {
    return path.dirname(absolutePath);
  }

  throw expectedError("UNSUPPORTED_SCENE_PATH", "Scene path must be an exploded scene folder or manifest.json file.", absolutePath);
}

async function loadGeometryDocuments(sceneDirectory: string): Promise<GeometryDocument[]> {
  const geometryDirectory = path.join(sceneDirectory, "geometry");
  const entries = await readdir(geometryDirectory, { withFileTypes: true });
  const geometryFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  return Promise.all(geometryFiles.map((fileName) => readJsonFile<GeometryDocument>(path.join(geometryDirectory, fileName))));
}

export async function loadScenePackageFromPath(inputPath: string): Promise<unknown> {
  const absolutePath = path.resolve(inputPath);
  const inputStat = await stat(absolutePath);

  if (inputStat.isFile() && path.extname(absolutePath).toLowerCase() === ".kairo") {
    return readKairoPackage(await readFile(absolutePath)).scenePackage;
  }

  const sceneDirectory = await resolveSceneDirectory(inputPath);
  const [manifest, scene, geometry, layers, materials, sourceMap] = await Promise.all([
    readJsonFile<unknown>(path.join(sceneDirectory, "manifest.json")),
    readJsonFile<unknown>(path.join(sceneDirectory, "scene.json")),
    loadGeometryDocuments(sceneDirectory),
    readJsonFile<unknown>(path.join(sceneDirectory, "layers.json")),
    readJsonFile<unknown>(path.join(sceneDirectory, "materials.json")),
    readJsonFile<unknown>(path.join(sceneDirectory, "source-map.json"))
  ]);

  return {
    manifest,
    scene,
    geometry,
    layers,
    materials,
    sourceMap
  };
}

function expectedError(code: string, message: string, filePath?: string) {
  return Object.assign(new Error(message), {
    expected: true,
    code,
    path: filePath
  });
}

function normalizeError(error: unknown): CliError {
  if (error instanceof Error) {
    const tagged = error as Error & { code?: string; path?: string };
    if (tagged.code === "ENOENT") {
      return {
        code: "SCENE_PATH_NOT_FOUND",
        message: "Scene path or required scene file was not found.",
        path: tagged.path
      };
    }

    return {
      code: tagged.code ?? "CLI_ERROR",
      message: error.message,
      path: tagged.path
    };
  }

  return {
    code: "CLI_ERROR",
    message: String(error)
  };
}

function formatValidOutput(scenePackage: ScenePackage, report: ValidationReport) {
  const root = scenePackage.scene.nodes.find((node) => node.id === scenePackage.scene.rootNodeId);
  return [
    "Kairo validation passed",
    `Scene: ${root?.displayName ?? scenePackage.scene.rootNodeId}`,
    `Format version: ${scenePackage.manifest.version}`,
    `Nodes: ${scenePackage.scene.nodes.length}`,
    `Geometry: ${flattenGeometry(scenePackage).length}`,
    `Issues: ${report.summary.errors} errors, ${report.summary.warnings} warnings, ${report.summary.infos} infos`
  ].join("\n");
}

function formatInvalidOutput(report: ValidationReport) {
  const lines = [
    "Kairo validation failed",
    `Issues: ${report.summary.errors} errors, ${report.summary.warnings} warnings, ${report.summary.infos} infos`
  ];

  for (const finding of report.findings) {
    lines.push(`- ${finding.severity.toUpperCase()} ${finding.code}${finding.path ? ` ${finding.path}` : ""}: ${finding.message}`);
  }

  return lines.join("\n");
}

function jsonValidationOutput(scenePackage: ScenePackage, report: ValidationReport) {
  return {
    valid: report.valid,
    summary: report.summary,
    scene: {
      rootNodeId: scenePackage.scene.rootNodeId,
      rootName: scenePackage.scene.nodes.find((node) => node.id === scenePackage.scene.rootNodeId)?.displayName,
      formatVersion: scenePackage.manifest.version,
      nodeCount: scenePackage.scene.nodes.length,
      geometryCount: flattenGeometry(scenePackage).length
    },
    issues: report.findings
  };
}

function jsonErrorOutput(error: CliError) {
  return {
    valid: false,
    summary: {
      errors: 1,
      warnings: 0,
      infos: 0
    },
    issues: [
      {
        code: error.code,
        severity: "error",
        message: error.message,
        path: error.path
      }
    ]
  };
}

function parseOptionValue(args: string[], optionName: string): string | undefined {
  const index = args.indexOf(optionName);
  if (index === -1) return undefined;
  return args[index + 1];
}

function withoutOptions(args: string[], optionsWithValues: string[], booleanOptions: string[]) {
  const positional: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (optionsWithValues.includes(arg)) {
      index += 1;
      continue;
    }
    if (booleanOptions.includes(arg)) {
      continue;
    }
    positional.push(arg);
  }
  return positional;
}

function parseCompressionLevel(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 9) {
    throw expectedError("INVALID_COMPRESSION_LEVEL", "--compression-level must be an integer from 0 to 9.");
  }
  return parsed;
}

function redactSourcePaths(scenePackage: ScenePackage): ScenePackage {
  return {
    ...scenePackage,
    manifest: {
      ...scenePackage.manifest,
      source: {
        ...scenePackage.manifest.source,
        path: scenePackage.manifest.source.path ? path.basename(scenePackage.manifest.source.path) : undefined,
        note: [scenePackage.manifest.source.note, "Source paths redacted by kairo import-dxf-package."]
          .filter(Boolean)
          .join(" ")
      }
    },
    sourceMap: {
      sources: scenePackage.sourceMap.sources.map((source) => ({
        ...source,
        path: path.basename(source.path)
      }))
    }
  };
}

function compactSourceMap(scenePackage: ScenePackage): ScenePackage {
  return {
    ...scenePackage,
    manifest: {
      ...scenePackage.manifest,
      source: {
        ...scenePackage.manifest.source,
        note: [scenePackage.manifest.source.note, "Source map compacted for large-DXF package loading."]
          .filter(Boolean)
          .join(" ")
      }
    },
    scene: {
      ...scenePackage.scene,
      nodes: scenePackage.scene.nodes.map((node) => {
        const { sourceRef: _sourceRef, ...rest } = node;
        return rest;
      })
    },
    geometry: scenePackage.geometry.map((document) => ({
      geometries: document.geometries.map((geometry) => {
        const { sourceRef: _geometrySourceRef, ...geometryRest } = geometry;
        if (geometry.kind !== "curve-set") return geometryRest;
        return {
          ...geometryRest,
          entities: geometry.entities.map((entity) => {
            const { sourceRef: _entitySourceRef, ...entityRest } = entity;
            return entityRest;
          })
        };
      })
    })),
    sourceMap: {
      sources: []
    }
  };
}

function includePoint(bounds: { min: [number, number, number]; max: [number, number, number] }, point: readonly number[]) {
  for (let index = 0; index < 3; index += 1) {
    const value = point[index] ?? 0;
    bounds.min[index] = Math.min(bounds.min[index], value);
    bounds.max[index] = Math.max(bounds.max[index], value);
  }
}

function includeEntityBounds(bounds: { min: [number, number, number]; max: [number, number, number] }, entity: DrawingEntity) {
  if (entity.type === "line") {
    includePoint(bounds, entity.start);
    includePoint(bounds, entity.end);
  } else if (entity.type === "polyline") {
    for (const point of entity.points) includePoint(bounds, point);
  } else if (entity.type === "circle") {
    includePoint(bounds, [entity.center[0] - entity.radius, entity.center[1] - entity.radius, entity.center[2]]);
    includePoint(bounds, [entity.center[0] + entity.radius, entity.center[1] + entity.radius, entity.center[2]]);
  } else if (entity.type === "arc") {
    includePoint(bounds, [entity.center[0] - entity.radius, entity.center[1] - entity.radius, entity.center[2]]);
    includePoint(bounds, [entity.center[0] + entity.radius, entity.center[1] + entity.radius, entity.center[2]]);
  } else if (entity.type === "ellipse") {
    const major = Math.hypot(entity.majorAxis[0], entity.majorAxis[1], entity.majorAxis[2]);
    const minor = major * entity.minorToMajorRatio;
    const radius = Math.max(major, minor);
    includePoint(bounds, [entity.center[0] - radius, entity.center[1] - radius, entity.center[2]]);
    includePoint(bounds, [entity.center[0] + radius, entity.center[1] + radius, entity.center[2]]);
  } else if (entity.type === "spline") {
    for (const point of entity.controlPoints) includePoint(bounds, point);
    for (const point of entity.fitPoints) includePoint(bounds, point);
  } else if (entity.type === "point") {
    includePoint(bounds, entity.position);
  } else if (entity.type === "solid" || entity.type === "face3d") {
    for (const point of entity.vertices) includePoint(bounds, point);
  } else if (entity.type === "text") {
    includePoint(bounds, entity.position);
  }
}

function includeGeometryBounds(bounds: { min: [number, number, number]; max: [number, number, number] }, geometry: Geometry) {
  if ("boundingBox" in geometry && geometry.boundingBox) {
    includePoint(bounds, geometry.boundingBox.min);
    includePoint(bounds, geometry.boundingBox.max);
    return;
  }
  if (geometry.kind === "curve-set") {
    for (const entity of geometry.entities) includeEntityBounds(bounds, entity);
  } else {
    for (let index = 0; index < geometry.vertices.length; index += 3) {
      includePoint(bounds, [geometry.vertices[index], geometry.vertices[index + 1], geometry.vertices[index + 2]]);
    }
  }
}

function sceneBounds(scenePackage: ScenePackage) {
  const bounds = {
    min: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY] as [number, number, number],
    max: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY] as [number, number, number]
  };
  for (const document of scenePackage.geometry) {
    for (const geometry of document.geometries) includeGeometryBounds(bounds, geometry);
  }
  return Number.isFinite(bounds.min[0]) ? bounds : undefined;
}

function sceneSummary(scenePackage: ScenePackage) {
  const root = scenePackage.scene.nodes.find((node) => node.id === scenePackage.scene.rootNodeId);
  return {
    rootNodeId: scenePackage.scene.rootNodeId,
    rootName: root?.displayName ?? scenePackage.scene.rootNodeId,
    units: scenePackage.manifest.units,
    nodeCount: scenePackage.scene.nodes.length,
    geometryDocumentCount: scenePackage.geometry.length,
    geometryCount: flattenGeometry(scenePackage).length,
    layerCount: scenePackage.layers.layers.length,
    materialCount: scenePackage.materials.materials.length,
    sourceMapCount: scenePackage.sourceMap.sources.length,
    bounds: sceneBounds(scenePackage)
  };
}

async function validateCommand(args: string[], io: CliIo): Promise<number> {
  const json = args.includes("--json");
  const positional = args.filter((arg) => arg !== "--json");
  const scenePath = positional[0];

  if (!scenePath) {
    const error = {
      code: "MISSING_SCENE_PATH",
      message: "Usage: kairo validate <scene-path> [--json]"
    };
    if (json) {
      io.stdout(stableJson(jsonErrorOutput(error)));
    } else {
      io.stderr(`Kairo validation failed\n- ERROR ${error.code}: ${error.message}\n`);
    }
    return 1;
  }

  try {
    const sceneData = await loadScenePackageFromPath(scenePath);
    const report = validateScenePackage(sceneData);
    const parsedScenePackage = report.valid ? scenePackageSchema.parse(sceneData) : undefined;

    if (json) {
      io.stdout(stableJson(parsedScenePackage ? jsonValidationOutput(parsedScenePackage, report) : {
        valid: report.valid,
        summary: report.summary,
        issues: report.findings
      }));
    } else if (report.valid && parsedScenePackage) {
      io.stdout(`${formatValidOutput(parsedScenePackage, report)}\n`);
    } else {
      io.stderr(`${formatInvalidOutput(report)}\n`);
    }

    return report.valid ? 0 : 1;
  } catch (error) {
    const normalized = normalizeError(error);
    if (json) {
      io.stdout(stableJson(jsonErrorOutput(normalized)));
    } else {
      io.stderr(`Kairo validation failed\n- ERROR ${normalized.code}${normalized.path ? ` ${normalized.path}` : ""}: ${normalized.message}\n`);
    }
    return 1;
  }
}

async function importDxfCommand(args: string[], io: CliIo): Promise<number> {
  const quietWarnings = args.includes("--quiet-warnings");
  const positional = args.filter((arg) => arg !== "--quiet-warnings");
  const [inputPath, outputDir] = positional;

  if (!inputPath || !outputDir) {
    io.stderr("Kairo DXF import failed\n- ERROR MISSING_IMPORT_ARGS: Usage: kairo import-dxf <input.dxf> <output-dir> [--quiet-warnings]\n");
    return 1;
  }

  try {
    const result = await importDxfToKairo(inputPath);
    await writeScenePackage(outputDir, result.scenePackage);
    const validationReport = validateScenePackage(result.scenePackage);

    if (!validationReport.valid) {
      io.stderr(`${formatInvalidOutput(validationReport)}\n`);
      return 1;
    }

    io.stdout(
      [
        "Kairo DXF import passed",
        `Input: ${path.resolve(inputPath)}`,
        `Output: ${path.resolve(outputDir)}`,
        `Supported entities: ${result.summary.supportedEntityCount}`,
        `Unsupported entities: ${result.summary.unsupportedEntityCount}`,
        `Conversion: ${result.coverage.conversionPercent.toFixed(4)}%`,
        `Layers: ${result.summary.layerCount}`,
        `Warnings: ${result.summary.warningCount}`,
        `Pre-clean ACAD_REACTORS removed: ${result.preCleanReport.removedAcadReactorsCount}`,
        `Pre-clean missing EOF appended: ${result.preCleanReport.appendedMissingEof}`
      ].join("\n") + "\n"
    );
    if (!quietWarnings) {
      for (const warning of result.preCleanReport.warnings) {
        io.stderr(`- WARNING ${warning.code}${warning.line ? ` line ${warning.line}` : ""}: ${warning.message}\n`);
      }
      for (const warning of result.warnings) {
        io.stderr(`- WARNING ${warning.code}${warning.entityType ? ` ${warning.entityType}` : ""}${warning.handle ? ` ${warning.handle}` : ""}: ${warning.message}\n`);
      }
    }
    return 0;
  } catch (error) {
    const normalized = normalizeError(error);
    io.stderr(`Kairo DXF import failed\n- ERROR ${normalized.code}${normalized.path ? ` ${normalized.path}` : ""}: ${normalized.message}\n`);
    return 1;
  }
}

async function importDxfPackageCommand(args: string[], io: CliIo): Promise<number> {
  const quietWarnings = args.includes("--quiet-warnings");
  const redactPaths = args.includes("--redact-source-paths");
  const fullSourceMap = args.includes("--full-source-map");
  const reportPath = parseOptionValue(args, "--report");
  const compressionLevelValue = parseOptionValue(args, "--compression-level");
  const positional = withoutOptions(args, ["--report", "--compression-level"], ["--quiet-warnings", "--redact-source-paths", "--full-source-map"]);
  const [inputPath, outputPath] = positional;

  if (!inputPath || !outputPath) {
    io.stderr(
      "Kairo DXF package import failed\n- ERROR MISSING_IMPORT_PACKAGE_ARGS: Usage: kairo import-dxf-package <input.dxf> <output.kairo> [--report <report.json>] [--quiet-warnings] [--redact-source-paths] [--full-source-map] [--compression-level 0-9]\n"
    );
    return 1;
  }

  if (path.extname(outputPath).toLowerCase() !== ".kairo") {
    io.stderr("Kairo DXF package import failed\n- ERROR INVALID_PACKAGE_PATH: Output file must use the .kairo extension.\n");
    return 1;
  }

  try {
    if (args.includes("--report") && !reportPath) {
      throw expectedError("MISSING_REPORT_PATH", "--report requires a report JSON path.");
    }
    if (args.includes("--compression-level") && !compressionLevelValue) {
      throw expectedError("MISSING_COMPRESSION_LEVEL", "--compression-level requires an integer from 0 to 9.");
    }
    const compressionLevel = parseCompressionLevel(compressionLevelValue);
    const importResult = await importDxfToKairo(inputPath, { createdBy: "kairo import-dxf-package" });
    const packageScenePackage = fullSourceMap ? importResult.scenePackage : compactSourceMap(importResult.scenePackage);
    const writableScenePackage = prepareScenePackageForWrite(
      redactPaths ? redactSourcePaths(packageScenePackage) : packageScenePackage
    );
    const validationReport = validateScenePackage(writableScenePackage);
    if (!validationReport.valid) {
      io.stderr(`${formatInvalidOutput(validationReport)}\n`);
      return 1;
    }

    const archive = createKairoPackage(writableScenePackage, {
      createdBy: "kairo import-dxf-package",
      compressionLevel
    });
    const absoluteOutputPath = path.resolve(outputPath);
    await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
    await writeFile(absoluteOutputPath, archive);

    const readBackReport = validateScenePackage(readKairoPackage(archive).scenePackage);
    const report = {
      ok: validationReport.valid && readBackReport.valid,
      input: path.resolve(inputPath),
      output: absoluteOutputPath,
      packageBytes: archive.byteLength,
      options: {
        redactSourcePaths: redactPaths,
        sourceMap: fullSourceMap ? "full" : "compact",
        compressionLevel: compressionLevel ?? 6
      },
      scene: sceneSummary(writableScenePackage),
      import: {
        summary: importResult.summary,
        coverage: importResult.coverage,
        warningCount: importResult.warnings.length,
        warnings: importResult.warnings,
        preCleanReport: importResult.preCleanReport,
        timing: importResult.timing ?? []
      },
      validation: {
        write: validationReport,
        readBack: readBackReport
      }
    };

    if (reportPath) {
      const absoluteReportPath = path.resolve(reportPath);
      await mkdir(path.dirname(absoluteReportPath), { recursive: true });
      await writeFile(absoluteReportPath, stableJson(report));
    }

    io.stdout(
      [
        "Kairo DXF package import passed",
        `Input: ${path.resolve(inputPath)}`,
        `Output: ${absoluteOutputPath}`,
        reportPath ? `Report: ${path.resolve(reportPath)}` : undefined,
        `Package bytes: ${archive.byteLength}`,
        `Units: ${writableScenePackage.manifest.units}`,
        `Geometry documents: ${writableScenePackage.geometry.length}`,
        `Supported entities: ${importResult.summary.supportedEntityCount}`,
        `Unsupported entities: ${importResult.summary.unsupportedEntityCount}`,
        `Conversion: ${importResult.coverage.conversionPercent.toFixed(4)}%`,
        `Warnings: ${importResult.summary.warningCount}`,
        `Read-back validation: ${readBackReport.summary.errors} errors, ${readBackReport.summary.warnings} warnings`
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n") + "\n"
    );

    if (!quietWarnings) {
      for (const warning of importResult.preCleanReport.warnings) {
        io.stderr(`- WARNING ${warning.code}${warning.line ? ` line ${warning.line}` : ""}: ${warning.message}\n`);
      }
      for (const warning of importResult.warnings) {
        io.stderr(`- WARNING ${warning.code}${warning.entityType ? ` ${warning.entityType}` : ""}${warning.handle ? ` ${warning.handle}` : ""}: ${warning.message}\n`);
      }
    }
    return readBackReport.valid ? 0 : 1;
  } catch (error) {
    const normalized = normalizeError(error);
    io.stderr(`Kairo DXF package import failed\n- ERROR ${normalized.code}${normalized.path ? ` ${normalized.path}` : ""}: ${normalized.message}\n`);
    return 1;
  }
}

async function packSceneCommand(args: string[], io: CliIo): Promise<number> {
  const [scenePath, outputPath] = args;

  if (!scenePath || !outputPath) {
    io.stderr("Kairo scene package failed\n- ERROR MISSING_PACK_ARGS: Usage: kairo pack-scene <scene-path> <output.kairo>\n");
    return 1;
  }

  if (path.extname(outputPath).toLowerCase() !== ".kairo") {
    io.stderr("Kairo scene package failed\n- ERROR INVALID_PACKAGE_PATH: Output file must use the .kairo extension.\n");
    return 1;
  }

  try {
    const sceneData = await loadScenePackageFromPath(scenePath);
    const report = validateScenePackage(sceneData);
    if (!report.valid) {
      io.stderr(`${formatInvalidOutput(report)}\n`);
      return 1;
    }

    const scenePackage = scenePackageSchema.parse(sceneData);
    const archive = createKairoPackage(scenePackage, { createdBy: "kairo cli" });
    const absoluteOutputPath = path.resolve(outputPath);
    await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
    await writeFile(absoluteOutputPath, archive);

    io.stdout(
      [
        "Kairo scene package passed",
        `Scene: ${scenePackage.scene.nodes.find((node) => node.id === scenePackage.scene.rootNodeId)?.displayName ?? scenePackage.scene.rootNodeId}`,
        `Input: ${path.resolve(scenePath)}`,
        `Output: ${absoluteOutputPath}`,
        `Package bytes: ${archive.byteLength}`
      ].join("\n") + "\n"
    );
    return 0;
  } catch (error) {
    const normalized = normalizeError(error);
    io.stderr(`Kairo scene package failed\n- ERROR ${normalized.code}${normalized.path ? ` ${normalized.path}` : ""}: ${normalized.message}\n`);
    return 1;
  }
}

async function dxfCoverageCommand(args: string[], io: CliIo): Promise<number> {
  const json = args.includes("--json");
  const inputs = args.filter((arg) => arg !== "--json");

  if (inputs.length === 0) {
    const error = {
      code: "MISSING_DXF_COVERAGE_ARGS",
      message: "Usage: kairo dxf-coverage <input.dxf> [...input.dxf] [--json]"
    };
    if (json) io.stdout(stableJson(jsonErrorOutput(error)));
    else io.stderr(`Kairo DXF coverage failed\n- ERROR ${error.code}: ${error.message}\n`);
    return 1;
  }

  try {
    const results = [];
    for (const inputPath of inputs) {
      const result = await importDxfToKairo(inputPath, { createdBy: "kairo dxf-coverage" });
      results.push({
        input: path.resolve(inputPath),
        coverage: result.coverage,
        summary: result.summary,
        warnings: result.warnings.length,
        timing: result.timing
      });
    }

    const failed = results.filter((result) => result.coverage.failedInstances > 0);
    if (json) {
      io.stdout(stableJson({ ok: failed.length === 0, files: results }));
    } else {
      const lines = ["Kairo DXF coverage", ""];
      for (const result of results) {
        lines.push(
          `${result.coverage.failedInstances === 0 ? "PASS" : "FAIL"} ${result.coverage.conversionPercent.toFixed(4)}% ${result.input}`,
          `  Covered: ${result.coverage.coveredInstances}/${result.coverage.totalSourceInstances}`,
          `  Failed: ${result.coverage.failedInstances}`,
          `  Warnings: ${result.warnings}`
        );
        const topFailures = Object.entries(result.coverage.byFailureCode)
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 5);
        if (topFailures.length > 0) {
          lines.push(`  Failure codes: ${topFailures.map(([code, count]) => `${code}=${count}`).join(", ")}`);
        }
      }
      io.stdout(`${lines.join("\n")}\n`);
    }
    return failed.length === 0 ? 0 : 1;
  } catch (error) {
    const normalized = normalizeError(error);
    if (json) io.stdout(stableJson(jsonErrorOutput(normalized)));
    else io.stderr(`Kairo DXF coverage failed\n- ERROR ${normalized.code}${normalized.path ? ` ${normalized.path}` : ""}: ${normalized.message}\n`);
    return 1;
  }
}

async function inspectDxfCommand(args: string[], io: CliIo): Promise<number> {
  const [inputPath, outputBasePath] = args;

  if (!inputPath) {
    io.stderr("Kairo DXF inspection failed\n- ERROR MISSING_INSPECT_ARGS: Usage: kairo inspect-dxf <input.dxf> [output-base-path]\n");
    return 1;
  }

  try {
    const inventory = await analyzeDxfBlocks(inputPath);

    if (outputBasePath) {
      await writeDxfBlockInventoryReports(inventory, outputBasePath);
    }

    if (!inventory.parser.ok) {
      io.stderr(
        [
          "Kairo DXF inspection failed",
          `Input: ${path.resolve(inputPath)}`,
          `Parser error: ${inventory.parser.error?.name ?? "Error"}: ${inventory.parser.error?.message ?? "Unknown parser error"}`,
          outputBasePath ? `Output: ${path.resolve(outputBasePath)}.json / .md` : ""
        ]
          .filter(Boolean)
          .join("\n") + "\n"
      );
      return 1;
    }

    const ta = inventory.textAudit;
    const summaryLines = [
      "Kairo DXF inspection passed",
      `Input: ${path.resolve(inputPath)}`,
      outputBasePath ? `Output: ${path.resolve(outputBasePath)}.json / .md` : "",
      `Layers: ${inventory.layerCount}`,
      `INSERT entities: ${inventory.totalInsertCount}`,
      `Unique INSERT block names: ${inventory.uniqueInsertBlockNameCount}`,
      `BLOCK definitions: ${inventory.blockDefinitionCount}`,
      `Missing block definitions: ${inventory.missingBlockDefinitions.length}`,
      `Nested INSERTs inside blocks: ${inventory.nestedInsertCountInsideBlocks}`,
      "",
      "Text / Attribute Audit:",
      `  TEXT:   ${ta.totalTextCount} (${ta.inDirectEntities.TEXT} direct + ${ta.inBlockDefinitions.TEXT} in blocks)`,
      `  MTEXT:  ${ta.totalMTextCount} (${ta.inDirectEntities.MTEXT} direct + ${ta.inBlockDefinitions.MTEXT} in blocks)`,
      `  ATTDEF: ${ta.totalAttdefCount} (${ta.inDirectEntities.ATTDEF} direct + ${ta.inBlockDefinitions.ATTDEF} in blocks)`,
      `  ATTRIB: ${ta.totalAttribCount} (${ta.inDirectEntities.ATTRIB} direct + ${ta.inBlockDefinitions.ATTRIB} in blocks)`,
      "",
      `Equipment / robot blocks matched (${ta.equipmentBlockMatches.length}):`,
      ...ta.equipmentBlockMatches.slice(0, 10).map((m) => `  ${m.blockName} (pattern: ${m.matchedPattern}, inserts: ${m.insertCount}, classification: ${m.classification})`),
      ta.equipmentBlockMatches.length === 0 ? "  None." : "",
      "",
      `Hard-transform blocks with text (${ta.hardTransformTextBlocks.length}):`,
      ...ta.hardTransformTextBlocks.slice(0, 10).map((b) => `  ${b.blockName} (inserts: ${b.insertCount}, TEXT: ${b.textCount}, ATTDEF: ${b.attdefCount})`),
      ta.hardTransformTextBlocks.length === 0 ? "  None." : "",
      "",
      `Partial-expand blocks where text was skipped (${ta.partialExpandTextSkipped.length}):`,
      ...ta.partialExpandTextSkipped.slice(0, 10).map((b) => `  ${b.blockName} (inserts: ${b.insertCount}, TEXT: ${b.textCount}, ATTDEF: ${b.attdefCount})`),
      ta.partialExpandTextSkipped.length === 0 ? "  None." : "",
      "",
      "Top blocks by text/attr count (up to 10):",
      ...ta.topTextBlocks.slice(0, 10).map((b) => `  ${b.blockName}: TEXT=${b.textCount} ATTDEF=${b.attdefCount} ATTRIB=${b.attribCount} MTEXT=${b.mtextCount} (used ${b.usageCount}×)`),
      ta.topTextBlocks.length === 0 ? "  None." : "",
      "",
      "Top text layers (up to 5):",
      ...ta.topTextLayers.slice(0, 5).map((l) => `  ${l.layerName}: ${l.count}`),
      ta.topTextLayers.length === 0 ? "  None." : "",
      "",
      "Sample text strings:",
      ...ta.sampleTextStrings.slice(0, 5).map((s) => `  [${s.source}] ${s.text}`),
      ta.sampleTextStrings.length === 0 ? "  None." : "",
      "",
      "Transform Complexity Audit:",
      `  Hard-blocked INSERTs: ${inventory.transformAudit.totalHardBlocked}`,
      `  Flag counts: negX=${inventory.transformAudit.flagCounts.negativeX} negY=${inventory.transformAudit.flagCounts.negativeY} negZ=${inventory.transformAudit.flagCounts.negativeZ} nonUniform=${inventory.transformAudit.flagCounts.nonUniform} negDet=${inventory.transformAudit.flagCounts.negativeDet} hasRotation=${inventory.transformAudit.flagCounts.hasRotation} zOffsetAlso=${inventory.transformAudit.flagCounts.zOffsetAlso}`,
      `  Categories: pureNegUniform=${inventory.transformAudit.categoryCounts.pureNegativeUniform} pureNonUniformPos=${inventory.transformAudit.categoryCounts.pureNonUniformPositive} nonUniformNeg=${inventory.transformAudit.categoryCounts.nonUniformNegative} other=${inventory.transformAudit.categoryCounts.other}`,
      `  Option unlocks: A=${inventory.transformAudit.optionUnlocks.optionA} B=${inventory.transformAudit.optionUnlocks.optionB} C=${inventory.transformAudit.optionUnlocks.optionC}`,
      `  Top blocked blocks (${inventory.transformAudit.topBlockedBlocks.length}):`,
      ...inventory.transformAudit.topBlockedBlocks.slice(0, 10).map((b) => `    ${b.blockName} (inserts: ${b.insertCount}, scale: ${JSON.stringify(b.sampleScale)}, category: ${b.category})`),
      inventory.transformAudit.topBlockedBlocks.length === 0 ? "    None." : "",
      `  Blocked equipment blocks (${inventory.transformAudit.blockedEquipmentBlocks.length}):`,
      ...inventory.transformAudit.blockedEquipmentBlocks.slice(0, 10).map((b) => `    ${b.blockName} (pattern: ${b.matchedPattern}, inserts: ${b.insertCount}, category: ${b.category})`),
      inventory.transformAudit.blockedEquipmentBlocks.length === 0 ? "    None." : ""
    ]
      .filter((line) => line !== undefined)
      .join("\n");

    io.stdout(`${summaryLines}\n`);
    return 0;
  } catch (error) {
    const normalized = normalizeError(error);
    io.stderr(`Kairo DXF inspection failed\n- ERROR ${normalized.code}${normalized.path ? ` ${normalized.path}` : ""}: ${normalized.message}\n`);
    return 1;
  }
}

function isSafeViewerSceneName(sceneName: string) {
  return /^[A-Za-z0-9._-]+$/.test(sceneName);
}

function viewerScenesDirectory() {
  return path.resolve(process.env.KAIRO_VIEWER_PUBLIC_SCENES_DIR ?? path.join("apps", "viewer", "public", "scenes"));
}

async function stageViewerSceneCommand(args: string[], io: CliIo): Promise<number> {
  const [scenePath, sceneName] = args;

  if (!scenePath || !sceneName) {
    io.stderr("Kairo viewer scene staging failed\n- ERROR MISSING_STAGE_ARGS: Usage: kairo stage-viewer-scene <scene-path> <scene-name>\n");
    return 1;
  }

  if (!isSafeViewerSceneName(sceneName)) {
    io.stderr("Kairo viewer scene staging failed\n- ERROR INVALID_SCENE_NAME: Scene name may only contain letters, numbers, dot, underscore, and dash.\n");
    return 1;
  }

  try {
    const sceneData = await loadScenePackageFromPath(scenePath);
    const report = validateScenePackage(sceneData);
    if (!report.valid) {
      io.stderr(`${formatInvalidOutput(report)}\n`);
      return 1;
    }

    const parsedScenePackage = scenePackageSchema.parse(sceneData);
    const sourceDirectory = await resolveSceneDirectory(scenePath);
    const scenesDirectory = viewerScenesDirectory();
    const destinationDirectory = path.join(scenesDirectory, sceneName);
    await mkdir(scenesDirectory, { recursive: true });
    await rm(destinationDirectory, { recursive: true, force: true });
    await cp(sourceDirectory, destinationDirectory, { recursive: true });

    io.stdout(
      [
        "Kairo viewer scene staging passed",
        `Scene: ${parsedScenePackage.scene.nodes.find((node) => node.id === parsedScenePackage.scene.rootNodeId)?.displayName ?? parsedScenePackage.scene.rootNodeId}`,
        `Input: ${path.resolve(scenePath)}`,
        `Output: ${destinationDirectory}`,
        `URL path: /?scene=${sceneName}`
      ].join("\n") + "\n"
    );
    return 0;
  } catch (error) {
    const normalized = normalizeError(error);
    io.stderr(`Kairo viewer scene staging failed\n- ERROR ${normalized.code}${normalized.path ? ` ${normalized.path}` : ""}: ${normalized.message}\n`);
    return 1;
  }
}

async function sceneOutliersCommand(args: string[], io: CliIo): Promise<number> {
  let topN = 20;
  let summaryMode = false;
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--top") {
      const next = args[i + 1];
      const parsed = next ? Number(next) : NaN;
      if (!Number.isFinite(parsed) || parsed <= 0) {
        io.stderr("Kairo scene-outliers failed\n- ERROR INVALID_TOP: --top requires a positive integer.\n");
        return 1;
      }
      topN = Math.floor(parsed);
      i++;
    } else if (args[i] === "--summary") {
      summaryMode = true;
    } else {
      positional.push(args[i]);
    }
  }
  const scenePath = positional[0];

  if (!scenePath) {
    io.stderr("Kairo scene-outliers failed\n- ERROR MISSING_SCENE_PATH: Usage: kairo scene-outliers <scene-path> [--top N] [--summary]\n");
    return 1;
  }

  try {
    const sceneDirectory = await resolveSceneDirectory(scenePath);
    const documents = await loadGeometryDocuments(sceneDirectory);
    const entities = flattenCurveEntities(documents);
    const outliers = findOutliers(entities);

    const header = [
      "Kairo scene-outliers",
      `Scene: ${path.resolve(scenePath)}`,
      `Total entities: ${entities.length}`,
      `Outliers (3× median distance from scene centroid): ${outliers.length}`
    ];

    if (summaryMode) {
      const summary = computeOutlierBlockSummary(outliers);
      const lines = [
        ...header,
        "",
        "| Block name | Count | Min dist (mm) | Max dist (mm) |",
        "|---|---|---|---|",
        ...summary.map(
          (s) =>
            `| ${s.blockName} | ${s.count} | ${Math.round(s.minDistance)} | ${Math.round(s.maxDistance)} |`
        )
      ];
      io.stdout(lines.join("\n") + "\n");
    } else {
      const top = outliers.slice(0, topN);
      const lines = [
        ...header,
        `Showing top ${top.length}:`,
        "",
        "| Rank | Distance | Type | Layer | Centroid X | Centroid Y | Centroid Z | Source ref |",
        "|---|---|---|---|---|---|---|---|",
        ...top.map((o) =>
          `| ${o.rank} | ${o.distance.toFixed(2)} | ${o.type} | ${o.layerId ?? "-"} | ${o.centroid[0].toFixed(2)} | ${o.centroid[1].toFixed(2)} | ${o.centroid[2].toFixed(2)} | ${o.sourceRef ?? "-"} |`
        )
      ];
      io.stdout(lines.join("\n") + "\n");
    }
    return 0;
  } catch (error) {
    const normalized = normalizeError(error);
    io.stderr(`Kairo scene-outliers failed\n- ERROR ${normalized.code}${normalized.path ? ` ${normalized.path}` : ""}: ${normalized.message}\n`);
    return 1;
  }
}

export async function runCli(argv: string[], io: CliIo = defaultIo): Promise<number> {
  const [command, ...args] = argv;

  if (command === "validate") {
    return validateCommand(args, io);
  }

  if (command === "import-dxf") {
    return importDxfCommand(args, io);
  }

  if (command === "import-dxf-package") {
    return importDxfPackageCommand(args, io);
  }

  if (command === "dxf-coverage") {
    return dxfCoverageCommand(args, io);
  }

  if (command === "pack-scene") {
    return packSceneCommand(args, io);
  }

  if (command === "inspect-dxf") {
    return inspectDxfCommand(args, io);
  }

  if (command === "stage-viewer-scene") {
    return stageViewerSceneCommand(args, io);
  }

  if (command === "scene-outliers") {
    return sceneOutliersCommand(args, io);
  }

  const message =
    "Usage: kairo validate <scene-path|package.kairo> [--json] | kairo import-dxf <input.dxf> <output-dir> [--quiet-warnings] | kairo import-dxf-package <input.dxf> <output.kairo> [--report <report.json>] [--quiet-warnings] [--redact-source-paths] [--full-source-map] [--compression-level 0-9] | kairo dxf-coverage <input.dxf> [...input.dxf] [--json] | kairo pack-scene <scene-path> <output.kairo> | kairo inspect-dxf <input.dxf> [output-base-path] | kairo stage-viewer-scene <scene-path> <scene-name> | kairo scene-outliers <scene-path> [--top N]";
  io.stderr(`Kairo command failed\n- ERROR UNKNOWN_COMMAND: ${message}\n`);
  return 1;
}

const isDirectExecution = process.argv[1] ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) : false;

if (isDirectExecution) {
  const exitCode = await runCli(process.argv.slice(2));
  process.exitCode = exitCode;
}
