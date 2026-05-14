import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseGlbJson(bytes: Buffer) {
  const jsonLength = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8").trim());
}

describe("CAD Exchanger GLB export script", () => {
  it("scales stroke text styling and writes deterministic redacted reports", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "kairo-cadex-glb-test-"));
    try {
      const sceneDir = path.join(tempDir, "scene");
      const geometryDir = path.join(sceneDir, "geometry");
      await mkdir(geometryDir, { recursive: true });

      await writeJson(path.join(sceneDir, "manifest.json"), {
        format: "kairo-neutral-scene",
        version: "0.1.0",
        units: "millimeter",
        axisSystem: { up: "Z", handedness: "right" },
        rootSceneFile: "scene.json",
        createdBy: { name: "test", version: "0" },
        source: {
          format: "DXF",
          path: "C:\\Users\\georgem\\Downloads\\ScottLayouts\\problem.dxf"
        }
      });
      await writeJson(path.join(sceneDir, "layers.json"), {
        layers: [
          { id: "layer-cut", name: "CUT", visible: true },
          { id: "layer-text", name: "TEXT", visible: true }
        ]
      });
      await writeJson(path.join(sceneDir, "source-map.json"), {
        sources: [
          { id: "src-dxf-file", format: "DXF", entityType: "FILE", path: "C:\\Users\\georgem\\Downloads\\ScottLayouts\\problem.dxf" },
          { id: "src-dxf-line-1", format: "DXF", entityType: "LINE", entityId: "1" },
          { id: "src-dxf-text-1", format: "DXF", entityType: "TEXT", entityId: "2" }
        ]
      });
      await writeJson(path.join(sceneDir, "import-report.json"), {
        summary: { warningCount: 1 },
        warnings: [
          {
            code: "DXF_BLOCK_PARTIAL_EXPAND",
            entityType: "INSERT",
            handle: "I1",
            message: "DXF BLOCK was partially expanded; unsupported children skipped: SPLINEx1."
          }
        ]
      });
      await writeJson(path.join(geometryDir, "geom-layer-cut-curves.json"), {
        geometries: [
          {
            id: "geom-layer-cut-curves",
            kind: "curve-set",
            layerId: "layer-cut",
            entities: [
              { id: "line-1", type: "line", layerId: "layer-cut", sourceRef: "src-dxf-line-1", start: [0, 0, 0], end: [1000, 0, 0] },
              {
                id: "text-1",
                type: "text",
                layerId: "layer-text",
                sourceRef: "src-dxf-text-1",
                text: "7B-020L GEO & SPAC",
                position: [0, 100, 5],
                rotationDeg: 0,
                height: 457.2,
                origin: "TEXT"
              }
            ]
          }
        ]
      });

      const outputBase = path.join(tempDir, "out", "problem");
      await execFileAsync(process.execPath, [path.join(repoRoot, "tools", "export-scene-cadex-glb.mjs"), sceneDir, outputBase, "--scale-to-meters"], {
        cwd: repoRoot
      });

      const reportText = await readFile(`${outputBase}.cadex-report.json`, "utf8");
      const report = JSON.parse(reportText);
      expect(reportText).not.toContain("C:\\Users\\");
      expect(report.sourceFile).toBe("problem.dxf");
      expect(report.text.textZLift).toBe(0.003);
      expect(report.text.suspiciousLargeTextHeights[0]).toMatchObject({
        label: "7B-020L",
        sourceHeight: 457.2,
        exportedTextHeight: 0.4572,
        capHeight: 0.15,
        z: 0.008
      });
      expect(report.entityCounts.sourceMap).toEqual({ LINE: 1, TEXT: 1 });
      expect(report.importWarnings.warningCounts).toEqual({ DXF_BLOCK_PARTIAL_EXPAND: 1 });
      expect(report.importWarnings.warnings[0]).toMatchObject({
        code: "DXF_BLOCK_PARTIAL_EXPAND",
        entityType: "INSERT",
        handle: "I1"
      });
      expect(report.outputs.meshPath).toBe("problem.pro.ribbons-keytext.glb");

      const summary = JSON.parse(await readFile(`${outputBase}.cadex-summary.json`, "utf8"));
      expect(summary.source).toBe("problem.dxf");
      expect(summary.coordinateScale).toBe(0.001);

      const gltf = parseGlbJson(await readFile(`${outputBase}.pro.lines-keytext.glb`));
      const zMax = Math.max(...gltf.accessors.filter((accessor: { type: string }) => accessor.type === "VEC3").map((accessor: { max: number[] }) => accessor.max[2]));
      expect(zMax).toBeLessThan(0.02);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
