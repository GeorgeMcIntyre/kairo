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
  let index = 0;

  for (const entity of [...parsed.entities.lines].sort(byHandle)) {
    entities.push(lineToEntity(entity, index++));
  }
  for (const entity of [...parsed.entities.lwPolylines].sort(byHandle)) {
    entities.push(lwPolylineToEntity(entity, index++));
  }
  for (const entity of [...parsed.entities.circles].sort(byHandle)) {
    entities.push(circleToEntity(entity, index++));
  }
  for (const entity of [...parsed.entities.arcs].sort(byHandle)) {
    entities.push(arcToEntity(entity, index++));
  }

  for (const entity of [...parsed.entities.inserts].sort(byHandle)) {
    warnings.push(unsupportedWarning("INSERT", entity));
  }

  const unsupportedGroups: Array<[string, EntityCommons[]]> = [
    ["POINT", parsed.entities.points],
    ["TEXT", parsed.entities.texts],
    ["SPLINE", parsed.entities.splines],
    ["ELLIPSE", parsed.entities.ellipses],
    ["POLYLINE", parsed.entities.polylines],
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
    warnings: warnings.sort((a, b) =>
      `${a.code}:${a.entityType ?? ""}:${a.handle ?? ""}`.localeCompare(`${b.code}:${b.entityType ?? ""}:${b.handle ?? ""}`)
    )
  };
}

function buildSourceMap(inputPath: string, entities: DrawingEntity[], parsed: DxfGlobalObject) {
  const dxfEntityType = (entity: DrawingEntity) => {
    if (entity.type === "polyline") {
      return "LWPOLYLINE";
    }
    return entity.type.toUpperCase();
  };

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
        entityType: dxfEntityType(entity),
        entityId: entity.sourceRef?.replace(/^src-dxf-/, "") ?? entity.id
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
    sourceMap: buildSourceMap(inputPath, converted.entities, parsed)
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
