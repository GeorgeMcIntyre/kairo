#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const inputPath = process.argv[2];

if (!inputPath) {
  console.error("Usage: node tools/jt81-probe-local-tools.mjs <input.jt>");
  process.exit(1);
}

const txJt2JtPath = "C:\\Program Files\\Tecnomatix_2301.0\\eMPower\\TxJt2Jt.exe";
const investigationDir = path.resolve("specs/investigations/jt-8-1-raw-spike");
const probeReportPath = path.join(investigationDir, "probe-results.md");
const roundTripPath = path.join(investigationDir, "minimal-candidate.txjt2jt-output.jt");

function hexPreview(filePath, byteCount = 128) {
  if (!existsSync(filePath)) return "";

  const bytes = readFileSync(filePath).subarray(0, byteCount);

  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join(" ");
}

function runProcess(command, args, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const toolDir = path.dirname(command);
    const child = spawn(command, args, {
      cwd: toolDir,
      env: {
        ...process.env,
        PATH: `${toolDir};${process.env.PATH ?? ""}`
      },
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        command,
        args,
        exitCode: null,
        signal: null,
        timedOut,
        stdout,
        stderr: `${stderr}${error.message}`
      });
    });

    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      resolve({
        command,
        args,
        exitCode,
        signal,
        timedOut,
        stdout,
        stderr
      });
    });
  });
}

const inputResolved = path.resolve(inputPath);
const toolExists = existsSync(txJt2JtPath);
const inputExists = existsSync(inputResolved);
const inputSize = inputExists ? statSync(inputResolved).size : 0;
const first128Hex = inputExists ? hexPreview(inputResolved, 128) : "";

let result = null;
if (toolExists && inputExists) {
  result = await runProcess(txJt2JtPath, [inputResolved, roundTripPath]);
}

mkdirSync(investigationDir, { recursive: true });

const markdown = `# JT 8.1 Raw Spike Probe Results

Generated: ${new Date().toISOString()}

## Inputs

- Candidate JT: \`${inputResolved}\`
- Candidate exists: ${inputExists ? "yes" : "no"}
- Candidate size: ${inputSize} bytes
- TxJt2Jt path: \`${txJt2JtPath}\`
- TxJt2Jt exists: ${toolExists ? "yes" : "no"}

## First 128 Bytes

\`\`\`text
${first128Hex || "(no bytes)"}
\`\`\`

## TxJt2Jt Probe

${result ? `- Command: \`${result.command} ${result.args.map((arg) => `"${arg}"`).join(" ")}\`
- Exit code: ${result.exitCode === null ? "(none)" : result.exitCode}
- Signal: ${result.signal ?? "(none)"}
- Timed out: ${result.timedOut ? "yes" : "no"}

### stdout

\`\`\`text
${result.stdout || "(empty)"}
\`\`\`

### stderr

\`\`\`text
${result.stderr || "(empty)"}
\`\`\`

### Output File

- Expected output: \`${roundTripPath}\`
- Output exists: ${existsSync(roundTripPath) ? "yes" : "no"}
` : "TxJt2Jt was not run because the tool or input file was missing."}
`;

writeFileSync(probeReportPath, markdown);
console.log(`Wrote probe report: ${probeReportPath}`);

if (result) {
  console.log(`TxJt2Jt exitCode=${result.exitCode} signal=${result.signal ?? ""} timedOut=${result.timedOut}`);
}
