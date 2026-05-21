import { computeRobustSceneBounds, flattenCurveEntities, readKairoPackage } from "@kairo/core";
import { readFile, writeFile } from "node:fs/promises";
import { exportScenePackageToCadExchangerGlb, type CadExchangerGlbExportOptions } from "../apps/viewer/src/cadExchangerGlb.ts";

type CliOptions = {
  input?: string;
  output?: string;
  stats?: string;
  settingsJson?: string;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--input") {
      options.input = value;
      index += 1;
    } else if (arg === "--output") {
      options.output = value;
      index += 1;
    } else if (arg === "--stats") {
      options.stats = value;
      index += 1;
    } else if (arg === "--settings-json") {
      options.settingsJson = value;
      index += 1;
    }
  }
  return options;
}

function usage(): never {
  throw new Error(
    "Usage: pnpm exec tsx tools/export-kairo-package-cadex-glb.ts --input scene.kairo --output scene.glb --stats scene.stats.json --settings-json '{...}'"
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.input || !options.output || !options.stats) usage();

  const settings = options.settingsJson
    ? (JSON.parse(options.settingsJson) as CadExchangerGlbExportOptions & { includeOutliers?: boolean })
    : {};
  const scenePackage = readKairoPackage(await readFile(options.input)).scenePackage;
  const excludedEntityIds =
    settings.includeOutliers === true
      ? undefined
      : new Set(computeRobustSceneBounds(flattenCurveEntities(scenePackage.geometry)).outlierEntityIds);
  const result = exportScenePackageToCadExchangerGlb(scenePackage, {
    ...settings,
    excludedEntityIds
  });
  await writeFile(options.output, result.bytes);
  await writeFile(
    options.stats,
    `${JSON.stringify({ filename: result.filename, stats: result.stats }, null, 2)}\n`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
