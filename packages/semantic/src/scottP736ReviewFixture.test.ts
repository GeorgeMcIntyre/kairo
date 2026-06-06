import { computeRobustSceneBounds, flattenCurveEntities } from "@kairo/core";
import type { GeometryDocument, LayersDocument, Manifest, MaterialsDocument, SceneDocument, ScenePackage } from "@kairo/schema";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { computeLayoutSemantics } from "./layoutSemantics";
import { parseSemanticReviewArtifactJson, semanticOverridesFromReviewArtifact } from "./semanticReviewArtifact";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const scottSceneRoot = join(repoRoot, "apps/viewer/public/scenes/scott-dxf2013-import");
const fixturePath = join(repoRoot, "docs/examples/scott-p736-protected-labels.semantic-review.json");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function loadScottScenePackage(): ScenePackage {
  const geometryRoot = join(scottSceneRoot, "geometry");
  const geometry = readdirSync(geometryRoot)
    .filter((fileName) => fileName.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right))
    .map((fileName) => readJson<GeometryDocument>(join(geometryRoot, fileName)));

  return {
    manifest: readJson<Manifest>(join(scottSceneRoot, "manifest.json")),
    scene: readJson<SceneDocument>(join(scottSceneRoot, "scene.json")),
    geometry,
    layers: readJson<LayersDocument>(join(scottSceneRoot, "layers.json")),
    materials: readJson<MaterialsDocument>(join(scottSceneRoot, "materials.json")),
    sourceMap: { sources: [] }
  };
}

describe("Scott P736 semantic review fixture", () => {
  it(
    "imports the checked-in protected-label fixture against the staged Scott scene",
    () => {
      const scenePackage = loadScottScenePackage();
      const robustBounds = computeRobustSceneBounds(flattenCurveEntities(scenePackage.geometry));
      const semantics = computeLayoutSemantics(scenePackage, robustBounds);
      const result = parseSemanticReviewArtifactJson(readFileSync(fixturePath, "utf8"), semantics);

      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error(result.errors.map((error) => `${error.path}: ${error.message}`).join("\n"));
      }

      expect(result.artifact.summary).toEqual({
        totalRecords: 4,
        acceptedRecords: 1,
        correctedRecords: 0,
        rejectedRecords: 0,
        uncertainRecords: 3,
        overrideRecords: 0
      });
      expect(semanticOverridesFromReviewArtifact(result.artifact)).toEqual({});

      const recordsByLabel = new Map(result.artifact.records.map((record) => [record.detectedLabel, record]));
      expect(recordsByLabel.get("7B-020L-04")).toMatchObject({
        deviceId: "semantic-device-robot-dxf-mtext-1709d",
        detectedDeviceType: "robot",
        reviewStatus: "uncertain"
      });
      expect(recordsByLabel.get("7B-070L-DN1")).toMatchObject({
        deviceId: "semantic-device-dunnage-dxf-mtext-17092",
        detectedDeviceType: "dunnage",
        reviewStatus: "uncertain"
      });
      expect(recordsByLabel.get("7B-070L-DN2")).toMatchObject({
        deviceId: "semantic-device-dunnage-dxf-mtext-17093",
        detectedDeviceType: "dunnage",
        reviewStatus: "uncertain"
      });
      expect(recordsByLabel.get("7B-060L-1N")).toMatchObject({
        deviceId: "semantic-device-nest-dxf-mtext-17091",
        detectedDeviceType: "nest",
        reviewStatus: "accepted"
      });
    },
    60_000
  );
});
