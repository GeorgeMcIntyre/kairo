import { identityMatrix } from "@kairo/core";
import type { ScenePackage, ValidationReport } from "@kairo/schema";
import { describe, expect, it } from "vitest";
import { buildLayoutContentCoveragePack } from "./layoutContentReport";

const validationReport: ValidationReport = {
  valid: true,
  summary: {
    errors: 0,
    warnings: 0,
    infos: 0
  },
  findings: []
};

function scenePackage(): ScenePackage {
  return {
    manifest: {
      format: "kairo-neutral-scene",
      version: "0.1.0",
      units: "millimeter",
      axisSystem: {
        up: "Z",
        handedness: "right"
      },
      rootSceneFile: "scene.json",
      createdBy: {
        name: "test",
        version: "0.1.0"
      },
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
          displayName: "Fixture",
          type: "scene",
          children: ["layer-node"],
          localTransform: identityMatrix()
        },
        {
          id: "layer-node",
          displayName: "0-A-ANNOT-T",
          type: "drawing",
          children: [],
          localTransform: identityMatrix(),
          geometryRefs: ["geom-a"],
          layerId: "layer-a"
        }
      ]
    },
    layers: {
      layers: [
        {
          id: "layer-a",
          name: "0-A-ANNOT-T",
          visible: true
        }
      ]
    },
    materials: { materials: [] },
    sourceMap: {
      sources: [
        {
          id: "src-dxf-file",
          path: "C:\\Users\\georgem\\Downloads\\ScottLayouts\\layout.dxf",
          format: "DXF"
        },
        {
          id: "src-dxf-text-a",
          path: "C:\\Users\\georgem\\Downloads\\ScottLayouts\\layout.dxf",
          format: "DXF",
          entityType: "TEXT",
          entityId: "A"
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
                layerId: "layer-a",
                sourceRef: "src-dxf-line-a"
              },
              {
                id: "text-a",
                type: "text",
                text: "7B-070L-DN1, \"A\"",
                position: [5, 2, 0],
                rotationDeg: 0,
                height: 2,
                origin: "TEXT",
                layerId: "layer-a",
                sourceRef: "src-dxf-text-a"
              }
            ]
          }
        ]
      }
    ]
  };
}

describe("layout content coverage report", () => {
  it("renders deterministic markdown and CSV without local paths or timestamps", () => {
    const first = buildLayoutContentCoveragePack(scenePackage(), validationReport);
    const second = buildLayoutContentCoveragePack(scenePackage(), validationReport);

    expect(first.markdown).toBe(second.markdown);
    expect(first.markdown).toContain("Manual visual geometry confirmation is still pending.");
    expect(first.markdown).toContain("layout.dxf");
    expect(first.markdown).not.toContain("C:\\Users\\");
    expect(first.markdown).not.toContain("Downloads\\ScottLayouts");
    expect(first.markdown).not.toMatch(/\d{4}-\d{2}-\d{2}/);

    expect(first.csv["labels.csv"]).toContain('"7B-070L-DN1, ""A"""');
    expect(first.csv["labels.csv"]).toContain("reviewer_result,reviewer_notes");
    expect(first.csv["semantic-items.csv"]).toContain("dunnage");
    expect(first.csv["layers.csv"]).toContain("0-A-ANNOT-T");
    expect(first.csv["coverage-risks.csv"]).toContain("risk,severity,count,details,reviewer_result,reviewer_notes");
    expect(first.csv["coverage-risks.csv"]).toContain("NONE,info,0");
  });
});
