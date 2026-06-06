import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;
const COMPONENT_FLOAT = 5126;

const MODE_NAMES = {
  1: "LINES",
  3: "LINE_STRIP",
  4: "TRIANGLES",
  5: "TRIANGLE_STRIP"
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const inputPath = resolve(scriptDir, "probe-output.glb");

function formatVec(vec) {
  return `[${vec.map((value) => Number(value.toFixed(6))).join(", ")}]`;
}

function readGlb(buffer) {
  if (buffer.length < 20) {
    throw new Error("File is too small to be a GLB.");
  }

  const magic = buffer.readUInt32LE(0);
  const version = buffer.readUInt32LE(4);
  const declaredLength = buffer.readUInt32LE(8);
  const jsonLength = buffer.readUInt32LE(12);
  const jsonType = buffer.readUInt32LE(16);
  const jsonStart = 20;
  const jsonEnd = jsonStart + jsonLength;
  const binHeaderStart = jsonEnd;
  const binLength = buffer.readUInt32LE(binHeaderStart);
  const binType = buffer.readUInt32LE(binHeaderStart + 4);
  const binStart = binHeaderStart + 8;
  const binEnd = binStart + binLength;

  if (jsonEnd > buffer.length || binEnd > buffer.length) {
    throw new Error("GLB chunk lengths exceed file size.");
  }

  const jsonText = buffer.subarray(jsonStart, jsonEnd).toString("utf8").trimEnd();
  const gltf = JSON.parse(jsonText);
  const bin = buffer.subarray(binStart, binEnd);

  return {
    header: {
      magic,
      version,
      declaredLength,
      actualLength: buffer.length
    },
    jsonChunk: {
      length: jsonLength,
      type: jsonType,
      validType: jsonType === JSON_CHUNK_TYPE
    },
    binChunk: {
      length: binLength,
      type: binType,
      validType: binType === BIN_CHUNK_TYPE
    },
    gltf,
    bin
  };
}

function accessorPositions(gltf, bin, accessorIndex) {
  const accessor = gltf.accessors?.[accessorIndex];
  if (!accessor) throw new Error(`Missing accessor ${accessorIndex}.`);
  if (accessor.componentType !== COMPONENT_FLOAT || accessor.type !== "VEC3") {
    throw new Error(`Accessor ${accessorIndex} is not FLOAT VEC3 POSITION data.`);
  }
  const view = gltf.bufferViews?.[accessor.bufferView];
  if (!view) throw new Error(`Missing bufferView ${accessor.bufferView} for accessor ${accessorIndex}.`);

  const stride = view.byteStride ?? 12;
  const viewOffset = view.byteOffset ?? 0;
  const accessorOffset = accessor.byteOffset ?? 0;
  const start = viewOffset + accessorOffset;
  const positions = [];
  for (let i = 0; i < accessor.count; i += 1) {
    const offset = start + i * stride;
    positions.push([bin.readFloatLE(offset), bin.readFloatLE(offset + 4), bin.readFloatLE(offset + 8)]);
  }
  return positions;
}

function boundsForPositions(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const point of positions) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], point[axis]);
      max[axis] = Math.max(max[axis], point[axis]);
    }
  }
  return { min, max };
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

const fileBuffer = await readFile(inputPath);
const { header, jsonChunk, binChunk, gltf, bin } = readGlb(fileBuffer);

const nodeNames = gltf.nodes?.map((node) => node.name ?? "(unnamed)") ?? [];
const meshNames = gltf.meshes?.map((mesh) => mesh.name ?? "(unnamed)") ?? [];
const materialNames = gltf.materials?.map((material) => material.name ?? "(unnamed)") ?? [];
const primitiveRows = [];
const accessorRows = [];
const globalPositions = [];
let farOriginDetected = false;
let subMillimeterLineDetected = false;

for (const [meshIndex, mesh] of (gltf.meshes ?? []).entries()) {
  for (const [primitiveIndex, primitive] of (mesh.primitives ?? []).entries()) {
    const mode = primitive.mode ?? 4;
    const accessorIndex = primitive.attributes?.POSITION;
    const positions = accessorPositions(gltf, bin, accessorIndex);
    globalPositions.push(...positions);
    const bounds = boundsForPositions(positions);
    const material = gltf.materials?.[primitive.material];
    const hasFarPoint = positions.some((point) => Math.abs(point[0] - 110000) <= 1 && Math.abs(point[1] - 90000) <= 1);
    const hasSubMmSegment =
      mode === 1 &&
      positions.some((point, index) => index % 2 === 0 && positions[index + 1] && Math.abs(distance(point, positions[index + 1]) - 0.1) < 0.0001);

    farOriginDetected ||= hasFarPoint;
    subMillimeterLineDetected ||= hasSubMmSegment;

    primitiveRows.push({
      mesh: mesh.name ?? `mesh_${meshIndex}`,
      primitiveIndex,
      mode,
      modeName: MODE_NAMES[mode] ?? `MODE_${mode}`,
      material: material?.name ?? "(none)",
      accessorIndex,
      count: positions.length,
      bounds,
      extras: Boolean(primitive.extras)
    });
  }
}

for (const [index, accessor] of (gltf.accessors ?? []).entries()) {
  accessorRows.push({
    index,
    count: accessor.count,
    type: accessor.type,
    componentType: accessor.componentType,
    min: accessor.min,
    max: accessor.max
  });
}

const globalBounds = boundsForPositions(globalPositions);
const nodesWithExtras = (gltf.nodes ?? []).filter((node) => node.extras?.kairoProbe).length;
const meshesWithExtras = (gltf.meshes ?? []).filter((mesh) => mesh.extras?.kairoProbe).length;
const materialsWithExtras = (gltf.materials ?? []).filter((material) => material.extras?.kairoProbe).length;
const primitivesWithExtras = primitiveRows.filter((row) => row.extras).length;

console.log("CAD Exchanger GLB Probe Inspector");
console.log("==================================");
console.log(`Input: ${inputPath}`);
console.log("");

console.log("GLB header");
console.log(`- magic: 0x${header.magic.toString(16)} ${header.magic === GLB_MAGIC ? "(valid)" : "(invalid)"}`);
console.log(`- version: ${header.version}`);
console.log(`- declared length: ${header.declaredLength}`);
console.log(`- actual length: ${header.actualLength}`);
console.log(`- length matches: ${header.declaredLength === header.actualLength}`);
console.log("");

console.log("Chunks");
console.log(`- JSON chunk: ${jsonChunk.length} bytes, type 0x${jsonChunk.type.toString(16)}, valid=${jsonChunk.validType}`);
console.log(`- BIN chunk: ${binChunk.length} bytes, type 0x${binChunk.type.toString(16)}, valid=${binChunk.validType}`);
console.log(`- glTF asset version: ${gltf.asset?.version ?? "(missing)"}`);
console.log(`- extensionsUsed: ${(gltf.extensionsUsed ?? []).join(", ") || "(none)"}`);
console.log("");

console.log("Node names");
for (const name of nodeNames) console.log(`- ${name}`);
console.log("");

console.log("Mesh names");
for (const name of meshNames) console.log(`- ${name}`);
console.log("");

console.log("Material names");
for (const name of materialNames) console.log(`- ${name}`);
console.log("");

console.log("Primitive modes");
for (const row of primitiveRows) {
  console.log(
    `- ${row.mesh} primitive ${row.primitiveIndex}: ${row.mode} (${row.modeName}), material=${row.material}, accessor=${row.accessorIndex}, count=${row.count}`
  );
}
console.log("");

console.log("Accessor counts and bounds");
for (const row of accessorRows) {
  console.log(
    `- accessor ${row.index}: count=${row.count}, type=${row.type}, componentType=${row.componentType}, min=${formatVec(row.min)}, max=${formatVec(row.max)}`
  );
}
console.log("");

console.log("Bounds");
console.log(`- global min: ${formatVec(globalBounds.min)}`);
console.log(`- global max: ${formatVec(globalBounds.max)}`);
for (const row of primitiveRows) {
  console.log(`- ${row.mesh}: min=${formatVec(row.bounds.min)}, max=${formatVec(row.bounds.max)}`);
}
console.log("");

console.log("Extras metadata");
console.log(`- scene extras present: ${Boolean(gltf.scenes?.[gltf.scene ?? 0]?.extras?.kairoProbe)}`);
console.log(`- nodes with kairoProbe extras: ${nodesWithExtras}/${gltf.nodes?.length ?? 0}`);
console.log(`- meshes with kairoProbe extras: ${meshesWithExtras}/${gltf.meshes?.length ?? 0}`);
console.log(`- primitives with extras: ${primitivesWithExtras}/${primitiveRows.length}`);
console.log(`- materials with kairoProbe extras: ${materialsWithExtras}/${gltf.materials?.length ?? 0}`);
console.log("");

console.log("Feature detection");
console.log(`- far-origin coordinate near [110000, 90000, 0]: ${farOriginDetected ? "YES" : "NO"}`);
console.log(`- 0.1 mm LINES segment: ${subMillimeterLineDetected ? "YES" : "NO"}`);
