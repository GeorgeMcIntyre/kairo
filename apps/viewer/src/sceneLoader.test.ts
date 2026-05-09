import { describe, expect, it } from "vitest";
import { loadPublicScenePackage, resolveViewerSceneRequest, sampleScenePackage } from "./sceneLoader";

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
});
