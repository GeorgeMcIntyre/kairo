import { describe, expect, it } from "vitest";
import { computeSceneCentroid, parseSourceRef } from "./index";

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
