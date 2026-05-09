import type {
  Geometry,
  GeometryDocument,
  Layer,
  SceneNode,
  ScenePackage,
  SourceMapDocument
} from "@kairo/schema";

export type { Geometry, GeometryDocument, Layer, SceneNode, ScenePackage, SourceMapDocument };

export const identityMatrix = (): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function flattenGeometry(scenePackage: ScenePackage): Geometry[] {
  return scenePackage.geometry.flatMap((document) => document.geometries);
}

export function geometryById(scenePackage: ScenePackage): Map<string, Geometry> {
  return new Map(flattenGeometry(scenePackage).map((geometry) => [geometry.id, geometry]));
}

export function nodesById(scenePackage: ScenePackage): Map<string, SceneNode> {
  return new Map(scenePackage.scene.nodes.map((node) => [node.id, node]));
}

export function sourcePathForNode(scenePackage: ScenePackage, node: SceneNode): string | undefined {
  if (!node.sourceRef) {
    return undefined;
  }

  return scenePackage.sourceMap.sources.find((source) => source.id === node.sourceRef)?.path;
}

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

export async function loadExplodedScene(baseUrl: string): Promise<ScenePackage> {
  const root = baseUrl.replace(/\/$/, "");
  const [manifest, scene, meshGeometry, curveGeometry, layers, materials, sourceMap] = await Promise.all([
    fetchJson<ScenePackage["manifest"]>(`${root}/manifest.json`),
    fetchJson<ScenePackage["scene"]>(`${root}/scene.json`),
    fetchJson<GeometryDocument>(`${root}/geometry/bracket.mesh.json`),
    fetchJson<GeometryDocument>(`${root}/geometry/drawing.curves.json`),
    fetchJson<ScenePackage["layers"]>(`${root}/layers.json`),
    fetchJson<ScenePackage["materials"]>(`${root}/materials.json`),
    fetchJson<SourceMapDocument>(`${root}/source-map.json`)
  ]);

  return {
    manifest,
    scene,
    geometry: [meshGeometry, curveGeometry],
    layers,
    materials,
    sourceMap
  };
}
