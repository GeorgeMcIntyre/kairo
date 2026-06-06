import { spawnSync } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const commands = [
  {
    name: "build GLB primitive probe",
    args: ["tools\\glb-probes\\build-probe.mjs"],
    expectedOutput: ["Nodes: 10", "Meshes: 10", "Materials: 3"]
  },
  {
    name: "inspect GLB primitive probe",
    args: ["tools\\glb-probes\\inspect-glb-probe.mjs"],
    expectedOutput: [
      "primitive 0: 1 (LINES)",
      "primitive 0: 3 (LINE_STRIP)",
      "primitive 0: 4 (TRIANGLES)",
      "primitive 0: 5 (TRIANGLE_STRIP)",
      "scene extras present: true",
      "nodes with kairoProbe extras: 10/10",
      "meshes with kairoProbe extras: 10/10",
      "primitives with extras: 12/12",
      "materials with kairoProbe extras: 3/3",
      "far-origin coordinate near [110000, 90000, 0]: YES",
      "0.1 mm LINES segment: YES"
    ]
  },
  {
    name: "build JT bridge part probe",
    args: ["tools\\glb-probes\\build-jt-bridge-part-probe.mjs"],
    expectedOutput: [
      "Part: jt_bridge_probe_named_red_block_100x50x25mm",
      "Dimensions: 100 x 50 x 25 mm",
      "Vertices: 36",
      "Triangles: 12",
      "Materials: 1"
    ]
  },
  {
    name: "inspect JT bridge part probe",
    args: ["tools\\glb-probes\\inspect-jt-bridge-part-probe.mjs"],
    expectedOutput: [
      "node: jt_bridge_probe_named_red_block_100x50x25mm",
      "mesh: jt_bridge_probe_named_red_block_100x50x25mm",
      "material: inspection_red_jt_bridge_probe",
      "dimensions: [100, 50, 25] mm",
      "vertices: 36",
      "triangles: 12",
      "dimensions 100x50x25: PASS",
      "red material color: PASS",
      "material extras present: PASS"
    ]
  }
];

const expectedFiles = [
  "tools\\glb-probes\\probe-output.glb",
  "tools\\glb-probes\\jt-bridge-part-output.glb"
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function runCommand(command) {
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, command.args, {
    cwd: repoRoot,
    encoding: "utf8"
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
  if (result.status !== 0) {
    throw new Error(
      [`${command.name} failed with exit code ${result.status}`, output.trim()].filter(Boolean).join("\n")
    );
  }
  for (const expected of command.expectedOutput) {
    assert(output.includes(expected), `${command.name} output did not include expected text: ${expected}`);
  }
  return {
    name: command.name,
    ms: Date.now() - startedAt
  };
}

const checks = commands.map(runCommand);
const files = [];
for (const filePath of expectedFiles) {
  const absolutePath = path.join(repoRoot, filePath);
  const fileStats = await stat(absolutePath);
  assert(fileStats.size > 0, `${filePath} is empty`);
  files.push({ path: filePath, bytes: fileStats.size });
}

console.log("CAD GLB probe smoke passed");
for (const check of checks) {
  console.log(`- ${check.name}: ${check.ms} ms`);
}
for (const file of files) {
  console.log(`- ${file.path}: ${file.bytes.toLocaleString("en-US")} bytes`);
}
