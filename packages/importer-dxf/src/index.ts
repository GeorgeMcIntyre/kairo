import {
  Parser,
  type ArcEntity,
  type CircleEntity,
  type DxfGlobalObject,
  type EntityCommons,
  type LineEntity,
  type LWPolylineEntity
} from "@dxfjs/parser";
import {
  formatName,
  formatVersion,
  type DrawingEntity,
  type GeometryDocument,
  type Layer,
  type ScenePackage
} from "@kairo/schema";
import { validateScenePackage } from "@kairo/validator";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { preCleanDxfText, type DxfPreCleanReport } from "./preCleanDxf";
export { analyzeDxfBlocks, renderDxfBlockInventoryMarkdown, writeDxfBlockInventoryReports } from "./analyzeDxfBlocks";
export type {
  DxfBlockDefinitionSummary,
  DxfBlockExpansionClassification,
  DxfBlockInsertInventory,
  DxfBlockTransformComplexity,
  DxfInsertedBlockSummary
} from "./analyzeDxfBlocks";

export type DxfImportOptions = {
  createdBy?: string;
  defaultUnits?: ScenePackage["manifest"]["units"];
};

export type DxfImportWarning = {
  code: string;
  message: string;
  entityType?: string;
  handle?: string;
};

export type DxfImportSummary = {
  supportedEntityCount: number;
  unsupportedEntityCount: number;
  layerCount: number;
  warningCount: number;
};

export type DxfImportResult = {
  scenePackage: ScenePackage;
  warnings: DxfImportWarning[];
  summary: DxfImportSummary;
  preCleanReport: DxfPreCleanReport;
};

type LegacyPolylineVertex = {
  x?: number;
  y?: number;
  z?: number;
  bulge?: number;
};

type LegacyPolylineEntity = EntityCommons & {
  flag?: number;
  z?: number;
  vertices: LegacyPolylineVertex[];
};

type DxfBlockEntityCollections = {
  lines: LineEntity[];
  lwPolylines: LWPolylineEntity[];
  circles: CircleEntity[];
  arcs: ArcEntity[];
  polylines: LegacyPolylineEntity[];
  inserts: EntityCommons[];
  points: EntityCommons[];
  texts: EntityCommons[];
  splines: EntityCommons[];
  ellipses: EntityCommons[];
  solids: EntityCommons[];
  solid3ds: EntityCommons[];
  face3ds: EntityCommons[];
  attdefs: EntityCommons[];
  attribs: EntityCommons[];
};

type DxfBlockDefinition = EntityCommons & {
  name?: string;
  basePointX?: number;
  basePointY?: number;
  basePointZ?: number;
  entities: DxfBlockEntityCollections;
};

type DxfInsertEntity = EntityCommons & {
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

const identityMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const defaultLayerName = "0";

const aciColors: Record<number, [number, number, number]> = {
  1: [1, 0, 0],
  2: [1, 1, 0],
  3: [0, 1, 0],
  4: [0, 1, 1],
  5: [0, 0, 1],
  6: [1, 0, 1],
  7: [1, 1, 1],
  8: [0.5, 0.5, 0.5],
  9: [0.75, 0.75, 0.75]
};

const dxfUnitMap: Record<number, ScenePackage["manifest"]["units"]> = {
  1: "inch",
  2: "foot",
  4: "millimeter",
  5: "centimeter",
  6: "meter"
};

const slug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unnamed";

const stableJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

function point(x = 0, y = 0, z = 0): [number, number, number] {
  return [x, y, z];
}

function layerIdForName(layerName = defaultLayerName) {
  return `layer-${slug(layerName)}`;
}

function sourceIdForEntity(entity: EntityCommons, fallbackIndex: number) {
  return `src-dxf-${slug(entity.handle || `entity-${fallbackIndex}`)}`;
}

function sourceIdForExpandedBlockEntity(insert: DxfInsertEntity, blockName: string, child: EntityCommons, fallbackIndex: number) {
  return `src-dxf-insert-${slug(insert.handle || `insert-${fallbackIndex}`)}-block-${slug(blockName)}-child-${slug(child.handle || `child-${fallbackIndex}`)}`;
}

function colorFromAci(color?: number): Layer["color"] | undefined {
  if (color === undefined) {
    return undefined;
  }

  const rgb = aciColors[Math.abs(color)];
  if (!rgb) {
    return undefined;
  }

  return { r: rgb[0], g: rgb[1], b: rgb[2], a: 1 };
}

function byHandle(a: Partial<EntityCommons>, b: Partial<EntityCommons>) {
  return (a.handle ?? "").localeCompare(b.handle ?? "");
}

function detectUnits(parsed: DxfGlobalObject, options: DxfImportOptions, warnings: DxfImportWarning[]) {
  const rawUnits = parsed.header?.$INSUNITS;
  if (typeof rawUnits === "number" && dxfUnitMap[rawUnits]) {
    return dxfUnitMap[rawUnits];
  }

  if (typeof rawUnits === "number") {
    warnings.push({
      code: "DXF_UNSUPPORTED_UNITS",
      message: `DXF $INSUNITS value ${rawUnits} is not mapped; using ${options.defaultUnits ?? "millimeter"}.`
    });
  } else {
    warnings.push({
      code: "DXF_UNITS_UNKNOWN",
      message: `DXF units were not declared; using ${options.defaultUnits ?? "millimeter"}.`
    });
  }

  return options.defaultUnits ?? "millimeter";
}

function allParsedEntities(parsed: DxfGlobalObject): EntityCommons[] {
  return [
    ...parsed.entities.lines,
    ...parsed.entities.lwPolylines,
    ...parsed.entities.circles,
    ...parsed.entities.arcs,
    ...parsed.entities.inserts,
    ...parsed.entities.points,
    ...parsed.entities.texts,
    ...parsed.entities.splines,
    ...parsed.entities.ellipses,
    ...parsed.entities.polylines,
    ...parsed.entities.solids,
    ...parsed.entities.solid3ds,
    ...parsed.entities.face3ds,
    ...parsed.entities.attdefs,
    ...parsed.entities.attribs
  ];
}

function layersFromDxf(parsed: DxfGlobalObject): Layer[] {
  const layers = new Map<string, Layer>();

  for (const record of parsed.tables.layer.records ?? []) {
    const name = record.name ?? defaultLayerName;
    layers.set(name, {
      id: layerIdForName(name),
      name,
      color: colorFromAci(record.color),
      visible: record.color === undefined ? true : record.color >= 0,
      metadata: {
        dxfFlags: String(record.flags ?? 0),
        dxfLineType: record.lineType ?? "UNKNOWN"
      }
    });
  }

  for (const entity of allParsedEntities(parsed)) {
    const name = entity.layerName ?? defaultLayerName;
    if (!layers.has(name)) {
      layers.set(name, {
        id: layerIdForName(name),
        name,
        visible: true
      });
    }
  }

  if (layers.size === 0) {
    layers.set(defaultLayerName, {
      id: layerIdForName(defaultLayerName),
      name: defaultLayerName,
      visible: true
    });
  }

  return [...layers.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function entityBase(entity: EntityCommons, type: DrawingEntity["type"], fallbackIndex: number) {
  return {
    id: `dxf-${type}-${slug(entity.handle || String(fallbackIndex))}`,
    layerId: layerIdForName(entity.layerName),
    sourceRef: sourceIdForEntity(entity, fallbackIndex)
  };
}

function lineToEntity(entity: LineEntity, fallbackIndex: number): DrawingEntity {
  return {
    ...entityBase(entity, "line", fallbackIndex),
    type: "line",
    start: point(entity.startX, entity.startY, entity.startZ),
    end: point(entity.endX, entity.endY, entity.endZ)
  };
}

function lwPolylineToEntity(entity: LWPolylineEntity, fallbackIndex: number): DrawingEntity {
  return {
    ...entityBase(entity, "polyline", fallbackIndex),
    type: "polyline",
    points: entity.vertices.map((vertex) => point(vertex.x, vertex.y, entity.elevation ?? 0)),
    closed: (entity.flag & 1) === 1
  };
}

function isSimpleLegacyPolyline(entity: LegacyPolylineEntity) {
  const flag = entity.flag ?? 0;
  const hasComplexFlag = (flag & 2) === 2 || (flag & 4) === 4 || (flag & 8) === 8 || (flag & 16) === 16 || (flag & 64) === 64;
  const hasBulge = entity.vertices.some((vertex) => vertex.bulge !== undefined && Math.abs(vertex.bulge) > 1e-12);
  return entity.vertices.length >= 2 && !hasComplexFlag && !hasBulge;
}

function legacyPolylineUnsupportedReason(entity: LegacyPolylineEntity) {
  const flag = entity.flag ?? 0;
  const reasons: string[] = [];
  if (entity.vertices.length < 2) reasons.push("fewer than 2 vertices");
  if ((flag & 2) === 2) reasons.push("curve-fit flag");
  if ((flag & 4) === 4) reasons.push("spline-fit flag");
  if ((flag & 8) === 8) reasons.push("3D polyline flag");
  if ((flag & 16) === 16) reasons.push("mesh flag");
  if ((flag & 64) === 64) reasons.push("polyface flag");
  if (entity.vertices.some((vertex) => vertex.bulge !== undefined && Math.abs(vertex.bulge) > 1e-12)) reasons.push("bulge values");
  return reasons.join(", ") || "unsupported legacy POLYLINE mode";
}

function legacyPolylineToEntity(entity: LegacyPolylineEntity, fallbackIndex: number): DrawingEntity {
  return {
    ...entityBase(entity, "polyline", fallbackIndex),
    type: "polyline",
    points: entity.vertices.map((vertex) => point(vertex.x, vertex.y, vertex.z ?? entity.z ?? 0)),
    closed: ((entity.flag ?? 0) & 1) === 1
  };
}

function blockDefinitionsByName(parsed: DxfGlobalObject) {
  const blocks = (parsed.blocks ?? []) as unknown as DxfBlockDefinition[];
  return new Map(blocks.map((block) => [block.name ?? "", block]));
}

function blockNameForInsert(insert: DxfInsertEntity) {
  return insert.blockName ?? insert.name ?? "";
}

function insertScale(insert: DxfInsertEntity) {
  return {
    x: insert.xScale ?? 1,
    y: insert.yScale ?? 1,
    z: insert.zScale ?? 1
  };
}

function hardInsertTransformReason(insert: DxfInsertEntity) {
  const scale = insertScale(insert);
  const reasons: string[] = [];
  if (Math.abs(scale.x - scale.y) > 1e-9 || Math.abs(scale.x - scale.z) > 1e-9) reasons.push("non-uniform scale");
  if (scale.x < 0 || scale.y < 0 || scale.z < 0) reasons.push("negative scale");
  return reasons.join(", ");
}

function hasZOffset(insert: DxfInsertEntity) {
  return Math.abs(insert.z ?? 0) > 1e-9;
}

function blockHasNestedInserts(block: DxfBlockDefinition) {
  return (block.entities.inserts?.length ?? 0) > 0;
}

function blockSkippableEntityTypes(block: DxfBlockDefinition) {
  const skippable: string[] = [];
  const entityGroups: Array<[string, EntityCommons[]]> = [
    ["ATTDEF", block.entities.attdefs],
    ["ATTRIB", block.entities.attribs],
    ["ELLIPSE", block.entities.ellipses],
    ["POINT", block.entities.points],
    ["SOLID", block.entities.solids],
    ["SPLINE", block.entities.splines],
    ["TEXT", block.entities.texts],
    ["3DFACE", block.entities.face3ds],
    ["3DSOLID", block.entities.solid3ds]
  ];

  for (const [entityType, entities] of entityGroups) {
    if ((entities?.length ?? 0) > 0) {
      skippable.push(entityType);
    }
  }

  if ((block.entities.polylines ?? []).some((entity) => !isSimpleLegacyPolyline(entity))) {
    skippable.push("COMPLEX_POLYLINE");
  }

  return skippable.sort((a, b) => a.localeCompare(b));
}

function blockSkippedEntityCounts(block: DxfBlockDefinition, skippableTypes: string[]) {
  const counts: string[] = [];
  const entityGroups: Array<[string, EntityCommons[]]> = [
    ["ATTDEF", block.entities.attdefs],
    ["ATTRIB", block.entities.attribs],
    ["ELLIPSE", block.entities.ellipses],
    ["POINT", block.entities.points],
    ["SOLID", block.entities.solids],
    ["SPLINE", block.entities.splines],
    ["TEXT", block.entities.texts],
    ["3DFACE", block.entities.face3ds],
    ["3DSOLID", block.entities.solid3ds]
  ];

  for (const [entityType, entities] of entityGroups) {
    if (skippableTypes.includes(entityType) && (entities?.length ?? 0) > 0) {
      counts.push(`${entityType}×${entities.length}`);
    }
  }

  const complexPolylineCount = (block.entities.polylines ?? []).filter((entity) => !isSimpleLegacyPolyline(entity)).length;
  if (skippableTypes.includes("COMPLEX_POLYLINE") && complexPolylineCount > 0) {
    counts.push(`COMPLEX_POLYLINE×${complexPolylineCount}`);
  }

  return counts.join(", ");
}

function effectiveLayerName(child: EntityCommons, insert: DxfInsertEntity) {
  const childLayer = child.layerName ?? "0";
  return childLayer === "0" ? insert.layerName ?? "0" : childLayer;
}

function transformBlockPoint(x: number | undefined, y: number | undefined, z: number | undefined, insert: DxfInsertEntity, block: DxfBlockDefinition): [number, number, number] {
  const scale = insertScale(insert).x;
  const radians = ((insert.rotation ?? 0) * Math.PI) / 180;
  const localX = ((x ?? 0) - (block.basePointX ?? 0)) * scale;
  const localY = ((y ?? 0) - (block.basePointY ?? 0)) * scale;
  const localZ = ((z ?? 0) - (block.basePointZ ?? 0)) * scale;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return [
    localX * cos - localY * sin + (insert.x ?? 0),
    localX * sin + localY * cos + (insert.y ?? 0),
    localZ + (insert.z ?? 0)
  ];
}

function rotateAngle(angle: number, insert: DxfInsertEntity) {
  return angle + (insert.rotation ?? 0);
}

function composeInserts(outerInsert: DxfInsertEntity, outerBlock: DxfBlockDefinition, flatChildInsert: DxfInsertEntity): DxfInsertEntity {
  const outerScale = insertScale(outerInsert).x;
  const childScale = insertScale(flatChildInsert).x;
  const [composedX, composedY] = transformBlockPoint(flatChildInsert.x ?? 0, flatChildInsert.y ?? 0, 0, outerInsert, outerBlock);
  return {
    ...flatChildInsert,
    x: composedX,
    y: composedY,
    z: 0,
    xScale: outerScale * childScale,
    yScale: outerScale * childScale,
    zScale: outerScale * childScale,
    rotation: (outerInsert.rotation ?? 0) + (flatChildInsert.rotation ?? 0)
  };
}

function expandedEntityBase(
  type: DrawingEntity["type"],
  insert: DxfInsertEntity,
  blockName: string,
  child: EntityCommons,
  fallbackIndex: number
) {
  const sourceRef = sourceIdForExpandedBlockEntity(insert, blockName, child, fallbackIndex);
  return {
    id: `dxf-${type}-insert-${slug(insert.handle || `insert-${fallbackIndex}`)}-child-${slug(child.handle || `child-${fallbackIndex}`)}`,
    layerId: layerIdForName(effectiveLayerName(child, insert)),
    sourceRef
  };
}

function circleToEntity(entity: CircleEntity, fallbackIndex: number): DrawingEntity {
  return {
    ...entityBase(entity, "circle", fallbackIndex),
    type: "circle",
    center: point(entity.centerX, entity.centerY, entity.centerZ),
    radius: entity.radius
  };
}

function arcToEntity(entity: ArcEntity, fallbackIndex: number): DrawingEntity {
  return {
    ...entityBase(entity, "arc", fallbackIndex),
    type: "arc",
    center: point(entity.centerX, entity.centerY, entity.centerZ),
    radius: entity.radius,
    startAngleDeg: entity.startAngle,
    endAngleDeg: entity.endAngle
  };
}

function expandBlockLine(entity: LineEntity, insert: DxfInsertEntity, block: DxfBlockDefinition, blockName: string, fallbackIndex: number): DrawingEntity {
  return {
    ...expandedEntityBase("line", insert, blockName, entity, fallbackIndex),
    type: "line",
    start: transformBlockPoint(entity.startX, entity.startY, entity.startZ, insert, block),
    end: transformBlockPoint(entity.endX, entity.endY, entity.endZ, insert, block)
  };
}

function expandBlockLWPolyline(entity: LWPolylineEntity, insert: DxfInsertEntity, block: DxfBlockDefinition, blockName: string, fallbackIndex: number): DrawingEntity {
  return {
    ...expandedEntityBase("polyline", insert, blockName, entity, fallbackIndex),
    type: "polyline",
    points: entity.vertices.map((vertex) => transformBlockPoint(vertex.x, vertex.y, entity.elevation ?? 0, insert, block)),
    closed: (entity.flag & 1) === 1
  };
}

function expandBlockLegacyPolyline(
  entity: LegacyPolylineEntity,
  insert: DxfInsertEntity,
  block: DxfBlockDefinition,
  blockName: string,
  fallbackIndex: number
): DrawingEntity {
  return {
    ...expandedEntityBase("polyline", insert, blockName, entity, fallbackIndex),
    type: "polyline",
    points: entity.vertices.map((vertex) => transformBlockPoint(vertex.x, vertex.y, vertex.z ?? entity.z ?? 0, insert, block)),
    closed: ((entity.flag ?? 0) & 1) === 1
  };
}

function expandBlockCircle(entity: CircleEntity, insert: DxfInsertEntity, block: DxfBlockDefinition, blockName: string, fallbackIndex: number): DrawingEntity {
  return {
    ...expandedEntityBase("circle", insert, blockName, entity, fallbackIndex),
    type: "circle",
    center: transformBlockPoint(entity.centerX, entity.centerY, entity.centerZ, insert, block),
    radius: entity.radius * insertScale(insert).x
  };
}

function expandBlockArc(entity: ArcEntity, insert: DxfInsertEntity, block: DxfBlockDefinition, blockName: string, fallbackIndex: number): DrawingEntity {
  return {
    ...expandedEntityBase("arc", insert, blockName, entity, fallbackIndex),
    type: "arc",
    center: transformBlockPoint(entity.centerX, entity.centerY, entity.centerZ, insert, block),
    radius: entity.radius * insertScale(insert).x,
    startAngleDeg: rotateAngle(entity.startAngle, insert),
    endAngleDeg: rotateAngle(entity.endAngle, insert)
  };
}

function unsupportedWarning(entityType: string, entity: Partial<EntityCommons>): DxfImportWarning {
  const isBlockInsert = entityType === "INSERT";
  return {
    code: isBlockInsert ? "DXF_BLOCK_INSERT_UNSUPPORTED" : "DXF_ENTITY_UNSUPPORTED",
    message: isBlockInsert
      ? "DXF BLOCK/INSERT expansion is not supported yet; entity was reported but not imported."
      : `DXF entity type ${entityType} is not supported by the minimal importer.`,
    entityType,
    handle: entity.handle
  };
}

function convertEntities(parsed: DxfGlobalObject) {
  const warnings: DxfImportWarning[] = [];
  const entities: DrawingEntity[] = [];
  const sourceEntityTypes = new Map<string, string>();
  const sourceEntityIds = new Map<string, string>();
  const sourceNotes = new Map<string, string>();
  const blocks = blockDefinitionsByName(parsed);
  let index = 0;
  const registerSource = (entity: DrawingEntity, entityType: string, entityId: string, note?: string) => {
    const sourceRef = entity.sourceRef ?? entity.id;
    sourceEntityTypes.set(sourceRef, entityType);
    sourceEntityIds.set(sourceRef, entityId);
    if (note) {
      sourceNotes.set(sourceRef, note);
    }
  };

  for (const entity of [...parsed.entities.lines].sort(byHandle)) {
    const converted = lineToEntity(entity, index++);
    entities.push(converted);
    registerSource(converted, "LINE", entity.handle ?? converted.id);
  }
  for (const entity of [...parsed.entities.lwPolylines].sort(byHandle)) {
    const converted = lwPolylineToEntity(entity, index++);
    entities.push(converted);
    registerSource(converted, "LWPOLYLINE", entity.handle ?? converted.id);
  }
  for (const entity of [...parsed.entities.circles].sort(byHandle)) {
    const converted = circleToEntity(entity, index++);
    entities.push(converted);
    registerSource(converted, "CIRCLE", entity.handle ?? converted.id);
  }
  for (const entity of [...parsed.entities.arcs].sort(byHandle)) {
    const converted = arcToEntity(entity, index++);
    entities.push(converted);
    registerSource(converted, "ARC", entity.handle ?? converted.id);
  }

  for (const entity of [...(parsed.entities.polylines as LegacyPolylineEntity[])].sort(byHandle)) {
    if (isSimpleLegacyPolyline(entity)) {
      const converted = legacyPolylineToEntity(entity, index++);
      entities.push(converted);
      registerSource(converted, "POLYLINE", entity.handle ?? converted.id);
    } else {
      warnings.push({
        code: "DXF_POLYLINE_UNSUPPORTED",
        message: `DXF POLYLINE entity is not a simple vertex chain and was skipped: ${legacyPolylineUnsupportedReason(entity)}.`,
        entityType: "POLYLINE",
        handle: entity.handle
      });
    }
  }

  for (const entity of [...(parsed.entities.inserts as DxfInsertEntity[])].sort(byHandle)) {
    const blockName = blockNameForInsert(entity);
    const block = blocks.get(blockName);
    if (!block) {
      warnings.push({
        code: "DXF_BLOCK_DEFINITION_MISSING",
        message: `DXF INSERT references missing BLOCK definition "${blockName}"; entity was skipped.`,
        entityType: "INSERT",
        handle: entity.handle
      });
      continue;
    }

    const hardReason = hardInsertTransformReason(entity);
    if (hardReason) {
      warnings.push({
        code: "DXF_BLOCK_INSERT_TRANSFORM_UNSUPPORTED",
        message: `DXF INSERT transform is not supported by the simple expander (${hardReason}); entity was skipped.`,
        entityType: "INSERT",
        handle: entity.handle
      });
      continue;
    }

    const expandInsert = hasZOffset(entity) ? { ...entity, z: 0 } : entity;
    if (hasZOffset(entity)) {
      warnings.push({
        code: "DXF_INSERT_Z_FLATTENED",
        message: `DXF INSERT was expanded with Z offset (${(entity.z ?? 0).toFixed(4)}) flattened to 0 for 2D layout import.`,
        entityType: "INSERT",
        handle: entity.handle
      });
    }

    const skippableTypes = blockSkippableEntityTypes(block);
    if (skippableTypes.length > 0) {
      const countDetail = blockSkippedEntityCounts(block, skippableTypes);
      warnings.push({
        code: "DXF_BLOCK_PARTIAL_EXPAND",
        message: `DXF BLOCK "${blockName}" was partially expanded; unsupported children skipped: ${countDetail}.`,
        entityType: "INSERT",
        handle: entity.handle
      });
    }

    for (const child of [...block.entities.lines].sort(byHandle)) {
      const converted = expandBlockLine(child, expandInsert, block, blockName, index++);
      entities.push(converted);
      registerSource(converted, "LINE", child.handle ?? converted.id, `Expanded from INSERT ${entity.handle ?? "unknown"}, BLOCK ${blockName}.`);
    }
    for (const child of [...block.entities.lwPolylines].sort(byHandle)) {
      const converted = expandBlockLWPolyline(child, expandInsert, block, blockName, index++);
      entities.push(converted);
      registerSource(converted, "LWPOLYLINE", child.handle ?? converted.id, `Expanded from INSERT ${entity.handle ?? "unknown"}, BLOCK ${blockName}.`);
    }
    for (const child of [...block.entities.circles].sort(byHandle)) {
      const converted = expandBlockCircle(child, expandInsert, block, blockName, index++);
      entities.push(converted);
      registerSource(converted, "CIRCLE", child.handle ?? converted.id, `Expanded from INSERT ${entity.handle ?? "unknown"}, BLOCK ${blockName}.`);
    }
    for (const child of [...block.entities.arcs].sort(byHandle)) {
      const converted = expandBlockArc(child, expandInsert, block, blockName, index++);
      entities.push(converted);
      registerSource(converted, "ARC", child.handle ?? converted.id, `Expanded from INSERT ${entity.handle ?? "unknown"}, BLOCK ${blockName}.`);
    }
    for (const child of [...block.entities.polylines].sort(byHandle)) {
      if (!isSimpleLegacyPolyline(child)) {
        continue;
      }
      const converted = expandBlockLegacyPolyline(child, expandInsert, block, blockName, index++);
      entities.push(converted);
      registerSource(converted, "POLYLINE", child.handle ?? converted.id, `Expanded from INSERT ${entity.handle ?? "unknown"}, BLOCK ${blockName}.`);
    }

    for (const childInsertRaw of [...(block.entities.inserts as DxfInsertEntity[])].sort(byHandle)) {
      const childBlockName = blockNameForInsert(childInsertRaw);

      if (childBlockName === blockName) {
        warnings.push({
          code: "DXF_BLOCK_INSERT_CYCLE",
          message: `DXF BLOCK "${blockName}" contains a self-referential INSERT; nested INSERT was skipped.`,
          entityType: "INSERT",
          handle: childInsertRaw.handle
        });
        continue;
      }

      const childBlock = blocks.get(childBlockName);
      if (!childBlock) {
        warnings.push({
          code: "DXF_BLOCK_DEFINITION_MISSING",
          message: `DXF INSERT references missing BLOCK definition "${childBlockName}"; entity was skipped.`,
          entityType: "INSERT",
          handle: childInsertRaw.handle
        });
        continue;
      }

      const childHardReason = hardInsertTransformReason(childInsertRaw);
      if (childHardReason) {
        warnings.push({
          code: "DXF_BLOCK_INSERT_TRANSFORM_UNSUPPORTED",
          message: `DXF INSERT transform is not supported by the simple expander (${childHardReason}); entity was skipped.`,
          entityType: "INSERT",
          handle: childInsertRaw.handle
        });
        continue;
      }

      const flatChildInsert = hasZOffset(childInsertRaw) ? { ...childInsertRaw, z: 0 } : childInsertRaw;
      if (hasZOffset(childInsertRaw)) {
        warnings.push({
          code: "DXF_INSERT_Z_FLATTENED",
          message: `DXF INSERT was expanded with Z offset (${(childInsertRaw.z ?? 0).toFixed(4)}) flattened to 0 for 2D layout import.`,
          entityType: "INSERT",
          handle: childInsertRaw.handle
        });
      }

      const composedInsert = composeInserts(expandInsert, block, flatChildInsert);

      const childSkippableTypes = blockSkippableEntityTypes(childBlock);
      if (childSkippableTypes.length > 0) {
        const childCountDetail = blockSkippedEntityCounts(childBlock, childSkippableTypes);
        warnings.push({
          code: "DXF_BLOCK_PARTIAL_EXPAND",
          message: `DXF BLOCK "${childBlockName}" was partially expanded; unsupported children skipped: ${childCountDetail}.`,
          entityType: "INSERT",
          handle: childInsertRaw.handle
        });
      }

      for (const grandchild of [...childBlock.entities.lines].sort(byHandle)) {
        const converted = expandBlockLine(grandchild, composedInsert, childBlock, childBlockName, index++);
        entities.push(converted);
        registerSource(converted, "LINE", grandchild.handle ?? converted.id, `Expanded from INSERT ${entity.handle ?? "unknown"}, BLOCK ${blockName}, INSERT ${childInsertRaw.handle ?? "unknown"}, BLOCK ${childBlockName}.`);
      }
      for (const grandchild of [...childBlock.entities.lwPolylines].sort(byHandle)) {
        const converted = expandBlockLWPolyline(grandchild, composedInsert, childBlock, childBlockName, index++);
        entities.push(converted);
        registerSource(converted, "LWPOLYLINE", grandchild.handle ?? converted.id, `Expanded from INSERT ${entity.handle ?? "unknown"}, BLOCK ${blockName}, INSERT ${childInsertRaw.handle ?? "unknown"}, BLOCK ${childBlockName}.`);
      }
      for (const grandchild of [...childBlock.entities.circles].sort(byHandle)) {
        const converted = expandBlockCircle(grandchild, composedInsert, childBlock, childBlockName, index++);
        entities.push(converted);
        registerSource(converted, "CIRCLE", grandchild.handle ?? converted.id, `Expanded from INSERT ${entity.handle ?? "unknown"}, BLOCK ${blockName}, INSERT ${childInsertRaw.handle ?? "unknown"}, BLOCK ${childBlockName}.`);
      }
      for (const grandchild of [...childBlock.entities.arcs].sort(byHandle)) {
        const converted = expandBlockArc(grandchild, composedInsert, childBlock, childBlockName, index++);
        entities.push(converted);
        registerSource(converted, "ARC", grandchild.handle ?? converted.id, `Expanded from INSERT ${entity.handle ?? "unknown"}, BLOCK ${blockName}, INSERT ${childInsertRaw.handle ?? "unknown"}, BLOCK ${childBlockName}.`);
      }
      for (const grandchild of [...childBlock.entities.polylines].sort(byHandle)) {
        if (!isSimpleLegacyPolyline(grandchild)) continue;
        const converted = expandBlockLegacyPolyline(grandchild, composedInsert, childBlock, childBlockName, index++);
        entities.push(converted);
        registerSource(converted, "POLYLINE", grandchild.handle ?? converted.id, `Expanded from INSERT ${entity.handle ?? "unknown"}, BLOCK ${blockName}, INSERT ${childInsertRaw.handle ?? "unknown"}, BLOCK ${childBlockName}.`);
      }

      for (const depthThreeInsert of [...(childBlock.entities.inserts as DxfInsertEntity[])].sort(byHandle)) {
        const depthThreeBlockName = blockNameForInsert(depthThreeInsert);
        warnings.push({
          code: "DXF_BLOCK_INSERT_NESTED_UNSUPPORTED",
          message: `DXF BLOCK "${childBlockName}" contains nested INSERT to "${depthThreeBlockName}"; expansion limited to one level.`,
          entityType: "INSERT",
          handle: depthThreeInsert.handle
        });
      }
    }
  }

  const unsupportedGroups: Array<[string, EntityCommons[]]> = [
    ["POINT", parsed.entities.points],
    ["TEXT", parsed.entities.texts],
    ["SPLINE", parsed.entities.splines],
    ["ELLIPSE", parsed.entities.ellipses],
    ["SOLID", parsed.entities.solids],
    ["3DSOLID", parsed.entities.solid3ds],
    ["3DFACE", parsed.entities.face3ds],
    ["ATTDEF", parsed.entities.attdefs],
    ["ATTRIB", parsed.entities.attribs]
  ];

  for (const [entityType, group] of unsupportedGroups) {
    for (const entity of [...group].sort(byHandle)) {
      warnings.push(unsupportedWarning(entityType, entity));
    }
  }

  return {
    entities,
    sourceEntityTypes,
    sourceEntityIds,
    sourceNotes,
    warnings: warnings.sort((a, b) =>
      `${a.code}:${a.entityType ?? ""}:${a.handle ?? ""}`.localeCompare(`${b.code}:${b.entityType ?? ""}:${b.handle ?? ""}`)
    )
  };
}

function buildSourceMap(
  inputPath: string,
  entities: DrawingEntity[],
  parsed: DxfGlobalObject,
  sourceEntityTypes: Map<string, string>,
  sourceEntityIds: Map<string, string>,
  sourceNotes: Map<string, string>
) {
  return {
    sources: [
      {
        id: "src-dxf-file",
        path: inputPath,
        format: "DXF",
        entityType: "FILE",
        note: `Imported from DXF. Raw $INSUNITS: ${String(parsed.header?.$INSUNITS ?? "unknown")}.`
      },
      ...entities.map((entity) => ({
        id: entity.sourceRef ?? `src-${entity.id}`,
        path: inputPath,
        format: "DXF",
        entityType: sourceEntityTypes.get(entity.sourceRef ?? entity.id) ?? entity.type.toUpperCase(),
        entityId: sourceEntityIds.get(entity.sourceRef ?? entity.id) ?? entity.sourceRef?.replace(/^src-dxf-/, "") ?? entity.id,
        note: sourceNotes.get(entity.sourceRef ?? entity.id)
      }))
    ]
  };
}

function groupEntitiesByLayer(entities: DrawingEntity[]) {
  const byLayer = new Map<string, DrawingEntity[]>();
  for (const entity of entities) {
    const layerId = entity.layerId ?? layerIdForName(defaultLayerName);
    byLayer.set(layerId, [...(byLayer.get(layerId) ?? []), entity]);
  }
  return [...byLayer.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function buildScenePackage(inputPath: string, parsed: DxfGlobalObject, options: DxfImportOptions, warnings: DxfImportWarning[]): ScenePackage {
  const units = detectUnits(parsed, options, warnings);
  const layers = layersFromDxf(parsed);
  const converted = convertEntities(parsed);
  warnings.push(...converted.warnings);

  const geometryDocuments: GeometryDocument[] = [];
  const nodes: ScenePackage["scene"]["nodes"] = [
    {
      id: "node-dxf-root",
      displayName: path.basename(inputPath),
      type: "drawing",
      children: [],
      localTransform: identityMatrix,
      metadata: {
        sourceFormat: "DXF",
        unitsStatus: parsed.header?.$INSUNITS === undefined ? "unknown" : "from-$INSUNITS"
      },
      sourceRef: "src-dxf-file"
    }
  ];

  for (const [layerId, entities] of groupEntitiesByLayer(converted.entities)) {
    const layer = layers.find((entry) => entry.id === layerId);
    const geometryId = `geom-${layerId}-curves`;
    const nodeId = `node-${layerId}`;
    geometryDocuments.push({
      geometries: [
        {
          id: geometryId,
          kind: "curve-set",
          layerId,
          sourceRef: "src-dxf-file",
          entities: entities.sort((a, b) => a.id.localeCompare(b.id))
        }
      ]
    });
    nodes[0].children.push(nodeId);
    nodes.push({
      id: nodeId,
      displayName: layer?.name ?? layerId,
      type: "drawing",
      children: [],
      localTransform: identityMatrix,
      geometryRefs: [geometryId],
      layerId,
      metadata: {
        importedEntityCount: entities.length
      },
      sourceRef: "src-dxf-file"
    });
  }

  nodes[0].children.sort((a, b) => a.localeCompare(b));
  geometryDocuments.sort((a, b) => a.geometries[0].id.localeCompare(b.geometries[0].id));

  return {
    manifest: {
      format: formatName,
      version: formatVersion,
      units,
      axisSystem: {
        up: "Z",
        handedness: "right"
      },
      rootSceneFile: "scene.json",
      createdBy: {
        name: options.createdBy ?? "kairo import-dxf",
        version: "0.1.0"
      },
      source: {
        format: "DXF",
        path: inputPath,
        note: warnings.length === 0 ? "Imported by minimal DXF importer." : `Imported with ${warnings.length} warning(s).`
      }
    },
    scene: {
      rootNodeId: "node-dxf-root",
      nodes
    },
    geometry: geometryDocuments,
    layers: { layers },
    materials: { materials: [] },
    sourceMap: buildSourceMap(inputPath, converted.entities, parsed, converted.sourceEntityTypes, converted.sourceEntityIds, converted.sourceNotes)
  };
}

export async function importDxfToKairo(inputPath: string, options: DxfImportOptions = {}): Promise<DxfImportResult> {
  const absolutePath = path.resolve(inputPath);
  const content = await readFile(absolutePath, "utf8");
  const preCleaned = preCleanDxfText(content);
  const parser = new Parser();
  const parsed = await parser.parse(preCleaned.text);
  const warnings: DxfImportWarning[] = [];
  const scenePackage = buildScenePackage(absolutePath, parsed, options, warnings);
  const report = validateScenePackage(scenePackage);

  if (!report.valid) {
    throw Object.assign(new Error("Imported DXF scene package failed Kairo validation."), {
      code: "DXF_IMPORT_VALIDATION_FAILED",
      report
    });
  }

  return {
    scenePackage,
    warnings: warnings.sort((a, b) =>
      `${a.code}:${a.entityType ?? ""}:${a.handle ?? ""}`.localeCompare(`${b.code}:${b.entityType ?? ""}:${b.handle ?? ""}`)
    ),
    summary: {
      supportedEntityCount: scenePackage.geometry.reduce(
        (count, document) =>
          count +
          document.geometries.reduce((inner, geometry) => inner + (geometry.kind === "curve-set" ? geometry.entities.length : 0), 0),
        0
      ),
      unsupportedEntityCount: warnings.length,
      layerCount: scenePackage.layers.layers.length,
      warningCount: warnings.length
    },
    preCleanReport: preCleaned.report
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
