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

export type DxfImportTimingStage = {
  stage: string;
  ms: number;
};

export type DxfImportResult = {
  scenePackage: ScenePackage;
  warnings: DxfImportWarning[];
  summary: DxfImportSummary;
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

type LwPolylineVertex = {
  x?: number;
  y?: number;
  bulge?: number;
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
    origin: "TEXT",
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
  return {
    ...entityBase(entity, "polyline", fallbackIndex),
    type: "polyline",
    points: lwPolylinePoints(entity.vertices, entity.elevation ?? 0, (entity.flag & 1) === 1),
    closed: (entity.flag & 1) === 1
  };
}

function sampleBulgeSegment(start: LwPolylineVertex, end: LwPolylineVertex, z: number): Array<[number, number, number]> {
  const bulge = start.bulge ?? 0;
  const startX = start.x ?? 0;
  const startY = start.y ?? 0;
  const endX = end.x ?? 0;
  const endY = end.y ?? 0;
  const dx = endX - startX;
  const dy = endY - startY;
  const chord = Math.hypot(dx, dy);
  if (Math.abs(bulge) < 1e-12 || chord < 1e-9) {
    return [point(endX, endY, z)];
  }

  const theta = 4 * Math.atan(bulge);
  const radius = chord / (2 * Math.abs(Math.sin(theta / 2)));
  const chordAngle = Math.atan2(dy, dx);
  const centerAngle = chordAngle + (Math.PI / 2 - 2 * Math.atan(bulge));
  const centerX = startX + Math.cos(centerAngle) * radius;
  const centerY = startY + Math.sin(centerAngle) * radius;
  const startAngle = Math.atan2(startY - centerY, startX - centerX);
  const segmentCount = Math.max(2, Math.min(64, Math.ceil(Math.abs(theta) / (Math.PI / 18))));
  const points: Array<[number, number, number]> = [];

  for (let index = 1; index <= segmentCount; index += 1) {
    const angle = startAngle + (theta * index) / segmentCount;
    points.push(point(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius, z));
  }

  return points;
}

function lwPolylinePoints(vertices: LwPolylineVertex[], elevation: number, closed: boolean): Array<[number, number, number]> {
  if (vertices.length === 0) {
    return [];
  }

  const points: Array<[number, number, number]> = [point(vertices[0].x, vertices[0].y, elevation)];
  for (let index = 0; index < vertices.length - 1; index += 1) {
    points.push(...sampleBulgeSegment(vertices[index], vertices[index + 1], elevation));
  }

  if (closed && vertices.length > 1 && Math.abs(vertices[vertices.length - 1].bulge ?? 0) > 1e-12) {
    points.push(...sampleBulgeSegment(vertices[vertices.length - 1], vertices[0], elevation));
  }

  return points;
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
  const absX = Math.abs(scale.x);
  const absY = Math.abs(scale.y);
  const absZ = Math.abs(scale.z);
  const reasons: string[] = [];
  if (Math.abs(absX - absY) > 1e-9 || Math.abs(absX - absZ) > 1e-9) reasons.push("non-uniform scale");
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
    ["ATTRIB", block.entities.attribs],
    ["ELLIPSE", block.entities.ellipses],
    ["POINT", block.entities.points],
    ["SOLID", block.entities.solids],
    ["SPLINE", block.entities.splines],
    ["3DFACE", block.entities.face3ds],
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
    ["ATTRIB", block.entities.attribs],
    ["ELLIPSE", block.entities.ellipses],
    ["POINT", block.entities.points],
    ["SOLID", block.entities.solids],
    ["SPLINE", block.entities.splines],
    ["3DFACE", block.entities.face3ds],
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
    points: lwPolylinePoints(entity.vertices, entity.elevation ?? 0, (entity.flag & 1) === 1).map((vertex) =>
      transformBlockPoint(vertex[0], vertex[1], vertex[2], insert, block)
    ),
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

function textInsertionPoint(entity: DxfTextEntity): [number, number, number] {
  const x = entity.firstAlignmentX ?? entity.firstAlignmentPointX ?? 0;
  const y = entity.firstAlignmentY ?? entity.firstAlignmentPointY ?? 0;
  const z = entity.firstAlignmentZ ?? entity.firstAlignmentPointZ ?? 0;
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

  for (const entity of [...(parsed.entities.texts as unknown as DxfTextEntity[])].sort(byHandle)) {
    const converted = textToEntity(entity, index++);
    entities.push(converted);
    registerSource(converted, "TEXT", entity.handle ?? converted.id);
  }

  for (const entity of [...(parsed.entities.polylines as LegacyPolylineEntity[])].sort(byHandle)) {
    if (isSimpleLegacyPolyline(entity)) {
      const converted = legacyPolylineToEntity(entity, index++);
      entities.push(converted);
      registerSource(converted, "POLYLINE", entity.handle ?? converted.id);
    } else {
      const fittingVertices = extractFittingVertices(entity);
      if (fittingVertices !== null) {
        const converted = legacyPolylineToEntity({ ...entity, vertices: fittingVertices }, index++);
        entities.push(converted);
        registerSource(converted, "POLYLINE", entity.handle ?? converted.id);
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
      }
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
    if (hasMirrorAxes(entity)) {
      warnings.push({
        code: "DXF_INSERT_MIRROR_FLATTENED",
        message: `DXF INSERT mirror scale was expanded by flipping output coordinates for 2D layout import.`,
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
      if (isSimpleLegacyPolyline(child)) {
        const converted = expandBlockLegacyPolyline(child, expandInsert, block, blockName, index++);
        entities.push(converted);
        registerSource(converted, "POLYLINE", child.handle ?? converted.id, `Expanded from INSERT ${entity.handle ?? "unknown"}, BLOCK ${blockName}.`);
      } else {
        const fittingVertices = extractFittingVertices(child);
        if (fittingVertices !== null) {
          const converted = expandBlockLegacyPolyline({ ...child, vertices: fittingVertices }, expandInsert, block, blockName, index++);
          entities.push(converted);
          registerSource(converted, "POLYLINE", child.handle ?? converted.id, `Expanded from INSERT ${entity.handle ?? "unknown"}, BLOCK ${blockName}.`);
        }
      }
    }
    for (const child of [...(block.entities.texts as unknown as DxfTextEntity[])].sort(byHandle)) {
      const converted = expandBlockText(child, expandInsert, block, blockName, index++);
      entities.push(converted);
      registerSource(converted, "TEXT", child.handle ?? converted.id, `Expanded from INSERT ${entity.handle ?? "unknown"}, BLOCK ${blockName}.`);
    }
    for (const child of [...(block.entities.attdefs as unknown as DxfAttdefEntity[])].sort(byHandle)) {
      const converted = expandBlockAttdef(child, expandInsert, block, blockName, index++);
      entities.push(converted);
      registerSource(converted, "ATTDEF", child.handle ?? converted.id, `Expanded from INSERT ${entity.handle ?? "unknown"}, BLOCK ${blockName}.`);
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
      if (hasMirrorAxes(childInsertRaw)) {
        warnings.push({
          code: "DXF_INSERT_MIRROR_FLATTENED",
          message: `DXF INSERT mirror scale was expanded by flipping output coordinates for 2D layout import.`,
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
        if (isSimpleLegacyPolyline(grandchild)) {
          const converted = expandBlockLegacyPolyline(grandchild, composedInsert, childBlock, childBlockName, index++);
          entities.push(converted);
          registerSource(converted, "POLYLINE", grandchild.handle ?? converted.id, `Expanded from INSERT ${entity.handle ?? "unknown"}, BLOCK ${blockName}, INSERT ${childInsertRaw.handle ?? "unknown"}, BLOCK ${childBlockName}.`);
        } else {
          const fittingVertices = extractFittingVertices(grandchild);
          if (fittingVertices !== null) {
            const converted = expandBlockLegacyPolyline({ ...grandchild, vertices: fittingVertices }, composedInsert, childBlock, childBlockName, index++);
            entities.push(converted);
            registerSource(converted, "POLYLINE", grandchild.handle ?? converted.id, `Expanded from INSERT ${entity.handle ?? "unknown"}, BLOCK ${blockName}, INSERT ${childInsertRaw.handle ?? "unknown"}, BLOCK ${childBlockName}.`);
          }
        }
      }
      for (const grandchild of [...(childBlock.entities.texts as unknown as DxfTextEntity[])].sort(byHandle)) {
        const converted = expandBlockText(grandchild, composedInsert, childBlock, childBlockName, index++);
        entities.push(converted);
        registerSource(converted, "TEXT", grandchild.handle ?? converted.id, `Expanded from INSERT ${entity.handle ?? "unknown"}, BLOCK ${blockName}, INSERT ${childInsertRaw.handle ?? "unknown"}, BLOCK ${childBlockName}.`);
      }
      for (const grandchild of [...(childBlock.entities.attdefs as unknown as DxfAttdefEntity[])].sort(byHandle)) {
        const converted = expandBlockAttdef(grandchild, composedInsert, childBlock, childBlockName, index++);
        entities.push(converted);
        registerSource(converted, "ATTDEF", grandchild.handle ?? converted.id, `Expanded from INSERT ${entity.handle ?? "unknown"}, BLOCK ${blockName}, INSERT ${childInsertRaw.handle ?? "unknown"}, BLOCK ${childBlockName}.`);
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
): ScenePackage {
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
  const scenePackage = buildScenePackage(inputPath, parsed, options, warnings, rawMtext);
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
      unsupportedEntityCount: warnings.length,
      layerCount: scenePackage.layers.layers.length,
      warningCount: warnings.length
    },
    preCleanReport: preCleaned.report,
    timing: [...timing, { stage: "total-import", ms: Math.max(0, performance.now() - totalStartedAt) }]
  };
}
