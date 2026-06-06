import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;
const COMPONENT_FLOAT = 5126;
const ARRAY_BUFFER = 34962;

const MODE_NAMES = {
  1: "LINES",
  3: "LINE_STRIP",
  4: "TRIANGLES",
  5: "TRIANGLE_STRIP"
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(scriptDir, "probe-output.glb");

const bufferChunks = [];
const bufferViews = [];
const accessors = [];
const meshes = [];
const nodes = [];

const materials = [
  material("layer_a_red", [1, 0, 0, 1], "layer-a"),
  material("layer_b_green", [0, 1, 0, 1], "layer-b"),
  material("layer_c_blue", [0, 0.3, 1, 1], "layer-c")
];

function material(name, baseColorFactor, layer) {
  return {
    name,
    pbrMetallicRoughness: {
      baseColorFactor,
      metallicFactor: 0,
      roughnessFactor: 1
    },
    extensions: {
      KHR_materials_unlit: {}
    },
    extras: {
      kairoProbe: true,
      layer,
      primitiveMode: "MATERIAL",
      expectedBehavior: "Material name, color, unlit extension, and layer metadata should remain inspectable if preserved by the toolchain."
    }
  };
}

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

function encodePositions(points) {
  const byteOffset = bufferChunks.reduce((sum, chunk) => sum + chunk.length, 0);
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
    min,
    max
  });

  return accessorIndex;
}

function primitive(points, mode, materialIndex, extras) {
  return {
    attributes: {
      POSITION: encodePositions(points)
    },
    mode,
    material: materialIndex,
    extras: {
      kairoProbe: true,
      primitiveMode: MODE_NAMES[mode],
      ...extras
    }
  };
}

function addNode({ name, primitives, layer, primitiveMode, expectedBehavior }) {
  const meshIndex = meshes.length;
  meshes.push({
    name,
    primitives,
    extras: {
      kairoProbe: true,
      layer,
      primitiveMode,
      expectedBehavior
    }
  });

  const nodeIndex = nodes.length;
  nodes.push({
    name,
    mesh: meshIndex,
    extras: {
      kairoProbe: true,
      layer,
      primitiveMode,
      expectedBehavior
    }
  });

  return nodeIndex;
}

function arcPoints(center, radius, startDeg, endDeg, segments) {
  const points = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const angle = ((startDeg + (endDeg - startDeg) * t) * Math.PI) / 180;
    points.push([center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius, center[2]]);
  }
  return points;
}

function circlePoints(center, radius, segments) {
  return arcPoints(center, radius, 0, 360, segments);
}

function rectangleTriangles(x0, y0, x1, y1, z = 0) {
  return [
    [x0, y0, z],
    [x1, y0, z],
    [x1, y1, z],
    [x0, y0, z],
    [x1, y1, z],
    [x0, y1, z]
  ];
}

addNode({
  name: "probe_01_LINES_red_layer_a",
  layer: "layer-a",
  primitiveMode: "LINES",
  expectedBehavior: "Independent glTF LINES segments should remain visible and red after CAD Exchanger import and JT conversion.",
  primitives: [
    primitive(
      [
        [0, 0, 0],
        [20, 0, 0],
        [0, 4, 0],
        [20, 4, 0],
        [0, 8, 0],
        [20, 8, 0]
      ],
      1,
      0,
      { layer: "layer-a", expectedBehavior: "Three independent line segments." }
    )
  ]
});

addNode({
  name: "probe_02_LINE_STRIP_green_layer_b",
  layer: "layer-b",
  primitiveMode: "LINE_STRIP",
  expectedBehavior: "Connected glTF LINE_STRIP should remain visible and green.",
  primitives: [
    primitive(
      [
        [40, 0, 0],
        [50, 8, 0],
        [60, 0, 0],
        [70, 8, 0],
        [80, 0, 0]
      ],
      3,
      1,
      { layer: "layer-b", expectedBehavior: "Connected zig-zag line strip." }
    )
  ]
});

addNode({
  name: "probe_03_TRIANGLES_blue_layer_c",
  layer: "layer-c",
  primitiveMode: "TRIANGLES",
  expectedBehavior: "Basic triangle mesh should remain visible and blue.",
  primitives: [
    primitive(
      [
        [100, 0, 0],
        [120, 0, 0],
        [110, 14, 0]
      ],
      4,
      2,
      { layer: "layer-c", expectedBehavior: "Single blue triangle." }
    )
  ]
});

addNode({
  name: "probe_04_TRIANGLE_STRIP_red_layer_a",
  layer: "layer-a",
  primitiveMode: "TRIANGLE_STRIP",
  expectedBehavior: "Triangle strip should remain visible and red.",
  primitives: [
    primitive(
      [
        [140, 0, 0],
        [140, 12, 0],
        [160, 0, 0],
        [160, 12, 0]
      ],
      5,
      0,
      { layer: "layer-a", expectedBehavior: "Four-vertex strip rectangle." }
    )
  ]
});

addNode({
  name: "probe_05_RIBBON_LINE_blue_layer_c",
  layer: "layer-c",
  primitiveMode: "TRIANGLES_RIBBON_FALLBACK",
  expectedBehavior: "Thin mesh ribbon fallback should survive if CAD/JT drops native glTF lines.",
  primitives: [
    primitive(
      rectangleTriangles(180, -0.1, 190, 0.1, 0),
      4,
      2,
      { layer: "layer-c", expectedBehavior: "10 mm long, 0.2 mm wide blue mesh ribbon." }
    )
  ]
});

addNode({
  name: "probe_06_ARC_24_LINE_STRIP_green_layer_b",
  layer: "layer-b",
  primitiveMode: "LINE_STRIP",
  expectedBehavior: "24-segment arc represented as LINE_STRIP should remain visibly curved.",
  primitives: [
    primitive(
      arcPoints([220, 0, 0], 14, 0, 180, 24),
      3,
      1,
      { layer: "layer-b", expectedBehavior: "24-segment half arc line strip." }
    )
  ]
});

addNode({
  name: "probe_07_CIRCLE_32_LINE_STRIP_red_layer_a",
  layer: "layer-a",
  primitiveMode: "LINE_STRIP",
  expectedBehavior: "32-segment circle represented as closed LINE_STRIP should remain closed.",
  primitives: [
    primitive(
      circlePoints([270, 0, 0], 12, 32),
      3,
      0,
      { layer: "layer-a", expectedBehavior: "32-segment closed circle line strip; first point repeated." }
    )
  ]
});

addNode({
  name: "probe_08_SUBMM_0p1_LINE_green_layer_b",
  layer: "layer-b",
  primitiveMode: "LINES",
  expectedBehavior: "0.1 mm line tests sub-millimeter preservation and measurability.",
  primitives: [
    primitive(
      [
        [310, 0, 0],
        [310.1, 0, 0]
      ],
      1,
      1,
      { layer: "layer-b", expectedBehavior: "Single 0.1 mm green line segment." }
    )
  ]
});

addNode({
  name: "probe_09_FAR_ORIGIN_LINE_blue_layer_c",
  layer: "layer-c",
  primitiveMode: "LINES",
  expectedBehavior: "Far-origin line tests Float32 precision and CAD/JT handling around plant-layout coordinates.",
  primitives: [
    primitive(
      [
        [110000, 90000, 0],
        [110020, 90000, 0]
      ],
      1,
      2,
      { layer: "layer-c", expectedBehavior: "20 mm blue line near [110000, 90000, 0]." }
    )
  ]
});

addNode({
  name: "probe_10_MULTI_MATERIAL_PRIMITIVES",
  layer: "mixed",
  primitiveMode: "TRIANGLES_MULTI_MATERIAL",
  expectedBehavior: "One mesh with three primitives should preserve per-primitive materials or reveal material flattening behavior.",
  primitives: [
    primitive(rectangleTriangles(0, 45, 12, 57, 0), 4, 0, {
      layer: "layer-a",
      expectedBehavior: "Red primitive inside multi-material mesh."
    }),
    primitive(rectangleTriangles(16, 45, 28, 57, 0), 4, 1, {
      layer: "layer-b",
      expectedBehavior: "Green primitive inside multi-material mesh."
    }),
    primitive(rectangleTriangles(32, 45, 44, 57, 0), 4, 2, {
      layer: "layer-c",
      expectedBehavior: "Blue primitive inside multi-material mesh."
    })
  ]
});

const binChunk = Buffer.concat(bufferChunks);

const gltf = {
  asset: {
    version: "2.0",
    generator: "Kairo CAD Exchanger compatibility probe generator"
  },
  extensionsUsed: ["KHR_materials_unlit"],
  scene: 0,
  scenes: [
    {
      name: "cad_exchanger_glb_probe_scene",
      nodes: nodes.map((_, index) => index),
      extras: {
        kairoProbe: true,
        expectedBehavior: "Manual CAD Exchanger and JT conversion compatibility probe; not a Kairo exporter."
      }
    }
  ],
  nodes,
  meshes,
  materials,
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
console.log(`Nodes: ${nodes.length}`);
console.log(`Meshes: ${meshes.length}`);
console.log(`Materials: ${materials.length}`);
console.log(`Buffer bytes: ${binChunk.length}`);
