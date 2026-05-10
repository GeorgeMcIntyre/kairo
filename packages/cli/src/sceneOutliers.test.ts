import type { DrawingEntity } from "@kairo/schema";
import { describe, expect, it } from "vitest";
import {
  computeEntityCentroid,
  computeOutlierBlockSummary,
  computeSceneCentroid,
  extractBlockName,
  findOutliers
} from "./sceneOutliers";

function lineAt(id: string, x: number, y: number, length = 1, layerId?: string): DrawingEntity {
  return {
    id,
    type: "line",
    start: [x, y, 0],
    end: [x + length, y, 0],
    ...(layerId ? { layerId } : {})
  };
}

describe("computeEntityCentroid", () => {
  it("computes line midpoint", () => {
    expect(computeEntityCentroid({ id: "l1", type: "line", start: [0, 0, 0], end: [10, 4, 2] })).toEqual([5, 2, 1]);
  });

  it("computes polyline bbox midpoint", () => {
    expect(
      computeEntityCentroid({
        id: "p1",
        type: "polyline",
        closed: false,
        points: [
          [0, 0, 0],
          [4, 0, 0],
          [4, 6, 2]
        ]
      })
    ).toEqual([2, 3, 1]);
  });

  it("returns center for circle and arc", () => {
    expect(computeEntityCentroid({ id: "c1", type: "circle", center: [3, 4, 5], radius: 1 })).toEqual([3, 4, 5]);
    expect(
      computeEntityCentroid({
        id: "a1",
        type: "arc",
        center: [-2, 7, 0],
        radius: 1,
        startAngleDeg: 0,
        endAngleDeg: 90
      })
    ).toEqual([-2, 7, 0]);
  });
});

describe("computeSceneCentroid", () => {
  it("uses median, not mean — resists outlier influence", () => {
    const centroids = [
      [0, 0, 0],
      [1, 0, 0],
      [-1, 0, 0],
      [2, 0, 0],
      [-2, 0, 0],
      [10000, 0, 0]
    ] as const;
    const c = computeSceneCentroid(centroids);
    expect(c[0]).toBeCloseTo(0.5, 6);
    expect(c[1]).toBe(0);
    expect(c[2]).toBe(0);
  });
});

describe("findOutliers", () => {
  it("flags a single distant entity in an otherwise centered ring", () => {
    const ring: DrawingEntity[] = [];
    for (let i = 0; i < 100; i++) {
      const angle = (i / 100) * Math.PI * 2;
      ring.push(lineAt(`ring-${i}`, Math.cos(angle) * 10, Math.sin(angle) * 10));
    }
    const distant = lineAt("distant", 100000, 100000);
    const result = findOutliers([...ring, distant]);
    expect(result.length).toBe(1);
    expect(result[0].entityId).toBe("distant");
    expect(result[0].rank).toBe(1);
    expect(result[0].distance).toBeGreaterThan(100000);
  });

  it("returns no outliers when entities are uniformly distributed", () => {
    const entities: DrawingEntity[] = [];
    for (let x = 0; x < 10; x++) {
      for (let y = 0; y < 10; y++) {
        entities.push(lineAt(`u-${x}-${y}`, x * 5, y * 5));
      }
    }
    const result = findOutliers(entities);
    expect(result).toEqual([]);
  });

  it("handles negative coordinates by absolute distance", () => {
    const inner: DrawingEntity[] = [];
    for (let i = 0; i < 50; i++) {
      inner.push(lineAt(`inner-${i}`, (i % 10) - 5, Math.floor(i / 10) - 2));
    }
    const distantNeg = lineAt("distant-neg", -100000, -100000);
    const result = findOutliers([...inner, distantNeg]);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].entityId).toBe("distant-neg");
    expect(result[0].distance).toBeGreaterThan(100000);
  });

  it("returns empty list for empty input without throwing", () => {
    expect(findOutliers([])).toEqual([]);
  });
});

describe("extractBlockName", () => {
  it("extracts block name from a standard insert source ref", () => {
    expect(extractBlockName("src-dxf-insert-1773a-block-7b060-spac-child-f4ed")).toBe("7b060-spac");
  });

  it("extracts block name containing dashes without over-consuming into child segment", () => {
    expect(extractBlockName("src-dxf-insert-178a3-block-7b-040-ped-rivet-r00-child-13863")).toBe(
      "7b-040-ped-rivet-r00"
    );
  });

  it("returns (direct) for a direct entity ref (no block/child pattern)", () => {
    expect(extractBlockName("src-dxf-8bdaa")).toBe("(direct)");
    expect(extractBlockName("src-dxf-mtext-8bdca")).toBe("(direct)");
  });

  it("returns (no source) for undefined or empty", () => {
    expect(extractBlockName(undefined)).toBe("(no source)");
    expect(extractBlockName("")).toBe("(no source)");
  });
});

describe("computeOutlierBlockSummary", () => {
  it("groups outliers by block name, counts, and tracks min/max distance", () => {
    const outliers = [
      { rank: 1, distance: 900, type: "polyline" as const, entityId: "e1", centroid: [0, 0, 0] as const, sourceRef: "src-dxf-insert-aaa-block-spac-child-11" },
      { rank: 2, distance: 800, type: "polyline" as const, entityId: "e2", centroid: [0, 0, 0] as const, sourceRef: "src-dxf-insert-bbb-block-spac-child-22" },
      { rank: 3, distance: 300, type: "line" as const, entityId: "e3", centroid: [0, 0, 0] as const, sourceRef: "src-dxf-insert-ccc-block-fence-child-33" }
    ];
    const summary = computeOutlierBlockSummary(outliers);
    expect(summary[0].blockName).toBe("spac");
    expect(summary[0].count).toBe(2);
    expect(summary[0].minDistance).toBe(800);
    expect(summary[0].maxDistance).toBe(900);
    expect(summary[1].blockName).toBe("fence");
    expect(summary[1].count).toBe(1);
  });

  it("sorts by count descending", () => {
    const outliers = [
      { rank: 1, distance: 100, type: "line" as const, entityId: "a", centroid: [0, 0, 0] as const, sourceRef: "src-dxf-insert-x-block-rare-child-1" },
      { rank: 2, distance: 200, type: "line" as const, entityId: "b", centroid: [0, 0, 0] as const, sourceRef: "src-dxf-insert-x-block-common-child-1" },
      { rank: 3, distance: 300, type: "line" as const, entityId: "c", centroid: [0, 0, 0] as const, sourceRef: "src-dxf-insert-y-block-common-child-2" }
    ];
    const summary = computeOutlierBlockSummary(outliers);
    expect(summary[0].blockName).toBe("common");
    expect(summary[0].count).toBe(2);
    expect(summary[1].blockName).toBe("rare");
    expect(summary[1].count).toBe(1);
  });

  it("returns empty array for no outliers", () => {
    expect(computeOutlierBlockSummary([])).toEqual([]);
  });
});
