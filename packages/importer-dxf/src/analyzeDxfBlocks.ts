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

export type DxfEquipmentBlockMatch = {
  blockName: string;
  matchedPattern: string;
  insertCount: number;
  entityTypeCounts: Record<string, number>;
  classification: DxfBlockExpansionClassification;
};

export type DxfTransformAuditSummary = {
  totalHardBlocked: number;
  flagCounts: {
    negativeX: number;
    negativeY: number;
    negativeZ: number;
    nonUniform: number;
    negativeDet: number;
    hasRotation: number;
    zOffsetAlso: number;
  };
  categoryCounts: {
    pureNegativeUniform: number;
    pureNonUniformPositive: number;
    nonUniformNegative: number;
    other: number;
  };
  optionUnlocks: {
    optionA: number;
    optionB: number;
    optionC: number;
  };
  topBlockedBlocks: Array<{
    blockName: string;
    insertCount: number;
    sampleScale: { xScale: number; yScale: number; zScale: number };
    sampleRotation: number;
    category: string;
  }>;
  blockedEquipmentBlocks: Array<{
    blockName: string;
    matchedPattern: string;
    insertCount: number;
    category: string;
  }>;
};

export type DxfTextAuditSummary = {
  totalTextCount: number;
  totalMTextCount: number;
  totalAttdefCount: number;
  totalAttribCount: number;
  inDirectEntities: { TEXT: number; MTEXT: number; ATTDEF: number; ATTRIB: number };
  inBlockDefinitions: { TEXT: number; MTEXT: number; ATTDEF: number; ATTRIB: number };
  topTextBlocks: Array<{ blockName: string; usageCount: number; textCount: number; attdefCount: number; attribCount: number; mtextCount: number }>;
  topTextLayers: Array<{ layerName: string; count: number }>;
  sampleTextStrings: Array<{ source: string; text: string }>;
  equipmentBlockMatches: DxfEquipmentBlockMatch[];
  hardTransformTextBlocks: Array<{ blockName: string; insertCount: number; textCount: number; attdefCount: number }>;
  partialExpandTextSkipped: Array<{ blockName: string; insertCount: number; textCount: number; attdefCount: number }>;
};

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
  textAudit: DxfTextAuditSummary;
  transformAudit: DxfTransformAuditSummary;
};

type ParsedTextLike = {
  text?: string;
  value?: string;
  tag?: string;
  layerName?: string;
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

const EQUIPMENT_PATTERNS = ["FANUC", "ROBOT", "CONTROLLER", "RBT", "HENROB", "PV-R", "PDP", "LIFT", "TILT", "SPAC", "RESPOT"];
const supportedGeometryForPartialExpand = new Set(["LINE", "LWPOLYLINE", "CIRCLE", "ARC", "POLYLINE"]);

const emptyTransformAudit = (): DxfTransformAuditSummary => ({
  totalHardBlocked: 0,
  flagCounts: { negativeX: 0, negativeY: 0, negativeZ: 0, nonUniform: 0, negativeDet: 0, hasRotation: 0, zOffsetAlso: 0 },
  categoryCounts: { pureNegativeUniform: 0, pureNonUniformPositive: 0, nonUniformNegative: 0, other: 0 },
  optionUnlocks: { optionA: 0, optionB: 0, optionC: 0 },
  topBlockedBlocks: [],
  blockedEquipmentBlocks: []
});

function categorizeHardBlockedInsert(sx: number, sy: number, sz: number): keyof DxfTransformAuditSummary["categoryCounts"] {
  const absSx = Math.abs(sx);
  const absSy = Math.abs(sy);
  const absSz = Math.abs(sz);
  const uniformMag = Math.abs(absSx - absSy) < 1e-9 && Math.abs(absSx - absSz) < 1e-9;
  const anyNegative = sx < 0 || sy < 0 || sz < 0;
  const allNonNegative = sx >= 0 && sy >= 0 && sz >= 0;

  if (anyNegative && uniformMag) return "pureNegativeUniform";
  if (allNonNegative) return "pureNonUniformPositive";
  if (anyNegative && !uniformMag) return "nonUniformNegative";
  return "other";
}

function computeTransformAudit(inserts: ParsedEntity[]): DxfTransformAuditSummary {
  const flagCounts: DxfTransformAuditSummary["flagCounts"] = {
    negativeX: 0, negativeY: 0, negativeZ: 0, nonUniform: 0, negativeDet: 0, hasRotation: 0, zOffsetAlso: 0
  };
  const categoryCounts: DxfTransformAuditSummary["categoryCounts"] = {
    pureNegativeUniform: 0, pureNonUniformPositive: 0, nonUniformNegative: 0, other: 0
  };

  const blockedByBlock = new Map<string, { count: number; category: string; sampleScale: { xScale: number; yScale: number; zScale: number }; sampleRotation: number }>();

  for (const insert of inserts) {
    const sx = insert.xScale ?? 1;
    const sy = insert.yScale ?? 1;
    const sz = insert.zScale ?? 1;
    const isNonUniform = Math.abs(sx - sy) > 1e-9 || Math.abs(sx - sz) > 1e-9;
    const isNegative = sx < 0 || sy < 0 || sz < 0;

    if (!isNonUniform && !isNegative) continue;

    if (sx < 0) flagCounts.negativeX++;
    if (sy < 0) flagCounts.negativeY++;
    if (sz < 0) flagCounts.negativeZ++;
    if (isNonUniform) flagCounts.nonUniform++;
    const negCount = (sx < 0 ? 1 : 0) + (sy < 0 ? 1 : 0) + (sz < 0 ? 1 : 0);
    if (negCount % 2 === 1) flagCounts.negativeDet++;
    if (Math.abs(insert.rotation ?? 0) > 1e-9) flagCounts.hasRotation++;
    if (Math.abs(insert.z ?? 0) > 1e-9) flagCounts.zOffsetAlso++;

    const category = categorizeHardBlockedInsert(sx, sy, sz);
    categoryCounts[category]++;

    const blockName = blockNameForInsert(insert);
    if (!blockedByBlock.has(blockName)) {
      blockedByBlock.set(blockName, { count: 0, category, sampleScale: { xScale: round(sx), yScale: round(sy), zScale: round(sz) }, sampleRotation: round(insert.rotation ?? 0) });
    }
    blockedByBlock.get(blockName)!.count++;
  }

  const totalHardBlocked = Object.values(categoryCounts).reduce((a, b) => a + b, 0);

  const topBlockedBlocks = [...blockedByBlock.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .slice(0, 20)
    .map(([blockName, info]) => ({ blockName, insertCount: info.count, sampleScale: info.sampleScale, sampleRotation: info.sampleRotation, category: info.category }));

  const blockedEquipmentBlocks: DxfTransformAuditSummary["blockedEquipmentBlocks"] = [];
  for (const [blockName, info] of blockedByBlock.entries()) {
    const upper = blockName.toUpperCase();
    for (const pattern of EQUIPMENT_PATTERNS) {
      if (upper.includes(pattern)) {
        blockedEquipmentBlocks.push({ blockName, matchedPattern: pattern, insertCount: info.count, category: info.category });
        break;
      }
    }
  }

  return {
    totalHardBlocked,
    flagCounts,
    categoryCounts,
    optionUnlocks: {
      optionA: categoryCounts.pureNegativeUniform,
      optionB: categoryCounts.pureNonUniformPositive,
      optionC: totalHardBlocked
    },
    topBlockedBlocks,
    blockedEquipmentBlocks: blockedEquipmentBlocks.sort((a, b) => b.insertCount - a.insertCount || a.blockName.localeCompare(b.blockName)).slice(0, 25)
  };
}

const emptyTextAudit = (): DxfTextAuditSummary => ({
  totalTextCount: 0,
  totalMTextCount: 0,
  totalAttdefCount: 0,
  totalAttribCount: 0,
  inDirectEntities: { TEXT: 0, MTEXT: 0, ATTDEF: 0, ATTRIB: 0 },
  inBlockDefinitions: { TEXT: 0, MTEXT: 0, ATTDEF: 0, ATTRIB: 0 },
  topTextBlocks: [],
  topTextLayers: [],
  sampleTextStrings: [],
  equipmentBlockMatches: [],
  hardTransformTextBlocks: [],
  partialExpandTextSkipped: []
});

function textEntitiesFor(entities: ParsedEntities | undefined, key: string): ParsedTextLike[] {
  return (entities?.[key] ?? []) as unknown as ParsedTextLike[];
}

function computeTextAudit(
  blocks: ParsedBlock[],
  entities: ParsedEntities,
  usage: Map<string, ParsedEntity[]>,
  blocksByName: Map<string, ParsedBlock>,
  blockDefinitionsByName: Record<string, DxfBlockDefinitionSummary>
): DxfTextAuditSummary {
  // Direct entity counts
  const directText = textEntitiesFor(entities, "texts");
  const directMText = textEntitiesFor(entities, "mtexts");
  const directAttdef = textEntitiesFor(entities, "attdefs");
  const directAttrib = textEntitiesFor(entities, "attribs");

  // Layer text counts (across all block definitions)
  const layerCounts = new Map<string, number>();
  const sampleTextStrings: Array<{ source: string; text: string }> = [];

  // Block-level text accumulation
  const topTextBlocks: DxfTextAuditSummary["topTextBlocks"] = [];
  let blockTotalText = 0, blockTotalMText = 0, blockTotalAttdef = 0, blockTotalAttrib = 0;

  for (const block of [...blocks].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))) {
    const blockName = block.name ?? "<unnamed-block>";
    const blockTexts = textEntitiesFor(block.entities, "texts");
    const blockMTexts = textEntitiesFor(block.entities, "mtexts");
    const blockAttdefs = textEntitiesFor(block.entities, "attdefs");
    const blockAttribs = textEntitiesFor(block.entities, "attribs");

    const blockTextTotal = blockTexts.length + blockMTexts.length + blockAttdefs.length + blockAttribs.length;
    if (blockTextTotal === 0) {
      continue;
    }

    blockTotalText += blockTexts.length;
    blockTotalMText += blockMTexts.length;
    blockTotalAttdef += blockAttdefs.length;
    blockTotalAttrib += blockAttribs.length;

    topTextBlocks.push({
      blockName,
      usageCount: usage.get(blockName)?.length ?? 0,
      textCount: blockTexts.length,
      attdefCount: blockAttdefs.length,
      attribCount: blockAttribs.length,
      mtextCount: blockMTexts.length
    });

    // Layer counts
    for (const t of [...blockTexts, ...blockAttdefs, ...blockAttribs]) {
      const layer = t.layerName ?? "0";
      layerCounts.set(layer, (layerCounts.get(layer) ?? 0) + 1);
    }

    // Sample text strings (up to 10)
    for (const t of blockTexts) {
      if (sampleTextStrings.length < 10 && t.text) {
        sampleTextStrings.push({ source: `BLOCK:${blockName}/TEXT`, text: t.text.slice(0, 80) });
      }
    }
    for (const t of blockAttdefs) {
      if (sampleTextStrings.length < 10 && (t.tag ?? t.value)) {
        sampleTextStrings.push({ source: `BLOCK:${blockName}/ATTDEF`, text: `${t.tag ?? ""}=${t.value ?? ""}`.slice(0, 80) });
      }
    }
  }

  // Direct entity samples
  for (const t of directText) {
    if (sampleTextStrings.length < 10 && t.text) {
      sampleTextStrings.push({ source: "ENTITIES/TEXT", text: t.text.slice(0, 80) });
    }
  }

  // Equipment block matches
  const equipmentBlockMatches: DxfEquipmentBlockMatch[] = [];
  for (const [blockName, inserts] of usage.entries()) {
    const upper = blockName.toUpperCase();
    for (const pattern of EQUIPMENT_PATTERNS) {
      if (upper.includes(pattern)) {
        const blockDef = blocksByName.get(blockName);
        equipmentBlockMatches.push({
          blockName,
          matchedPattern: pattern,
          insertCount: inserts.length,
          entityTypeCounts: entityCountMap(blockDef?.entities),
          classification: blockDefinitionsByName[blockName]?.classification ?? "missing block definition"
        });
        break;
      }
    }
  }

  // Hard-transform-blocked blocks that also contain text/attributes
  const hardTransformTextBlocks: DxfTextAuditSummary["hardTransformTextBlocks"] = [];
  for (const [blockName, summary] of Object.entries(blockDefinitionsByName)) {
    if (summary.classification === "blocked by transform complexity" && summary.hasAttdefAttribTextMtext) {
      const c = summary.containedEntityTypeCounts;
      hardTransformTextBlocks.push({
        blockName,
        insertCount: summary.usageCount,
        textCount: (c.TEXT ?? 0) + (c.MTEXT ?? 0),
        attdefCount: c.ATTDEF ?? 0
      });
    }
  }

  // Partial-expand blocks where text was skipped (has text AND has supported geometry AND used)
  const partialExpandTextSkipped: DxfTextAuditSummary["partialExpandTextSkipped"] = [];
  for (const [blockName, summary] of Object.entries(blockDefinitionsByName)) {
    if (!summary.hasAttdefAttribTextMtext || summary.usageCount === 0) {
      continue;
    }
    const c = summary.containedEntityTypeCounts;
    const hasSupportedGeometry = Object.keys(c).some((t) => supportedGeometryForPartialExpand.has(t) && (c[t] ?? 0) > 0);
    if (hasSupportedGeometry) {
      partialExpandTextSkipped.push({
        blockName,
        insertCount: summary.usageCount,
        textCount: (c.TEXT ?? 0) + (c.MTEXT ?? 0),
        attdefCount: c.ATTDEF ?? 0
      });
    }
  }

  return {
    totalTextCount: directText.length + blockTotalText,
    totalMTextCount: directMText.length + blockTotalMText,
    totalAttdefCount: directAttdef.length + blockTotalAttdef,
    totalAttribCount: directAttrib.length + blockTotalAttrib,
    inDirectEntities: {
      TEXT: directText.length,
      MTEXT: directMText.length,
      ATTDEF: directAttdef.length,
      ATTRIB: directAttrib.length
    },
    inBlockDefinitions: {
      TEXT: blockTotalText,
      MTEXT: blockTotalMText,
      ATTDEF: blockTotalAttdef,
      ATTRIB: blockTotalAttrib
    },
    topTextBlocks: topTextBlocks
      .sort((a, b) => (b.textCount + b.attdefCount + b.attribCount + b.mtextCount) - (a.textCount + a.attdefCount + a.attribCount + a.mtextCount) || a.blockName.localeCompare(b.blockName))
      .slice(0, 20),
    topTextLayers: [...layerCounts.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([layerName, count]) => ({ layerName, count })),
    sampleTextStrings,
    equipmentBlockMatches: equipmentBlockMatches
      .sort((a, b) => b.insertCount - a.insertCount || a.blockName.localeCompare(b.blockName))
      .slice(0, 25),
    hardTransformTextBlocks: hardTransformTextBlocks
      .sort((a, b) => b.insertCount - a.insertCount || a.blockName.localeCompare(b.blockName))
      .slice(0, 20),
    partialExpandTextSkipped: partialExpandTextSkipped
      .sort((a, b) => b.insertCount - a.insertCount || a.blockName.localeCompare(b.blockName))
      .slice(0, 20)
  };
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

  const blockDefinitionsByName = summarizeBlockDefinitions(blocks, usage);

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
    blockDefinitionsByName: blockDefinitionsByName,
    missingBlockDefinitions: [...usage.keys()].filter((blockName) => !blocksByName.has(blockName)).sort(sortAlpha),
    nestedInsertCountInsideBlocks: blocks.reduce((count, block) => count + (block.entities?.inserts?.length ?? 0), 0),
    safeExpansionClassificationCounts,
    topInsertedBlockNames: topInsertedBlockNames.slice(0, 25),
    textAudit: computeTextAudit(blocks, entities, usage, blocksByName, blockDefinitionsByName),
    transformAudit: computeTransformAudit(inserts)
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
      topInsertedBlockNames: [],
      textAudit: emptyTextAudit(),
      transformAudit: emptyTransformAudit()
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

  const ta = inventory.textAudit;
  lines.push(
    "",
    "## Text and Attribute Audit",
    "",
    `- TEXT: ${ta.totalTextCount} total (${ta.inDirectEntities.TEXT} direct + ${ta.inBlockDefinitions.TEXT} in blocks)`,
    `- MTEXT: ${ta.totalMTextCount} total (${ta.inDirectEntities.MTEXT} direct + ${ta.inBlockDefinitions.MTEXT} in blocks)`,
    `- ATTDEF: ${ta.totalAttdefCount} total (${ta.inDirectEntities.ATTDEF} direct + ${ta.inBlockDefinitions.ATTDEF} in blocks)`,
    `- ATTRIB: ${ta.totalAttribCount} total (${ta.inDirectEntities.ATTRIB} direct + ${ta.inBlockDefinitions.ATTRIB} in blocks)`,
    "",
    "### Top 20 Blocks by Text/Attribute Count",
    "",
    "| block | usageCount | TEXT | ATTDEF | ATTRIB | MTEXT |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...ta.topTextBlocks.map((b) => `| ${b.blockName} | ${b.usageCount} | ${b.textCount} | ${b.attdefCount} | ${b.attribCount} | ${b.mtextCount} |`),
    "",
    "### Top 10 Layers by Text Entity Count",
    "",
    ...ta.topTextLayers.map((l) => `- ${l.layerName}: ${l.count}`),
    ta.topTextLayers.length === 0 ? "None." : "",
    "",
    "### Sample Text Strings",
    "",
    ...ta.sampleTextStrings.map((s) => `- [${s.source}] ${s.text}`),
    ta.sampleTextStrings.length === 0 ? "None." : "",
    "",
    "### Equipment / Robot Block Matches",
    "",
    "| block | pattern | inserts | classification | entity types |",
    "| --- | --- | ---: | --- | --- |",
    ...ta.equipmentBlockMatches.map((m) => `| ${m.blockName} | ${m.matchedPattern} | ${m.insertCount} | ${m.classification} | ${JSON.stringify(m.entityTypeCounts).replace(/\|/g, "\\|")} |`),
    ta.equipmentBlockMatches.length === 0 ? "None." : "",
    "",
    "### Hard-Transform-Blocked Blocks Containing Text",
    "",
    "| block | inserts | TEXT | ATTDEF |",
    "| --- | ---: | ---: | ---: |",
    ...ta.hardTransformTextBlocks.map((b) => `| ${b.blockName} | ${b.insertCount} | ${b.textCount} | ${b.attdefCount} |`),
    ta.hardTransformTextBlocks.length === 0 ? "None." : "",
    "",
    "### Partial-Expand Blocks Where Text Was Skipped",
    "",
    "| block | inserts | TEXT | ATTDEF |",
    "| --- | ---: | ---: | ---: |",
    ...ta.partialExpandTextSkipped.map((b) => `| ${b.blockName} | ${b.insertCount} | ${b.textCount} | ${b.attdefCount} |`),
    ta.partialExpandTextSkipped.length === 0 ? "None." : ""
  );

  const xa = inventory.transformAudit;
  lines.push(
    "",
    "## Transform Complexity Audit",
    "",
    `Total hard-blocked INSERTs (non-uniform or negative scale): ${xa.totalHardBlocked}`,
    "",
    "### Flag Counts (non-exclusive)",
    "",
    `- Negative X scale: ${xa.flagCounts.negativeX}`,
    `- Negative Y scale: ${xa.flagCounts.negativeY}`,
    `- Negative Z scale: ${xa.flagCounts.negativeZ}`,
    `- Non-uniform scale: ${xa.flagCounts.nonUniform}`,
    `- Negative determinant (odd negative axes): ${xa.flagCounts.negativeDet}`,
    `- Has rotation: ${xa.flagCounts.hasRotation}`,
    `- Z offset also present: ${xa.flagCounts.zOffsetAlso}`,
    "",
    "### Category Counts (exclusive per INSERT)",
    "",
    `- pureNegativeUniform (uniform magnitude, any axes negative → Option A): ${xa.categoryCounts.pureNegativeUniform}`,
    `- pureNonUniformPositive (all positive, non-uniform → Option B): ${xa.categoryCounts.pureNonUniformPositive}`,
    `- nonUniformNegative (non-uniform magnitude + negative → Option C): ${xa.categoryCounts.nonUniformNegative}`,
    `- other: ${xa.categoryCounts.other}`,
    "",
    "### Option Unlock Estimates",
    "",
    `- Option A (negative uniform mirror — apply abs(scale)): ${xa.optionUnlocks.optionA} inserts`,
    `- Option B (non-uniform XY 2D — scale x and y separately): ${xa.optionUnlocks.optionB} inserts`,
    `- Option C (full matrix — unlocks all hard-blocked): ${xa.optionUnlocks.optionC} inserts`,
    "",
    "### Top 20 Blocked Blocks",
    "",
    "| block | inserts | sample scale | sample rotation | category |",
    "| --- | ---: | --- | --- | --- |",
    ...xa.topBlockedBlocks.map((b) => `| ${b.blockName.replace(/\|/g, "\\|")} | ${b.insertCount} | ${JSON.stringify(b.sampleScale)} | ${b.sampleRotation} | ${b.category} |`),
    xa.topBlockedBlocks.length === 0 ? "None." : "",
    "",
    "### Blocked Equipment Blocks",
    "",
    "| block | pattern | inserts | category |",
    "| --- | --- | ---: | --- |",
    ...xa.blockedEquipmentBlocks.map((b) => `| ${b.blockName.replace(/\|/g, "\\|")} | ${b.matchedPattern} | ${b.insertCount} | ${b.category} |`),
    xa.blockedEquipmentBlocks.length === 0 ? "None." : ""
  );

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
