import {
  Parser,
  type ArcEntity,
  type CircleEntity,
  type DxfGlobalObject,
  type EllipseEntity,
  type EntityCommons,
  type Face3DEntity,
  type LineEntity,
  type LWPolylineEntity,
  type PointEntity,
  type Solid3DEntity,
  type SolidEntity,
  type SplineEntity
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
import { preCleanDxfText, type DxfPreCleanReport } from "./preCleanDxf";
import { extractDirectMtextEntities, type RawMtextRecord } from "./extractMtext";

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

export type DxfCoverageFailure = {
  code: string;
  entityType: string;
  handle?: string;
  blockPath?: string[];
  message: string;
};

export type DxfCoverageReport = {
  totalSourceInstances: number;
  coveredInstances: number;
  failedInstances: number;
  conversionPercent: number;
  failures: DxfCoverageFailure[];
  byEntityType: Record<string, { total: number; covered: number; failed: number }>;
  byFailureCode: Record<string, number>;
};

export type DxfImportTimingStage = {
  stage: string;
  ms: number;
};

export type DxfImportResult = {
  scenePackage: ScenePackage;
  warnings: DxfImportWarning[];
  summary: DxfImportSummary;
  coverage: DxfCoverageReport;
  preCleanReport: DxfPreCleanReport;
  timing?: DxfImportTimingStage[];
};

type LegacyPolylineVertex = {
  x?: number;
  y?: number;
  z?: number;
  bulge?: number;
  flag?: number;
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
  points: PointEntity[];
  texts: EntityCommons[];
  splines: SplineEntity[];
  ellipses: EllipseEntity[];
  solids: SolidEntity[];
  solid3ds: Solid3DEntity[];
  face3ds: Face3DEntity[];
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

const coverageEntityTypes = [
  "LINE",
  "LWPOLYLINE",
  "CIRCLE",
  "ARC",
  "POLYLINE",
  "INSERT",
  "TEXT",
  "MTEXT",
  "ATTDEF",
  "ATTRIB",
  "POINT",
  "SPLINE",
  "ELLIPSE",
  "SOLID",
  "3DFACE",
  "3DSOLID"
] as const;

type CoverageEntityType = (typeof coverageEntityTypes)[number] | string;

function emptyCoverageReport(): DxfCoverageReport {
  return {
    totalSourceInstances: 0,
    coveredInstances: 0,
    failedInstances: 0,
    conversionPercent: 100,
    failures: [],
    byEntityType: {},
    byFailureCode: {}
  };
}

function coverageType(report: DxfCoverageReport, entityType: CoverageEntityType) {
  report.byEntityType[entityType] ??= { total: 0, covered: 0, failed: 0 };
  return report.byEntityType[entityType];
}

function markCovered(report: DxfCoverageReport, entityType: CoverageEntityType) {
  const entry = coverageType(report, entityType);
  entry.total += 1;
  entry.covered += 1;
  report.totalSourceInstances += 1;
  report.coveredInstances += 1;
}

function markFailed(report: DxfCoverageReport, failure: DxfCoverageFailure) {
  const entry = coverageType(report, failure.entityType);
  entry.total += 1;
  entry.failed += 1;
  report.totalSourceInstances += 1;
  report.failedInstances += 1;
  report.failures.push(failure);
  report.byFailureCode[failure.code] = (report.byFailureCode[failure.code] ?? 0) + 1;
}

function finalizeCoverage(report: DxfCoverageReport): DxfCoverageReport {
  return {
    ...report,
    conversionPercent:
      report.totalSourceInstances === 0
        ? 100
        : Number(((report.coveredInstances / report.totalSourceInstances) * 100).toFixed(4)),
    failures: report.failures.sort((a, b) =>
      `${a.code}:${a.entityType}:${a.blockPath?.join("/") ?? ""}:${a.handle ?? ""}`.localeCompare(
        `${b.code}:${b.entityType}:${b.blockPath?.join("/") ?? ""}:${b.handle ?? ""}`
      )
    ),
    byEntityType: Object.fromEntries(Object.entries(report.byEntityType).sort(([a], [b]) => a.localeCompare(b))),
    byFailureCode: Object.fromEntries(Object.entries(report.byFailureCode).sort(([a], [b]) => a.localeCompare(b)))
  };
}

const slug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unnamed";

function baseNameFromPath(inputPath: string) {
  return inputPath.split(/[\\/]/).filter(Boolean).pop() ?? inputPath;
}

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

function mtextToEntity(record: RawMtextRecord, fallbackIndex: number): DrawingEntity {
  const handle = record.handle || `mtext-${fallbackIndex}`;
  return {
    id: `dxf-mtext-${slug(handle)}`,
    layerId: layerIdForName(record.layerName),
    sourceRef: `src-dxf-mtext-${slug(handle)}`,
    type: "text",
    text: record.text,
    position: point(record.insertion[0], record.insertion[1], record.insertion[2]),
    rotationDeg: record.rotationDeg,
    height: Math.max(record.height, 1e-6),
    origin: "MTEXT",
    ...(record.attachmentPoint !== undefined && { attachmentPoint: record.attachmentPoint })
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
  const bulges = entity.vertices.map((vertex) => vertex.bulge ?? 0);
  return {
    ...entityBase(entity, "polyline", fallbackIndex),
    type: "polyline",
    points: entity.vertices.map((vertex) => point(vertex.x, vertex.y, entity.elevation ?? 0)),
    closed: (entity.flag & 1) === 1,
    ...(bulges.some((bulge) => Math.abs(bulge) > 1e-12) && { bulges })
  };
}

function legacyPolylineHasBulges(entity: LegacyPolylineEntity) {
  return entity.vertices.some((vertex) => vertex.bulge !== undefined && Math.abs(vertex.bulge) > 1e-12);
}

function isSimpleLegacyPolyline(entity: LegacyPolylineEntity) {
  const flag = entity.flag ?? 0;
  const hasUnsupportedFlag = (flag & 2) === 2 || (flag & 4) === 4 || (flag & 16) === 16 || (flag & 64) === 64;
  return entity.vertices.length >= 2 && !hasUnsupportedFlag;
}

function legacyPolylineUnsupportedReason(entity: LegacyPolylineEntity) {
  const flag = entity.flag ?? 0;
  const reasons: string[] = [];
  if (entity.vertices.length < 2) reasons.push("fewer than 2 vertices");
  if ((flag & 2) === 2) reasons.push("curve-fit flag");
  if ((flag & 4) === 4) reasons.push("spline-fit flag");
  if ((flag & 16) === 16) reasons.push("mesh flag");
  if ((flag & 64) === 64) reasons.push("polyface flag");
  return reasons.join(", ") || "unsupported legacy POLYLINE mode";
}

function extractFittingVertices(entity: LegacyPolylineEntity): LegacyPolylineVertex[] | null {
  const flag = entity.flag ?? 0;
  if ((flag & 4) === 4) {
    const fitting = entity.vertices.filter((v) => ((v.flag ?? 0) & 8) === 8 && ((v.flag ?? 0) & 16) === 0);
    return fitting.length >= 2 ? fitting : null;
  }
  if ((flag & 2) === 2) {
    const fitting = entity.vertices.filter((v) => ((v.flag ?? 0) & 1) === 1);
    return fitting.length >= 2 ? fitting : null;
  }
  return null;
}

function legacyPolylineToEntity(entity: LegacyPolylineEntity, fallbackIndex: number): DrawingEntity {
  const bulges = entity.vertices.map((vertex) => vertex.bulge ?? 0);
  return {
    ...entityBase(entity, "polyline", fallbackIndex),
    type: "polyline",
    points: entity.vertices.map((vertex) => point(vertex.x, vertex.y, vertex.z ?? entity.z ?? 0)),
    closed: ((entity.flag ?? 0) & 1) === 1,
    ...(bulges.some((bulge) => Math.abs(bulge) > 1e-12) && { bulges })
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

function isNonUniformInsertScale(insert: DxfInsertEntity) {
  const scale = insertScale(insert);
  const absX = Math.abs(scale.x);
  const absY = Math.abs(scale.y);
  const absZ = Math.abs(scale.z);
  return Math.abs(absX - absY) > 1e-9 || Math.abs(absX - absZ) > 1e-9;
}

function lwPolylineHasBulges(entity: LWPolylineEntity) {
  return entity.vertices.some((vertex) => vertex.bulge !== undefined && Math.abs(vertex.bulge) > 1e-12);
}

function blockSupportsNonUniformTransform(block: DxfBlockDefinition, blocks: Map<string, DxfBlockDefinition>, seen = new Set<string>()): boolean {
  const blockName = block.name ?? "";
  if (seen.has(blockName)) return false;
  const nextSeen = new Set(seen);
  nextSeen.add(blockName);

  if (
    block.entities.circles.length > 0 ||
    block.entities.arcs.length > 0 ||
    block.entities.ellipses.length > 0 ||
    block.entities.texts.length > 0 ||
    block.entities.attdefs.length > 0 ||
    block.entities.attribs.length > 0 ||
    block.entities.lwPolylines.some(lwPolylineHasBulges) ||
    block.entities.polylines.some(legacyPolylineHasBulges)
  ) {
    return false;
  }

  for (const childInsert of block.entities.inserts as DxfInsertEntity[]) {
    const childBlock = blocks.get(blockNameForInsert(childInsert));
    if (!childBlock || !blockSupportsNonUniformTransform(childBlock, blocks, nextSeen)) {
      return false;
    }
  }

  return true;
}

function hardInsertTransformReason(insert: DxfInsertEntity, block?: DxfBlockDefinition, blocks?: Map<string, DxfBlockDefinition>) {
  const reasons: string[] = [];
  if (isNonUniformInsertScale(insert) && (!block || !blocks || !blockSupportsNonUniformTransform(block, blocks))) {
    reasons.push("non-uniform scale");
  }
  return reasons.join(", ");
}

function hasMirrorAxes(insert: DxfInsertEntity) {
  const scale = insertScale(insert);
  return scale.x < 0 || scale.y < 0 || scale.z < 0;
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
    ["3DSOLID", block.entities.solid3ds]
  ];

  for (const [entityType, entities] of entityGroups) {
    if ((entities?.length ?? 0) > 0) {
      skippable.push(entityType);
    }
  }

  if ((block.entities.polylines ?? []).some((entity) => !isSimpleLegacyPolyline(entity) && extractFittingVertices(entity) === null)) {
    skippable.push("COMPLEX_POLYLINE");
  }

  return skippable.sort((a, b) => a.localeCompare(b));
}

function blockSkippedEntityCounts(block: DxfBlockDefinition, skippableTypes: string[]) {
  const counts: string[] = [];
  const entityGroups: Array<[string, EntityCommons[]]> = [
    ["3DSOLID", block.entities.solid3ds]
  ];

  for (const [entityType, entities] of entityGroups) {
    if (skippableTypes.includes(entityType) && (entities?.length ?? 0) > 0) {
      counts.push(`${entityType}×${entities.length}`);
    }
  }

  const complexPolylineCount = (block.entities.polylines ?? []).filter((entity) => !isSimpleLegacyPolyline(entity) && extractFittingVertices(entity) === null).length;
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
  const scale = insertScale(insert);
  const radians = ((insert.rotation ?? 0) * Math.PI) / 180;
  const localX = ((x ?? 0) - (block.basePointX ?? 0)) * scale.x;
  const localY = ((y ?? 0) - (block.basePointY ?? 0)) * scale.y;
  const localZ = ((z ?? 0) - (block.basePointZ ?? 0)) * scale.z;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return [
    localX * cos - localY * sin + (insert.x ?? 0),
    localX * sin + localY * cos + (insert.y ?? 0),
    localZ + (insert.z ?? 0)
  ];
}

function transformBlockVector(x: number | undefined, y: number | undefined, z: number | undefined, insert: DxfInsertEntity): [number, number, number] {
  const scale = insertScale(insert);
  const radians = ((insert.rotation ?? 0) * Math.PI) / 180;
  const localX = (x ?? 0) * scale.x;
  const localY = (y ?? 0) * scale.y;
  const localZ = (z ?? 0) * scale.z;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return [localX * cos - localY * sin, localX * sin + localY * cos, localZ];
}

function transformPolylineBulges(bulges: number[], insert: DxfInsertEntity) {
  const scale = insertScale(insert);
  const determinantSign = scale.x * scale.y < 0 ? -1 : 1;
  return bulges.map((bulge) => bulge * determinantSign);
}

function transformArcAngles(startAngle: number, endAngle: number, insert: DxfInsertEntity): [number, number] {
  const scale = insertScale(insert);
  const mirrorX = scale.x < 0;
  const mirrorY = scale.y < 0;
  const rot = insert.rotation ?? 0;
  // X mirror reflects angles in the Y axis (θ → 180−θ), also reverses arc direction
  if (mirrorX && !mirrorY) return [180 - endAngle + rot, 180 - startAngle + rot];
  // Y mirror reflects angles in the X axis (θ → −θ), also reverses arc direction
  if (!mirrorX && mirrorY) return [-endAngle + rot, -startAngle + rot];
  // Both X and Y mirror = 180° rotation, no direction reversal
  if (mirrorX && mirrorY) return [startAngle + 180 + rot, endAngle + 180 + rot];
  return [startAngle + rot, endAngle + rot];
}

// AutoCAD MIRRTEXT=0 default: text remains readable when the host insert is mirrored.
// We compose insert rotation with text rotation; we do NOT reflect the angle for mirror.
// Position is still mirror-correct via transformBlockPoint. Acceptable v1 limitation.
function transformTextRotation(textRotation: number, insert: DxfInsertEntity): number {
  return textRotation + (insert.rotation ?? 0);
}

function composeInserts(outerInsert: DxfInsertEntity, outerBlock: DxfBlockDefinition, flatChildInsert: DxfInsertEntity): DxfInsertEntity {
  const outerScale = insertScale(outerInsert);
  const childScale = insertScale(flatChildInsert);
  const [composedX, composedY] = transformBlockPoint(flatChildInsert.x ?? 0, flatChildInsert.y ?? 0, 0, outerInsert, outerBlock);
  return {
    ...flatChildInsert,
    handle: `${outerInsert.handle ?? "outer"}-${flatChildInsert.handle ?? "child"}`,
    x: composedX,
    y: composedY,
    z: 0,
    xScale: outerScale.x * childScale.x,
    yScale: outerScale.y * childScale.y,
    zScale: outerScale.z * childScale.z,
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

function pointToEntity(entity: PointEntity, fallbackIndex: number): DrawingEntity {
  return {
    ...entityBase(entity, "point", fallbackIndex),
    type: "point",
    position: point(entity.x, entity.y, entity.z),
    ...(entity.thickness !== undefined && { thickness: entity.thickness }),
    ...(entity.xAxisAngle !== undefined && { xAxisAngle: entity.xAxisAngle })
  };
}

function ellipseToEntity(entity: EllipseEntity, fallbackIndex: number): DrawingEntity {
  return {
    ...entityBase(entity, "ellipse", fallbackIndex),
    type: "ellipse",
    center: point(entity.centerX, entity.centerY, entity.centerZ),
    majorAxis: point(entity.majorAxisX, entity.majorAxisY, entity.majorAxisZ),
    minorToMajorRatio: entity.ratioOfMinorAxisToMajorAxis,
    startParameter: entity.startParameter,
    endParameter: entity.endParameter
  };
}

function vectorFromParserPoint(value: { x?: number; y?: number; z?: number }): [number, number, number] {
  return point(value.x, value.y, value.z);
}

function splineToEntity(entity: SplineEntity, fallbackIndex: number): DrawingEntity {
  return {
    ...entityBase(entity, "spline", fallbackIndex),
    type: "spline",
    degree: entity.degree ?? 0,
    flags: entity.flags,
    normal: point(entity.normalVectorX, entity.normalVectory, entity.normalVectorZ),
    knots: entity.knots ?? [],
    weights: entity.weights ?? [],
    controlPoints: (entity.controlPoints ?? []).map(vectorFromParserPoint),
    fitPoints: (entity.fitPoints ?? []).map(vectorFromParserPoint),
    startTangent: point(entity.startTangentX, entity.startTangentY, entity.startTangentZ),
    endTangent: point(entity.endTangentX, entity.endTangentY, entity.endTangentZ),
    knotTolerance: entity.knotTolerance,
    controlPointTolerance: entity.controlPointTolerance,
    fitTolerance: entity.fitTolerance
  };
}

function face3dVertices(entity: Face3DEntity): [number, number, number][] {
  const vertices = [
    point(entity.firstX, entity.firstY, entity.firstZ),
    point(entity.secondX, entity.secondY, entity.secondZ),
    point(entity.thirdX, entity.thirdY, entity.thirdZ),
    point(entity.fourthX, entity.fourthY, entity.fourthZ)
  ];
  const third = vertices[2];
  const fourth = vertices[3];
  return fourth[0] === third[0] && fourth[1] === third[1] && fourth[2] === third[2] ? vertices.slice(0, 3) : vertices;
}

function face3dToEntity(entity: Face3DEntity, fallbackIndex: number): DrawingEntity {
  return {
    ...entityBase(entity, "face3d", fallbackIndex),
    type: "face3d",
    vertices: face3dVertices(entity),
    ...(entity.invisibleEdgeFlag !== undefined && { invisibleEdgeFlag: entity.invisibleEdgeFlag })
  };
}

function solidVertices(entity: SolidEntity): [number, number, number][] {
  const vertices = [
    point(entity.firstX, entity.firstY, entity.firstZ),
    point(entity.secondX, entity.secondY, entity.secondZ),
    point(entity.thirdX, entity.thirdY, entity.thirdZ),
    point(entity.fourthX, entity.fourthY, entity.fourthZ)
  ];
  const third = vertices[2];
  const fourth = vertices[3];
  return fourth[0] === third[0] && fourth[1] === third[1] && fourth[2] === third[2] ? vertices.slice(0, 3) : vertices;
}

function solidToEntity(entity: SolidEntity, fallbackIndex: number): DrawingEntity {
  return {
    ...entityBase(entity, "solid", fallbackIndex),
    type: "solid",
    vertices: solidVertices(entity),
    ...(entity.thickness !== undefined && { thickness: entity.thickness })
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
  const bulges = transformPolylineBulges(entity.vertices.map((vertex) => vertex.bulge ?? 0), insert);
  return {
    ...expandedEntityBase("polyline", insert, blockName, entity, fallbackIndex),
    type: "polyline",
    points: entity.vertices.map((vertex) => transformBlockPoint(vertex.x, vertex.y, entity.elevation ?? 0, insert, block)),
    closed: (entity.flag & 1) === 1,
    ...(bulges.some((bulge) => Math.abs(bulge) > 1e-12) && { bulges })
  };
}

function expandBlockLegacyPolyline(
  entity: LegacyPolylineEntity,
  insert: DxfInsertEntity,
  block: DxfBlockDefinition,
  blockName: string,
  fallbackIndex: number
): DrawingEntity {
  const bulges = transformPolylineBulges(entity.vertices.map((vertex) => vertex.bulge ?? 0), insert);
  return {
    ...expandedEntityBase("polyline", insert, blockName, entity, fallbackIndex),
    type: "polyline",
    points: entity.vertices.map((vertex) => transformBlockPoint(vertex.x, vertex.y, vertex.z ?? entity.z ?? 0, insert, block)),
    closed: ((entity.flag ?? 0) & 1) === 1,
    ...(bulges.some((bulge) => Math.abs(bulge) > 1e-12) && { bulges })
  };
}

function expandBlockCircle(entity: CircleEntity, insert: DxfInsertEntity, block: DxfBlockDefinition, blockName: string, fallbackIndex: number): DrawingEntity {
  return {
    ...expandedEntityBase("circle", insert, blockName, entity, fallbackIndex),
    type: "circle",
    center: transformBlockPoint(entity.centerX, entity.centerY, entity.centerZ, insert, block),
    radius: entity.radius * Math.abs(insertScale(insert).x)
  };
}

function expandBlockArc(entity: ArcEntity, insert: DxfInsertEntity, block: DxfBlockDefinition, blockName: string, fallbackIndex: number): DrawingEntity {
  const [startAngleDeg, endAngleDeg] = transformArcAngles(entity.startAngle, entity.endAngle, insert);
  return {
    ...expandedEntityBase("arc", insert, blockName, entity, fallbackIndex),
    type: "arc",
    center: transformBlockPoint(entity.centerX, entity.centerY, entity.centerZ, insert, block),
    radius: entity.radius * Math.abs(insertScale(insert).x),
    startAngleDeg,
    endAngleDeg
  };
}

function expandBlockPoint(entity: PointEntity, insert: DxfInsertEntity, block: DxfBlockDefinition, blockName: string, fallbackIndex: number): DrawingEntity {
  return {
    ...expandedEntityBase("point", insert, blockName, entity, fallbackIndex),
    type: "point",
    position: transformBlockPoint(entity.x, entity.y, entity.z, insert, block),
    ...(entity.thickness !== undefined && { thickness: entity.thickness * Math.abs(insertScale(insert).x) }),
    ...(entity.xAxisAngle !== undefined && { xAxisAngle: entity.xAxisAngle + (insert.rotation ?? 0) })
  };
}

function expandBlockEllipse(entity: EllipseEntity, insert: DxfInsertEntity, block: DxfBlockDefinition, blockName: string, fallbackIndex: number): DrawingEntity {
  return {
    ...expandedEntityBase("ellipse", insert, blockName, entity, fallbackIndex),
    type: "ellipse",
    center: transformBlockPoint(entity.centerX, entity.centerY, entity.centerZ, insert, block),
    majorAxis: transformBlockVector(entity.majorAxisX, entity.majorAxisY, entity.majorAxisZ, insert),
    minorToMajorRatio: entity.ratioOfMinorAxisToMajorAxis,
    startParameter: entity.startParameter,
    endParameter: entity.endParameter
  };
}

function expandBlockSpline(entity: SplineEntity, insert: DxfInsertEntity, block: DxfBlockDefinition, blockName: string, fallbackIndex: number): DrawingEntity {
  return {
    ...expandedEntityBase("spline", insert, blockName, entity, fallbackIndex),
    type: "spline",
    degree: entity.degree ?? 0,
    flags: entity.flags,
    normal: point(entity.normalVectorX, entity.normalVectory, entity.normalVectorZ),
    knots: entity.knots ?? [],
    weights: entity.weights ?? [],
    controlPoints: (entity.controlPoints ?? []).map((value) => transformBlockPoint(value.x, value.y, value.z, insert, block)),
    fitPoints: (entity.fitPoints ?? []).map((value) => transformBlockPoint(value.x, value.y, value.z, insert, block)),
    startTangent: transformBlockVector(entity.startTangentX, entity.startTangentY, entity.startTangentZ, insert),
    endTangent: transformBlockVector(entity.endTangentX, entity.endTangentY, entity.endTangentZ, insert),
    knotTolerance: entity.knotTolerance,
    controlPointTolerance: entity.controlPointTolerance,
    fitTolerance: entity.fitTolerance
  };
}

function expandBlockFace3d(entity: Face3DEntity, insert: DxfInsertEntity, block: DxfBlockDefinition, blockName: string, fallbackIndex: number): DrawingEntity {
  return {
    ...expandedEntityBase("face3d", insert, blockName, entity, fallbackIndex),
    type: "face3d",
    vertices: face3dVertices(entity).map((value) => transformBlockPoint(value[0], value[1], value[2], insert, block)),
    ...(entity.invisibleEdgeFlag !== undefined && { invisibleEdgeFlag: entity.invisibleEdgeFlag })
  };
}

function expandBlockSolid(entity: SolidEntity, insert: DxfInsertEntity, block: DxfBlockDefinition, blockName: string, fallbackIndex: number): DrawingEntity {
  return {
    ...expandedEntityBase("solid", insert, blockName, entity, fallbackIndex),
    type: "solid",
    vertices: solidVertices(entity).map((value) => transformBlockPoint(value[0], value[1], value[2], insert, block)),
    ...(entity.thickness !== undefined && { thickness: entity.thickness * Math.abs(insertScale(insert).x) })
  };
}

type DxfTextEntity = EntityCommons & {
  text?: string;
  textHeight?: number;
  height?: number;
  rotation?: number;
  firstAlignmentX?: number;
  firstAlignmentY?: number;
  firstAlignmentZ?: number;
  firstAlignmentPointX?: number;
  firstAlignmentPointY?: number;
  firstAlignmentPointZ?: number;
  horizontalJustification?: number;
  verticalJustification?: number;
  secondAlignmentendX?: number;
  secondAlignmentendY?: number;
  secondAlignmentendZ?: number;
};

type DxfAttdefEntity = DxfTextEntity & {
  value?: string;
  tag?: string;
  secondAlignmentPointX?: number;
  secondAlignmentPointY?: number;
  secondAlignmentPointZ?: number;
};

type DxfAttribEntity = DxfTextEntity & {
  value?: string;
  tag?: string;
  startPointX?: number;
  startPointY?: number;
  startPointZ?: number;
  alignmentPointX?: number;
  alignmentPointY?: number;
  alignmentPointZ?: number;
};

function textInsertionPoint(entity: DxfTextEntity): [number, number, number] {
  const attrib = entity as DxfAttribEntity;
  const x = entity.firstAlignmentX ?? entity.firstAlignmentPointX ?? attrib.startPointX ?? 0;
  const y = entity.firstAlignmentY ?? entity.firstAlignmentPointY ?? attrib.startPointY ?? 0;
  const z = entity.firstAlignmentZ ?? entity.firstAlignmentPointZ ?? attrib.startPointZ ?? 0;
  return [x, y, z];
}

function textSecondPoint(entity: DxfTextEntity): [number, number, number] {
  return [entity.secondAlignmentendX ?? 0, entity.secondAlignmentendY ?? 0, entity.secondAlignmentendZ ?? 0];
}

function attdefSecondPoint(entity: DxfAttdefEntity): [number, number, number] {
  return [
    entity.secondAlignmentPointX ?? entity.secondAlignmentendX ?? 0,
    entity.secondAlignmentPointY ?? entity.secondAlignmentendY ?? 0,
    entity.secondAlignmentPointZ ?? entity.secondAlignmentendZ ?? 0
  ];
}

function textHeightOf(entity: DxfTextEntity): number {
  return entity.textHeight ?? entity.height ?? 0;
}

function attdefDisplayString(entity: DxfAttdefEntity): string {
  const value = (entity.value ?? "").trim();
  return value.length > 0 ? value : entity.tag ?? "";
}

function attribDisplayString(entity: DxfAttribEntity): string {
  const value = (entity.value ?? "").trim();
  return value.length > 0 ? value : entity.tag ?? "";
}

function textToEntity(entity: DxfTextEntity, fallbackIndex: number): DrawingEntity {
  const h = entity.horizontalJustification ?? 0;
  const v = entity.verticalJustification ?? 0;
  const useAlignment = h !== 0 || v !== 0;
  const secondPt = textSecondPoint(entity);
  const [x, y, z] = useAlignment ? secondPt : textInsertionPoint(entity);
  return {
    ...entityBase(entity, "text", fallbackIndex),
    type: "text",
    text: entity.text ?? "",
    position: point(x, y, z),
    rotationDeg: entity.rotation ?? 0,
    height: Math.max(textHeightOf(entity), 1e-6),
    origin: "TEXT",
    ...(h !== 0 && { hAlign: h }),
    ...(v !== 0 && { vAlign: v }),
    ...(useAlignment && { alignmentPoint: secondPt })
  };
}

function attdefToEntity(entity: DxfAttdefEntity, fallbackIndex: number): DrawingEntity {
  const h = entity.horizontalJustification ?? 0;
  const v = entity.verticalJustification ?? 0;
  const useAlignment = h !== 0 || v !== 0;
  const secondPt = attdefSecondPoint(entity);
  const [x, y, z] = useAlignment ? secondPt : textInsertionPoint(entity);
  return {
    ...entityBase(entity, "text", fallbackIndex),
    type: "text",
    text: attdefDisplayString(entity),
    position: point(x, y, z),
    rotationDeg: entity.rotation ?? 0,
    height: Math.max(textHeightOf(entity), 1e-6),
    origin: "ATTDEF",
    tag: entity.tag,
    ...(h !== 0 && { hAlign: h }),
    ...(v !== 0 && { vAlign: v }),
    ...(useAlignment && { alignmentPoint: secondPt })
  };
}

function attribToEntity(entity: DxfAttribEntity, fallbackIndex: number): DrawingEntity {
  const h = entity.horizontalJustification ?? 0;
  const v = entity.verticalJustification ?? 0;
  const useAlignment = h !== 0 || v !== 0;
  const secondPt: [number, number, number] = [
    entity.alignmentPointX ?? entity.secondAlignmentendX ?? 0,
    entity.alignmentPointY ?? entity.secondAlignmentendY ?? 0,
    entity.alignmentPointZ ?? entity.secondAlignmentendZ ?? 0
  ];
  const [x, y, z] = useAlignment ? secondPt : textInsertionPoint(entity);
  return {
    ...entityBase(entity, "text", fallbackIndex),
    type: "text",
    text: attribDisplayString(entity),
    position: point(x, y, z),
    rotationDeg: entity.rotation ?? 0,
    height: Math.max(textHeightOf(entity), 1e-6),
    origin: "ATTRIB",
    tag: entity.tag,
    ...(h !== 0 && { hAlign: h }),
    ...(v !== 0 && { vAlign: v }),
    ...(useAlignment && { alignmentPoint: secondPt })
  };
}

function expandBlockText(entity: DxfTextEntity, insert: DxfInsertEntity, block: DxfBlockDefinition, blockName: string, fallbackIndex: number): DrawingEntity {
  const h = entity.horizontalJustification ?? 0;
  const v = entity.verticalJustification ?? 0;
  const useAlignment = h !== 0 || v !== 0;
  const secondPt = textSecondPoint(entity);
  const [x, y, z] = useAlignment ? secondPt : textInsertionPoint(entity);
  const scaleMagnitude = Math.abs(insertScale(insert).x);
  return {
    ...expandedEntityBase("text", insert, blockName, entity, fallbackIndex),
    type: "text",
    text: entity.text ?? "",
    position: transformBlockPoint(x, y, z, insert, block),
    rotationDeg: transformTextRotation(entity.rotation ?? 0, insert),
    height: Math.max(textHeightOf(entity) * scaleMagnitude, 1e-6),
    origin: "TEXT",
    ...(h !== 0 && { hAlign: h }),
    ...(v !== 0 && { vAlign: v }),
    ...(useAlignment && { alignmentPoint: transformBlockPoint(secondPt[0], secondPt[1], secondPt[2], insert, block) })
  };
}

function expandBlockAttdef(entity: DxfAttdefEntity, insert: DxfInsertEntity, block: DxfBlockDefinition, blockName: string, fallbackIndex: number): DrawingEntity {
  const h = entity.horizontalJustification ?? 0;
  const v = entity.verticalJustification ?? 0;
  const useAlignment = h !== 0 || v !== 0;
  const secondPt = attdefSecondPoint(entity);
  const [x, y, z] = useAlignment ? secondPt : textInsertionPoint(entity);
  const scaleMagnitude = Math.abs(insertScale(insert).x);
  return {
    ...expandedEntityBase("text", insert, blockName, entity, fallbackIndex),
    type: "text",
    text: attdefDisplayString(entity),
    position: transformBlockPoint(x, y, z, insert, block),
    rotationDeg: transformTextRotation(entity.rotation ?? 0, insert),
    height: Math.max(textHeightOf(entity) * scaleMagnitude, 1e-6),
    origin: "ATTDEF",
    tag: entity.tag,
    ...(h !== 0 && { hAlign: h }),
    ...(v !== 0 && { vAlign: v }),
    ...(useAlignment && { alignmentPoint: transformBlockPoint(secondPt[0], secondPt[1], secondPt[2], insert, block) })
  };
}

function expandBlockAttrib(entity: DxfAttribEntity, insert: DxfInsertEntity, block: DxfBlockDefinition, blockName: string, fallbackIndex: number): DrawingEntity {
  const h = entity.horizontalJustification ?? 0;
  const v = entity.verticalJustification ?? 0;
  const useAlignment = h !== 0 || v !== 0;
  const secondPt: [number, number, number] = [
    entity.alignmentPointX ?? entity.secondAlignmentendX ?? 0,
    entity.alignmentPointY ?? entity.secondAlignmentendY ?? 0,
    entity.alignmentPointZ ?? entity.secondAlignmentendZ ?? 0
  ];
  const [x, y, z] = useAlignment ? secondPt : textInsertionPoint(entity);
  const scaleMagnitude = Math.abs(insertScale(insert).x);
  return {
    ...expandedEntityBase("text", insert, blockName, entity, fallbackIndex),
    type: "text",
    text: attribDisplayString(entity),
    position: transformBlockPoint(x, y, z, insert, block),
    rotationDeg: transformTextRotation(entity.rotation ?? 0, insert),
    height: Math.max(textHeightOf(entity) * scaleMagnitude, 1e-6),
    origin: "ATTRIB",
    tag: entity.tag,
    ...(h !== 0 && { hAlign: h }),
    ...(v !== 0 && { vAlign: v }),
    ...(useAlignment && { alignmentPoint: transformBlockPoint(secondPt[0], secondPt[1], secondPt[2], insert, block) })
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
  const coverage = emptyCoverageReport();
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
    markCovered(coverage, "LINE");
  }
  for (const entity of [...parsed.entities.lwPolylines].sort(byHandle)) {
    const converted = lwPolylineToEntity(entity, index++);
    entities.push(converted);
    registerSource(converted, "LWPOLYLINE", entity.handle ?? converted.id);
    markCovered(coverage, "LWPOLYLINE");
  }
  for (const entity of [...parsed.entities.circles].sort(byHandle)) {
    const converted = circleToEntity(entity, index++);
    entities.push(converted);
    registerSource(converted, "CIRCLE", entity.handle ?? converted.id);
    markCovered(coverage, "CIRCLE");
  }
  for (const entity of [...parsed.entities.arcs].sort(byHandle)) {
    const converted = arcToEntity(entity, index++);
    entities.push(converted);
    registerSource(converted, "ARC", entity.handle ?? converted.id);
    markCovered(coverage, "ARC");
  }

  for (const entity of [...(parsed.entities.texts as unknown as DxfTextEntity[])].sort(byHandle)) {
    const converted = textToEntity(entity, index++);
    entities.push(converted);
    registerSource(converted, "TEXT", entity.handle ?? converted.id);
    markCovered(coverage, "TEXT");
  }

  for (const entity of [...parsed.entities.points].sort(byHandle)) {
    const converted = pointToEntity(entity, index++);
    entities.push(converted);
    registerSource(converted, "POINT", entity.handle ?? converted.id);
    markCovered(coverage, "POINT");
  }

  for (const entity of [...parsed.entities.ellipses].sort(byHandle)) {
    const converted = ellipseToEntity(entity, index++);
    entities.push(converted);
    registerSource(converted, "ELLIPSE", entity.handle ?? converted.id);
    markCovered(coverage, "ELLIPSE");
  }

  for (const entity of [...parsed.entities.splines].sort(byHandle)) {
    const converted = splineToEntity(entity, index++);
    entities.push(converted);
    registerSource(converted, "SPLINE", entity.handle ?? converted.id);
    markCovered(coverage, "SPLINE");
  }

  for (const entity of [...parsed.entities.face3ds].sort(byHandle)) {
    const converted = face3dToEntity(entity, index++);
    entities.push(converted);
    registerSource(converted, "3DFACE", entity.handle ?? converted.id);
    markCovered(coverage, "3DFACE");
  }

  for (const entity of [...parsed.entities.solids].sort(byHandle)) {
    const converted = solidToEntity(entity, index++);
    entities.push(converted);
    registerSource(converted, "SOLID", entity.handle ?? converted.id);
    markCovered(coverage, "SOLID");
  }

  for (const entity of [...(parsed.entities.attdefs as unknown as DxfAttdefEntity[])].sort(byHandle)) {
    const converted = attdefToEntity(entity, index++);
    entities.push(converted);
    registerSource(converted, "ATTDEF", entity.handle ?? converted.id);
    markCovered(coverage, "ATTDEF");
  }

  for (const entity of [...(parsed.entities.attribs as unknown as DxfAttribEntity[])].sort(byHandle)) {
    const converted = attribToEntity(entity, index++);
    entities.push(converted);
    registerSource(converted, "ATTRIB", entity.handle ?? converted.id);
    markCovered(coverage, "ATTRIB");
  }

  for (const entity of [...parsed.entities.solid3ds].sort(byHandle)) {
    markFailed(coverage, {
      code: "DXF_3DSOLID_UNSUPPORTED",
      entityType: "3DSOLID",
      handle: entity.handle,
      message: "DXF 3DSOLID ACIS payload is not converted by the layout importer."
    });
    warnings.push(unsupportedWarning("3DSOLID", entity));
  }

  for (const entity of [...(parsed.entities.polylines as LegacyPolylineEntity[])].sort(byHandle)) {
    if (isSimpleLegacyPolyline(entity)) {
      const converted = legacyPolylineToEntity(entity, index++);
      entities.push(converted);
      registerSource(converted, "POLYLINE", entity.handle ?? converted.id);
      markCovered(coverage, "POLYLINE");
    } else {
      const fittingVertices = extractFittingVertices(entity);
      if (fittingVertices !== null) {
        const converted = legacyPolylineToEntity({ ...entity, vertices: fittingVertices }, index++);
        entities.push(converted);
        registerSource(converted, "POLYLINE", entity.handle ?? converted.id);
        markCovered(coverage, "POLYLINE");
        warnings.push({
          code: "DXF_POLYLINE_SPLINE_APPROXIMATED",
          message: `DXF POLYLINE entity was expanded using pre-sampled fitting vertices from the DXF file.`,
          entityType: "POLYLINE",
          handle: entity.handle
        });
      } else {
        const flag = entity.flag ?? 0;
        const isSplineOrCurveFit = (flag & 4) === 4 || (flag & 2) === 2;
        const reason = isSplineOrCurveFit
          ? `${(flag & 4) === 4 ? "spline-fit" : "curve-fit"} POLYLINE has no usable fitting vertices`
          : legacyPolylineUnsupportedReason(entity);
        warnings.push({
          code: "DXF_POLYLINE_UNSUPPORTED",
          message: `DXF POLYLINE entity is not a simple vertex chain and was skipped: ${reason}.`,
          entityType: "POLYLINE",
          handle: entity.handle
        });
        markFailed(coverage, {
          code: "DXF_POLYLINE_UNSUPPORTED",
          message: `DXF POLYLINE entity is not a simple vertex chain and was skipped: ${reason}.`,
          entityType: "POLYLINE",
          handle: entity.handle
        });
      }
    }
  }

  const addExpanded = (converted: DrawingEntity, entityType: string, entityId: string, note: string) => {
    entities.push(converted);
    registerSource(converted, entityType, entityId, note);
    markCovered(coverage, entityType);
  };

  const expandBlockContents = (insert: DxfInsertEntity, block: DxfBlockDefinition, blockName: string, blockPath: string[]) => {
    const note = `Expanded from ${blockPath.join(", ")}.`;

    const skippableTypes = blockSkippableEntityTypes(block);
    if (skippableTypes.length > 0) {
      const countDetail = blockSkippedEntityCounts(block, skippableTypes);
      warnings.push({
        code: "DXF_BLOCK_PARTIAL_EXPAND",
        message: `DXF BLOCK "${blockName}" was partially expanded; unsupported children skipped: ${countDetail}.`,
        entityType: "INSERT",
        handle: insert.handle
      });
    }

    for (const child of [...block.entities.lines].sort(byHandle)) addExpanded(expandBlockLine(child, insert, block, blockName, index++), "LINE", child.handle ?? "LINE", note);
    for (const child of [...block.entities.lwPolylines].sort(byHandle)) addExpanded(expandBlockLWPolyline(child, insert, block, blockName, index++), "LWPOLYLINE", child.handle ?? "LWPOLYLINE", note);
    for (const child of [...block.entities.circles].sort(byHandle)) addExpanded(expandBlockCircle(child, insert, block, blockName, index++), "CIRCLE", child.handle ?? "CIRCLE", note);
    for (const child of [...block.entities.arcs].sort(byHandle)) addExpanded(expandBlockArc(child, insert, block, blockName, index++), "ARC", child.handle ?? "ARC", note);
    for (const child of [...block.entities.points].sort(byHandle)) addExpanded(expandBlockPoint(child, insert, block, blockName, index++), "POINT", child.handle ?? "POINT", note);
    for (const child of [...block.entities.ellipses].sort(byHandle)) addExpanded(expandBlockEllipse(child, insert, block, blockName, index++), "ELLIPSE", child.handle ?? "ELLIPSE", note);
    for (const child of [...block.entities.splines].sort(byHandle)) addExpanded(expandBlockSpline(child, insert, block, blockName, index++), "SPLINE", child.handle ?? "SPLINE", note);
    for (const child of [...block.entities.face3ds].sort(byHandle)) addExpanded(expandBlockFace3d(child, insert, block, blockName, index++), "3DFACE", child.handle ?? "3DFACE", note);
    for (const child of [...block.entities.solids].sort(byHandle)) addExpanded(expandBlockSolid(child, insert, block, blockName, index++), "SOLID", child.handle ?? "SOLID", note);
    for (const child of [...(block.entities.texts as unknown as DxfTextEntity[])].sort(byHandle)) addExpanded(expandBlockText(child, insert, block, blockName, index++), "TEXT", child.handle ?? "TEXT", note);
    for (const child of [...(block.entities.attdefs as unknown as DxfAttdefEntity[])].sort(byHandle)) addExpanded(expandBlockAttdef(child, insert, block, blockName, index++), "ATTDEF", child.handle ?? "ATTDEF", note);
    for (const child of [...(block.entities.attribs as unknown as DxfAttribEntity[])].sort(byHandle)) addExpanded(expandBlockAttrib(child, insert, block, blockName, index++), "ATTRIB", child.handle ?? "ATTRIB", note);

    for (const child of [...block.entities.polylines].sort(byHandle)) {
      if (isSimpleLegacyPolyline(child)) {
        addExpanded(expandBlockLegacyPolyline(child, insert, block, blockName, index++), "POLYLINE", child.handle ?? "POLYLINE", note);
      } else {
        const fittingVertices = extractFittingVertices(child);
        if (fittingVertices !== null) {
          addExpanded(expandBlockLegacyPolyline({ ...child, vertices: fittingVertices }, insert, block, blockName, index++), "POLYLINE", child.handle ?? "POLYLINE", note);
        } else {
          const reason = legacyPolylineUnsupportedReason(child);
          warnings.push({
            code: "DXF_POLYLINE_UNSUPPORTED",
            message: `DXF POLYLINE entity is not a simple vertex chain and was skipped: ${reason}.`,
            entityType: "POLYLINE",
            handle: child.handle
          });
          markFailed(coverage, {
            code: "DXF_POLYLINE_UNSUPPORTED",
            message: `DXF POLYLINE entity is not a simple vertex chain and was skipped: ${reason}.`,
            entityType: "POLYLINE",
            handle: child.handle,
            blockPath
          });
        }
      }
    }

    for (const child of [...block.entities.solid3ds].sort(byHandle)) {
      warnings.push(unsupportedWarning("3DSOLID", child));
      markFailed(coverage, {
        code: "DXF_3DSOLID_UNSUPPORTED",
        message: "DXF 3DSOLID ACIS payload is not converted by the layout importer.",
        entityType: "3DSOLID",
        handle: child.handle,
        blockPath
      });
    }

    for (const childInsertRaw of [...(block.entities.inserts as DxfInsertEntity[])].sort(byHandle)) {
      expandInsertEntity(childInsertRaw, insert, block, blockPath);
    }
  };

  const expandInsertEntity = (rawInsert: DxfInsertEntity, parentInsert?: DxfInsertEntity, parentBlock?: DxfBlockDefinition, parentPath: string[] = []) => {
    const blockName = blockNameForInsert(rawInsert);
    const blockPath = [...parentPath, `INSERT ${rawInsert.handle ?? "unknown"}, BLOCK ${blockName}`];
    if (parentPath.some((entry) => entry.endsWith(`BLOCK ${blockName}`))) {
      warnings.push({
        code: "DXF_BLOCK_INSERT_CYCLE",
        message: `DXF BLOCK "${blockName}" appears recursively in INSERT expansion; nested INSERT was skipped.`,
        entityType: "INSERT",
        handle: rawInsert.handle
      });
      markFailed(coverage, {
        code: "DXF_BLOCK_INSERT_CYCLE",
        message: `DXF BLOCK "${blockName}" appears recursively in INSERT expansion; nested INSERT was skipped.`,
        entityType: "INSERT",
        handle: rawInsert.handle,
        blockPath
      });
      return;
    }

    const block = blocks.get(blockName);
    if (!block) {
      warnings.push({
        code: "DXF_BLOCK_DEFINITION_MISSING",
        message: `DXF INSERT references missing BLOCK definition "${blockName}"; entity was skipped.`,
        entityType: "INSERT",
        handle: rawInsert.handle
      });
      markFailed(coverage, {
        code: "DXF_BLOCK_DEFINITION_MISSING",
        message: `DXF INSERT references missing BLOCK definition "${blockName}"; entity was skipped.`,
        entityType: "INSERT",
        handle: rawInsert.handle,
        blockPath
      });
      return;
    }

    const hardReason = hardInsertTransformReason(rawInsert, block, blocks);
    if (hardReason) {
      warnings.push({
        code: "DXF_BLOCK_INSERT_TRANSFORM_UNSUPPORTED",
        message: `DXF INSERT transform is not supported by the simple expander (${hardReason}); entity was skipped.`,
        entityType: "INSERT",
        handle: rawInsert.handle
      });
      markFailed(coverage, {
        code: "DXF_BLOCK_INSERT_TRANSFORM_UNSUPPORTED",
        message: `DXF INSERT transform is not supported by the simple expander (${hardReason}); entity was skipped.`,
        entityType: "INSERT",
        handle: rawInsert.handle,
        blockPath
      });
      return;
    }

    const flatInsert = hasZOffset(rawInsert) ? { ...rawInsert, z: 0 } : rawInsert;
    if (hasZOffset(rawInsert)) {
      warnings.push({
        code: "DXF_INSERT_Z_FLATTENED",
        message: `DXF INSERT was expanded with Z offset (${(rawInsert.z ?? 0).toFixed(4)}) flattened to 0 for 2D layout import.`,
        entityType: "INSERT",
        handle: rawInsert.handle
      });
    }
    if (hasMirrorAxes(rawInsert)) {
      warnings.push({
        code: "DXF_INSERT_MIRROR_FLATTENED",
        message: `DXF INSERT mirror scale was expanded by flipping output coordinates for 2D layout import.`,
        entityType: "INSERT",
        handle: rawInsert.handle
      });
    }

    const effectiveInsert = parentInsert && parentBlock ? composeInserts(parentInsert, parentBlock, flatInsert) : flatInsert;
    markCovered(coverage, "INSERT");
    expandBlockContents(effectiveInsert, block, blockName, blockPath);
  };

  for (const entity of [...(parsed.entities.inserts as DxfInsertEntity[])].sort(byHandle)) {
    expandInsertEntity(entity);
  }

  return {
    entities,
    sourceEntityTypes,
    sourceEntityIds,
    sourceNotes,
    coverage: finalizeCoverage(coverage),
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
    const layerEntities = byLayer.get(layerId);
    if (layerEntities) {
      layerEntities.push(entity);
    } else {
      byLayer.set(layerId, [entity]);
    }
  }
  return [...byLayer.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function buildScenePackage(
  inputPath: string,
  parsed: DxfGlobalObject,
  options: DxfImportOptions,
  warnings: DxfImportWarning[],
  rawMtextRecords: RawMtextRecord[] = []
): { scenePackage: ScenePackage; coverage: DxfCoverageReport } {
  const units = detectUnits(parsed, options, warnings);
  const layers = layersFromDxf(parsed);
  const converted = convertEntities(parsed);
  warnings.push(...converted.warnings);

  if (rawMtextRecords.length > 0) {
    let mtextIndex = 0;
    for (const record of rawMtextRecords) {
      const entity = mtextToEntity(record, mtextIndex++);
      converted.entities.push(entity);
      const sourceRef = entity.sourceRef ?? entity.id;
      converted.sourceEntityTypes.set(sourceRef, "MTEXT");
      converted.sourceEntityIds.set(sourceRef, record.handle ?? entity.id);
      markCovered(converted.coverage, "MTEXT");
    }
  }

  const geometryDocuments: GeometryDocument[] = [];
  const nodes: ScenePackage["scene"]["nodes"] = [
    {
      id: "node-dxf-root",
      displayName: baseNameFromPath(inputPath),
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

  const scenePackage: ScenePackage = {
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

  return { scenePackage, coverage: finalizeCoverage(converted.coverage) };
}

export async function importDxfTextToKairo(inputPath: string, content: string, options: DxfImportOptions = {}): Promise<DxfImportResult> {
  const totalStartedAt = performance.now();
  const timing: DxfImportTimingStage[] = [];

  const recordStage = (stage: string, startedAt: number) => {
    timing.push({ stage, ms: Math.max(0, performance.now() - startedAt) });
  };

  const preCleanStartedAt = performance.now();
  const preCleaned = preCleanDxfText(content);
  recordStage("pre-clean", preCleanStartedAt);

  const parser = new Parser();
  const parseStartedAt = performance.now();
  const parsed = await parser.parse(preCleaned.text);
  recordStage("dxf-parse", parseStartedAt);

  // @dxfjs/parser does not surface MTEXT entities, so we scan the cleaned DXF
  // text for direct-section MTEXT records ourselves. Without this, large
  // title-block headers (e.g. "7B-070L RACK LOAD" at 457.2 mm) are silently
  // dropped from the imported scene.
  const mtextStartedAt = performance.now();
  const rawMtext = extractDirectMtextEntities(preCleaned.text);
  recordStage("mtext-scan", mtextStartedAt);

  const warnings: DxfImportWarning[] = [];
  const buildStartedAt = performance.now();
  const built = buildScenePackage(inputPath, parsed, options, warnings, rawMtext);
  const { scenePackage, coverage } = built;
  recordStage("scene-package-build", buildStartedAt);

  const validationStartedAt = performance.now();
  const report = validateScenePackage(scenePackage);
  recordStage("validation", validationStartedAt);

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
      unsupportedEntityCount: coverage.failedInstances,
      layerCount: scenePackage.layers.layers.length,
      warningCount: warnings.length
    },
    coverage,
    preCleanReport: preCleaned.report,
    timing: [...timing, { stage: "total-import", ms: Math.max(0, performance.now() - totalStartedAt) }]
  };
}
