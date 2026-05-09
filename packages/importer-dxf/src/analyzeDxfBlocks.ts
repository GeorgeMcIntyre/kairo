import { Parser, type DxfGlobalObject } from "@dxfjs/parser";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { preCleanDxfText, type DxfPreCleanReport } from "./preCleanDxf";

export type DxfBlockExpansionClassification =
  | "safe now"
  | "safe after POLYLINE support"
  | "blocked by nested INSERT"
  | "blocked by unsupported entity types"
  | "blocked by transform complexity"
  | "missing block definition";

export type DxfBlockTransformComplexity = {
  nonUniformScale: number;
  negativeScale: number;
  rotation: number;
  zOffset: number;
};

export type DxfInsertedBlockSummary = {
  blockName: string;
  insertCount: number;
  layerNames: string[];
  insertionPointSamples: Array<{ x: number; y: number; z: number }>;
  scaleSamples: Array<{ xScale: number; yScale: number; zScale: number }>;
  rotationSamples: number[];
  handleSamples: string[];
  blockDefinitionEntityTypeCounts: Record<string, number>;
  classificationCounts: Record<DxfBlockExpansionClassification, number>;
  transformComplexity: DxfBlockTransformComplexity;
};

export type DxfBlockDefinitionSummary = {
  blockName: string;
  usageCount: number;
  containedEntityTypeCounts: Record<string, number>;
  layerNames: string[];
  hasNestedInsert: boolean;
  hasAttdefAttribTextMtext: boolean;
  hasUnsupportedEntityTypes: boolean;
  transformComplexity: DxfBlockTransformComplexity;
  classification: DxfBlockExpansionClassification;
};

export type DxfBlockInsertInventory = {
  filePath: string;
  parser: {
    ok: boolean;
    error?: {
      name: string;
      message: string;
    };
  };
  preCleanReport: Pick<
    DxfPreCleanReport,
    "enabled" | "removedAcadReactorsCount" | "appendedMissingEof" | "originalLineCount" | "cleanedLineCount" | "warnings"
  >;
  layerCount: number;
  totalEntitiesByType: Record<string, number>;
  totalInsertCount: number;
  uniqueInsertBlockNameCount: number;
  insertCountsByBlockName: Record<string, number>;
  blockDefinitionCount: number;
  blockDefinitionsByName: Record<string, DxfBlockDefinitionSummary>;
  missingBlockDefinitions: string[];
  nestedInsertCountInsideBlocks: number;
  safeExpansionClassificationCounts: Record<DxfBlockExpansionClassification, number>;
  topInsertedBlockNames: DxfInsertedBlockSummary[];
};

type ParsedEntity = {
  handle?: string;
  layerName?: string;
  blockName?: string;
  name?: string;
  x?: number;
  y?: number;
  z?: number;
  xScale?: number;
  yScale?: number;
  zScale?: number;
  rotation?: number;
};

type ParsedEntities = Record<string, ParsedEntity[] | undefined>;

type ParsedBlock = {
  name?: string;
  layerName?: string;
  entities?: ParsedEntities;
};

const supportedNow = new Set(["LINE", "ARC", "CIRCLE", "LWPOLYLINE"]);
const supportedAfterPolyline = new Set([...supportedNow, "POLYLINE"]);
const textLikeTypes = new Set(["ATTDEF", "ATTRIB", "TEXT", "MTEXT"]);

const entityTypeKeys = [
  ["POINT", "points"],
  ["ARC", "arcs"],
  ["ATTDEF", "attdefs"],
  ["ATTRIB", "attribs"],
  ["3DFACE", "face3ds"],
  ["3DSOLID", "solid3ds"],
  ["SOLID", "solids"],
  ["CIRCLE", "circles"],
  ["ELLIPSE", "ellipses"],
  ["INSERT", "inserts"],
  ["LWPOLYLINE", "lwPolylines"],
  ["POLYLINE", "polylines"],
  ["LINE", "lines"],
  ["TEXT", "texts"],
  ["SPLINE", "splines"],
  ["MTEXT", "mtexts"]
] as const;

const emptyClassificationCounts = (): Record<DxfBlockExpansionClassification, number> => ({
  "safe now": 0,
  "safe after POLYLINE support": 0,
  "blocked by nested INSERT": 0,
  "blocked by unsupported entity types": 0,
  "blocked by transform complexity": 0,
  "missing block definition": 0
});

const emptyTransformComplexity = (): DxfBlockTransformComplexity => ({
  nonUniformScale: 0,
  negativeScale: 0,
  rotation: 0,
  zOffset: 0
});

const round = (value: number) => Number(value.toFixed(6));
const sortAlpha = (a: string, b: string) => a.localeCompare(b);
const blockNameForInsert = (insert: ParsedEntity) => insert.blockName ?? insert.name ?? "<missing-block-name>";

function parsedEntities(parsed: DxfGlobalObject): ParsedEntities {
  return parsed.entities as unknown as ParsedEntities;
}

function parsedBlocks(parsed: DxfGlobalObject): ParsedBlock[] {
  return (parsed.blocks ?? []) as unknown as ParsedBlock[];
}

function entityCountMap(entities: ParsedEntities | undefined) {
  const counts: Record<string, number> = {};

  for (const [type, key] of entityTypeKeys) {
    const count = entities?.[key]?.length ?? 0;
    if (count > 0) {
      counts[type] = count;
    }
  }

  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function entityLayers(entities: ParsedEntities | undefined) {
  const layers = new Set<string>();
  for (const [, key] of entityTypeKeys) {
    for (const entity of entities?.[key] ?? []) {
      layers.add(entity.layerName ?? "0");
    }
  }
  return [...layers].sort(sortAlpha);
}

function hasUnsupportedEntityTypes(counts: Record<string, number>, supportedTypes: Set<string>) {
  return Object.entries(counts).some(([type, count]) => count > 0 && !supportedTypes.has(type));
}

function hasTextLikeEntityTypes(counts: Record<string, number>) {
  return Object.entries(counts).some(([type, count]) => count > 0 && textLikeTypes.has(type));
}

function scaleFor(insert: ParsedEntity) {
  return {
    xScale: insert.xScale ?? 1,
    yScale: insert.yScale ?? 1,
    zScale: insert.zScale ?? 1
  };
}

function transformComplexityForInsert(insert: ParsedEntity) {
  const scale = scaleFor(insert);
  const nonUniformScale = Math.abs(scale.xScale - scale.yScale) > 1e-9 || Math.abs(scale.xScale - scale.zScale) > 1e-9;
  const negativeScale = scale.xScale < 0 || scale.yScale < 0 || scale.zScale < 0;
  const rotation = Math.abs(insert.rotation ?? 0) > 1e-9;
  const zOffset = Math.abs(insert.z ?? 0) > 1e-9;

  return {
    nonUniformScale,
    negativeScale,
    rotation,
    zOffset
  };
}

function addTransformComplexity(total: DxfBlockTransformComplexity, insert: ParsedEntity) {
  const complexity = transformComplexityForInsert(insert);
  if (complexity.nonUniformScale) total.nonUniformScale += 1;
  if (complexity.negativeScale) total.negativeScale += 1;
  if (complexity.rotation) total.rotation += 1;
  if (complexity.zOffset) total.zOffset += 1;
}

function hasTransformComplexity(insert: ParsedEntity) {
  const complexity = transformComplexityForInsert(insert);
  return complexity.nonUniformScale || complexity.negativeScale || complexity.zOffset;
}

function classifyInsert(insert: ParsedEntity, block: ParsedBlock | undefined): DxfBlockExpansionClassification {
  if (!block) {
    return "missing block definition";
  }

  const counts = entityCountMap(block.entities);
  if ((counts.INSERT ?? 0) > 0) {
    return "blocked by nested INSERT";
  }

  if (hasTransformComplexity(insert)) {
    return "blocked by transform complexity";
  }

  if (!hasUnsupportedEntityTypes(counts, supportedNow)) {
    return "safe now";
  }

  if (!hasUnsupportedEntityTypes(counts, supportedAfterPolyline)) {
    return "safe after POLYLINE support";
  }

  return "blocked by unsupported entity types";
}

function classificationForBlock(
  usageCount: number,
  counts: Record<string, number>,
  transformComplexity: DxfBlockTransformComplexity
): DxfBlockExpansionClassification {
  if (usageCount === 0) {
    return hasUnsupportedEntityTypes(counts, supportedNow) ? "blocked by unsupported entity types" : "safe now";
  }

  if ((counts.INSERT ?? 0) > 0) {
    return "blocked by nested INSERT";
  }

  if (
    transformComplexity.nonUniformScale > 0 ||
    transformComplexity.negativeScale > 0 ||
    transformComplexity.zOffset > 0
  ) {
    return "blocked by transform complexity";
  }

  if (!hasUnsupportedEntityTypes(counts, supportedNow)) {
    return "safe now";
  }

  if (!hasUnsupportedEntityTypes(counts, supportedAfterPolyline)) {
    return "safe after POLYLINE support";
  }

  return "blocked by unsupported entity types";
}

function layerCount(parsed: DxfGlobalObject) {
  const layers = new Set<string>();
  const records = parsed.tables?.layer?.records ?? [];
  for (const record of records) {
    if (record.name) {
      layers.add(record.name);
    }
  }
  for (const [, key] of entityTypeKeys) {
    for (const entity of parsedEntities(parsed)[key] ?? []) {
      layers.add(entity.layerName ?? "0");
    }
  }
  return layers.size;
}

function blockUsageByName(inserts: ParsedEntity[]) {
  const usage = new Map<string, ParsedEntity[]>();
  for (const insert of inserts) {
    const blockName = blockNameForInsert(insert);
    usage.set(blockName, [...(usage.get(blockName) ?? []), insert]);
  }
  return usage;
}

function summarizeInsertedBlocks(usage: Map<string, ParsedEntity[]>, blocksByName: Map<string, ParsedBlock>) {
  const summaries: DxfInsertedBlockSummary[] = [];

  for (const [blockName, inserts] of usage.entries()) {
    const block = blocksByName.get(blockName);
    const layerNames = new Set<string>();
    const insertionPointSamples: DxfInsertedBlockSummary["insertionPointSamples"] = [];
    const scaleSamples: DxfInsertedBlockSummary["scaleSamples"] = [];
    const rotationSamples: number[] = [];
    const handleSamples: string[] = [];
    const classificationCounts = emptyClassificationCounts();
    const transformComplexity = emptyTransformComplexity();

    for (const insert of inserts) {
      layerNames.add(insert.layerName ?? "0");
      if (insertionPointSamples.length < 5) {
        insertionPointSamples.push({ x: round(insert.x ?? 0), y: round(insert.y ?? 0), z: round(insert.z ?? 0) });
      }
      if (scaleSamples.length < 5) {
        const scale = scaleFor(insert);
        scaleSamples.push({ xScale: round(scale.xScale), yScale: round(scale.yScale), zScale: round(scale.zScale) });
      }
      if (rotationSamples.length < 5) {
        rotationSamples.push(round(insert.rotation ?? 0));
      }
      if (handleSamples.length < 5 && insert.handle) {
        handleSamples.push(insert.handle);
      }
      addTransformComplexity(transformComplexity, insert);
      classificationCounts[classifyInsert(insert, block)] += 1;
    }

    summaries.push({
      blockName,
      insertCount: inserts.length,
      layerNames: [...layerNames].sort(sortAlpha),
      insertionPointSamples,
      scaleSamples,
      rotationSamples,
      handleSamples,
      blockDefinitionEntityTypeCounts: entityCountMap(block?.entities),
      classificationCounts,
      transformComplexity
    });
  }

  return summaries.sort((a, b) => b.insertCount - a.insertCount || a.blockName.localeCompare(b.blockName));
}

function summarizeBlockDefinitions(blocks: ParsedBlock[], usage: Map<string, ParsedEntity[]>) {
  const summaries: Record<string, DxfBlockDefinitionSummary> = {};

  for (const block of [...blocks].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))) {
    const blockName = block.name ?? "<unnamed-block>";
    const inserts = usage.get(blockName) ?? [];
    const transformComplexity = emptyTransformComplexity();
    for (const insert of inserts) {
      addTransformComplexity(transformComplexity, insert);
    }
    const containedEntityTypeCounts = entityCountMap(block.entities);

    summaries[blockName] = {
      blockName,
      usageCount: inserts.length,
      containedEntityTypeCounts,
      layerNames: entityLayers(block.entities),
      hasNestedInsert: (containedEntityTypeCounts.INSERT ?? 0) > 0,
      hasAttdefAttribTextMtext: hasTextLikeEntityTypes(containedEntityTypeCounts),
      hasUnsupportedEntityTypes: hasUnsupportedEntityTypes(containedEntityTypeCounts, supportedNow),
      transformComplexity,
      classification: classificationForBlock(inserts.length, containedEntityTypeCounts, transformComplexity)
    };
  }

  return summaries;
}

function inventoryFromParsed(filePath: string, preCleanReport: DxfPreCleanReport, parsed: DxfGlobalObject): DxfBlockInsertInventory {
  const entities = parsedEntities(parsed);
  const inserts = entities.inserts ?? [];
  const blocks = parsedBlocks(parsed);
  const blocksByName = new Map(blocks.map((block) => [block.name ?? "<unnamed-block>", block]));
  const usage = blockUsageByName(inserts);
  const topInsertedBlockNames = summarizeInsertedBlocks(usage, blocksByName);
  const safeExpansionClassificationCounts = emptyClassificationCounts();

  for (const summary of topInsertedBlockNames) {
    for (const [classification, count] of Object.entries(summary.classificationCounts) as Array<[DxfBlockExpansionClassification, number]>) {
      safeExpansionClassificationCounts[classification] += count;
    }
  }

  const insertCountsByBlockName = Object.fromEntries(
    [...usage.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([blockName, blockInserts]) => [blockName, blockInserts.length])
  );

  return {
    filePath,
    parser: {
      ok: true
    },
    preCleanReport: {
      enabled: preCleanReport.enabled,
      removedAcadReactorsCount: preCleanReport.removedAcadReactorsCount,
      appendedMissingEof: preCleanReport.appendedMissingEof,
      originalLineCount: preCleanReport.originalLineCount,
      cleanedLineCount: preCleanReport.cleanedLineCount,
      warnings: preCleanReport.warnings
    },
    layerCount: layerCount(parsed),
    totalEntitiesByType: entityCountMap(entities),
    totalInsertCount: inserts.length,
    uniqueInsertBlockNameCount: usage.size,
    insertCountsByBlockName,
    blockDefinitionCount: blocks.length,
    blockDefinitionsByName: summarizeBlockDefinitions(blocks, usage),
    missingBlockDefinitions: [...usage.keys()].filter((blockName) => !blocksByName.has(blockName)).sort(sortAlpha),
    nestedInsertCountInsideBlocks: blocks.reduce((count, block) => count + (block.entities?.inserts?.length ?? 0), 0),
    safeExpansionClassificationCounts,
    topInsertedBlockNames: topInsertedBlockNames.slice(0, 25)
  };
}

export async function analyzeDxfBlocks(inputPath: string): Promise<DxfBlockInsertInventory> {
  const absolutePath = path.resolve(inputPath);
  const input = await readFile(absolutePath, "utf8");
  const preCleaned = preCleanDxfText(input);

  try {
    const parsed = await new Parser().parse(preCleaned.text);
    return inventoryFromParsed(absolutePath, preCleaned.report, parsed);
  } catch (error) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    return {
      filePath: absolutePath,
      parser: {
        ok: false,
        error: {
          name: normalized.name,
          message: normalized.message
        }
      },
      preCleanReport: {
        enabled: preCleaned.report.enabled,
        removedAcadReactorsCount: preCleaned.report.removedAcadReactorsCount,
        appendedMissingEof: preCleaned.report.appendedMissingEof,
        originalLineCount: preCleaned.report.originalLineCount,
        cleanedLineCount: preCleaned.report.cleanedLineCount,
        warnings: preCleaned.report.warnings
      },
      layerCount: 0,
      totalEntitiesByType: {},
      totalInsertCount: 0,
      uniqueInsertBlockNameCount: 0,
      insertCountsByBlockName: {},
      blockDefinitionCount: 0,
      blockDefinitionsByName: {},
      missingBlockDefinitions: [],
      nestedInsertCountInsideBlocks: 0,
      safeExpansionClassificationCounts: emptyClassificationCounts(),
      topInsertedBlockNames: []
    };
  }
}

export function renderDxfBlockInventoryMarkdown(inventory: DxfBlockInsertInventory) {
  const lines = [
    "# DXF Block/Insert Inventory",
    "",
    `Input: ${inventory.filePath}`,
    "",
    "## Summary",
    "",
    `- Parser ok: ${inventory.parser.ok}`,
    `- Layers: ${inventory.layerCount}`,
    `- INSERT entities: ${inventory.totalInsertCount}`,
    `- Unique INSERT block names: ${inventory.uniqueInsertBlockNameCount}`,
    `- BLOCK definitions: ${inventory.blockDefinitionCount}`,
    `- Missing block definitions: ${inventory.missingBlockDefinitions.length}`,
    `- Nested INSERTs inside block definitions: ${inventory.nestedInsertCountInsideBlocks}`,
    "",
    "## Safe Expansion Classification",
    "",
    ...Object.entries(inventory.safeExpansionClassificationCounts).map(([classification, count]) => `- ${classification}: ${count}`),
    "",
    "## Total Entities By Type",
    "",
    ...Object.entries(inventory.totalEntitiesByType).map(([type, count]) => `- ${type}: ${count}`),
    "",
    "## Missing Block Definitions",
    "",
    inventory.missingBlockDefinitions.length > 0 ? inventory.missingBlockDefinitions.map((name) => `- ${name}`).join("\n") : "None.",
    "",
    "## Top 25 Inserted Blocks",
    "",
    "| block | inserts | layers | sample insertion | sample scale | sample rotation | sample handles | contained entity types | classification |",
    "| --- | ---: | --- | --- | --- | --- | --- | --- | --- |",
    ...inventory.topInsertedBlockNames.map((entry) =>
      [
        entry.blockName,
        String(entry.insertCount),
        entry.layerNames.join(", "),
        JSON.stringify(entry.insertionPointSamples[0] ?? null),
        JSON.stringify(entry.scaleSamples[0] ?? null),
        JSON.stringify(entry.rotationSamples[0] ?? null),
        entry.handleSamples.join(", "),
        JSON.stringify(entry.blockDefinitionEntityTypeCounts),
        JSON.stringify(Object.fromEntries(Object.entries(entry.classificationCounts).filter(([, count]) => count > 0)))
      ]
        .map((value) => value.replace(/\|/g, "\\|"))
        .join(" | ")
    ).map((row) => `| ${row} |`)
  ];

  if (!inventory.parser.ok && inventory.parser.error) {
    lines.push("", "## Parser Error", "", `- ${inventory.parser.error.name}: ${inventory.parser.error.message}`);
  }

  return `${lines.join("\n")}\n`;
}

export async function writeDxfBlockInventoryReports(inventory: DxfBlockInsertInventory, outputBasePath: string): Promise<void> {
  await Promise.all([
    writeFile(`${outputBasePath}.json`, `${JSON.stringify(inventory, null, 2)}\n`),
    writeFile(`${outputBasePath}.md`, renderDxfBlockInventoryMarkdown(inventory))
  ]);
}
