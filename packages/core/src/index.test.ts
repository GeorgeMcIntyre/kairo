import { describe, expect, it } from "vitest";
import { computeEntityBounds, computeRobustSceneBounds, computeSceneCentroid, parseSourceRef } from "./index";

describe("parseSourceRef", () => {
  it("parses src-dxf-file", () => {
    expect(parseSourceRef("src-dxf-file")).toEqual({ kind: "file" });
  });

  it("parses direct entity ref", () => {
    expect(parseSourceRef("src-dxf-5a")).toEqual({ kind: "direct", handle: "5a" });
  });

  it("parses mtext ref", () => {
    expect(parseSourceRef("src-dxf-mtext-3f2")).toEqual({ kind: "mtext", handle: "3f2" });
  });

  it("parses simple block-child ref", () => {
    expect(parseSourceRef("src-dxf-insert-i1-block-lineblock-child-l1")).toEqual({
      kind: "block-child",
      insertHandle: "i1",
      blockName: "lineblock",
      childHandle: "l1"
    });
  });

  it("parses block-child ref with hyphenated block name", () => {
    expect(parseSourceRef("src-dxf-insert-5a-block-plant-layout-a0-1189x841-v2014-01-child-3f2")).toEqual({
      kind: "block-child",
      insertHandle: "5a",
      blockName: "plant-layout-a0-1189x841-v2014-01",
      childHandle: "3f2"
    });
  });

  it("returns unknown for unrecognised strings", () => {
    expect(parseSourceRef("random-string")).toEqual({ kind: "unknown" });
  });
});

describe("computeSceneCentroid", () => {
  it("returns median per axis — resistant to outlier influence", () => {
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

  it("returns the element itself for a single-element input", () => {
    const c = computeSceneCentroid([[7, 3, -2]]);
    expect(c).toEqual([7, 3, -2]);
  });

  it("averages the two middle values for even-count input", () => {
    const c = computeSceneCentroid([
      [0, 0, 0],
      [4, 0, 0]
    ]);
    expect(c[0]).toBeCloseTo(2, 6);
  });

  it("returns [0,0,0] for empty input", () => {
    expect(computeSceneCentroid([])).toEqual([0, 0, 0]);
  });
});

describe("computeEntityBounds", () => {
  it("computes curve entity bounds without Three.js", () => {
    expect(
      computeEntityBounds({
        id: "circle-1",
        type: "circle",
        center: [10, 20, 0],
        radius: 5
      })
    ).toEqual({ min: [5, 15, 0], max: [15, 25, 0] });
  });

  it("includes bulged polyline arc extents in bounds", () => {
    const bounds = computeEntityBounds({
      id: "bulged-polyline",
      type: "polyline",
      points: [
        [0, 0, 0],
        [10, 0, 0]
      ],
      bulges: [1],
      closed: false
    });

    expect(bounds.min[0]).toBeCloseTo(0, 6);
    expect(bounds.max[0]).toBeCloseTo(10, 6);
    expect(Math.max(Math.abs(bounds.min[1]), Math.abs(bounds.max[1]))).toBeGreaterThan(4.9);
  });
});

describe("computeRobustSceneBounds", () => {
  it("keeps raw bounds while excluding a far tiny entity from fit bounds", () => {
    const mainLines = Array.from({ length: 20 }, (_, index) => ({
      id: `main-${index}`,
      type: "line" as const,
      start: [index, 0, 0],
      end: [index, 10, 0],
      layerId: "main-layer"
    }));
    const farPointLine = {
      id: "far-left-tiny",
      type: "line" as const,
      start: [-10000, -10000, 0],
      end: [-9999.9, -10000, 0],
      layerId: "junk-layer"
    };

    const result = computeRobustSceneBounds([...mainLines, farPointLine]);

    expect(result.rawBounds.min[0]).toBeCloseTo(-10000, 6);
    expect(result.rawBounds.min[1]).toBeCloseTo(-10000, 6);
    expect(result.fitBounds.min[0]).toBeGreaterThan(-100);
    expect(result.fitBounds.min[1]).toBeGreaterThan(-100);
    expect(result.outlierEntityIds).toContain("far-left-tiny");
    expect(result.entityBounds.find((entry) => entry.entityId === "far-left-tiny")?.isOutlier).toBe(true);
    expect(result.outlierBounds?.min[0]).toBeCloseTo(-10000, 6);
  });

  it("falls back to zero bounds for empty input", () => {
    const result = computeRobustSceneBounds([]);
    expect(result.rawBounds).toEqual({ min: [0, 0, 0], max: [0, 0, 0] });
    expect(result.outlierEntityIds).toEqual([]);
  });

  it("does not hide legitimate uniformly distributed edge geometry", () => {
    const grid = Array.from({ length: 100 }, (_, index) => {
      const x = index % 10;
      const y = Math.floor(index / 10);
      return {
        id: `grid-${index}`,
        type: "line" as const,
        start: [x * 1000, y * 1000, 0],
        end: [x * 1000 + 200, y * 1000, 0]
      };
    });

    const result = computeRobustSceneBounds(grid);

    expect(result.outlierEntityIds).toEqual([]);
    expect(result.fitBounds).toEqual(result.rawBounds);
  });

  it("hides small disconnected sparse components near a dominant large layout", () => {
    const mainLayout = Array.from({ length: 1500 }, (_, index) => {
      const x = index % 50;
      const y = Math.floor(index / 50);
      return {
        id: `main-${index}`,
        type: "line" as const,
        start: [x * 1000, y * 1000, 0],
        end: [x * 1000 + 500, y * 1000, 0]
      };
    });
    const sparseIsland = Array.from({ length: 10 }, (_, index) => ({
      id: `island-${index}`,
      type: "line" as const,
      start: [25000 + index, 120000 + index, 0],
      end: [25000 + index + 0.1, 120000 + index, 0]
    }));

    const result = computeRobustSceneBounds([...mainLayout, ...sparseIsland], {
      spatialClusterMinEntityCount: 100,
      spatialClusterKeepFraction: 0.05
    });

    expect(result.outlierEntityIds).toEqual(expect.arrayContaining(sparseIsland.map((entity) => entity.id)));
    expect(result.fitBounds.max[1]).toBeLessThan(120000);
  });
});
