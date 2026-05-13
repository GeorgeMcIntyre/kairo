import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CIRCLE_SEGMENTS = 32;
const ARC_SEGMENTS = 24;

function usage() {
  console.error("Usage: node tools/export-scene-lines-glb.mjs <scene-dir> <output.glb>");
}

function colorTuple(color, fallback = [0.15, 0.7, 1]) {
  if (!color) return fallback;
  return [color.r ?? fallback[0], color.g ?? fallback[1], color.b ?? fallback[2]];
}

function pointsForCircle(entity) {
  const points = [];
  for (let i = 0; i <= CIRCLE_SEGMENTS; i += 1) {
    const angle = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
    points.push([
      entity.center[0] + Math.cos(angle) * entity.radius,
      entity.center[1] + Math.sin(angle) * entity.radius,
      entity.center[2]
    ]);
  }
  return points;
}

function pointsForArc(entity) {
  const points = [];
  const start = (entity.startAngleDeg * Math.PI) / 180;
  const end = (entity.endAngleDeg * Math.PI) / 180;
  for (let i = 0; i <= ARC_SEGMENTS; i += 1) {
    const angle = start + ((end - start) * i) / ARC_SEGMENTS;
    points.push([
      entity.center[0] + Math.cos(angle) * entity.radius,
      entity.center[1] + Math.sin(angle) * entity.radius,
      entity.center[2]
    ]);
  }
  return points;
}

function pointsForEntity(entity) {
  if (entity.type === "line") return [entity.start, entity.end];
  if (entity.type === "polyline") return entity.closed ? [...entity.points, entity.points[0]] : entity.points;
  if (entity.type === "circle") return pointsForCircle(entity);
  if (entity.type === "arc") return pointsForArc(entity);
  return [];
}

function padBuffer(buffer, padByte) {
  const paddedLength = Math.ceil(buffer.length / 4) * 4;
  if (paddedLength === buffer.length) return buffer;
  return Buffer.concat([buffer, Buffer.alloc(paddedLength - buffer.length, padByte)]);
}

function writeUInt32LE(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value, 0);
  return buffer;
}

function boundsOf(positions) {
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let i = 0; i < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[i + axis];
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }
  }
  return { min, max };
}

async function loadScenePackage(sceneDir) {
  const [manifest, layers] = await Promise.all([
    readFile(path.join(sceneDir, "manifest.json"), "utf8").then(JSON.parse),
    readFile(path.join(sceneDir, "layers.json"), "utf8").then(JSON.parse)
  ]);
  const geometryDir = path.join(sceneDir, "geometry");
  const geometryFiles = (await readdir(geometryDir))
    .filter((entry) => entry.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));
  return { manifest, layers, geometryDir, geometryFiles };
}

async function main() {
  const [sceneDirArg, outputArg] = process.argv.slice(2);
  if (!sceneDirArg || !outputArg) {
    usage();
    process.exitCode = 2;
    return;
  }

  const sceneDir = path.resolve(sceneDirArg);
  const outputPath = path.resolve(outputArg);
  const { manifest, layers, geometryDir, geometryFiles } = await loadScenePackage(sceneDir);
  const layerColors = new Map(layers.layers.map((layer) => [layer.id, colorTuple(layer.color)]));
  const fallbackColor = [0.15, 0.7, 1];
  const positions = [];
  const colors = [];
  const stats = {
    source: manifest.source?.path,
    units: manifest.units,
    geometryDocuments: geometryFiles.length,
    curveSets: 0,
    skippedTextEntities: 0,
    curveEntities: 0,
    lineSegments: 0,
    vertices: 0,
    primitiveMode: "LINES"
  };

  for (const fileName of geometryFiles) {
    const document = JSON.parse(await readFile(path.join(geometryDir, fileName), "utf8"));
    for (const geometry of document.geometries ?? []) {
      if (geometry.kind !== "curve-set") continue;
      stats.curveSets += 1;
      const geometryColor = layerColors.get(geometry.layerId) ?? fallbackColor;
      for (const entity of geometry.entities ?? []) {
        if (entity.type === "text") {
          stats.skippedTextEntities += 1;
          continue;
        }

        const points = pointsForEntity(entity);
        if (points.length < 2) continue;
        const entityColor = colorTuple(entity.color, layerColors.get(entity.layerId) ?? geometryColor);
        stats.curveEntities += 1;

        for (let index = 0; index < points.length - 1; index += 1) {
          const start = points[index];
          const end = points[index + 1];
          positions.push(start[0], start[1], start[2], end[0], end[1], end[2]);
          colors.push(...entityColor, ...entityColor);
          stats.lineSegments += 1;
        }
      }
    }
  }

  stats.vertices = positions.length / 3;
  if (stats.vertices === 0) throw new Error("No line vertices were generated.");

  const positionBuffer = Buffer.from(new Float32Array(positions).buffer);
  const colorBuffer = Buffer.from(new Float32Array(colors).buffer);
  const binaryBuffer = Buffer.concat([positionBuffer, colorBuffer]);
  const positionBounds = boundsOf(positions);
  const gltf = {
    asset: {
      version: "2.0",
      generator: "Kairo GLB line primitive probe",
      extras: {
        sourceUnits: manifest.units,
        sourcePath: manifest.source?.path
      }
    },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: path.basename(outputPath, ".glb") }],
    meshes: [
      {
        name: "DXF curve line segments",
        primitives: [
          {
            attributes: {
              POSITION: 0,
              COLOR_0: 1
            },
            mode: 1
          }
        ]
      }
    ],
    accessors: [
      {
        bufferView: 0,
        byteOffset: 0,
        componentType: 5126,
        count: stats.vertices,
        type: "VEC3",
        min: positionBounds.min,
        max: positionBounds.max
      },
      {
        bufferView: 1,
        byteOffset: 0,
        componentType: 5126,
        count: stats.vertices,
        type: "VEC3"
      }
    ],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: positionBuffer.byteLength,
        target: 34962
      },
      {
        buffer: 0,
        byteOffset: positionBuffer.byteLength,
        byteLength: colorBuffer.byteLength,
        target: 34962
      }
    ],
    buffers: [{ byteLength: binaryBuffer.byteLength }],
    extras: stats
  };

  const jsonChunk = padBuffer(Buffer.from(JSON.stringify(gltf), "utf8"), 0x20);
  const binChunk = padBuffer(binaryBuffer, 0x00);
  const totalLength = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const header = Buffer.concat([Buffer.from("glTF"), writeUInt32LE(2), writeUInt32LE(totalLength)]);
  const jsonHeader = Buffer.concat([writeUInt32LE(jsonChunk.length), Buffer.from("JSON")]);
  const binHeader = Buffer.concat([writeUInt32LE(binChunk.length), Buffer.from("BIN\0")]);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.concat([header, jsonHeader, jsonChunk, binHeader, binChunk]));
  await writeFile(`${outputPath}.summary.json`, `${JSON.stringify(stats, null, 2)}\n`);
  console.log(`Wrote ${outputPath}`);
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
