import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;
const COMPONENT_FLOAT = 5126;
const ARRAY_BUFFER = 34962;
const TRIANGLES = 4;

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(scriptDir, "jt-bridge-part-output.glb");

const bufferChunks = [];
const bufferViews = [];
const accessors = [];

function align4(value) {
  return (value + 3) & ~3;
}

function padBuffer(buffer, padByte = 0) {
  const paddedLength = align4(buffer.length);
  if (paddedLength === buffer.length) return buffer;
  const padded = Buffer.alloc(paddedLength, padByte);
  buffer.copy(padded);
  return padded;
}

function currentBufferOffset() {
  return bufferChunks.reduce((sum, chunk) => sum + chunk.length, 0);
}

function writeVec3Accessor(points, semantic) {
  const byteOffset = currentBufferOffset();
  const buffer = Buffer.alloc(points.length * 3 * 4);
  points.forEach((point, pointIndex) => {
    buffer.writeFloatLE(point[0], pointIndex * 12);
    buffer.writeFloatLE(point[1], pointIndex * 12 + 4);
    buffer.writeFloatLE(point[2], pointIndex * 12 + 8);
  });
  bufferChunks.push(buffer);

  const bufferViewIndex = bufferViews.length;
  bufferViews.push({
    buffer: 0,
    byteOffset,
    byteLength: buffer.length,
    byteStride: 12,
    target: ARRAY_BUFFER
  });

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const point of points) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], point[axis]);
      max[axis] = Math.max(max[axis], point[axis]);
    }
  }

  const accessorIndex = accessors.length;
  accessors.push({
    bufferView: bufferViewIndex,
    componentType: COMPONENT_FLOAT,
    count: points.length,
    type: "VEC3",
    ...(semantic === "POSITION" ? { min, max } : {})
  });

  return accessorIndex;
}

function pushFace(positions, normals, corners, normal) {
  const triangles = [
    [0, 1, 2],
    [0, 2, 3]
  ];
  for (const triangle of triangles) {
    for (const cornerIndex of triangle) {
      positions.push(corners[cornerIndex]);
      normals.push(normal);
    }
  }
}

function boxMesh(width, depth, height) {
  const x0 = -width / 2;
  const x1 = width / 2;
  const y0 = -depth / 2;
  const y1 = depth / 2;
  const z0 = 0;
  const z1 = height;
  const positions = [];
  const normals = [];

  pushFace(
    positions,
    normals,
    [
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1]
    ],
    [0, 0, 1]
  );
  pushFace(
    positions,
    normals,
    [
      [x1, y0, z0],
      [x0, y0, z0],
      [x0, y1, z0],
      [x1, y1, z0]
    ],
    [0, 0, -1]
  );
  pushFace(
    positions,
    normals,
    [
      [x1, y0, z1],
      [x1, y0, z0],
      [x1, y1, z0],
      [x1, y1, z1]
    ],
    [1, 0, 0]
  );
  pushFace(
    positions,
    normals,
    [
      [x0, y1, z1],
      [x0, y1, z0],
      [x0, y0, z0],
      [x0, y0, z1]
    ],
    [-1, 0, 0]
  );
  pushFace(
    positions,
    normals,
    [
      [x0, y1, z1],
      [x1, y1, z1],
      [x1, y1, z0],
      [x0, y1, z0]
    ],
    [0, 1, 0]
  );
  pushFace(
    positions,
    normals,
    [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y0, z1],
      [x0, y0, z1]
    ],
    [0, -1, 0]
  );

  return { positions, normals };
}

const partName = "jt_bridge_probe_named_red_block_100x50x25mm";
const dimensionsMm = { width: 100, depth: 50, height: 25 };
const { positions, normals } = boxMesh(dimensionsMm.width, dimensionsMm.depth, dimensionsMm.height);
const positionAccessor = writeVec3Accessor(positions, "POSITION");
const normalAccessor = writeVec3Accessor(normals, "NORMAL");
const binChunk = Buffer.concat(bufferChunks);

const gltf = {
  asset: {
    version: "2.0",
    generator: "Kairo CAD Exchanger JT bridge named-part probe"
  },
  scene: 0,
  scenes: [
    {
      name: "jt_bridge_named_part_probe_scene",
      nodes: [0],
      extras: {
        kairoProbe: true,
        probeKind: "CAD_EXCHANGER_JT_BRIDGE_SIMPLE_PART",
        expectedBehavior: "CAD Exchanger should preserve a single named colored mesh part through JT export before any Kairo product-export claim."
      }
    }
  ],
  nodes: [
    {
      name: partName,
      mesh: 0,
      extras: {
        kairoProbe: true,
        sourceSystem: "kairo",
        sourceId: "jt-bridge-probe-part-001",
        partNumber: "KAIRO-JT-BRIDGE-PROBE-001",
        colorName: "inspection_red",
        dimensionsMm,
        expectedBehavior: "Node name, part number, dimensions, and color should remain identifiable after CAD Exchanger import and JT conversion if the bridge is viable."
      }
    }
  ],
  meshes: [
    {
      name: partName,
      primitives: [
        {
          attributes: {
            POSITION: positionAccessor,
            NORMAL: normalAccessor
          },
          mode: TRIANGLES,
          material: 0,
          extras: {
            kairoProbe: true,
            primitiveMode: "TRIANGLES",
            triangleCount: positions.length / 3,
            dimensionsMm
          }
        }
      ],
      extras: {
        kairoProbe: true,
        partNumber: "KAIRO-JT-BRIDGE-PROBE-001",
        dimensionsMm
      }
    }
  ],
  materials: [
    {
      name: "inspection_red_jt_bridge_probe",
      pbrMetallicRoughness: {
        baseColorFactor: [1, 0.05, 0.02, 1],
        metallicFactor: 0,
        roughnessFactor: 0.55
      },
      extras: {
        kairoProbe: true,
        colorName: "inspection_red",
        expectedBehavior: "Material name and red appearance should remain identifiable through CAD Exchanger and JT viewing."
      }
    }
  ],
  buffers: [
    {
      byteLength: binChunk.length
    }
  ],
  bufferViews,
  accessors
};

const jsonChunk = padBuffer(Buffer.from(JSON.stringify(gltf, null, 2), "utf8"), 0x20);
const paddedBinChunk = padBuffer(binChunk, 0);
const totalLength = 12 + 8 + jsonChunk.length + 8 + paddedBinChunk.length;

const header = Buffer.alloc(12);
header.writeUInt32LE(GLB_MAGIC, 0);
header.writeUInt32LE(GLB_VERSION, 4);
header.writeUInt32LE(totalLength, 8);

const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(jsonChunk.length, 0);
jsonHeader.writeUInt32LE(JSON_CHUNK_TYPE, 4);

const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(paddedBinChunk.length, 0);
binHeader.writeUInt32LE(BIN_CHUNK_TYPE, 4);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, Buffer.concat([header, jsonHeader, jsonChunk, binHeader, paddedBinChunk]));

console.log(`Wrote ${outputPath}`);
console.log(`Part: ${partName}`);
console.log(`Dimensions: ${dimensionsMm.width} x ${dimensionsMm.depth} x ${dimensionsMm.height} mm`);
console.log(`Vertices: ${positions.length}`);
console.log(`Triangles: ${positions.length / 3}`);
console.log(`Materials: 1`);
