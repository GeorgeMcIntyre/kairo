import { z } from "zod";

export const formatName = "kairo-neutral-scene";
export const formatVersion = "0.1.0";
export const supportedFormatVersions = [formatVersion] as const;

export const matrix4Schema = z
  .array(z.number().finite())
  .length(16, "Transform matrices must contain 16 numeric values.");

export const vector3Schema = z.array(z.number().finite()).length(3);

export const colorSchema = z.object({
  r: z.number().min(0).max(1),
  g: z.number().min(0).max(1),
  b: z.number().min(0).max(1),
  a: z.number().min(0).max(1).optional()
});

export const manifestSchema = z.object({
  format: z.literal(formatName),
  version: z.string().min(1),
  units: z.enum(["millimeter", "centimeter", "meter", "inch", "foot"]),
  axisSystem: z.object({
    up: z.enum(["X", "Y", "Z", "-X", "-Y", "-Z"]),
    handedness: z.enum(["right", "left"])
  }),
  rootSceneFile: z.string().min(1),
  createdBy: z.object({
    name: z.string().min(1),
    version: z.string().min(1)
  }),
  source: z.object({
    format: z.string().min(1),
    path: z.string().optional(),
    note: z.string().optional()
  })
});

export const sceneNodeSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  type: z.enum(["scene", "assembly", "part", "mesh", "drawing", "curve", "metadata"]),
  children: z.array(z.string()).default([]),
  localTransform: matrix4Schema,
  worldTransform: matrix4Schema.optional(),
  geometryRefs: z.array(z.string()).optional(),
  layerId: z.string().optional(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  sourceRef: z.string().optional()
});

export const sceneSchema = z.object({
  rootNodeId: z.string().min(1),
  nodes: z.array(sceneNodeSchema).min(1)
});

export const layerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: colorSchema.optional(),
  visible: z.boolean().default(true),
  metadata: z.record(z.string()).optional()
});

export const layersDocumentSchema = z.object({
  layers: z.array(layerSchema)
});

export const materialSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  baseColor: colorSchema,
  metallic: z.number().min(0).max(1).optional(),
  roughness: z.number().min(0).max(1).optional()
});

export const materialsDocumentSchema = z.object({
  materials: z.array(materialSchema)
});

const bboxSchema = z.object({
  min: vector3Schema,
  max: vector3Schema
});

const meshGeometrySchema = z.object({
  id: z.string().min(1),
  kind: z.literal("mesh"),
  vertices: z.array(z.number().finite()).min(9),
  indices: z.array(z.number().int().nonnegative()).min(3),
  normals: z.array(z.number().finite()).optional(),
  colors: z.array(z.number().finite()).optional(),
  materialId: z.string().optional(),
  layerId: z.string().optional(),
  boundingBox: bboxSchema.optional(),
  sourceRef: z.string().optional()
});

const lineEntitySchema = z.object({
  id: z.string().min(1),
  type: z.literal("line"),
  start: vector3Schema,
  end: vector3Schema,
  layerId: z.string().optional(),
  color: colorSchema.optional(),
  sourceRef: z.string().optional()
});

const polylineEntitySchema = z.object({
  id: z.string().min(1),
  type: z.literal("polyline"),
  points: z.array(vector3Schema).min(2),
  closed: z.boolean().default(false),
  layerId: z.string().optional(),
  color: colorSchema.optional(),
  sourceRef: z.string().optional()
});

const circleEntitySchema = z.object({
  id: z.string().min(1),
  type: z.literal("circle"),
  center: vector3Schema,
  radius: z.number().positive(),
  layerId: z.string().optional(),
  color: colorSchema.optional(),
  sourceRef: z.string().optional()
});

const arcEntitySchema = z.object({
  id: z.string().min(1),
  type: z.literal("arc"),
  center: vector3Schema,
  radius: z.number().positive(),
  startAngleDeg: z.number().finite(),
  endAngleDeg: z.number().finite(),
  layerId: z.string().optional(),
  color: colorSchema.optional(),
  sourceRef: z.string().optional()
});

const textEntitySchema = z.object({
  id: z.string().min(1),
  type: z.literal("text"),
  text: z.string(),
  position: vector3Schema,
  rotationDeg: z.number().finite(),
  height: z.number().positive(),
  origin: z.enum(["TEXT", "ATTDEF"]),
  tag: z.string().optional(),
  layerId: z.string().optional(),
  color: colorSchema.optional(),
  sourceRef: z.string().optional()
});

export const drawingEntitySchema = z.discriminatedUnion("type", [
  lineEntitySchema,
  polylineEntitySchema,
  circleEntitySchema,
  arcEntitySchema,
  textEntitySchema
]);

const curveGeometrySchema = z.object({
  id: z.string().min(1),
  kind: z.literal("curve-set"),
  entities: z.array(drawingEntitySchema),
  layerId: z.string().optional(),
  sourceRef: z.string().optional()
});

export const geometrySchema = z.discriminatedUnion("kind", [meshGeometrySchema, curveGeometrySchema]);

export const geometryDocumentSchema = z.object({
  geometries: z.array(geometrySchema)
});

export const sourceMapEntrySchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  format: z.string().min(1),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  note: z.string().optional()
});

export const sourceMapDocumentSchema = z.object({
  sources: z.array(sourceMapEntrySchema)
});

export const validationFindingSchema = z.object({
  code: z.string().min(1),
  severity: z.enum(["error", "warning", "info"]),
  message: z.string().min(1),
  path: z.string().optional()
});

export const validationReportSchema = z.object({
  valid: z.boolean(),
  generatedAt: z.string().optional(),
  summary: z.object({
    errors: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(),
    infos: z.number().int().nonnegative()
  }),
  findings: z.array(validationFindingSchema)
});

export const scenePackageSchema = z.object({
  manifest: manifestSchema,
  scene: sceneSchema,
  geometry: z.array(geometryDocumentSchema),
  layers: layersDocumentSchema,
  materials: materialsDocumentSchema,
  sourceMap: sourceMapDocumentSchema
});

export type Manifest = z.infer<typeof manifestSchema>;
export type SceneNode = z.infer<typeof sceneNodeSchema>;
export type SceneDocument = z.infer<typeof sceneSchema>;
export type Layer = z.infer<typeof layerSchema>;
export type LayersDocument = z.infer<typeof layersDocumentSchema>;
export type Material = z.infer<typeof materialSchema>;
export type MaterialsDocument = z.infer<typeof materialsDocumentSchema>;
export type Geometry = z.infer<typeof geometrySchema>;
export type GeometryDocument = z.infer<typeof geometryDocumentSchema>;
export type DrawingEntity = z.infer<typeof drawingEntitySchema>;
export type SourceMapDocument = z.infer<typeof sourceMapDocumentSchema>;
export type ValidationFinding = z.infer<typeof validationFindingSchema>;
export type ValidationReport = z.infer<typeof validationReportSchema>;
export type ScenePackage = z.infer<typeof scenePackageSchema>;
