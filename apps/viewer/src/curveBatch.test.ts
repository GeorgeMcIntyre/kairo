import type { Geometry } from "@kairo/schema";
import { describe, expect, it } from "vitest";
import { createCurveBatchData, pickEntryForIntersectionIndex } from "./curveBatch";

function curveSet(entities: Extract<Geometry, { kind: "curve-set" }>["entities"]): Extract<Geometry, { kind: "curve-set" }> {
  return {
    id: "geom-test",
    kind: "curve-set",
    layerId: "layer-default",
    entities
  };
}

describe("createCurveBatchData", () => {
  it("maps a line segment to its source entity", () => {
    const batch = createCurveBatchData(
      curveSet([
        {
          id: "line-1",
          type: "line",
          start: [0, 0, 0],
          end: [10, 0, 0],
          sourceRef: "src-line-1",
          layerId: "layer-a"
        }
      ])
    );

    expect(batch.positions).toHaveLength(6);
    expect(batch.pickEntriesBySegment).toHaveLength(1);
    expect(batch.pickEntriesBySegment[0]).toMatchObject({
      entityId: "line-1",
      sourceRef: "src-line-1",
      type: "line",
      layerId: "layer-a",
      segmentIndex: 0,
      startVertexIndex: 0
    });
  });

  it("maps every rendered polyline segment back to the polyline entity", () => {
    const batch = createCurveBatchData(
      curveSet([
        {
          id: "poly-1",
          type: "polyline",
          points: [
            [0, 0, 0],
            [10, 0, 0],
            [10, 10, 0]
          ],
          closed: false,
          sourceRef: "src-poly-1"
        }
      ])
    );

    expect(batch.pickEntriesBySegment.map((entry) => entry.entityId)).toEqual(["poly-1", "poly-1"]);
    expect(batch.pickEntriesBySegment[0]?.startVertexIndex).toBe(0);
    expect(batch.pickEntriesBySegment[1]?.startVertexIndex).toBe(2);
  });

  it("samples bulged polylines while preserving picking metadata", () => {
    const batch = createCurveBatchData(
      curveSet([
        {
          id: "bulged-poly-1",
          type: "polyline",
          points: [
            [0, 0, 0],
            [10, 0, 0]
          ],
          bulges: [1],
          closed: false
        }
      ])
    );

    expect(batch.pickEntriesBySegment.length).toBeGreaterThan(1);
    expect(new Set(batch.pickEntriesBySegment.map((entry) => entry.entityId))).toEqual(new Set(["bulged-poly-1"]));
  });

  it("uses deterministic tessellation counts for circle and arc picking", () => {
    const batch = createCurveBatchData(
      curveSet([
        {
          id: "circle-1",
          type: "circle",
          center: [0, 0, 0],
          radius: 5,
          sourceRef: "src-circle-1"
        },
        {
          id: "arc-1",
          type: "arc",
          center: [0, 0, 0],
          radius: 5,
          startAngleDeg: 0,
          endAngleDeg: 90,
          sourceRef: "src-arc-1"
        }
      ])
    );

    expect(batch.pickEntriesBySegment.filter((entry) => entry.entityId === "circle-1")).toHaveLength(32);
    expect(batch.pickEntriesBySegment.filter((entry) => entry.entityId === "arc-1")).toHaveLength(24);
  });

  it("renders preserved DXF point, ellipse, spline, face, and solid entities for picking", () => {
    const batch = createCurveBatchData(
      curveSet([
        {
          id: "point-1",
          type: "point",
          position: [1, 2, 0]
        },
        {
          id: "ellipse-1",
          type: "ellipse",
          center: [0, 0, 0],
          majorAxis: [10, 0, 0],
          minorToMajorRatio: 0.5,
          startParameter: 0,
          endParameter: Math.PI * 2
        },
        {
          id: "spline-1",
          type: "spline",
          degree: 2,
          knots: [],
          weights: [],
          controlPoints: [],
          fitPoints: [
            [0, 0, 0],
            [5, 5, 0],
            [10, 0, 0]
          ]
        },
        {
          id: "face-1",
          type: "face3d",
          vertices: [
            [0, 0, 0],
            [10, 0, 0],
            [10, 10, 0],
            [0, 10, 0]
          ]
        },
        {
          id: "solid-1",
          type: "solid",
          vertices: [
            [20, 0, 0],
            [25, 0, 0],
            [20, 5, 0]
          ]
        }
      ])
    );

    expect(batch.pickEntriesBySegment.filter((entry) => entry.entityId === "point-1")).toHaveLength(1);
    expect(batch.pickEntriesBySegment.filter((entry) => entry.entityId === "ellipse-1")).toHaveLength(48);
    expect(batch.pickEntriesBySegment.filter((entry) => entry.entityId === "spline-1")).toHaveLength(2);
    expect(batch.pickEntriesBySegment.filter((entry) => entry.entityId === "face-1")).toHaveLength(4);
    expect(batch.pickEntriesBySegment.filter((entry) => entry.entityId === "solid-1")).toHaveLength(3);
  });

  it("can omit hidden entities while preserving segment metadata for visible entities", () => {
    const batch = createCurveBatchData(
      curveSet([
        {
          id: "visible-line",
          type: "line",
          start: [0, 0, 0],
          end: [10, 0, 0]
        },
        {
          id: "hidden-line",
          type: "line",
          start: [1000, 0, 0],
          end: [1010, 0, 0]
        }
      ]),
      undefined,
      { hiddenEntityIds: new Set(["hidden-line"]) }
    );

    expect(batch.positions).toHaveLength(6);
    expect(batch.pickEntriesBySegment.map((entry) => entry.entityId)).toEqual(["visible-line"]);
  });
});

describe("pickEntryForIntersectionIndex", () => {
  it("resolves Three.js LineSegments start vertex indexes", () => {
    const batch = createCurveBatchData(
      curveSet([
        {
          id: "line-1",
          type: "line",
          start: [0, 0, 0],
          end: [10, 0, 0]
        },
        {
          id: "line-2",
          type: "line",
          start: [20, 0, 0],
          end: [30, 0, 0]
        }
      ])
    );

    expect(pickEntryForIntersectionIndex(0, batch.pickEntriesBySegment)?.entityId).toBe("line-1");
    expect(pickEntryForIntersectionIndex(2, batch.pickEntriesBySegment)?.entityId).toBe("line-2");
  });

  it("also tolerates end vertex indexes", () => {
    const batch = createCurveBatchData(
      curveSet([
        {
          id: "line-1",
          type: "line",
          start: [0, 0, 0],
          end: [10, 0, 0]
        },
        {
          id: "line-2",
          type: "line",
          start: [20, 0, 0],
          end: [30, 0, 0]
        }
      ])
    );

    expect(pickEntryForIntersectionIndex(1, batch.pickEntriesBySegment)?.entityId).toBe("line-1");
    expect(pickEntryForIntersectionIndex(2, batch.pickEntriesBySegment)?.entityId).toBe("line-2");
  });
});
