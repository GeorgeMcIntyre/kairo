const defaultUrl = "https://codex-kairo-dxf-block-instan.kairo-viewer-6lh.pages.dev";

function usage() {
  return [
    "Usage: node scripts/smoke-pages-demo.mjs [url]",
    "",
    `Default URL: ${defaultUrl}`
  ].join("\n");
}

const input = process.argv[2] ?? defaultUrl;
if (input === "--help" || input === "-h") {
  console.log(usage());
  process.exit(0);
}

const baseUrl = new URL(input);
baseUrl.hash = "";
baseUrl.search = "";

const checks = [];

async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);
  try {
    const response = await fetch(url, { redirect: "follow", signal: controller.signal });
    const text = await response.text();
    return { response, text };
  } finally {
    clearTimeout(timeout);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function contentType(response) {
  return response.headers.get("content-type") ?? "";
}

function absoluteAssetUrl(assetPath) {
  return new URL(assetPath, baseUrl).toString();
}

function extractAssets(html, pattern) {
  const matches = [...html.matchAll(pattern)].map((match) => match[1]);
  return [...new Set(matches)];
}

async function record(name, fn) {
  const startedAt = Date.now();
  await fn();
  checks.push({ name, ms: Date.now() - startedAt });
}

let rootHtml = "";

await record("root app shell returns HTML", async () => {
  const { response, text } = await fetchText(baseUrl.toString());
  assert(response.ok, `Root returned ${response.status}`);
  assert(contentType(response).includes("text/html"), `Root content-type was ${contentType(response)}`);
  assert(text.includes("<!doctype html>") || text.includes("<!DOCTYPE html>"), "Root did not look like HTML");
  assert(text.includes('id="root"'), "Root HTML did not include #root");
  rootHtml = text;
});

const scriptAssets = extractAssets(rootHtml, /<script[^>]+src="([^"]+)"/g).filter((asset) => asset.includes("/assets/"));
const cssAssets = extractAssets(rootHtml, /<link[^>]+href="([^"]+\.css[^"]*)"/g).filter((asset) => asset.includes("/assets/"));

await record("root references built JS and CSS assets", async () => {
  assert(scriptAssets.length > 0, "Root HTML did not reference any built JS assets");
  assert(cssAssets.length > 0, "Root HTML did not reference any built CSS assets");
});

for (const asset of [...scriptAssets, ...cssAssets]) {
  await record(`asset returns 200: ${asset}`, async () => {
    const { response, text } = await fetchText(absoluteAssetUrl(asset));
    assert(response.ok, `${asset} returned ${response.status}`);
    assert(text.length > 0, `${asset} response was empty`);
  });
}

await record("SPA fallback route returns app shell", async () => {
  const fallbackUrl = new URL("/nonexistent-route", baseUrl);
  const { response, text } = await fetchText(fallbackUrl.toString());
  assert(response.ok, `Fallback route returned ${response.status}`);
  assert(contentType(response).includes("text/html"), `Fallback content-type was ${contentType(response)}`);
  assert(text.includes('id="root"'), "Fallback route did not return app shell HTML");
});

await record("Scott staged manifest is not deployed as JSON", async () => {
  const manifestUrl = new URL("/scenes/scott-dxf2013-import/manifest.json", baseUrl);
  const { response, text } = await fetchText(manifestUrl.toString());
  assert(response.ok, `Scott manifest path returned ${response.status}`);
  assert(contentType(response).includes("text/html"), `Scott manifest path content-type was ${contentType(response)}`);
  assert(text.includes('id="root"'), "Scott manifest path did not fall back to app shell");
  assert(!text.includes('"format": "kairo-neutral-scene"'), "Scott staged manifest appears to be publicly deployed");
});

console.log(`Pages smoke passed for ${baseUrl.toString()}`);
for (const check of checks) {
  console.log(`- ${check.name}: ${check.ms} ms`);
}
