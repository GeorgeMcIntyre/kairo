import { flattenGeometry } from "@kairo/core";
import { analyzeDxfBlocks, importDxfToKairo, writeDxfBlockInventoryReports, writeScenePackage } from "@kairo/importer-dxf";
import type { GeometryDocument, ScenePackage, ValidationReport } from "@kairo/schema";
import { scenePackageSchema } from "@kairo/schema";
import { validateScenePackage } from "@kairo/validator";
import { cp, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
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
  const [inputPath, outputDir] = args;

  if (!inputPath || !outputDir) {
    io.stderr("Kairo DXF import failed\n- ERROR MISSING_IMPORT_ARGS: Usage: kairo import-dxf <input.dxf> <output-dir>\n");
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
        `Layers: ${result.summary.layerCount}`,
        `Warnings: ${result.summary.warningCount}`,
        `Pre-clean ACAD_REACTORS removed: ${result.preCleanReport.removedAcadReactorsCount}`,
        `Pre-clean missing EOF appended: ${result.preCleanReport.appendedMissingEof}`
      ].join("\n") + "\n"
    );
    for (const warning of result.preCleanReport.warnings) {
      io.stderr(`- WARNING ${warning.code}${warning.line ? ` line ${warning.line}` : ""}: ${warning.message}\n`);
    }
    for (const warning of result.warnings) {
      io.stderr(`- WARNING ${warning.code}${warning.entityType ? ` ${warning.entityType}` : ""}${warning.handle ? ` ${warning.handle}` : ""}: ${warning.message}\n`);
    }
    return 0;
  } catch (error) {
    const normalized = normalizeError(error);
    io.stderr(`Kairo DXF import failed\n- ERROR ${normalized.code}${normalized.path ? ` ${normalized.path}` : ""}: ${normalized.message}\n`);
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
    "Usage: kairo validate <scene-path> [--json] | kairo import-dxf <input.dxf> <output-dir> | kairo inspect-dxf <input.dxf> [output-base-path] | kairo stage-viewer-scene <scene-path> <scene-name> | kairo scene-outliers <scene-path> [--top N]";
  io.stderr(`Kairo command failed\n- ERROR UNKNOWN_COMMAND: ${message}\n`);
  return 1;
}

const isDirectExecution = process.argv[1] ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) : false;

if (isDirectExecution) {
  const exitCode = await runCli(process.argv.slice(2));
  process.exitCode = exitCode;
}
