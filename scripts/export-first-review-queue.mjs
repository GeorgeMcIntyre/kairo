import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultProjectPath = path.join(repoRoot, "docs", "examples", "scott-p736-first-review.kairo-project.json");
const defaultMarkdownPath = path.join(repoRoot, "docs", "examples", "scott-p736-first-review-queue.md");
const defaultCsvPath = path.join(repoRoot, "docs", "examples", "scott-p736-first-review-queue.csv");
const protectedLabels = ["7B-020L-04", "7B-070L-DN1", "7B-070L-DN2", "7B-060L-1N"];

function usage() {
  return [
    "Usage: node scripts/export-first-review-queue.mjs [project-json] [markdown-output] [csv-output]",
    "",
    `Default project: ${path.relative(repoRoot, defaultProjectPath)}`,
    `Default markdown: ${path.relative(repoRoot, defaultMarkdownPath)}`,
    `Default CSV: ${path.relative(repoRoot, defaultCsvPath)}`
  ].join("\n");
}

const [projectArg, markdownArg, csvArg] = process.argv.slice(2);
if (projectArg === "--help" || projectArg === "-h") {
  console.log(usage());
  process.exit(0);
}

const projectPath = projectArg ? path.resolve(projectArg) : defaultProjectPath;
const markdownPath = markdownArg ? path.resolve(markdownArg) : defaultMarkdownPath;
const csvPath = csvArg ? path.resolve(csvArg) : defaultCsvPath;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeLabel(label) {
  return String(label ?? "").replace(/\s+/g, " ").trim();
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null && String(value).trim() !== "").map(String))];
}

function statusCounts(records) {
  return records.reduce((counts, record) => {
    counts[record.reviewStatus] = (counts[record.reviewStatus] ?? 0) + 1;
    return counts;
  }, {});
}

function typeCounts(records) {
  return records.reduce((counts, record) => {
    counts[record.detectedDeviceType] = (counts[record.detectedDeviceType] ?? 0) + 1;
    return counts;
  }, {});
}

function geometryStatus(record) {
  return record.detectedGeometryAssociation?.status ?? "unknown";
}

function stationFromEvidence(record) {
  const evidence = Array.isArray(record.evidence) ? record.evidence : [];
  const station = evidence.find((entry) => /^parent station\s+/i.test(entry));
  return station ? station.replace(/^parent station\s+/i, "") : "";
}

function geometryCenter(association) {
  const min = association?.bounds?.min;
  const max = association?.bounds?.max;
  if (!Array.isArray(min) || !Array.isArray(max) || min.length < 2 || max.length < 2) {
    return "";
  }
  const x = (Number(min[0]) + Number(max[0])) / 2;
  const y = (Number(min[1]) + Number(max[1])) / 2;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return "";
  }
  return `${Math.round(x * 10) / 10}, ${Math.round(y * 10) / 10}`;
}

function compactList(values, limit) {
  const list = unique(values);
  if (list.length <= limit) {
    return list.join(", ");
  }
  return `${list.slice(0, limit).join(", ")} (+${list.length - limit} more)`;
}

function markdownEscape(value) {
  return String(value ?? "")
    .replace(/\r?\n/g, "<br>")
    .replace(/\|/g, "\\|");
}

function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function recordSortKey(record) {
  return [
    stationFromEvidence(record),
    normalizeLabel(record.detectedLabel),
    record.detectedDeviceType,
    record.id
  ].join("\u0000");
}

function summaryLines(title, counts) {
  const entries = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right));
  return [
    `### ${title}`,
    "",
    "| Value | Count |",
    "|---|---:|",
    ...entries.map(([value, count]) => `| ${markdownEscape(value)} | ${count} |`),
    entries.length === 0 ? "| None | 0 |" : "",
    ""
  ];
}

function findGeometryAssociation(project, record) {
  return project.layoutPackage.geometryAssociations.find((association) => association.sourceDeviceId === record.detectedItemId);
}

function sourceIds(project, record) {
  const training = project.layoutPackage.trainingPack.find((entry) => entry.detectedItemId === record.detectedItemId);
  return training?.sourceEntityIds ?? [];
}

const project = JSON.parse(await readFile(projectPath, "utf8"));
assert(project.schema === "kairo-project", `Expected kairo-project schema in ${projectPath}`);
assert(project.schemaVersion === 1, `Expected kairo-project schemaVersion 1 in ${projectPath}`);
assert(project.layoutReviewPack?.records, "Project does not contain layoutReviewPack.records");
assert(project.layoutPackage?.geometryAssociations, "Project does not contain layoutPackage.geometryAssociations");

const records = [...project.layoutReviewPack.records].sort((left, right) => recordSortKey(left).localeCompare(recordSortKey(right)));
const uncertainRecords = records.filter((record) => record.reviewStatus === "uncertain");
const protectedRows = protectedLabels.map((label) => {
  const record = records.find((entry) => normalizeLabel(entry.detectedLabel).includes(label));
  return { label, record };
});

const markdown = [
  "# Scott P736 First-Review Queue",
  "",
  "Generated from `docs/examples/scott-p736-first-review.kairo-project.json`.",
  "",
  "This is a reviewer aid for the human visual QA pass. It does not make or imply human approval. Use the viewer Workbench to change statuses and export the reviewed `kairo-project.json`.",
  "",
  "## Summary",
  "",
  `- Total review records: ${records.length}`,
  `- Records still needing human review: ${uncertainRecords.length}`,
  `- Source display name: ${project.source?.displayName ?? "unknown"}`,
  "",
  ...summaryLines("Review Status", statusCounts(records)),
  ...summaryLines("Uncertain Records By Type", typeCounts(uncertainRecords)),
  "## Protected P736 Labels",
  "",
  "| Label | Review status | Detected type | Geometry status | Confidence | Station | Notes |",
  "|---|---|---|---|---:|---|---|",
  ...protectedRows.map(({ label, record }) => {
    if (!record) {
      return `| ${label} | missing |  |  |  |  | Not found in fixture |`;
    }
    return [
      label,
      record.reviewStatus,
      record.detectedDeviceType,
      geometryStatus(record),
      Number(record.confidence).toFixed(2),
      stationFromEvidence(record),
      record.reviewerNote || (record.reviewStatus === "uncertain" ? "Needs visual confirmation" : "Auto-accepted; spot-check before human-reviewed truth")
    ].map(markdownEscape).join(" | ").replace(/^/, "| ").replace(/$/, " |");
  }),
  "",
  "## Uncertain Review Queue",
  "",
  "| # | Label | Detected type | Station | Confidence | Geometry status | Geometry center x,y | Source entity IDs | Evidence |",
  "|---:|---|---|---|---:|---|---|---|---|",
  ...uncertainRecords.map((record, index) => {
    const association = findGeometryAssociation(project, record);
    return [
      String(index + 1),
      normalizeLabel(record.detectedLabel),
      record.detectedDeviceType,
      stationFromEvidence(record),
      Number(record.confidence).toFixed(2),
      geometryStatus(record),
      geometryCenter(association),
      compactList(sourceIds(project, record), 5),
      unique(record.evidence ?? []).slice(0, 8).join("; ")
    ].map(markdownEscape).join(" | ").replace(/^/, "| ").replace(/$/, " |");
  }),
  ""
].join("\n");

const csvRows = [
  [
    "index",
    "reviewStatus",
    "detectedLabel",
    "detectedDeviceType",
    "station",
    "confidence",
    "geometryStatus",
    "geometryCenterXY",
    "sourceEntityIds",
    "evidence"
  ],
  ...uncertainRecords.map((record, index) => {
    const association = findGeometryAssociation(project, record);
    return [
      String(index + 1),
      record.reviewStatus,
      normalizeLabel(record.detectedLabel),
      record.detectedDeviceType,
      stationFromEvidence(record),
      Number(record.confidence).toFixed(2),
      geometryStatus(record),
      geometryCenter(association),
      sourceIds(project, record).join(", "),
      unique(record.evidence ?? []).join("; ")
    ];
  })
].map((row) => row.map(csvEscape).join(",")).join("\n") + "\n";

await mkdir(path.dirname(markdownPath), { recursive: true });
await mkdir(path.dirname(csvPath), { recursive: true });
await writeFile(markdownPath, markdown, "utf8");
await writeFile(csvPath, csvRows, "utf8");

console.log(`Wrote ${path.relative(repoRoot, markdownPath)}`);
console.log(`Wrote ${path.relative(repoRoot, csvPath)}`);
console.log(`Review records: ${records.length}; uncertain queue: ${uncertainRecords.length}`);
