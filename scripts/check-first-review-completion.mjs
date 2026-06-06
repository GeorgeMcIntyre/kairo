import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultProjectPath = path.join(repoRoot, "docs", "examples", "scott-p736-first-review.kairo-project.json");
const protectedLabels = ["7B-020L-04", "7B-070L-DN1", "7B-070L-DN2", "7B-060L-1N"];

function usage() {
  return [
    "Usage: node scripts/check-first-review-completion.mjs [project-json] [--require-complete] [--json]",
    "",
    "Completion rule:",
    "  A review row is unresolved when reviewStatus is \"uncertain\" and both reviewerNote and reviewedAt are blank.",
    "  This allows a human reviewer to leave a row uncertain if they add reviewer evidence.",
    "",
    `Default project: ${path.relative(repoRoot, defaultProjectPath)}`
  ].join("\n");
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(usage());
  process.exit(0);
}

const requireComplete = args.includes("--require-complete");
const asJson = args.includes("--json");
const projectArg = args.find((arg) => !arg.startsWith("--"));
const projectPath = projectArg ? path.resolve(projectArg) : defaultProjectPath;

function normalizeLabel(label) {
  return String(label ?? "").replace(/\s+/g, " ").trim();
}

function statusCounts(records) {
  return records.reduce((counts, record) => {
    counts[record.reviewStatus] = (counts[record.reviewStatus] ?? 0) + 1;
    return counts;
  }, {});
}

function hasReviewerEvidence(record) {
  return String(record.reviewerNote ?? "").trim() !== "" || String(record.reviewedAt ?? "").trim() !== "";
}

function isUnresolved(record) {
  return record.reviewStatus === "uncertain" && !hasReviewerEvidence(record);
}

function protectedStatus(records) {
  return protectedLabels.map((label) => {
    const record = records.find((entry) => normalizeLabel(entry.detectedLabel).includes(label));
    return {
      label,
      found: Boolean(record),
      reviewStatus: record?.reviewStatus ?? "missing",
      hasReviewerEvidence: record ? hasReviewerEvidence(record) : false,
      detectedDeviceType: record?.detectedDeviceType ?? "",
      geometryStatus: record?.detectedGeometryAssociation?.status ?? ""
    };
  });
}

const project = JSON.parse(await readFile(projectPath, "utf8"));
if (project.schema !== "kairo-project" || project.schemaVersion !== 1) {
  throw new Error(`Expected kairo-project schema v1 in ${projectPath}`);
}
if (!Array.isArray(project.layoutReviewPack?.records)) {
  throw new Error(`Project does not contain layoutReviewPack.records: ${projectPath}`);
}

const records = project.layoutReviewPack.records;
const unresolvedRecords = records.filter(isUnresolved);
const result = {
  projectPath: path.relative(repoRoot, projectPath),
  totalRecords: records.length,
  statusCounts: statusCounts(records),
  unresolvedRecords: unresolvedRecords.length,
  completionStatus: unresolvedRecords.length === 0 ? "complete" : "incomplete",
  protectedLabels: protectedStatus(records),
  unresolvedSample: unresolvedRecords.slice(0, 12).map((record) => ({
    id: record.id,
    detectedLabel: normalizeLabel(record.detectedLabel),
    detectedDeviceType: record.detectedDeviceType,
    geometryStatus: record.detectedGeometryAssociation?.status ?? "",
    confidence: record.confidence
  }))
};

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`First-review completion: ${result.completionStatus}`);
  console.log(`Project: ${result.projectPath}`);
  console.log(`Records: ${result.totalRecords}`);
  console.log(`Status counts: ${JSON.stringify(result.statusCounts)}`);
  console.log(`Unresolved generated-uncertain records: ${result.unresolvedRecords}`);
  console.log("Protected labels:");
  for (const row of result.protectedLabels) {
    console.log(
      `- ${row.label}: ${row.reviewStatus}${row.hasReviewerEvidence ? " (reviewer evidence present)" : ""}` +
        `${row.detectedDeviceType ? `, ${row.detectedDeviceType}` : ""}` +
        `${row.geometryStatus ? `, geometry ${row.geometryStatus}` : ""}`
    );
  }
  if (result.unresolvedSample.length > 0) {
    console.log("Unresolved sample:");
    for (const row of result.unresolvedSample) {
      console.log(`- ${row.detectedLabel} (${row.detectedDeviceType}, ${row.geometryStatus}, confidence ${row.confidence})`);
    }
  }
}

if (requireComplete && unresolvedRecords.length > 0) {
  process.exitCode = 1;
}
