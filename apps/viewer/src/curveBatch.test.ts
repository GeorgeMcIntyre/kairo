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
