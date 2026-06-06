import { spawnSync } from "node:child_process";

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const checks = [
  {
    name: "Pages HTTP smoke",
    command: [pnpm, "smoke:pages"]
  },
  {
    name: ".kairo package smoke",
    command: [pnpm, "smoke:kairo-package"]
  },
  {
    name: "CAD GLB probe smoke",
    command: [pnpm, "smoke:cad-glb-probes"]
  },
  {
    name: "Scott first-review completion report",
    command: [pnpm, "review:first-check"]
  },
  {
    name: "Scott first-review regression test",
    command: [pnpm, "test", "--run", "apps/viewer/src/project/scottP736FirstReview.test.ts"]
  }
];

const manualGates = [
  "Browser/canvas QA for the public Pages URL",
  "Browser file-picker QA for opening tmp\\scott-dxf2013-import.kairo in the deployed viewer",
  "Human visual review of the 88 generated-uncertain Scott first-review rows",
  "Desktop CAD Exchanger -> JT -> JT2Go / Process Simulate result matrix"
];

function formatCommand(command) {
  return command.join(" ");
}

function tail(text, maxLines = 30) {
  const lines = text.trimEnd().split(/\r?\n/);
  return lines.slice(Math.max(0, lines.length - maxLines)).join("\n");
}

function runCheck(check) {
  const startedAt = Date.now();
  const result = spawnSync(check.command[0], check.command.slice(1), {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20,
    shell: process.platform === "win32"
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
  const failed = result.status !== 0 || result.error;
  if (failed) {
    throw new Error(
      [
        `${check.name} failed with exit code ${result.status}${result.signal ? `, signal ${result.signal}` : ""}`,
        result.error ? `Process error: ${result.error.message}` : "",
        `Command: ${formatCommand(check.command)}`,
        tail(output)
      ]
        .filter(Boolean)
        .join("\n")
    );
  }
  return {
    name: check.name,
    command: formatCommand(check.command),
    ms: Date.now() - startedAt
  };
}

const results = checks.map(runCheck);

console.log("Current automated gate smoke passed");
for (const result of results) {
  console.log(`- ${result.name}: ${result.ms} ms (${result.command})`);
}
console.log("");
console.log("Manual gates still required:");
for (const gate of manualGates) {
  console.log(`- ${gate}`);
}
