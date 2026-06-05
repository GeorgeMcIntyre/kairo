import type { DrawingEntity, ScenePackage } from "@kairo/schema";
import { describe, expect, it } from "vitest";
import { parseDeviceText } from "./deviceDictionary";
import type { SemanticTextLabel } from "./layoutSemantics";
import { associateLabelToGeometry, buildSemanticGeometryGroups } from "./semanticDevices";

function label(text: string, x: number, y: number, patch: Partial<SemanticTextLabel> = {}): SemanticTextLabel {
  return {
    text,
    normalizedText: text,
    position: [x, y, 0],
    rotationDeg: 0,
    height: 100,
    bounds: { min: [x - 50, y - 50, 0], max: [x + 50, y + 50, 0] },
    sourceTextEntityIds: [`text-${text}`],
    ...patch
  };
}

function line(id: string, x: number, y: number, sourceRef?: string): DrawingEntity {
  return {
    id,
    type: "line",
    start: [x - 100, y - 100, 0],
    end: [x + 100, y + 100, 0],
    layerId: "layer-robot",
    sourceRef
  };
}

function scene(entities: DrawingEntity[]): ScenePackage {
  return {
    manifest: {
      format: "kairo-neutral-scene",
      version: "0.1.0",
      units: "millimeter",
      axisSystem: { up: "Z", handedness: "right" },
      rootSceneFile: "scene.json",
      createdBy: { name: "test", version: "0.1.0" },
      source: { format: "dxf" }
    },
    scene: {
      rootNodeId: "root",
      nodes: [
        {
          id: "root",
          displayName: "root",
          type: "scene",
          children: [],
          localTransform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
          geometryRefs: ["curves"]
        }
      ]
    },
    layers: {
      layers: [{ id: "layer-robot", name: "0-Q-GENRO", visible: true }]
    },
    materials: { materials: [] },
    sourceMap: { sources: [] },
    geometry: [
      {
        geometries: [
          {
            id: "curves",
            kind: "curve-set",
            layerId: "layer-robot",
            entities
          }
        ]
      }
    ]
  };
}

describe("label-to-geometry association", () => {
  it("links a label close to one geometry group", () => {
    const sourceRef = "src-dxf-insert-A1-block-robot-base-child-L1";
    const groups = buildSemanticGeometryGroups(scene([line("robot-line", 0, 0, sourceRef)]));
    const association = associateLabelToGeometry(label("7B-020L-04", 120, 0), groups, parseDeviceText("7B-020L-04"));

    expect(association.status).toBe("linked");
    expect(association.group?.entityIds).toEqual(["robot-line"]);
    expect(association.confidence).toBeGreaterThan(0.7);
    expect(association.reason.join(" ")).toContain("known P736 robot tag");
  });

  it("marks a label between two similarly scored groups as ambiguous", () => {
    const groups = buildSemanticGeometryGroups(
      scene([
        line("left-line", -500, 0, "src-dxf-insert-L-block-robot-base-child-L1"),
        line("right-line", 500, 0, "src-dxf-insert-R-block-robot-base-child-L1")
      ])
    );
    const association = associateLabelToGeometry(label("7B-020L-04", 0, 0), groups, parseDeviceText("7B-020L-04"));

    expect(association.status).toBe("ambiguous");
    expect(association.candidates.map((candidate) => candidate.groupId)).toHaveLength(2);
    expect(association.reason.join(" ")).toContain("multiple nearby geometry groups");
  });

  it("keeps a far label unlinked", () => {
    const groups = buildSemanticGeometryGroups(scene([line("robot-line", 0, 0, "src-dxf-insert-A1-block-robot-child-L1")]));
    const association = associateLabelToGeometry(
      label("7B-020L-04", 20000, 0),
      groups,
      parseDeviceText("7B-020L-04")
    );

    expect(association.status).toBe("unlinked");
    expect(association.group).toBeUndefined();
    expect(association.reason.join(" ")).toContain("no nearby geometry group");
  });

  it("drops association confidence as distance increases", () => {
    const groups = buildSemanticGeometryGroups(scene([line("robot-line", 0, 0, "src-dxf-insert-A1-block-robot-child-L1")]));
    const parsed = parseDeviceText("7B-020L-04");
    const near = associateLabelToGeometry(label("7B-020L-04", 120, 0), groups, parsed);
    const farther = associateLabelToGeometry(label("7B-020L-04", 2400, 0), groups, parsed);

    expect(near.status).toBe("linked");
    expect(farther.status).toBe("linked");
    expect(farther.confidence).toBeLessThan(near.confidence);
  });

  it("honors capped association radius for long text labels", () => {
    const groups = buildSemanticGeometryGroups(scene([line("robot-line", 0, 0, "src-dxf-insert-A1-block-robot-child-L1")]));
    const parsed = parseDeviceText("7B-020R-03");
    const association = associateLabelToGeometry(
      label("7B-020R-03 long note", 2200, 0, {
        associationText: "7B-020R-03",
        isLongText: true,
        height: 500,
        associationRadius: 900
      }),
      groups,
      parsed
    );

    expect(association.status).toBe("unlinked");
    expect(association.reason.join(" ")).toContain("no nearby geometry group");
  });
});
