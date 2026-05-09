import { flattenGeometry } from "@kairo/core";
import { importDxfToKairo, writeScenePackage } from "@kairo/importer-dxf";
import type { GeometryDocument, ScenePackage, ValidationReport } from "@kairo/schema";
import { scenePackageSchema } from "@kairo/schema";
import { validateScenePackage } from "@kairo/validator";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

export async function runCli(argv: string[], io: CliIo = defaultIo): Promise<number> {
  const [command, ...args] = argv;

  if (command === "validate") {
    return validateCommand(args, io);
  }

  if (command === "import-dxf") {
    return importDxfCommand(args, io);
  }

  const message = "Usage: kairo validate <scene-path> [--json] | kairo import-dxf <input.dxf> <output-dir>";
  io.stderr(`Kairo command failed\n- ERROR UNKNOWN_COMMAND: ${message}\n`);
  return 1;
}

const isDirectExecution = process.argv[1] ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) : false;

if (isDirectExecution) {
  const exitCode = await runCli(process.argv.slice(2));
  process.exitCode = exitCode;
}
