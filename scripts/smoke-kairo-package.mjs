import { spawnSync } from "node:child_process";
import { mkdir, readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultScenePath = path.join(repoRoot, "apps", "viewer", "public", "scenes", "scott-dxf2013-import");
const defaultPackagePath = path.join(repoRoot, "tmp", "scott-dxf2013-import.kairo");
const cliPath = path.join(repoRoot, "packages", "cli", "dist", "index.js");
const coreRequire = createRequire(path.join(repoRoot, "packages", "core", "package.json"));
const { strFromU8, unzipSync } = coreRequire("fflate");

function usage() {
  return [
    "Usage: node scripts/smoke-kairo-package.mjs [scene-path] [output.kairo] [--json]",
    "",
    "Creates and validates the Scott `.kairo` sharing package, then inspects the ZIP package index and scene counts.",
    "",
    `Default scene: ${path.relative(repoRoot, defaultScenePath)}`,
    `Default output: ${path.relative(repoRoot, defaultPackagePath)}`
  ].join("\n");
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(usage());
  process.exit(0);
}

const asJson = args.includes("--json");
const positional = args.filter((arg) => !arg.startsWith("--"));
const scenePath = path.resolve(positional[0] ?? defaultScenePath);
const packagePath = path.resolve(positional[1] ?? defaultPackagePath);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function relativePath(value) {
  return path.relative(repoRoot, value) || ".";
}

function runCli(cliArgs) {
  const result = spawnSync(process.execPath, [cliPath, ...cliArgs], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(
      [
        `CLI failed: node ${relativePath(cliPath)} ${cliArgs.join(" ")}`,
        result.stdout.trim(),
        result.stderr.trim()
      ]
        .filter(Boolean)
        .join("\n")
    );
  }
  return result.stdout;
}

function readJsonEntry(entries, entryPath) {
  const bytes = entries[entryPath];
  assert(bytes, `Package is missing ${entryPath}`);
  const text = strFromU8(bytes);
  return JSON.parse(text.startsWith("\uFEFF") ? text.slice(1) : text);
}

function countEntities(geometryDocuments) {
  let geometryCount = 0;
  let curveSetCount = 0;
  let meshCount = 0;
  let drawingEntityCount = 0;
  let textEntityCount = 0;
  for (const document of geometryDocuments) {
    for (const geometry of document.geometries ?? []) {
      geometryCount += 1;
      if (geometry.kind === "curve-set") {
        curveSetCount += 1;
        for (const entity of geometry.entities ?? []) {
          drawingEntityCount += 1;
          if (entity.type === "text") {
            textEntityCount += 1;
          }
        }
      } else if (geometry.kind === "mesh") {
        meshCount += 1;
      }
    }
  }
  return {
    geometryCount,
    curveSetCount,
    meshCount,
    drawingEntityCount,
    curveEntityCount: drawingEntityCount - textEntityCount,
    textEntityCount
  };
}

await mkdir(path.dirname(packagePath), { recursive: true });
runCli(["pack-scene", scenePath, packagePath]);
const validation = JSON.parse(runCli(["validate", packagePath, "--json"]));

assert(validation.valid === true, "CLI validation did not mark the package valid");
assert(validation.summary?.errors === 0, `Validation found ${validation.summary?.errors} error(s)`);
assert(validation.summary?.warnings === 0, `Validation found ${validation.summary?.warnings} warning(s)`);
assert(validation.summary?.infos === 0, `Validation found ${validation.summary?.infos} info item(s)`);

const bytes = await readFile(packagePath);
const fileStats = await stat(packagePath);
const entries = unzipSync(bytes);
const entryNames = Object.keys(entries).sort((a, b) => a.localeCompare(b));
const packageIndex = readJsonEntry(entries, "kairo-package.json");

assert(packageIndex.format === "kairo-package", `Unexpected package format: ${packageIndex.format}`);
assert(packageIndex.version === "0.1.0", `Unexpected package version: ${packageIndex.version}`);

const expectedEntries = [
  packageIndex.scene.manifest,
  packageIndex.scene.scene,
  packageIndex.scene.layers,
  packageIndex.scene.materials,
  packageIndex.scene.sourceMap,
  ...packageIndex.scene.geometry
];
for (const entryPath of expectedEntries) {
  assert(entries[entryPath], `Package index references missing entry: ${entryPath}`);
}

assert(
  packageIndex.scene.geometry.length === validation.scene.geometryCount,
  `Package index geometry count ${packageIndex.scene.geometry.length} did not match validation count ${validation.scene.geometryCount}`
);

const scene = readJsonEntry(entries, packageIndex.scene.scene);
const layers = readJsonEntry(entries, packageIndex.scene.layers);
const sourceMap = readJsonEntry(entries, packageIndex.scene.sourceMap);
const geometryDocuments = packageIndex.scene.geometry.map((entryPath) => readJsonEntry(entries, entryPath));
const entityCounts = countEntities(geometryDocuments);

assert(scene.nodes.length === validation.scene.nodeCount, "Scene node count did not match CLI validation");
assert(geometryDocuments.length === validation.scene.geometryCount, "Geometry document count did not match CLI validation");

const result = {
  packagePath: relativePath(packagePath),
  packageBytes: fileStats.size,
  validation: {
    valid: validation.valid,
    errors: validation.summary.errors,
    warnings: validation.summary.warnings,
    infos: validation.summary.infos,
    rootName: validation.scene.rootName,
    nodeCount: validation.scene.nodeCount,
    geometryDocuments: validation.scene.geometryCount
  },
  archive: {
    entries: entryNames.length,
    requiredEntries: expectedEntries.length + 1,
    geometryEntries: packageIndex.scene.geometry.length,
    format: packageIndex.format,
    version: packageIndex.version
  },
  scene: {
    nodes: scene.nodes.length,
    layers: layers.layers.length,
    sourceMapRows: sourceMap.sources.length,
    ...entityCounts
  }
};

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`Kairo package smoke passed for ${result.packagePath}`);
  console.log(`- package size: ${result.packageBytes.toLocaleString("en-US")} bytes`);
  console.log(`- validation: ${result.validation.nodeCount} nodes, ${result.validation.geometryDocuments} geometry documents, 0 findings`);
  console.log(
    `- archive: ${result.archive.entries} entries, ${result.archive.geometryEntries} geometry entries, ${result.archive.format} ${result.archive.version}`
  );
  console.log(
    `- scene counts: ${result.scene.layers} layers, ${result.scene.sourceMapRows} source-map rows, ` +
      `${result.scene.curveEntityCount} curve entities, ${result.scene.textEntityCount} text entities`
  );
}
