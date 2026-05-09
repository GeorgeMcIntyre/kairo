import { scenePackageSchema } from "@kairo/schema";
import manifest from "../../../examples/example-scene/manifest.json";
import scene from "../../../examples/example-scene/scene.json";
import meshGeometry from "../../../examples/example-scene/geometry/bracket.mesh.json";
import curveGeometry from "../../../examples/example-scene/geometry/drawing.curves.json";
import layers from "../../../examples/example-scene/layers.json";
import materials from "../../../examples/example-scene/materials.json";
import sourceMap from "../../../examples/example-scene/source-map.json";

export const sampleScenePackage = scenePackageSchema.parse({
  manifest,
  scene,
  geometry: [meshGeometry, curveGeometry],
  layers,
  materials,
  sourceMap
});
