import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createReadStream, createWriteStream } from "node:fs";
import { access, copyFile, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import type { IncomingMessage, ServerResponse } from "node:http";

const viewerDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(viewerDirectory, "../..");
const require = createRequire(import.meta.url);
const cliDistPath = path.join(repoRoot, "packages", "cli", "dist", "index.js");
const nodeMaxOldSpaceMb = Number(process.env.KAIRO_LARGE_DXF_NODE_HEAP_MB ?? 12288);
const packageCacheDirectory = process.env.KAIRO_LARGE_DXF_CACHE_DIR ?? path.join(tmpdir(), "kairo-large-dxf-cache");
const glbExportScriptPath = path.join(repoRoot, "tools", "export-kairo-package-cadex-glb.ts");
const tsxCliPath = path.join(path.dirname(require.resolve("tsx/package.json")), "dist", "cli.mjs");
const glbExportCacheVersion = "cadex-glb-v2-spatial-outliers";

function safeFileName(value: string | undefined, fallback: string) {
  const decoded = value ? decodeURIComponent(value) : fallback;
  return path.basename(decoded).replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_") || fallback;
}

function writeJson(res: ServerResponse, statusCode: number, value: unknown) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(`${JSON.stringify(value)}\n`);
}

function childProcessEnv(extra?: NodeJS.ProcessEnv) {
  return Object.fromEntries(
    Object.entries({ ...process.env, ...extra }).filter(([key, value]) => value !== undefined && !key.startsWith("="))
  ) as NodeJS.ProcessEnv;
}

async function pathExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function cacheKeyForRequest(fileName: string, req: IncomingMessage) {
  const fileSize = req.headers["x-kairo-file-size"]?.toString() ?? req.headers["content-length"]?.toString() ?? "unknown-size";
  const lastModified = req.headers["x-kairo-file-last-modified"]?.toString() ?? "unknown-mtime";
  const hash = createHash("sha256").update(`${fileName}\n${fileSize}\n${lastModified}`).digest("hex").slice(0, 24);
  const baseName = path.basename(fileName, path.extname(fileName)).replace(/[^A-Za-z0-9._-]+/g, "_") || "layout";
  return {
    key: hash,
    packagePath: path.join(packageCacheDirectory, `${baseName}-${hash}.kairo`),
    reportPath: path.join(packageCacheDirectory, `${baseName}-${hash}.report.json`)
  };
}

async function sendPackageResponse(
  res: ServerResponse,
  fileName: string,
  cacheKey: string,
  packagePath: string,
  reportPath: string,
  cacheStatus: "hit" | "miss"
) {
  const [archive, reportText] = await Promise.all([readFile(packagePath), readFile(reportPath, "utf8")]);
  const report = JSON.parse(reportText) as {
    import?: {
      summary?: {
        warningCount?: number;
        supportedEntityCount?: number;
        unsupportedEntityCount?: number;
      };
      coverage?: {
        conversionPercent?: number;
      };
    };
  };

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/vnd.kairo.package+zip");
  res.setHeader("Content-Disposition", `attachment; filename="${path.basename(fileName, path.extname(fileName))}.kairo"`);
  res.setHeader("X-Kairo-Cache-Key", cacheKey);
  res.setHeader("X-Kairo-Cache", cacheStatus);
  res.setHeader("X-Kairo-Warning-Count", String(report.import?.summary?.warningCount ?? 0));
  res.setHeader("X-Kairo-Supported-Entities", String(report.import?.summary?.supportedEntityCount ?? 0));
  res.setHeader("X-Kairo-Unsupported-Entities", String(report.import?.summary?.unsupportedEntityCount ?? 0));
  res.setHeader("X-Kairo-Conversion-Percent", String(report.import?.coverage?.conversionPercent ?? 100));
  res.end(archive);
}

function runProcess(command: string, args: string[], options: { cwd: string; timeoutMs?: number; env?: NodeJS.ProcessEnv }) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ? childProcessEnv(options.env) : undefined,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timeout = options.timeoutMs
      ? setTimeout(() => {
          child.kill();
          reject(new Error(`${command} timed out after ${options.timeoutMs}ms.`));
        }, options.timeoutMs)
      : undefined;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (timeout) clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      if (timeout) clearTimeout(timeout);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${command} exited with code ${code}.\n${stdout}\n${stderr}`.trim()));
    });
  });
}

async function ensureCliDist() {
  if (await pathExists(cliDistPath)) return;
  const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  await runProcess(pnpmCommand, ["--filter", "@kairo/cli", "build"], {
    cwd: repoRoot,
    timeoutMs: 120_000
  });
}

async function importDxfPackageWithCli(inputPath: string, outputPath: string, reportPath: string) {
  await ensureCliDist();
  await runProcess(
    process.execPath,
    [
      `--max-old-space-size=${Number.isFinite(nodeMaxOldSpaceMb) ? nodeMaxOldSpaceMb : 12288}`,
      cliDistPath,
      "import-dxf-package",
      inputPath,
      outputPath,
      "--report",
      reportPath,
      "--quiet-warnings"
    ],
    {
      cwd: repoRoot,
      timeoutMs: 30 * 60_000
    }
  );
}

function settingFromUrl(searchParams: URLSearchParams) {
  const geometryMode = searchParams.get("geometryMode") === "lines" ? "lines" : "ribbons";
  const textMode = searchParams.get("textMode") === "skip" ? "skip" : "metadata";
  const ribbonWidthMm = Math.max(0.01, Number(searchParams.get("ribbonWidthMm") ?? 3) || 3);
  const layerTree = searchParams.get("layerTree") !== "false";
  const includeOutliers = searchParams.get("includeOutliers") === "true";
  const presetName = searchParams.get("preset") ?? "process-simulate";
  return {
    geometryMode,
    textMode,
    ribbonWidthMm,
    layerTree,
    presetName,
    includeOutliers
  };
}

function glbSettingsHash(settings: ReturnType<typeof settingFromUrl>) {
  return createHash("sha256").update(JSON.stringify({ version: glbExportCacheVersion, settings })).digest("hex").slice(0, 16);
}

async function locateCachedPackageByKey(cacheKey: string) {
  if (!/^[A-Za-z0-9._-]+$/.test(cacheKey)) {
    throw new Error("Invalid cache key.");
  }
  const entries = await readdir(packageCacheDirectory, { withFileTypes: true });
  const match = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(`-${cacheKey}.kairo`))
    .map((entry) => path.join(packageCacheDirectory, entry.name))
    .sort((a, b) => a.localeCompare(b))[0];
  if (!match) {
    throw new Error("Cached Kairo package was not found. Re-open the DXF once, then export GLB again.");
  }
  return match;
}

async function exportGlbWithWorker(packagePath: string, outputPath: string, statsPath: string, settings: ReturnType<typeof settingFromUrl>) {
  const exportSettings = {
    geometryMode: settings.geometryMode,
    textMode: settings.textMode,
    ribbonWidthMm: settings.ribbonWidthMm,
    layerTree: settings.layerTree,
    presetName: settings.presetName,
    includeOutliers: settings.includeOutliers
  };
  await runProcess(
    process.execPath,
    [
      tsxCliPath,
      glbExportScriptPath,
      "--input",
      packagePath,
      "--output",
      outputPath,
      "--stats",
      statsPath,
      "--settings-json",
      JSON.stringify(exportSettings)
    ],
    {
      cwd: repoRoot,
      timeoutMs: 30 * 60_000,
      env: {
        NODE_OPTIONS: `--max-old-space-size=${Number.isFinite(nodeMaxOldSpaceMb) ? nodeMaxOldSpaceMb : 12288}`
      }
    }
  );
}

async function sendGlbResponse(res: ServerResponse, glbPath: string, statsPath: string, cacheStatus: "hit" | "miss") {
  const statsText = await readFile(statsPath, "utf8");
  const stats = JSON.parse(statsText) as { filename?: string };
  const filename = safeFileName(encodeURIComponent(stats.filename ?? path.basename(glbPath)), "kairo-layout.cadex-handoff.glb");
  res.statusCode = 200;
  res.setHeader("Content-Type", "model/gltf-binary");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("X-Kairo-Glb-Cache", cacheStatus);
  await pipeline(createReadStream(glbPath), res);
}

async function sendPreparedGlbResponse(res: ServerResponse, glbPath: string, statsPath: string, cacheStatus: "hit" | "miss") {
  const [glbStats, statsText] = await Promise.all([stat(glbPath), readFile(statsPath, "utf8")]);
  const stats = JSON.parse(statsText) as { filename?: string; lineSegments?: number; primitiveModes?: string[]; outputUnits?: string };
  writeJson(res, 200, {
    ok: true,
    cacheStatus,
    filename: safeFileName(encodeURIComponent(stats.filename ?? path.basename(glbPath)), "kairo-layout.cadex-handoff.glb"),
    bytes: glbStats.size,
    lineSegments: stats.lineSegments,
    primitiveModes: stats.primitiveModes,
    outputUnits: stats.outputUnits
  });
}

async function handleGlbExport(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "GET") {
    writeJson(res, 405, { error: "METHOD_NOT_ALLOWED", message: "Use GET." });
    return;
  }

  try {
    const requestUrl = new URL(req.url ?? "", "http://localhost");
    const cacheKey = requestUrl.searchParams.get("cacheKey") ?? "";
    const settings = settingFromUrl(requestUrl.searchParams);
    const settingsHash = glbSettingsHash(settings);
    const packagePath = await locateCachedPackageByKey(cacheKey);
    const baseName = path.basename(packagePath, ".kairo");
    const outputPath = path.join(packageCacheDirectory, `${baseName}-${settingsHash}.cadex.glb`);
    const statsPath = path.join(packageCacheDirectory, `${baseName}-${settingsHash}.cadex.stats.json`);
    const prepareOnly = requestUrl.searchParams.get("prepare") === "true";

    if ((await pathExists(outputPath)) && (await pathExists(statsPath))) {
      if (prepareOnly) {
        await sendPreparedGlbResponse(res, outputPath, statsPath, "hit");
        return;
      }
      await sendGlbResponse(res, outputPath, statsPath, "hit");
      return;
    }

    await exportGlbWithWorker(packagePath, outputPath, statsPath, settings);
    if (prepareOnly) {
      await sendPreparedGlbResponse(res, outputPath, statsPath, "miss");
      return;
    }
    await sendGlbResponse(res, outputPath, statsPath, "miss");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeJson(res, 500, { error: "GLB_EXPORT_FAILED", message });
  }
}

async function handleLargeDxfPackageImport(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") {
    writeJson(res, 405, { error: "METHOD_NOT_ALLOWED", message: "Use POST." });
    return;
  }

  const fileName = safeFileName(req.headers["x-kairo-file-name"]?.toString(), "uploaded.dxf");
  if (!/\.dxf$/i.test(fileName)) {
    writeJson(res, 400, { error: "INVALID_FILE_NAME", message: "Only .dxf files can be imported." });
    return;
  }

  const cache = cacheKeyForRequest(fileName, req);
  if ((await pathExists(cache.packagePath)) && (await pathExists(cache.reportPath))) {
    await sendPackageResponse(res, fileName, cache.key, cache.packagePath, cache.reportPath, "hit");
    return;
  }

  const workDir = path.join(tmpdir(), `kairo-large-dxf-${process.pid}-${Date.now()}`);
  const inputPath = path.join(workDir, fileName);
  try {
    await mkdir(workDir, { recursive: true });
    await mkdir(packageCacheDirectory, { recursive: true });
    await pipeline(req, createWriteStream(inputPath));
    const outputPath = path.join(workDir, `${path.basename(fileName, path.extname(fileName))}.kairo`);
    const reportPath = path.join(workDir, `${path.basename(fileName, path.extname(fileName))}.report.json`);
    await importDxfPackageWithCli(inputPath, outputPath, reportPath);
    await Promise.all([copyFile(outputPath, cache.packagePath), copyFile(reportPath, cache.reportPath)]);
    await sendPackageResponse(res, fileName, cache.key, cache.packagePath, cache.reportPath, "miss");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeJson(res, 500, { error: "DXF_PACKAGE_IMPORT_FAILED", message });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

function kairoLocalImportPlugin() {
  return {
    name: "kairo-local-import",
    configureServer(server: import("vite").ViteDevServer) {
      server.middlewares.use("/api/kairo/import-dxf-package", (req, res) => {
        void handleLargeDxfPackageImport(req, res);
      });
      server.middlewares.use("/api/kairo/export-glb", (req, res) => {
        void handleGlbExport(req, res);
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), kairoLocalImportPlugin()],
  server: {
    port: 5173,
    strictPort: false
  }
});
