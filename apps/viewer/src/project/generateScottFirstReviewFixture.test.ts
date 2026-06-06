/**
 * One-time fixture generator. Run with:
 *   pnpm vitest run apps/viewer/src/project/generateScottFirstReviewFixture.test.ts
 *
 * Produces docs/examples/scott-p736-first-review.kairo-project.json with all records
 * set to "uncertain" (the conservative default). After George's manual review pass in
 * the browser, the fixture can be replaced with the exported kairo-project.json.
 *
 * Tests in this file are excluded from the normal pnpm test run via describe.skipIf
 * so they do not pollute CI or the daily test run.
 */
import { computeRobustSceneBounds, flattenCurveEntities } from "@kairo/core";
import { buildSemanticSummary, computeLayoutSemantics } from "@kairo/semantic";
import type { GeometryDocument, LayersDocument, Manifest, MaterialsDocument, SceneDocument, ScenePackage } from "@kairo/schema";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildAdvancedLayoutModel } from "../advancedEngineering/advancedLayout";
import { buildLayoutPackage } from "../layoutLibrary/layoutPackage";
import { buildBlankLayoutReviewPack } from "../layoutLibrary/layoutReviewPack";
import { buildKairoProject, exportKairoProjectJson } from "./kairoProject";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const scottSceneRoot = join(repoRoot, "apps/viewer/public/scenes/scott-dxf2013-import");
const fixturePath = join(repoRoot, "docs/examples/scott-p736-first-review.kairo-project.json");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function loadScottScenePackage(): ScenePackage {
  const geometryRoot = join(scottSceneRoot, "geometry");
  const { readdirSync } = require("node:fs") as typeof import("node:fs");
  const geometry = readdirSync(geometryRoot)
    .filter((fileName: string) => fileName.endsWith(".json"))
    .sort((left: string, right: string) => left.localeCompare(right))
    .map((fileName: string) => readJson<GeometryDocument>(join(geometryRoot, fileName)));

  return {
    manifest: readJson<Manifest>(join(scottSceneRoot, "manifest.json")),
    scene: readJson<SceneDocument>(join(scottSceneRoot, "scene.json")),
    geometry,
    layers: readJson<LayersDocument>(join(scottSceneRoot, "layers.json")),
    materials: readJson<MaterialsDocument>(join(scottSceneRoot, "materials.json")),
    sourceMap: { sources: [] }
  };
}

// Only runs when explicitly invoked — not part of the normal test suite
describe.skipIf(existsSync(fixturePath))("Scott P736 first-review fixture generator", () => {
  it(
    "generates the baseline kairo-project.json fixture from the staged Scott scene",
    () => {
      const scenePackage = loadScottScenePackage();
      const robustBounds = computeRobustSceneBounds(flattenCurveEntities(scenePackage.geometry));
      const semantics = computeLayoutSemantics(scenePackage, robustBounds);
      const semanticSummary = buildSemanticSummary(semantics, scenePackage.manifest.source.path);
      const advancedLayout = buildAdvancedLayoutModel(scenePackage, semantics);
      const layoutPackage = buildLayoutPackage(scenePackage, semantics, advancedLayout);
      const blankReviewPack = buildBlankLayoutReviewPack(layoutPackage);

      const project = buildKairoProject({
        source: layoutPackage.source,
        semanticSummary,
        layoutPackage,
        layoutReviewPack: blankReviewPack
      });

      const json = exportKairoProjectJson(project);
      writeFileSync(fixturePath, json, "utf8");

      expect(existsSync(fixturePath)).toBe(true);
      expect(project.schema).toBe("kairo-project");
      expect(project.layoutReviewPack?.records.length).toBeGreaterThan(0);
      console.log(`\nGenerated: ${fixturePath}`);
      console.log(`Records: ${project.layoutReviewPack?.records.length ?? 0}`);
    },
    120_000
  );
});
