import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;
const FLOAT = 5126;
const UNSIGNED_INT = 5125;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;
const TRIANGLES = 4;

function usage() {
  console.error("Usage:");
  console.error("  node tools/cadex-glb-diagnostics.mjs add-indices <input.glb> <output.glb>");
  console.error("  node tools/cadex-glb-diagnostics.mjs basic <output-dir>");
  process.exitCode = 1;
}

function readUint32(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function writeUint32(bytes, offset, value) {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value, true);
}

function padBytes(bytes, padByte) {
  const paddedLength = Math.ceil(bytes.byteLength / 4) * 4;
  if (paddedLength === bytes.byteLength) return bytes;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded.fill(padByte, bytes.byteLength);
  return padded;
}

function concatBytes(parts) {
  const length = parts.reduce((total, part) => total + part.byteLength, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function parseGlb(bytes) {
  if (readUint32(bytes, 0) !== GLB_MAGIC || readUint32(bytes, 4) !== GLB_VERSION) {
    throw new Error("Not a binary glTF 2.0 file.");
  }
  const jsonLength = readUint32(bytes, 12);
  const jsonType = readUint32(bytes, 16);
  if (jsonType !== JSON_CHUNK_TYPE) throw new Error("GLB JSON chunk is missing.");
  const jsonStart = 20;
  const jsonEnd = jsonStart + jsonLength;
  const json = JSON.parse(new TextDecoder().decode(bytes.slice(jsonStart, jsonEnd)).trim());
  const binHeader = jsonEnd;
  const binLength = readUint32(bytes, binHeader);
  const binType = readUint32(bytes, binHeader + 4);
  if (binType !== BIN_CHUNK_TYPE) throw new Error("GLB BIN chunk is missing.");
  return {
    json,
    bin: bytes.slice(binHeader + 8, binHeader + 8 + binLength)
  };
}

function writeGlb(json, bin) {
  json.buffers = [{ byteLength: bin.byteLength }];
  const jsonChunk = padBytes(new TextEncoder().encode(JSON.stringify(json)), 0x20);
  const binChunk = padBytes(bin, 0);
  const totalLength = 12 + 8 + jsonChunk.byteLength + 8 + binChunk.byteLength;
  const bytes = new Uint8Array(totalLength);
  writeUint32(bytes, 0, GLB_MAGIC);
  writeUint32(bytes, 4, GLB_VERSION);
  writeUint32(bytes, 8, totalLength);
  writeUint32(bytes, 12, jsonChunk.byteLength);
  writeUint32(bytes, 16, JSON_CHUNK_TYPE);
  bytes.set(jsonChunk, 20);
  const binHeader = 20 + jsonChunk.byteLength;
  writeUint32(bytes, binHeader, binChunk.byteLength);
  writeUint32(bytes, binHeader + 4, BIN_CHUNK_TYPE);
  bytes.set(binChunk, binHeader + 8);
  return bytes;
}

function uint32Bytes(values) {
  return new Uint8Array(new Uint32Array(values).buffer);
}

function floatBytes(values) {
  return new Uint8Array(new Float32Array(values).buffer);
}

function addSequentialIndices(json, bin) {
  const binaryParts = [bin];
  let binaryOffset = bin.byteLength;
  let indexedPrimitiveCount = 0;
  let indexedVertexCount = 0;

  json.bufferViews ??= [];
  json.accessors ??= [];

  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      if (primitive.mode !== TRIANGLES || primitive.indices !== undefined) continue;
      const positionAccessor = json.accessors[primitive.attributes?.POSITION];
      if (!positionAccessor?.count) continue;
      const indices = Array.from({ length: positionAccessor.count }, (_, index) => index);
      const indexBytes = padBytes(uint32Bytes(indices), 0);
      const bufferViewIndex = json.bufferViews.length;
      const accessorIndex = json.accessors.length;
      binaryParts.push(indexBytes);
      json.bufferViews.push({
        buffer: 0,
        byteOffset: binaryOffset,
        byteLength: indexBytes.byteLength,
        target: ELEMENT_ARRAY_BUFFER
      });
      binaryOffset += indexBytes.byteLength;
      json.accessors.push({
        bufferView: bufferViewIndex,
        byteOffset: 0,
        componentType: UNSIGNED_INT,
        count: indices.length,
        type: "SCALAR",
        min: [0],
        max: [Math.max(0, indices.length - 1)]
      });
      primitive.indices = accessorIndex;
      indexedPrimitiveCount += 1;
      indexedVertexCount += indices.length;
    }
  }

  json.asset ??= { version: "2.0" };
  json.asset.extras = {
    ...(json.asset.extras ?? {}),
    cadexDiagnostic: "sequential triangle indices added",
    indexedPrimitiveCount,
    indexedVertexCount
  };
  return { json, bin: concatBytes(binaryParts), indexedPrimitiveCount, indexedVertexCount };
}

function boundsOf(values) {
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let i = 0; i < values.length; i += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], values[i + axis]);
      max[axis] = Math.max(max[axis], values[i + axis]);
    }
  }
  return { min, max };
}

async function writeBasicGlb(outputPath, name, positions, indices) {
  const normals = [];
  for (let i = 0; i < positions.length / 3; i += 1) normals.push(0, 0, 1);
  const parts = [
    padBytes(floatBytes(positions), 0),
    padBytes(floatBytes(normals), 0),
    padBytes(uint32Bytes(indices), 0)
  ];
  const positionOffset = 0;
  const normalOffset = parts[0].byteLength;
  const indexOffset = parts[0].byteLength + parts[1].byteLength;
  const { min, max } = boundsOf(positions);
  const json = {
    asset: { version: "2.0", generator: "Kairo CADEx diagnostic GLB" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name }],
    meshes: [
      {
        name,
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1 },
            indices: 2,
            material: 0,
            mode: TRIANGLES
          }
        ]
      }
    ],
    materials: [
      {
        name: "diagnostic material",
        pbrMetallicRoughness: {
          baseColorFactor: [0.1, 0.55, 0.95, 1],
          metallicFactor: 0,
          roughnessFactor: 1
        },
        doubleSided: true
      }
    ],
    accessors: [
      { bufferView: 0, componentType: FLOAT, count: positions.length / 3, type: "VEC3", min, max },
      { bufferView: 1, componentType: FLOAT, count: normals.length / 3, type: "VEC3" },
      { bufferView: 2, componentType: UNSIGNED_INT, count: indices.length, type: "SCALAR", min: [0], max: [positions.length / 3 - 1] }
    ],
    bufferViews: [
      { buffer: 0, byteOffset: positionOffset, byteLength: parts[0].byteLength, target: ARRAY_BUFFER },
      { buffer: 0, byteOffset: normalOffset, byteLength: parts[1].byteLength, target: ARRAY_BUFFER },
      { buffer: 0, byteOffset: indexOffset, byteLength: parts[2].byteLength, target: ELEMENT_ARRAY_BUFFER }
    ],
    buffers: [{ byteLength: 0 }]
  };
  const bytes = writeGlb(json, concatBytes(parts));
  await writeFile(outputPath, bytes);
  return bytes.byteLength;
}

async function addIndicesCommand(input, output) {
  const parsed = parseGlb(await readFile(input));
  const result = addSequentialIndices(parsed.json, parsed.bin);
  const bytes = writeGlb(result.json, result.bin);
  await writeFile(output, bytes);
  console.log(
    JSON.stringify(
      {
        output,
        bytes: bytes.byteLength,
        indexedPrimitiveCount: result.indexedPrimitiveCount,
        indexedVertexCount: result.indexedVertexCount
      },
      null,
      2
    )
  );
}

async function basicCommand(outputDir) {
  const quad = await writeBasicGlb(
    path.join(outputDir, "kairo-cadex-diagnostic-indexed-quad.glb"),
    "indexed quad",
    [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0],
    [0, 1, 2, 0, 2, 3]
  );
  const ribbon = await writeBasicGlb(
    path.join(outputDir, "kairo-cadex-diagnostic-indexed-ribbon.glb"),
    "indexed ribbon",
    [-5, -0.05, 0, 5, -0.05, 0, 5, 0.05, 0, -5, 0.05, 0],
    [0, 1, 2, 0, 2, 3]
  );
  console.log(
    JSON.stringify(
      {
        files: [
          { path: path.join(outputDir, "kairo-cadex-diagnostic-indexed-quad.glb"), bytes: quad },
          { path: path.join(outputDir, "kairo-cadex-diagnostic-indexed-ribbon.glb"), bytes: ribbon }
        ]
      },
      null,
      2
    )
  );
}

const [command, first, second] = process.argv.slice(2);
if (command === "add-indices" && first && second) {
  await addIndicesCommand(first, second);
} else if (command === "basic" && first) {
  await basicCommand(first);
} else {
  usage();
}
