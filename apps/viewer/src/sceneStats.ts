import type { Geometry, ScenePackage } from "@kairo/schema";

export type SceneStats = {
  nodeCount: number;
  layerCount: number;
  geometryDocumentCount: number;
  geometryCount: number;
  meshCount: number;
  curveSetCount: number;
  curveEntityCount: number;
};

export type LayerEntityCount = {
  id: string;
  name: string;
  entityCount: number;
  geometryCount: number;
};

function geometries(scenePackage: ScenePackage): Geometry[] {
  return scenePackage.geometry.flatMap((document) => document.geometries);
}

export function computeSceneStats(scenePackage: ScenePackage): SceneStats {
  const allGeometry = geometries(scenePackage);
  const curveSets = allGeometry.filter((geometry) => geometry.kind === "curve-set");
  const meshes = allGeometry.filter((geometry) => geometry.kind === "mesh");

  return {
    nodeCount: scenePackage.scene.nodes.length,
    layerCount: scenePackage.layers.layers.length,
    geometryDocumentCount: scenePackage.geometry.length,
    geometryCount: allGeometry.length,
    meshCount: meshes.length,
    curveSetCount: curveSets.length,
    curveEntityCount: curveSets.reduce((count, geometry) => count + geometry.entities.length, 0)
  };
}

export function computeLayerEntityCounts(scenePackage: ScenePackage): LayerEntityCount[] {
  const counts = new Map<string, { entityCount: number; geometryCount: number }>();
  for (const layer of scenePackage.layers.layers) {
    counts.set(layer.id, { entityCount: 0, geometryCount: 0 });
  }

  for (const geometry of geometries(scenePackage)) {
    if (geometry.layerId) {
      const count = counts.get(geometry.layerId);
      if (count) {
        count.geometryCount += 1;
      }
    }

    if (geometry.kind === "curve-set") {
      for (const entity of geometry.entities) {
        const layerId = entity.layerId ?? geometry.layerId;
        if (!layerId) {
          continue;
        }
        const count = counts.get(layerId);
        if (count) {
          count.entityCount += 1;
        }
      }
    }
  }

  return scenePackage.layers.layers.map((layer) => ({
    id: layer.id,
    name: layer.name,
    entityCount: counts.get(layer.id)?.entityCount ?? 0,
    geometryCount: counts.get(layer.id)?.geometryCount ?? 0
  }));
}
