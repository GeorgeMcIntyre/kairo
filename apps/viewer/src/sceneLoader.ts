import { scenePackageSchema, type GeometryDocument, type SceneDocument, type ScenePackage } from "@kairo/schema";
import type { DxfImportResult } from "@kairo/importer-dxf/browser";
import manifest from "../../../examples/example-scene/manifest.json";
import scene from "../../../examples/example-scene/scene.json";
import meshGeometry from "../../../examples/example-scene/geometry/bracket.mesh.json";
import curveGeometry from "../../../examples/example-scene/geometry/drawing.curves.json";
import layers from "../../../examples/example-scene/layers.json";
import materials from "../../../examples/example-scene/materials.json";
import sourceMap from "../../../examples/example-scene/source-map.json";

export type ViewerSceneRequest =
  | {
      kind: "bundled";
    }
  | {
      kind: "public-scene";
      sceneName: string;
      basePath: string;
    };

type FetchLike = (input: string) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

const dxfFilePattern = /\.dxf$/i;

export const sampleScenePackage = scenePackageSchema.parse({
  manifest,
  scene,
  geometry: [meshGeometry, curveGeometry],
  layers,
  materials,
  sourceMap
});

const sceneNamePattern = /^[A-Za-z0-9._-]+$/;

export function resolveViewerSceneRequest(search: string): ViewerSceneRequest {
  const sceneName = new URLSearchParams(search).get("scene")?.trim();
  if (!sceneName) {
    return { kind: "bundled" };
  }

  if (!sceneNamePattern.test(sceneName)) {
    throw new Error("Scene query may only contain letters, numbers, dot, underscore, and dash.");
  }

  return {
    kind: "public-scene",
    sceneName,
    basePath: `/scenes/${sceneName}`
  };
}

async function fetchJson(fetcher: FetchLike, url: string) {
  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: HTTP ${response.status}.`);
  }
  return response.json();
}

function geometryRefsFromScene(sceneDocument: SceneDocument) {
  return [
    ...new Set(sceneDocument.nodes.flatMap((node) => node.geometryRefs ?? []))
  ].sort((a, b) => a.localeCompare(b));
}

export async function loadPublicScenePackage(basePath: string, fetcher: FetchLike = fetch): Promise<ScenePackage> {
  const [manifestDocument, sceneDocument, layersDocument, materialsDocument, sourceMapDocument] = await Promise.all([
    fetchJson(fetcher, `${basePath}/manifest.json`),
    fetchJson(fetcher, `${basePath}/scene.json`),
    fetchJson(fetcher, `${basePath}/layers.json`),
    fetchJson(fetcher, `${basePath}/materials.json`),
    fetchJson(fetcher, `${basePath}/source-map.json`)
  ]);

  const sceneData = sceneDocument as SceneDocument;
  const geometry = await Promise.all(
    geometryRefsFromScene(sceneData).map((geometryRef) => fetchJson(fetcher, `${basePath}/geometry/${encodeURIComponent(geometryRef)}.json`) as Promise<GeometryDocument>)
  );

  return scenePackageSchema.parse({
    manifest: manifestDocument,
    scene: sceneDocument,
    geometry,
    layers: layersDocument,
    materials: materialsDocument,
    sourceMap: sourceMapDocument
  });
}

export async function loadDxfFileScenePackage(file: File): Promise<DxfImportResult> {
  const fileName = file.name.trim() || "uploaded.dxf";
  if (!dxfFilePattern.test(fileName)) {
    throw new Error("Only .dxf files can be opened.");
  }

  const text = await file.text();
  const { importDxfTextToKairo } = await import("@kairo/importer-dxf/browser");
  return importDxfTextToKairo(fileName, text, { createdBy: "kairo viewer upload" });
}
