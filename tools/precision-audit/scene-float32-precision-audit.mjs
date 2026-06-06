import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const defaultSceneDir = path.join(rootDir, "apps", "viewer", "public", "scenes", "scott-dxf2013-import");
const sceneDir = process.argv[2] ? path.resolve(process.argv[2]) : defaultSceneDir;
const geometryDir = path.join(sceneDir, "geometry");

function createBounds() {
  return {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity]
  };
}

function includePoint(bounds, point) {
  for (let axis = 0; axis < 3; axis += 1) {
    const value = Number(point[axis] ?? 0);
    if (!Number.isFinite(value)) continue;
    bounds.min[axis] = Math.min(bounds.min[axis], value);
    bounds.max[axis] = Math.max(bounds.max[axis], value);
  }
}

function includeRadius(bounds, center, radius) {
  includePoint(bounds, [center[0] - radius, center[1] - radius, center[2] ?? 0]);
  includePoint(bounds, [center[0] + radius, center[1] + radius, center[2] ?? 0]);
}

function distance(a, b) {
  return Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0), (a[2] ?? 0) - (b[2] ?? 0));
}

function nextFloat32(value) {
  if (!Number.isFinite(value)) return value;
  if (value < 0) return -previousFloat32(-value);
  if (Object.is(value, -0)) return Number.MIN_VALUE;
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setFloat32(0, value, true);
  const bits = view.getUint32(0, true);
  view.setUint32(0, bits + 1, true);
  return view.getFloat32(0, true);
}

function previousFloat32(value) {
  if (!Number.isFinite(value)) return value;
  if (value <= 0) return -nextFloat32(-value);
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setFloat32(0, value, true);
  const bits = view.getUint32(0, true);
  view.setUint32(0, bits - 1, true);
  return view.getFloat32(0, true);
}

function float32SpacingAt(value) {
  const magnitude = Math.abs(value);
  if (magnitude === 0) return nextFloat32(0);
  const rounded = Math.fround(magnitude);
  return nextFloat32(rounded) - rounded;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return String(value);
  if (Math.abs(value) >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 6 });
  return value.toLocaleString("en-US", { maximumFractionDigits: 9 });
}

function updateSmallest(current, candidate, entity, label) {
  if (!Number.isFinite(candidate) || candidate <= 0.001) return current;
  if (!current || candidate < current.value) {
    return { value: candidate, entityId: entity.id, type: entity.type, layerId: entity.layerId, label };
  }
  return current;
}

const geometryFiles = (await readdir(geometryDir)).filter((name) => name.endsWith(".json")).sort((a, b) => a.localeCompare(b));
const bounds = createBounds();
const counts = {
  geometryDocuments: 0,
  geometries: 0,
  line: 0,
  polyline: 0,
  circle: 0,
  arc: 0,
  text: 0,
  mesh: 0
};
let coordinateCount = 0;
let maxAbsCoordinate = 0;
let smallestLineLikeFeature;
let smallestRadius;
let smallestTextHeight;
const absCoordinateMagnitudes = [];

function recordPoint(point) {
  includePoint(bounds, point);
  for (const value of point) {
    if (Number.isFinite(value)) {
      const magnitude = Math.abs(value);
      maxAbsCoordinate = Math.max(maxAbsCoordinate, magnitude);
      absCoordinateMagnitudes.push(magnitude);
      coordinateCount += 1;
    }
  }
}

function percentile(values, percentileValue) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1));
  return sorted[index];
}

for (const fileName of geometryFiles) {
  const documentPath = path.join(geometryDir, fileName);
  const document = JSON.parse(await readFile(documentPath, "utf8"));
  counts.geometryDocuments += 1;
  for (const geometry of document.geometries ?? []) {
    counts.geometries += 1;
    if (geometry.kind === "mesh") {
      counts.mesh += 1;
      for (let index = 0; index < geometry.vertices.length; index += 3) {
        recordPoint([geometry.vertices[index], geometry.vertices[index + 1], geometry.vertices[index + 2]]);
      }
      continue;
    }

    if (geometry.kind !== "curve-set") continue;
    for (const entity of geometry.entities ?? []) {
      counts[entity.type] = (counts[entity.type] ?? 0) + 1;
      switch (entity.type) {
        case "line":
          recordPoint(entity.start);
          recordPoint(entity.end);
          smallestLineLikeFeature = updateSmallest(smallestLineLikeFeature, distance(entity.start, entity.end), entity, "line length");
          break;
        case "polyline":
          for (const point of entity.points) recordPoint(point);
          for (let index = 1; index < entity.points.length; index += 1) {
            smallestLineLikeFeature = updateSmallest(
              smallestLineLikeFeature,
              distance(entity.points[index - 1], entity.points[index]),
              entity,
              "polyline segment length"
            );
          }
          if (entity.closed && entity.points.length > 2) {
            smallestLineLikeFeature = updateSmallest(
              smallestLineLikeFeature,
              distance(entity.points[entity.points.length - 1], entity.points[0]),
              entity,
              "closed polyline segment length"
            );
          }
          break;
        case "circle":
          recordPoint(entity.center);
          includeRadius(bounds, entity.center, entity.radius);
          smallestRadius = updateSmallest(smallestRadius, entity.radius, entity, "circle radius");
          break;
        case "arc":
          recordPoint(entity.center);
          includeRadius(bounds, entity.center, entity.radius);
          smallestRadius = updateSmallest(smallestRadius, entity.radius, entity, "arc radius");
          break;
        case "text":
          recordPoint(entity.position);
          if (entity.alignmentPoint) recordPoint(entity.alignmentPoint);
          smallestTextHeight = updateSmallest(smallestTextHeight, entity.height, entity, "text height");
          break;
      }
    }
  }
}

const extent = bounds.max.map((value, index) => value - bounds.min[index]);
const sceneCenter = bounds.max.map((value, index) => (value + bounds.min[index]) / 2);
const maxSpacing = float32SpacingAt(maxAbsCoordinate);
const spacingAtCenter = Math.max(...sceneCenter.map(float32SpacingAt));
const p95AbsCoordinate = percentile(absCoordinateMagnitudes, 95);
const p99AbsCoordinate = percentile(absCoordinateMagnitudes, 99);
const p999AbsCoordinate = percentile(absCoordinateMagnitudes, 99.9);
const tenXSpacing = maxSpacing * 10;
const hundredXSpacing = maxSpacing * 100;

console.log("Kairo Scene Float32 Precision Audit");
console.log("===================================");
console.log(`Scene: ${path.relative(rootDir, sceneDir)}`);
console.log("");
console.log("Counts");
console.log(`- geometry documents: ${counts.geometryDocuments}`);
console.log(`- geometries: ${counts.geometries}`);
console.log(`- line entities: ${counts.line}`);
console.log(`- polyline entities: ${counts.polyline}`);
console.log(`- circle entities: ${counts.circle}`);
console.log(`- arc entities: ${counts.arc}`);
console.log(`- text entities: ${counts.text}`);
console.log(`- sampled coordinate scalars: ${coordinateCount}`);
console.log("");
console.log("Bounds");
console.log(`- min: [${bounds.min.map(formatNumber).join(", ")}]`);
console.log(`- max: [${bounds.max.map(formatNumber).join(", ")}]`);
console.log(`- extent: [${extent.map(formatNumber).join(", ")}]`);
console.log(`- center: [${sceneCenter.map(formatNumber).join(", ")}]`);
console.log(`- max absolute coordinate: ${formatNumber(maxAbsCoordinate)} mm`);
console.log(`- p95 absolute coordinate: ${formatNumber(p95AbsCoordinate)} mm`);
console.log(`- p99 absolute coordinate: ${formatNumber(p99AbsCoordinate)} mm`);
console.log(`- p99.9 absolute coordinate: ${formatNumber(p999AbsCoordinate)} mm`);
console.log("");
console.log("Smallest Features");
console.log(`- line-like feature: ${smallestLineLikeFeature ? `${formatNumber(smallestLineLikeFeature.value)} mm (${smallestLineLikeFeature.type} ${smallestLineLikeFeature.entityId})` : "none"}`);
console.log(`- radius: ${smallestRadius ? `${formatNumber(smallestRadius.value)} mm (${smallestRadius.type} ${smallestRadius.entityId})` : "none"}`);
console.log(`- text height: ${smallestTextHeight ? `${formatNumber(smallestTextHeight.value)} mm (${smallestTextHeight.entityId})` : "none"}`);
console.log("");
console.log("Float32 Spacing");
console.log(`- spacing at max absolute coordinate: ${formatNumber(maxSpacing)} mm`);
console.log(`- spacing at scene center magnitude: ${formatNumber(spacingAtCenter)} mm`);
console.log(`- spacing at p99 absolute coordinate: ${formatNumber(float32SpacingAt(p99AbsCoordinate))} mm`);
console.log(`- spacing at p99.9 absolute coordinate: ${formatNumber(float32SpacingAt(p999AbsCoordinate))} mm`);
console.log(`- 10x max spacing: ${formatNumber(tenXSpacing)} mm`);
console.log(`- 100x max spacing: ${formatNumber(hundredXSpacing)} mm`);
console.log("");
console.log("Conclusion");
if (maxSpacing <= 0.01) {
  console.log("- Current Scott scene coordinates are acceptable for Float32 viewer buffers for visual review.");
  console.log("- Rebasing is not required before current drawing-first QA, layer isolate QA, or semantic review work.");
  console.log("- Revisit rebasing if coordinates approach 1,000,000 mm, if sub-0.1 mm measurement becomes a viewer requirement, or if visible jitter appears at high zoom.");
} else {
  console.log("- Current coordinate magnitudes are close to or above the conservative 0.01 mm Float32 spacing threshold.");
  console.log("- Plan a viewer-space rebasing pass before relying on high-zoom visual precision.");
}
