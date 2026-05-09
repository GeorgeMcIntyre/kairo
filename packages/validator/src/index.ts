import {
  type Geometry,
  type ScenePackage,
  type ValidationFinding,
  type ValidationReport,
  supportedFormatVersions,
  scenePackageSchema
} from "@kairo/schema";
import { ZodError } from "zod";

export const ValidationCode = {
  SCHEMA_INVALID: "SCHEMA_INVALID",
  DUPLICATE_ID: "DUPLICATE_ID",
  MISSING_ROOT: "MISSING_ROOT",
  MISSING_CHILD: "MISSING_CHILD",
  NODE_CYCLE: "NODE_CYCLE",
  ORPHAN_NODE: "ORPHAN_NODE",
  MISSING_GEOMETRY_REF: "MISSING_GEOMETRY_REF",
  MISSING_LAYER_REF: "MISSING_LAYER_REF",
  MISSING_SOURCE_REF: "MISSING_SOURCE_REF",
  INVALID_MESH_VERTEX_ARRAY: "INVALID_MESH_VERTEX_ARRAY",
  INVALID_MESH_INDEX: "INVALID_MESH_INDEX",
  INVALID_TRANSFORM: "INVALID_TRANSFORM",
  UNSUPPORTED_FORMAT_VERSION: "UNSUPPORTED_FORMAT_VERSION"
} as const;

type FindingInput = Omit<ValidationFinding, "severity"> & {
  severity?: ValidationFinding["severity"];
};

const byCodeThenPath = (a: ValidationFinding, b: ValidationFinding) =>
  `${a.severity}:${a.code}:${a.path ?? ""}:${a.message}`.localeCompare(
    `${b.severity}:${b.code}:${b.path ?? ""}:${b.message}`
  );

const geometryIds = (documents: ScenePackage["geometry"]) =>
  new Set(documents.flatMap((document) => document.geometries.map((geometry) => geometry.id)));

const allGeometries = (documents: ScenePackage["geometry"]): Geometry[] =>
  documents.flatMap((document) => document.geometries);

const addFinding = (findings: ValidationFinding[], finding: FindingInput) => {
  findings.push({
    severity: finding.severity ?? "error",
    code: finding.code,
    message: finding.message,
    path: finding.path
  });
};

const zodPath = (issuePath: Array<string | number>) =>
  issuePath.length === 0 ? "$" : `$${issuePath.map((part) => `[${JSON.stringify(part)}]`).join("")}`;

const codeForSchemaIssue = (issuePath: Array<string | number>) => {
  const lastPathPart = issuePath[issuePath.length - 1];
  return lastPathPart === "localTransform" || lastPathPart === "worldTransform"
    ? ValidationCode.INVALID_TRANSFORM
    : ValidationCode.SCHEMA_INVALID;
};

export function validateScenePackage(input: unknown): ValidationReport {
  const findings: ValidationFinding[] = [];
  const parsed = scenePackageSchema.safeParse(input);

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      addFinding(findings, {
        code: codeForSchemaIssue(issue.path),
        message: issue.message,
        path: zodPath(issue.path)
      });
    }

    return buildReport(findings);
  }

  const scenePackage = parsed.data;
  const { scene, layers, sourceMap } = scenePackage;
  const nodesById = new Map<string, (typeof scene.nodes)[number]>();
  const seenNodeIds = new Set<string>();
  const referencedChildren = new Set<string>();

  if (!supportedFormatVersions.includes(scenePackage.manifest.version as (typeof supportedFormatVersions)[number])) {
    addFinding(findings, {
      code: ValidationCode.UNSUPPORTED_FORMAT_VERSION,
      message: `Unsupported Kairo format version "${scenePackage.manifest.version}". Supported versions: ${supportedFormatVersions.join(", ")}.`,
      path: "$.manifest.version"
    });
  }

  scene.nodes.forEach((node, index) => {
    if (seenNodeIds.has(node.id)) {
      addFinding(findings, {
        code: ValidationCode.DUPLICATE_ID,
        message: `Duplicate node id "${node.id}".`,
        path: `$.scene.nodes[${index}].id`
      });
    }

    seenNodeIds.add(node.id);
    nodesById.set(node.id, node);

    if (node.localTransform.length !== 16 || node.localTransform.some((value) => !Number.isFinite(value))) {
      addFinding(findings, {
        code: ValidationCode.INVALID_TRANSFORM,
        message: `Node "${node.id}" must have a finite 4x4 local transform matrix.`,
        path: `$.scene.nodes[${index}].localTransform`
      });
    }
  });

  if (!nodesById.has(scene.rootNodeId)) {
    addFinding(findings, {
      code: ValidationCode.MISSING_ROOT,
      message: `Root node "${scene.rootNodeId}" does not exist.`,
      path: "$.scene.rootNodeId"
    });
  }

  scene.nodes.forEach((node, index) => {
    node.children.forEach((childId, childIndex) => {
      if (!nodesById.has(childId)) {
        addFinding(findings, {
          code: ValidationCode.MISSING_CHILD,
          message: `Node "${node.id}" references missing child "${childId}".`,
          path: `$.scene.nodes[${index}].children[${childIndex}]`
        });
      }
      referencedChildren.add(childId);
    });
  });

  for (const node of scene.nodes) {
    if (node.id !== scene.rootNodeId && !referencedChildren.has(node.id)) {
      addFinding(findings, {
        code: ValidationCode.ORPHAN_NODE,
        severity: "warning",
        message: `Node "${node.id}" is not reachable from the root node.`,
        path: `$.scene.nodes[?id=="${node.id}"]`
      });
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const reportedCycles = new Set<string>();
  const visit = (nodeId: string, path: string[]) => {
    if (visiting.has(nodeId)) {
      const cycle = [...path, nodeId];
      const cycleKey = cycle.slice(cycle.indexOf(nodeId)).join(" -> ");
      if (reportedCycles.has(cycleKey)) {
        return;
      }
      reportedCycles.add(cycleKey);
      addFinding(findings, {
        code: ValidationCode.NODE_CYCLE,
        message: `Circular child reference detected: ${cycle.join(" -> ")}.`,
        path: `$.scene.nodes[?id=="${nodeId}"].children`
      });
      return;
    }

    if (visited.has(nodeId)) {
      return;
    }

    const node = nodesById.get(nodeId);
    if (!node) {
      return;
    }

    visiting.add(nodeId);
    for (const childId of node.children) {
      visit(childId, [...path, nodeId]);
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  visit(scene.rootNodeId, []);
  for (const node of scene.nodes) {
    visit(node.id, []);
  }

  const knownGeometryIds = geometryIds(scenePackage.geometry);
  const knownLayerIds = new Set(layers.layers.map((layer) => layer.id));
  const knownSourceIds = new Set(sourceMap.sources.map((source) => source.id));

  scene.nodes.forEach((node, index) => {
    node.geometryRefs?.forEach((geometryRef, refIndex) => {
      if (!knownGeometryIds.has(geometryRef)) {
        addFinding(findings, {
          code: ValidationCode.MISSING_GEOMETRY_REF,
          message: `Node "${node.id}" references missing geometry "${geometryRef}".`,
          path: `$.scene.nodes[${index}].geometryRefs[${refIndex}]`
        });
      }
    });

    if (node.layerId && !knownLayerIds.has(node.layerId)) {
      addFinding(findings, {
        code: ValidationCode.MISSING_LAYER_REF,
        message: `Node "${node.id}" references missing layer "${node.layerId}".`,
        path: `$.scene.nodes[${index}].layerId`
      });
    }

    if (node.sourceRef && !knownSourceIds.has(node.sourceRef)) {
      addFinding(findings, {
        code: ValidationCode.MISSING_SOURCE_REF,
        message: `Node "${node.id}" references missing source "${node.sourceRef}".`,
        path: `$.scene.nodes[${index}].sourceRef`
      });
    }
  });

  allGeometries(scenePackage.geometry).forEach((geometry) => {
    if (geometry.layerId && !knownLayerIds.has(geometry.layerId)) {
      addFinding(findings, {
        code: ValidationCode.MISSING_LAYER_REF,
        message: `Geometry "${geometry.id}" references missing layer "${geometry.layerId}".`,
        path: `$.geometry[?id=="${geometry.id}"].layerId`
      });
    }

    if (geometry.sourceRef && !knownSourceIds.has(geometry.sourceRef)) {
      addFinding(findings, {
        code: ValidationCode.MISSING_SOURCE_REF,
        message: `Geometry "${geometry.id}" references missing source "${geometry.sourceRef}".`,
        path: `$.geometry[?id=="${geometry.id}"].sourceRef`
      });
    }

    if (geometry.kind === "mesh") {
      if (geometry.vertices.length % 3 !== 0) {
        addFinding(findings, {
          code: ValidationCode.INVALID_MESH_VERTEX_ARRAY,
          message: `Mesh "${geometry.id}" vertex array length must be divisible by 3.`,
          path: `$.geometry[?id=="${geometry.id}"].vertices`
        });
      }

      const vertexCount = geometry.vertices.length / 3;
      const invalidIndex = geometry.indices.find((index) => index >= vertexCount);
      if (invalidIndex !== undefined) {
        addFinding(findings, {
          code: ValidationCode.INVALID_MESH_INDEX,
          message: `Mesh "${geometry.id}" contains index ${invalidIndex} outside vertex count ${vertexCount}.`,
          path: `$.geometry[?id=="${geometry.id}"].indices`
        });
      }
    }

    if (geometry.kind === "curve-set") {
      for (const entity of geometry.entities) {
        if (entity.layerId && !knownLayerIds.has(entity.layerId)) {
          addFinding(findings, {
            code: ValidationCode.MISSING_LAYER_REF,
            message: `Drawing entity "${entity.id}" references missing layer "${entity.layerId}".`,
            path: `$.geometry[?id=="${geometry.id}"].entities[?id=="${entity.id}"].layerId`
          });
        }
        if (entity.sourceRef && !knownSourceIds.has(entity.sourceRef)) {
          addFinding(findings, {
            code: ValidationCode.MISSING_SOURCE_REF,
            message: `Drawing entity "${entity.id}" references missing source "${entity.sourceRef}".`,
            path: `$.geometry[?id=="${geometry.id}"].entities[?id=="${entity.id}"].sourceRef`
          });
        }
      }
    }
  });

  return buildReport(findings);
}

export function buildReport(findings: ValidationFinding[]): ValidationReport {
  const sorted = [...findings].sort(byCodeThenPath);
  const summary = {
    errors: sorted.filter((finding) => finding.severity === "error").length,
    warnings: sorted.filter((finding) => finding.severity === "warning").length,
    infos: sorted.filter((finding) => finding.severity === "info").length
  };

  return {
    valid: summary.errors === 0,
    summary,
    findings: sorted
  };
}

export function formatZodError(error: ZodError): ValidationFinding[] {
  return error.issues.map((issue) => ({
    code: codeForSchemaIssue(issue.path),
    severity: "error",
    message: issue.message,
    path: zodPath(issue.path)
  }));
}
