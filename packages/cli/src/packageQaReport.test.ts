import { identityMatrix } from "@kairo/core";
import type { ScenePackage, ValidationReport } from "@kairo/schema";
import { describe, expect, it } from "vitest";
import {
  buildPackageQaResult,
  countLocalSourcePaths,
  createPackageQaArchive,
  fingerprintScenePackage,
  redactScenePackageSourcePaths,
  renderPackageQaMarkdown
} from "./packageQaReport";

const validationReport: ValidationReport = {
  valid: true,
  summary: { errors: 0, warnings: 0, infos: 0 },
  findings: []
};

function scenePackage(): ScenePackage {
  return {
    manifest: {
      format: "kairo-neutral-scene",
      version: "0.1.0",
      units: "millimeter",
      axisSystem: { up: "Z", handedness: "right" },
      rootSceneFile: "scene.json",
      createdBy: { name: "test", version: "0.1.0" },
      source: {
        format: "DXF",
        path: "C:\\Users\\georgem\\Downloads\\ScottLayouts\\layout.dxf"
      }
    },
    scene: {
      rootNodeId: "root",
      nodes: [
        {
          id: "root",
          displayName: "Local Path Scene",
          type: "scene",
          children: ["node-a"],
          localTransform: identityMatrix()
        },
        {
          id: "node-a",
          displayName: "A",
          type: "drawing",
          children: [],
          localTransform: identityMatrix(),
          geometryRefs: ["geom-a"],
          layerId: "layer-a"
        }
      ]
    },
    geometry: [
      {
        geometries: [
          {
            id: "geom-a",
            kind: "curve-set",
            layerId: "layer-a",
            entities: [
              {
                id: "line-a",
                type: "line",
                start: [0, 0, 0],
                end: [10, 0, 0],
                layerId: "layer-a"
              },
              {
                id: "text-a",
                type: "text",
                text: "7B-070L-DN1",
                position: [5, 1, 0],
                rotationDeg: 0,
                height: 2,
                origin: "TEXT",
                layerId: "layer-a"
              }
            ]
          }
        ]
      }
    ],
    layers: { layers: [{ id: "layer-a", name: "A", visible: true }] },
    materials: { materials: [] },
    sourceMap: {
      sources: [
        {
          id: "src-dxf-file",
          path: "C:\\Users\\georgem\\Downloads\\ScottLayouts\\layout.dxf",
          format: "DXF"
        }
      ]
    }
  };
}

describe("package QA report", () => {
  it("redacts local source paths without changing package counts", () => {
    const original = scenePackage();
    const redacted = redactScenePackageSourcePaths(original);

    expect(countLocalSourcePaths(original)).toBe(2);
    expect(countLocalSourcePaths(redacted)).toBe(0);
    expect(redacted.manifest.source.path).toBe("layout.dxf");
    expect(redacted.sourceMap.sources[0].path).toBe("layout.dxf");
    expect(fingerprintScenePackage(redacted)).toEqual(fingerprintScenePackage(original));
  });

  it("creates deterministic machine QA markdown for a redacted package round trip", () => {
    const original = scenePackage();
    const { archive, loaded } = createPackageQaArchive(original, true);
    const result = buildPackageQaResult(
      original,
      loaded.scenePackage,
      validationReport,
      validationReport,
      archive.byteLength,
      loaded.packageIndex,
      "redacted"
    );
    const markdown = renderPackageQaMarkdown(result);

    expect(result.countsMatch).toBe(true);
    expect(result.localPathCount).toBe(0);
    expect(markdown).toBe(renderPackageQaMarkdown(result));
    expect(markdown).toContain("Machine QA: PASS");
    expect(markdown).toContain("Manual browser open/drop confirmation is still pending.");
    expect(markdown).not.toContain("C:\\Users\\");
    expect(markdown).not.toContain("Downloads\\ScottLayouts");
    expect(markdown).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});
