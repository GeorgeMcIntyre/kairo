import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;
const COMPONENT_FLOAT = 5126;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const inputPath = resolve(scriptDir, "jt-bridge-part-output.glb");
const expectedPartName = "jt_bridge_probe_named_red_block_100x50x25mm";
const expectedMaterialName = "inspection_red_jt_bridge_probe";

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

  const gltf = JSON.parse(buffer.subarray(jsonStart, jsonEnd).toString("utf8").trimEnd());
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

function readVec3Accessor(gltf, bin, accessorIndex) {
  const accessor = gltf.accessors?.[accessorIndex];
  if (!accessor) throw new Error(`Missing accessor ${accessorIndex}.`);
  if (accessor.componentType !== COMPONENT_FLOAT || accessor.type !== "VEC3") {
    throw new Error(`Accessor ${accessorIndex} is not FLOAT VEC3 data.`);
  }
  const view = gltf.bufferViews?.[accessor.bufferView];
  if (!view) throw new Error(`Missing bufferView ${accessor.bufferView}.`);

  const stride = view.byteStride ?? 12;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const values = [];
  for (let index = 0; index < accessor.count; index += 1) {
    const offset = start + index * stride;
    values.push([bin.readFloatLE(offset), bin.readFloatLE(offset + 4), bin.readFloatLE(offset + 8)]);
  }
  return values;
}

function boundsFor(points) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const point of points) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], point[axis]);
      max[axis] = Math.max(max[axis], point[axis]);
    }
  }
  return { min, max };
}

function approxEqual(actual, expected, tolerance = 0.0001) {
  return Math.abs(actual - expected) <= tolerance;
}

const fileBuffer = await readFile(inputPath);
const { header, jsonChunk, binChunk, gltf, bin } = readGlb(fileBuffer);
const node = gltf.nodes?.[0];
const mesh = gltf.meshes?.[node?.mesh ?? 0];
const primitive = mesh?.primitives?.[0];
const material = gltf.materials?.[primitive?.material ?? 0];
const positions = readVec3Accessor(gltf, bin, primitive.attributes.POSITION);
const normals = readVec3Accessor(gltf, bin, primitive.attributes.NORMAL);
const bounds = boundsFor(positions);
const dimensions = [
  bounds.max[0] - bounds.min[0],
  bounds.max[1] - bounds.min[1],
  bounds.max[2] - bounds.min[2]
];
const materialColor = material?.pbrMetallicRoughness?.baseColorFactor ?? [];

const checks = [
  ["magic valid", header.magic === GLB_MAGIC],
  ["version 2", header.version === 2],
  ["declared length matches", header.declaredLength === header.actualLength],
  ["JSON chunk valid", jsonChunk.validType],
  ["BIN chunk valid", binChunk.validType],
  ["asset version 2.0", gltf.asset?.version === "2.0"],
  ["single node", gltf.nodes?.length === 1],
  ["single mesh", gltf.meshes?.length === 1],
  ["single material", gltf.materials?.length === 1],
  ["part name present", node?.name === expectedPartName && mesh?.name === expectedPartName],
  ["material name present", material?.name === expectedMaterialName],
  ["triangles mode", primitive?.mode === 4],
  ["36 vertices", positions.length === 36],
  ["12 triangles", positions.length / 3 === 12],
  ["normals present", normals.length === positions.length],
  ["dimensions 100x50x25", approxEqual(dimensions[0], 100) && approxEqual(dimensions[1], 50) && approxEqual(dimensions[2], 25)],
  ["red material color", materialColor[0] >= 0.9 && materialColor[1] <= 0.1 && materialColor[2] <= 0.1],
  ["node extras present", Boolean(node?.extras?.kairoProbe && node.extras.partNumber)],
  ["mesh extras present", Boolean(mesh?.extras?.kairoProbe && mesh.extras.partNumber)],
  ["primitive extras present", Boolean(primitive?.extras?.kairoProbe)],
  ["material extras present", Boolean(material?.extras?.kairoProbe)]
];

console.log("CAD Exchanger JT Bridge Part Probe Inspector");
console.log("============================================");
console.log(`Input: ${inputPath}`);
console.log("");
console.log("GLB header");
console.log(`- magic: 0x${header.magic.toString(16)} ${header.magic === GLB_MAGIC ? "(valid)" : "(invalid)"}`);
console.log(`- version: ${header.version}`);
console.log(`- declared length: ${header.declaredLength}`);
console.log(`- actual length: ${header.actualLength}`);
console.log(`- length matches: ${header.declaredLength === header.actualLength}`);
console.log("");
console.log("Part");
console.log(`- node: ${node?.name ?? "(missing)"}`);
console.log(`- mesh: ${mesh?.name ?? "(missing)"}`);
console.log(`- material: ${material?.name ?? "(missing)"}`);
console.log(`- bounds min: ${formatVec(bounds.min)}`);
console.log(`- bounds max: ${formatVec(bounds.max)}`);
console.log(`- dimensions: ${formatVec(dimensions)} mm`);
console.log(`- vertices: ${positions.length}`);
console.log(`- triangles: ${positions.length / 3}`);
console.log(`- material color: ${formatVec(materialColor)}`);
console.log("");
console.log("Checks");
for (const [label, passed] of checks) {
  console.log(`- ${label}: ${passed ? "PASS" : "FAIL"}`);
}

if (checks.some(([, passed]) => !passed)) {
  throw new Error("JT bridge part probe inspection failed.");
}
