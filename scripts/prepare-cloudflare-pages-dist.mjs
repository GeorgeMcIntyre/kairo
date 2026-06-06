import { readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "apps", "viewer", "dist");
const scenesDir = path.join(distDir, "scenes");
const maxPagesAssetBytes = 25 * 1024 * 1024;

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

if (!(await exists(distDir))) {
  throw new Error(`Missing viewer dist directory: ${distDir}`);
}

await rm(scenesDir, { recursive: true, force: true });

const redirectsPath = path.join(distDir, "_redirects");
const redirects = (await readFile(redirectsPath, "utf8")).trim();
if (redirects !== "/* /index.html 200") {
  throw new Error(`Unexpected _redirects content in ${redirectsPath}: ${JSON.stringify(redirects)}`);
}

const files = await listFiles(distDir);
const oversized = [];
for (const file of files) {
  const fileStat = await stat(file);
  if (fileStat.size > maxPagesAssetBytes) {
    oversized.push({ file, size: fileStat.size });
  }
}

if (oversized.length > 0) {
  const details = oversized
    .map((entry) => `${path.relative(rootDir, entry.file)} (${entry.size} bytes)`)
    .join("\n");
  throw new Error(`Cloudflare Pages dist contains oversized assets:\n${details}`);
}

console.log(`Prepared Cloudflare Pages dist at ${path.relative(rootDir, distDir)} (${files.length} files, scenes pruned).`);
