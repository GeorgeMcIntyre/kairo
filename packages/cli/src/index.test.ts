import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "./index";

type CapturedRun = {
  code: number;
  stdout: string;
  stderr: string;
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sampleScenePath = path.join(repoRoot, "examples", "example-scene");
const dxfFixturePath = path.join(repoRoot, "packages", "importer-dxf", "test-fixtures", "one-line.dxf");

async function captureCli(args: string[]): Promise<CapturedRun> {
  let stdout = "";
  let stderr = "";
  const code = await runCli(args, {
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    }
  });

  return { code, stdout, stderr };
}

async function copySampleScene(tempRoot: string, name: string) {
  const destination = path.join(tempRoot, name);
  await cp(sampleScenePath, destination, { recursive: true });
  return destination;
}

async function readSceneJson(scenePath: string) {
  const filePath = path.join(scenePath, "scene.json");
  return {
    filePath,
    data: JSON.parse(await readFile(filePath, "utf8")) as {
      rootNodeId: string;
      nodes: Array<{
        id: string;
        geometryRefs?: string[];
      }>;
    }
  };
}

describe("kairo validate", () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "kairo-cli-"));
  });

  afterEach(async () => {
    delete process.env.KAIRO_VIEWER_PUBLIC_SCENES_DIR;
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("returns success for the valid example scene", async () => {
    const result = await captureCli(["validate", sampleScenePath]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toBe(
      [
        "Kairo validation passed",
        "Scene: Bracket Exchange Sample",
        "Format version: 0.1.0",
        "Nodes: 3",
        "Geometry: 2",
        "Issues: 0 errors, 0 warnings, 0 infos",
        ""
      ].join("\n")
    );
  });

  it("returns failure for an invalid scene folder", async () => {
    const invalidScenePath = await copySampleScene(tempRoot, "missing-geometry");
    const scene = await readSceneJson(invalidScenePath);
    scene.data.nodes[1].geometryRefs = ["missing-geometry"];
    await writeFile(scene.filePath, `${JSON.stringify(scene.data, null, 2)}\n`);

    const result = await captureCli(["validate", invalidScenePath]);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Kairo validation failed\n");
    expect(result.stderr).toContain("MISSING_GEOMETRY_REF $.scene.nodes[1].geometryRefs[0]");
    expect(result.stderr).not.toContain("Error:");
  });

  it("prints parseable deterministic JSON output", async () => {
    const first = await captureCli(["validate", sampleScenePath, "--json"]);
    const second = await captureCli(["validate", sampleScenePath, "--json"]);

    expect(first.code).toBe(0);
    expect(first.stderr).toBe("");
    expect(first.stdout).toBe(second.stdout);
    expect(JSON.parse(first.stdout)).toEqual({
      valid: true,
      summary: {
        errors: 0,
        warnings: 0,
        infos: 0
      },
      scene: {
        rootNodeId: "node-root",
        rootName: "Bracket Exchange Sample",
        formatVersion: "0.1.0",
        nodeCount: 3,
        geometryCount: 2
      },
      issues: []
    });
  });

  it("fails cleanly when the scene path is missing", async () => {
    const result = await captureCli(["validate"]);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("Kairo validation failed\n- ERROR MISSING_SCENE_PATH: Usage: kairo validate <scene-path> [--json]\n");
  });

  it("reports unsupported versions with UNSUPPORTED_FORMAT_VERSION", async () => {
    const invalidScenePath = await copySampleScene(tempRoot, "unsupported-version");
    const manifestPath = path.join(invalidScenePath, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { version: string };
    manifest.version = "9.9.9";
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = await captureCli(["validate", invalidScenePath, "--json"]);
    const json = JSON.parse(result.stdout);

    expect(result.code).toBe(1);
    expect(result.stderr).toBe("");
    expect(json.valid).toBe(false);
    expect(json.summary).toEqual({
      errors: 1,
      warnings: 0,
      infos: 0
    });
    expect(json.issues).toEqual([
      {
        code: "UNSUPPORTED_FORMAT_VERSION",
        severity: "error",
        message: 'Unsupported Kairo format version "9.9.9". Supported versions: 0.1.0.',
        path: "$.manifest.version"
      }
    ]);
  });

  it("imports a DXF fixture and writes a valid exploded scene", async () => {
    const outputDir = path.join(tempRoot, "imported-scene");
    const importResult = await captureCli(["import-dxf", dxfFixturePath, outputDir]);

    expect(importResult.code).toBe(0);
    expect(importResult.stderr).toBe("");
    expect(importResult.stdout).toContain("Kairo DXF import passed\n");
    expect(importResult.stdout).toContain("Supported entities: 1\n");
    expect(importResult.stdout).toContain("Unsupported entities: 0\n");

    const validateResult = await captureCli(["validate", outputDir]);
    expect(validateResult.code).toBe(0);
    expect(validateResult.stderr).toBe("");
    expect(validateResult.stdout).toContain("Kairo validation passed\n");
    expect(validateResult.stdout).toContain("Scene: one-line.dxf\n");
  });

  it("can suppress detailed DXF import warnings for operator handoff scripts", async () => {
    const outputDir = path.join(tempRoot, "imported-scene-quiet");
    const importResult = await captureCli(["import-dxf", dxfFixturePath, outputDir, "--quiet-warnings"]);

    expect(importResult.code).toBe(0);
    expect(importResult.stderr).toBe("");
    expect(importResult.stdout).toContain("Kairo DXF import passed\n");
    expect(importResult.stdout).toContain("Warnings: 0\n");
  });

  it("reports exact DXF conversion coverage without writing a scene", async () => {
    const result = await captureCli(["dxf-coverage", dxfFixturePath]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Kairo DXF coverage\n");
    expect(result.stdout).toContain("PASS 100.0000%");
    expect(result.stdout).toContain("Covered: 1/1\n");
    expect(result.stdout).toContain("Failed: 0\n");
  });

  it("inspects a DXF fixture and writes block inventory reports", async () => {
    const outputBasePath = path.join(tempRoot, "one-line-inventory");
    const result = await captureCli(["inspect-dxf", dxfFixturePath, outputBasePath]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Kairo DXF inspection passed\n");
    expect(result.stdout).toContain("INSERT entities: 0\n");
    expect(result.stdout).toContain("BLOCK definitions: 0\n");
    expect(result.stdout).toContain("Text / Attribute Audit:\n");

    const inventory = JSON.parse(await readFile(`${outputBasePath}.json`, "utf8")) as {
      parser: { ok: boolean };
      totalInsertCount: number;
      blockDefinitionCount: number;
      textAudit: { totalTextCount: number };
    };
    expect(inventory.parser.ok).toBe(true);
    expect(inventory.totalInsertCount).toBe(0);
    expect(inventory.blockDefinitionCount).toBe(0);
    expect(inventory.textAudit.totalTextCount).toBe(0);
    expect(await readFile(`${outputBasePath}.md`, "utf8")).toContain("## Text and Attribute Audit");
  });

  it("inspects a DXF fixture without writing files when output path is omitted", async () => {
    const result = await captureCli(["inspect-dxf", dxfFixturePath]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Kairo DXF inspection passed\n");
    expect(result.stdout).toContain("Text / Attribute Audit:\n");
    // No output-path line when not provided
    expect(result.stdout).not.toContain(".json / .md");
  });

  it("stages a validated exploded scene for the viewer public scene loader", async () => {
    const stagedRoot = path.join(tempRoot, "viewer-scenes");
    process.env.KAIRO_VIEWER_PUBLIC_SCENES_DIR = stagedRoot;
    const result = await captureCli(["stage-viewer-scene", sampleScenePath, "sample-dev"]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Kairo viewer scene staging passed\n");
    expect(result.stdout).toContain("URL path: /?scene=sample-dev\n");
    expect(JSON.parse(await readFile(path.join(stagedRoot, "sample-dev", "manifest.json"), "utf8"))).toMatchObject({
      format: "kairo-neutral-scene"
    });
  });

  it("packs an exploded scene into a .kairo package that validate can read", async () => {
    const outputPath = path.join(tempRoot, "sample.kairo");
    const packResult = await captureCli(["pack-scene", sampleScenePath, outputPath]);

    expect(packResult.code).toBe(0);
    expect(packResult.stderr).toBe("");
    expect(packResult.stdout).toContain("Kairo scene package passed\n");
    expect(packResult.stdout).toContain("Output: ");

    const packageBytes = await readFile(outputPath);
    expect(packageBytes.byteLength).toBeGreaterThan(100);

    const validateResult = await captureCli(["validate", outputPath]);
    expect(validateResult.code).toBe(0);
    expect(validateResult.stderr).toBe("");
    expect(validateResult.stdout).toContain("Kairo validation passed\n");
    expect(validateResult.stdout).toContain("Scene: Bracket Exchange Sample\n");
  });

  it("requires the .kairo extension when packing a scene", async () => {
    const result = await captureCli(["pack-scene", sampleScenePath, path.join(tempRoot, "sample.zip")]);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "Kairo scene package failed\n- ERROR INVALID_PACKAGE_PATH: Output file must use the .kairo extension.\n"
    );
  });

  it("rejects unsafe viewer scene names", async () => {
    const result = await captureCli(["stage-viewer-scene", sampleScenePath, "../escape"]);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "Kairo viewer scene staging failed\n- ERROR INVALID_SCENE_NAME: Scene name may only contain letters, numbers, dot, underscore, and dash.\n"
    );
  });
});
