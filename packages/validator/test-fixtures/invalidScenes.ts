import { scenePackageSchema, type ScenePackage } from "@kairo/schema";
import manifest from "../../../examples/example-scene/manifest.json";
import scene from "../../../examples/example-scene/scene.json";
import meshGeometry from "../../../examples/example-scene/geometry/bracket.mesh.json";
import curveGeometry from "../../../examples/example-scene/geometry/drawing.curves.json";
import layers from "../../../examples/example-scene/layers.json";
import materials from "../../../examples/example-scene/materials.json";
import sourceMap from "../../../examples/example-scene/source-map.json";

export type InvalidSceneFixture = {
  name: string;
  scenePackage: unknown;
  expectedSummary: {
    errors: number;
    warnings: number;
    infos: number;
  };
  expectedFindings: Array<{
    code: string;
    severity: "error" | "warning" | "info";
    path?: string;
  }>;
};

export function sampleScenePackage(): ScenePackage {
  return scenePackageSchema.parse(
    structuredClone({
      manifest,
      scene,
      geometry: [meshGeometry, curveGeometry],
      layers,
      materials,
      sourceMap
    })
  );
}

const withMutation = (mutate: (scenePackage: ScenePackage) => void): ScenePackage => {
  const scenePackage = sampleScenePackage();
  mutate(scenePackage);
  return scenePackage;
};

export const invalidSceneFixtures: InvalidSceneFixture[] = [
  {
    name: "duplicate node id",
    scenePackage: withMutation((scenePackage) => {
      scenePackage.scene.nodes.push({
        ...structuredClone(scenePackage.scene.nodes[1]),
        displayName: "Duplicate Bracket Body"
      });
    }),
    expectedSummary: { errors: 1, warnings: 0, infos: 0 },
    expectedFindings: [{ code: "DUPLICATE_ID", severity: "error", path: "$.scene.nodes[3].id" }]
  },
  {
    name: "missing root node",
    scenePackage: withMutation((scenePackage) => {
      scenePackage.scene.rootNodeId = "missing-root";
    }),
    expectedSummary: { errors: 1, warnings: 1, infos: 0 },
    expectedFindings: [
      { code: "MISSING_ROOT", severity: "error", path: "$.scene.rootNodeId" },
      { code: "ORPHAN_NODE", severity: "warning", path: '$.scene.nodes[?id=="node-root"]' }
    ]
  },
  {
    name: "child link points to missing node",
    scenePackage: withMutation((scenePackage) => {
      scenePackage.scene.nodes[0].children.push("missing-child");
    }),
    expectedSummary: { errors: 1, warnings: 0, infos: 0 },
    expectedFindings: [{ code: "MISSING_CHILD", severity: "error", path: "$.scene.nodes[0].children[2]" }]
  },
  {
    name: "cycle in node tree",
    scenePackage: withMutation((scenePackage) => {
      scenePackage.scene.nodes[1].children = [scenePackage.scene.rootNodeId];
    }),
    expectedSummary: { errors: 1, warnings: 0, infos: 0 },
    expectedFindings: [{ code: "NODE_CYCLE", severity: "error", path: '$.scene.nodes[?id=="node-root"].children' }]
  },
  {
    name: "geometry ref points to missing geometry",
    scenePackage: withMutation((scenePackage) => {
      scenePackage.scene.nodes[1].geometryRefs = ["missing-geometry"];
    }),
    expectedSummary: { errors: 1, warnings: 0, infos: 0 },
    expectedFindings: [
      { code: "MISSING_GEOMETRY_REF", severity: "error", path: "$.scene.nodes[1].geometryRefs[0]" }
    ]
  },
  {
    name: "layer ref points to missing layer",
    scenePackage: withMutation((scenePackage) => {
      scenePackage.scene.nodes[1].layerId = "missing-layer";
    }),
    expectedSummary: { errors: 1, warnings: 0, infos: 0 },
    expectedFindings: [{ code: "MISSING_LAYER_REF", severity: "error", path: "$.scene.nodes[1].layerId" }]
  },
  {
    name: "source ref points to missing source-map entry",
    scenePackage: withMutation((scenePackage) => {
      scenePackage.scene.nodes[1].sourceRef = "missing-source";
    }),
    expectedSummary: { errors: 1, warnings: 0, infos: 0 },
    expectedFindings: [{ code: "MISSING_SOURCE_REF", severity: "error", path: "$.scene.nodes[1].sourceRef" }]
  },
  {
    name: "mesh index out of range",
    scenePackage: withMutation((scenePackage) => {
      const mesh = scenePackage.geometry[0].geometries[0];
      if (mesh.kind === "mesh") {
        mesh.indices[0] = 99;
      }
    }),
    expectedSummary: { errors: 1, warnings: 0, infos: 0 },
    expectedFindings: [
      { code: "INVALID_MESH_INDEX", severity: "error", path: '$.geometry[?id=="geom-bracket-body"].indices' }
    ]
  },
  {
    name: "invalid transform shape",
    scenePackage: (() => {
      const scenePackage = sampleScenePackage() as unknown as {
        scene: {
          nodes: Array<{
            localTransform: number[];
          }>;
        };
      };
      scenePackage.scene.nodes[1].localTransform = scenePackage.scene.nodes[1].localTransform.slice(0, 15);
      return scenePackage;
    })(),
    expectedSummary: { errors: 1, warnings: 0, infos: 0 },
    expectedFindings: [
      { code: "INVALID_TRANSFORM", severity: "error", path: '$["scene"]["nodes"][1]["localTransform"]' }
    ]
  },
  {
    name: "unsupported format version",
    scenePackage: withMutation((scenePackage) => {
      scenePackage.manifest.version = "9.9.9";
    }),
    expectedSummary: { errors: 1, warnings: 0, infos: 0 },
    expectedFindings: [{ code: "UNSUPPORTED_FORMAT_VERSION", severity: "error", path: "$.manifest.version" }]
  }
];
