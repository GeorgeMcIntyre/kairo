import { describe, expect, it } from "vitest";
import {
  isPublicSceneAssetLoadError,
  loadDxfFileScenePackage,
  loadKairoPackageFileScenePackage,
  loadLocalSceneFilePackage,
  loadPublicScenePackage,
  resolveViewerSceneRequest,
  sampleScenePackage
} from "./sceneLoader";
import { createKairoPackage } from "@kairo/core";

const oneLineDxf = `0
SECTION
2
HEADER
9
$INSUNITS
70
4
0
ENDSEC
0
SECTION
2
TABLES
0
TABLE
2
LAYER
70
1
0
LAYER
2
CUT
70
0
62
1
6
CONTINUOUS
0
ENDTAB
0
ENDSEC
0
SECTION
2
ENTITIES
0
LINE
5
20
8
CUT
10
0
20
0
30
0
11
25
21
10
31
0
0
ENDSEC
0
EOF
`;

function filePart(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

describe("viewer scene loader", () => {
  it("uses the bundled sample when no scene query is present", () => {
    expect(resolveViewerSceneRequest("")).toEqual({ kind: "bundled" });
  });

  it("resolves a public scene from the scene query", () => {
    expect(resolveViewerSceneRequest("?scene=scott-dxf2013-import")).toEqual({
      kind: "public-scene",
      sceneName: "scott-dxf2013-import",
      basePath: "/scenes/scott-dxf2013-import"
    });
  });

  it("rejects scene query values that could escape the public scenes directory", () => {
    expect(() => resolveViewerSceneRequest("?scene=../tmp/scene")).toThrow("Scene query may only contain");
  });

  it("loads a public exploded scene package by geometry refs", async () => {
    const documents = new Map<string, unknown>([
      ["/scenes/sample/manifest.json", sampleScenePackage.manifest],
      ["/scenes/sample/scene.json", sampleScenePackage.scene],
      ["/scenes/sample/layers.json", sampleScenePackage.layers],
      ["/scenes/sample/materials.json", sampleScenePackage.materials],
      ["/scenes/sample/source-map.json", sampleScenePackage.sourceMap],
      ["/scenes/sample/geometry/geom-bracket-body.json", sampleScenePackage.geometry[0]],
      ["/scenes/sample/geometry/geom-reference-outline.json", sampleScenePackage.geometry[1]]
    ]);
    const requestedUrls: string[] = [];
    const loaded = await loadPublicScenePackage("/scenes/sample", async (input) => {
      requestedUrls.push(input);
      return {
        ok: documents.has(input),
        status: documents.has(input) ? 200 : 404,
        json: async () => documents.get(input)
      };
    });

    expect(loaded.scene.rootNodeId).toBe(sampleScenePackage.scene.rootNodeId);
    expect(loaded.geometry.map((document) => document.geometries[0].id)).toEqual(["geom-bracket-body", "geom-reference-outline"]);
    expect(requestedUrls).toContain("/scenes/sample/geometry/geom-bracket-body.json");
    expect(requestedUrls).toContain("/scenes/sample/geometry/geom-reference-outline.json");
  });

  it("classifies missing public scene assets as slim-preview scene asset errors", async () => {
    await expect(
      loadPublicScenePackage("/scenes/missing", async () => ({
        ok: false,
        status: 404,
        json: async () => ({})
      }))
    ).rejects.toSatisfy(isPublicSceneAssetLoadError);
  });

  it("classifies HTML fallback responses as slim-preview scene asset errors", async () => {
    await expect(
      loadPublicScenePackage("/scenes/missing", async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token '<', \"<!doctype\" is not valid JSON");
        }
      }))
    ).rejects.toSatisfy(isPublicSceneAssetLoadError);
  });

  it("loads a local DXF file through the browser importer", async () => {
    const progress: string[] = [];
    const loaded = await loadDxfFileScenePackage(new File([oneLineDxf], "uploaded.dxf"), {
      onProgress: (entry) => progress.push(`${entry.phase}:${entry.label}:${entry.percent}`),
      useWorker: false
    });

    expect(loaded.scenePackage.scene.nodes[0].displayName).toBe("uploaded.dxf");
    expect(loaded.scenePackage.manifest.source.path).toBe("uploaded.dxf");
    expect(loaded.summary.supportedEntityCount).toBe(1);
    expect(loaded.timing?.map((entry) => entry.stage)).toEqual([
      "file-read",
      "importer-module-load",
      "dxf-import",
      "pre-clean",
      "dxf-parse",
      "mtext-scan",
      "scene-package-build",
      "validation",
      "total-import",
      "browser-dxf-load-total"
    ]);
    expect(loaded.timing?.every((entry) => Number.isFinite(entry.ms) && entry.ms >= 0)).toBe(true);
    expect(progress).toEqual([
      "file-read:Reading file:10",
      "importer-module-load:Loading DXF importer:30",
      "dxf-import:Importing DXF:75"
    ]);
  });

  it("rejects non-DXF local files", async () => {
    await expect(loadDxfFileScenePackage(new File(["{}"], "scene.json"))).rejects.toThrow("Only .dxf files");
  });

  it("loads a local .kairo scene package", async () => {
    const archive = createKairoPackage(sampleScenePackage, { createdBy: "viewer-test" });
    const progress: string[] = [];
    const loaded = await loadKairoPackageFileScenePackage(new File([filePart(archive)], "sample.kairo"), {
      onProgress: (entry) => progress.push(`${entry.phase}:${entry.label}:${entry.percent}`)
    });

    expect(loaded.scene.rootNodeId).toBe(sampleScenePackage.scene.rootNodeId);
    expect(loaded.geometry.map((document) => document.geometries[0].id)).toEqual(["geom-bracket-body", "geom-reference-outline"]);
    expect(progress).toEqual(["kairo-package-read:Opening Kairo package:75"]);
  });

  it("loads local .dxf and .kairo files through the shared local-file loader", async () => {
    const dxfProgress: string[] = [];
    const kairoProgress: string[] = [];
    const dxfLoaded = await loadLocalSceneFilePackage(new File([oneLineDxf], "uploaded.dxf"), {
      onProgress: (entry) => dxfProgress.push(entry.phase),
      useWorker: false
    });
    const kairoLoaded = await loadLocalSceneFilePackage(
      new File([filePart(createKairoPackage(sampleScenePackage))], "sample.kairo"),
      {
        onProgress: (entry) => kairoProgress.push(entry.phase)
      }
    );

    expect(dxfLoaded.kind).toBe("dxf");
    expect(dxfLoaded.scenePackage.manifest.source.path).toBe("uploaded.dxf");
    expect(dxfLoaded.timing?.some((entry) => entry.stage === "browser-dxf-load-total")).toBe(true);
    expect(kairoLoaded.kind).toBe("kairo-package");
    expect(kairoLoaded.scenePackage.scene.rootNodeId).toBe(sampleScenePackage.scene.rootNodeId);
    expect(kairoLoaded.timing?.map((entry) => entry.stage)).toEqual(["kairo-package-read"]);
    expect(dxfProgress).toEqual(["file-read", "importer-module-load", "dxf-import"]);
    expect(kairoProgress).toEqual(["kairo-package-read"]);
  });

  it("rejects unsupported local package extensions", async () => {
    await expect(loadLocalSceneFilePackage(new File(["{}"], "scene.json"))).rejects.toThrow("Only .dxf and .kairo");
  });
});
