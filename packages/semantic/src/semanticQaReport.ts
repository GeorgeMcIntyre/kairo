import { normalizeDeviceText, type DeviceKind } from "./deviceDictionary";
import type { DeviceSemantic, LayoutSemantics, SemanticTextEntity, StationSemantic } from "./layoutSemantics";

export type RequiredSemanticQaLabel = {
  label: string;
  expectedKind: DeviceKind;
  expectedMeaning: string;
  expectedStationId: string;
};

export type SemanticQaLabelType = "station" | "device" | "unknown";

export type SemanticQaGeometryLink = {
  status: "linked" | "ambiguous" | "unlinked" | "none";
  confidence?: number;
  groupId?: string;
  groupSource?: string;
  blockName?: string;
  insertHandle?: string;
  linkedEntityIds: string[];
  candidateGroupIds: string[];
  candidateEntityIds: string[];
  reason: string[];
};

export type SemanticQaLabelRow = {
  label: string;
  normalizedLabel: string;
  labelType: SemanticQaLabelType;
  detectedType: string;
  confidence?: number;
  stationId?: string;
  sourceTextEntityIds: string[];
  geometry: SemanticQaGeometryLink;
  reason: string[];
};

export type SemanticQaRequiredLabelRow = RequiredSemanticQaLabel & {
  found: boolean;
  actualKind?: string;
  stationId?: string;
  confidence?: number;
  classificationCorrect: boolean;
  geometry: SemanticQaGeometryLink;
  sourceTextEntityIds: string[];
  reason: string[];
};

export type SemanticQaDuplicateLabelRow = {
  normalizedLabel: string;
  count: number;
  sourceTextEntityIds: string[];
  rawLabels: string[];
};

export type SemanticQaUncertainLabelRow = {
  label: string;
  detectedType: string;
  issue: "missing-required" | "classification-mismatch" | "ambiguous-geometry" | "unlinked-geometry" | "low-confidence" | "unknown";
  stationId?: string;
  confidence?: number;
  geometry: SemanticQaGeometryLink;
  reason: string[];
};

export type SemanticQaReport = {
  schema: "kairo-semantic-qa-report";
  schemaVersion: 1;
  status: "manual-review-pending";
  source: string;
  counts: {
    textLabels: number;
    detectedSemanticLabels: number;
    stations: number;
    devices: number;
    unknownLabels: number;
    duplicateLabels: number;
    requiredLabelsFound: number;
    requiredLabelsMissing: number;
    uncertainLabels: number;
  };
  requiredLabels: SemanticQaRequiredLabelRow[];
  detectedLabels: SemanticQaLabelRow[];
  unknownLabels: SemanticQaLabelRow[];
  duplicateLabels: SemanticQaDuplicateLabelRow[];
  uncertainLabels: SemanticQaUncertainLabelRow[];
};

export const SCOTT_REQUIRED_SEMANTIC_QA_LABELS: readonly RequiredSemanticQaLabel[] = [
  {
    label: "7B-020L-04",
    expectedKind: "robot",
    expectedMeaning: "robot",
    expectedStationId: "7B-020L"
  },
  {
    label: "7B-070L-DN1",
    expectedKind: "dunnage",
    expectedMeaning: "dunnage station",
    expectedStationId: "7B-070L"
  },
  {
    label: "7B-070L-DN2",
    expectedKind: "dunnage",
    expectedMeaning: "dunnage station",
    expectedStationId: "7B-070L"
  },
  {
    label: "7B-060L-1N",
    expectedKind: "nest",
    expectedMeaning: "nest",
    expectedStationId: "7B-060L"
  }
];

function markdownCell(value: unknown): string {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

function markdownRow(values: readonly unknown[]): string {
  return `| ${values.map(markdownCell).join(" | ")} |`;
}

function sourceLabel(sourcePath: string | undefined): string {
  if (!sourcePath) return "current viewer scene";
  const normalized = sourcePath.replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).at(-1) ?? "current viewer scene";
}

function normalizedLabel(value: string): string {
  return normalizeDeviceText(value);
}

function sortStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function groupInfo(semantics: LayoutSemantics, groupId: string | undefined) {
  if (!groupId) return undefined;
  return semantics.geometryGroups.find((group) => group.id === groupId);
}

function emptyGeometryLink(status: SemanticQaGeometryLink["status"] = "none"): SemanticQaGeometryLink {
  return {
    status,
    linkedEntityIds: [],
    candidateGroupIds: [],
    candidateEntityIds: [],
    reason: []
  };
}

function geometryLinkForDevice(semantics: LayoutSemantics, device: DeviceSemantic): SemanticQaGeometryLink {
  const group = groupInfo(semantics, device.geometryGroupId);
  return {
    status: device.associationStatus,
    confidence: device.associationConfidence,
    groupId: device.geometryGroupId,
    groupSource: device.geometryGroupSource,
    blockName: group?.blockName,
    insertHandle: group?.insertHandle,
    linkedEntityIds: sortStrings(device.linkedEntityIds),
    candidateGroupIds: sortStrings(device.associationCandidates.map((candidate) => candidate.groupId)),
    candidateEntityIds: sortStrings(device.associationCandidates.flatMap((candidate) => candidate.entityIds)),
    reason: device.associationReason
  };
}

function labelFromDevice(device: DeviceSemantic): string {
  return device.associationText ?? device.rawText ?? device.displayText ?? device.labelText;
}

function rowForStation(station: StationSemantic): SemanticQaLabelRow {
  return {
    label: station.labelText,
    normalizedLabel: normalizedLabel(station.labelText),
    labelType: "station",
    detectedType: "station",
    confidence: station.confidence,
    stationId: station.stationId,
    sourceTextEntityIds: sortStrings(station.sourceTextEntityIds),
    geometry: emptyGeometryLink("none"),
    reason: [`station label pattern ${station.stationId}`]
  };
}

function rowForDevice(semantics: LayoutSemantics, device: DeviceSemantic): SemanticQaLabelRow {
  const label = labelFromDevice(device);
  return {
    label,
    normalizedLabel: normalizedLabel(label),
    labelType: "device",
    detectedType: device.kind,
    confidence: device.confidence,
    stationId: device.stationId,
    sourceTextEntityIds: sortStrings(device.sourceTextEntityIds),
    geometry: geometryLinkForDevice(semantics, device),
    reason: device.evidence
  };
}

function rowForUnknown(text: SemanticTextEntity): SemanticQaLabelRow {
  const label = text.associationText ?? text.normalizedText ?? text.text;
  return {
    label,
    normalizedLabel: normalizedLabel(label),
    labelType: "unknown",
    detectedType: "unknown",
    stationId: undefined,
    sourceTextEntityIds: [text.entityId],
    geometry: emptyGeometryLink("none"),
    reason: ["not classified by station or device dictionary"]
  };
}

function compareLabelRows(left: SemanticQaLabelRow, right: SemanticQaLabelRow): number {
  return (
    left.normalizedLabel.localeCompare(right.normalizedLabel) ||
    left.labelType.localeCompare(right.labelType) ||
    (left.stationId ?? "").localeCompare(right.stationId ?? "") ||
    (left.sourceTextEntityIds[0] ?? "").localeCompare(right.sourceTextEntityIds[0] ?? "")
  );
}

function duplicateLabelRows(textEntities: readonly SemanticTextEntity[]): SemanticQaDuplicateLabelRow[] {
  const byNormalized = new Map<string, SemanticTextEntity[]>();
  for (const text of textEntities) {
    const label = normalizedLabel(text.associationText ?? text.normalizedText ?? text.text);
    if (!label) continue;
    byNormalized.set(label, [...(byNormalized.get(label) ?? []), text]);
  }

  return [...byNormalized.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([label, items]) => ({
      normalizedLabel: label,
      count: items.length,
      sourceTextEntityIds: sortStrings(items.map((item) => item.entityId)),
      rawLabels: sortStrings(items.map((item) => item.rawText ?? item.text))
    }))
    .sort((left, right) => left.normalizedLabel.localeCompare(right.normalizedLabel));
}

function findDeviceForRequiredLabel(semantics: LayoutSemantics, label: string): DeviceSemantic | undefined {
  const expected = normalizedLabel(label);
  return [...semantics.devices]
    .filter((device) =>
      [
        device.associationText,
        device.normalizedText,
        device.labelText,
        device.rawText,
        device.displayText
      ].some((value) => normalizedLabel(value ?? "") === expected)
    )
    .sort(
      (left, right) =>
        right.confidence - left.confidence ||
        right.associationConfidence - left.associationConfidence ||
        left.id.localeCompare(right.id)
    )[0];
}

function requiredLabelRows(semantics: LayoutSemantics): SemanticQaRequiredLabelRow[] {
  return SCOTT_REQUIRED_SEMANTIC_QA_LABELS.map((required) => {
    const device = findDeviceForRequiredLabel(semantics, required.label);
    return {
      ...required,
      found: Boolean(device),
      actualKind: device?.kind,
      stationId: device?.stationId,
      confidence: device?.confidence,
      classificationCorrect: device?.kind === required.expectedKind,
      geometry: device ? geometryLinkForDevice(semantics, device) : emptyGeometryLink("none"),
      sourceTextEntityIds: device ? sortStrings(device.sourceTextEntityIds) : [],
      reason: device ? device.evidence : ["required label not detected"]
    };
  });
}

function uncertainLabelRows(
  requiredLabels: readonly SemanticQaRequiredLabelRow[],
  detectedLabels: readonly SemanticQaLabelRow[],
  unknownLabels: readonly SemanticQaLabelRow[]
): SemanticQaUncertainLabelRow[] {
  const rows: SemanticQaUncertainLabelRow[] = [];

  for (const row of requiredLabels) {
    if (!row.found) {
      rows.push({
        label: row.label,
        detectedType: row.actualKind ?? "missing",
        issue: "missing-required",
        stationId: row.expectedStationId,
        confidence: row.confidence,
        geometry: row.geometry,
        reason: row.reason
      });
      continue;
    }
    if (!row.classificationCorrect) {
      rows.push({
        label: row.label,
        detectedType: row.actualKind ?? "unknown",
        issue: "classification-mismatch",
        stationId: row.stationId,
        confidence: row.confidence,
        geometry: row.geometry,
        reason: row.reason
      });
    }
  }

  for (const row of detectedLabels) {
    if (row.labelType !== "device") continue;
    const issue =
      row.geometry.status === "ambiguous"
        ? "ambiguous-geometry"
        : row.geometry.status === "unlinked"
          ? "unlinked-geometry"
          : (row.confidence ?? 1) < 0.72
            ? "low-confidence"
            : undefined;
    if (!issue) continue;
    rows.push({
      label: row.label,
      detectedType: row.detectedType,
      issue,
      stationId: row.stationId,
      confidence: row.confidence,
      geometry: row.geometry,
      reason: row.reason
    });
  }

  for (const row of unknownLabels) {
    rows.push({
      label: row.label,
      detectedType: row.detectedType,
      issue: "unknown",
      stationId: row.stationId,
      confidence: row.confidence,
      geometry: row.geometry,
      reason: row.reason
    });
  }

  return rows.sort(
    (left, right) =>
      left.issue.localeCompare(right.issue) ||
      left.label.localeCompare(right.label) ||
      (left.stationId ?? "").localeCompare(right.stationId ?? "")
  );
}

export function buildSemanticQaReport(semantics: LayoutSemantics, sourcePath?: string): SemanticQaReport {
  const detectedLabels = [
    ...semantics.stations.map(rowForStation),
    ...semantics.devices.map((device) => rowForDevice(semantics, device))
  ].sort(compareLabelRows);
  const unknownLabels = semantics.unknownTextEntities.map(rowForUnknown).sort(compareLabelRows);
  const duplicates = duplicateLabelRows(semantics.textEntities);
  const requiredLabels = requiredLabelRows(semantics);
  const uncertainLabels = uncertainLabelRows(requiredLabels, detectedLabels, unknownLabels);

  return {
    schema: "kairo-semantic-qa-report",
    schemaVersion: 1,
    status: "manual-review-pending",
    source: sourceLabel(sourcePath),
    counts: {
      textLabels: semantics.textEntities.length,
      detectedSemanticLabels: detectedLabels.length,
      stations: semantics.stations.length,
      devices: semantics.devices.length,
      unknownLabels: unknownLabels.length,
      duplicateLabels: duplicates.length,
      requiredLabelsFound: requiredLabels.filter((row) => row.found).length,
      requiredLabelsMissing: requiredLabels.filter((row) => !row.found).length,
      uncertainLabels: uncertainLabels.length
    },
    requiredLabels,
    detectedLabels,
    unknownLabels,
    duplicateLabels: duplicates,
    uncertainLabels
  };
}

function geometrySummary(geometry: SemanticQaGeometryLink): string {
  if (geometry.status === "none") return "-";
  const group = geometry.groupId ? `group=${geometry.groupId}` : "group=-";
  const block = geometry.blockName ? `block=${geometry.blockName}` : undefined;
  const insert = geometry.insertHandle ? `insert=${geometry.insertHandle}` : undefined;
  const linked = `linked=${geometry.linkedEntityIds.length}`;
  const candidates = geometry.candidateGroupIds.length > 0 ? `candidates=${geometry.candidateGroupIds.length}` : undefined;
  return [geometry.status, group, block, insert, linked, candidates].filter(Boolean).join("; ");
}

function reasonSummary(reasons: readonly string[]): string {
  return reasons.slice(0, 4).join("; ");
}

export function exportSemanticQaReportMarkdown(report: SemanticQaReport): string {
  const lines = [
    "# Kairo Semantic QA Report",
    "",
    `Source: ${report.source}`,
    "",
    "Status: **manual visual review pending**",
    "",
    "## Layout Summary",
    "",
    `- Text labels: ${report.counts.textLabels}`,
    `- Detected semantic labels: ${report.counts.detectedSemanticLabels}`,
    `- Stations: ${report.counts.stations}`,
    `- Devices: ${report.counts.devices}`,
    `- Unknown/unclassified labels: ${report.counts.unknownLabels}`,
    `- Duplicate labels: ${report.counts.duplicateLabels}`,
    `- Required Scott labels found: ${report.counts.requiredLabelsFound}/${report.requiredLabels.length}`,
    `- Missing/uncertain items: ${report.counts.uncertainLabels}`,
    "",
    "## Required Scott Label Checklist",
    "",
    markdownRow([
      "Label",
      "Expected meaning",
      "Expected type",
      "Found",
      "Detected type",
      "Station",
      "Confidence",
      "Geometry/entity/block",
      "Confidence/reason",
      "Classification correct",
      "Manual status",
      "Reviewer notes"
    ]),
    "|---|---|---|---|---|---|---:|---|---|---|---|---|",
    ...report.requiredLabels.map((row) =>
      markdownRow([
        row.label,
        row.expectedMeaning,
        row.expectedKind,
        row.found ? "yes" : "no",
        row.actualKind ?? "-",
        row.stationId ?? "-",
        row.confidence?.toFixed(2) ?? "-",
        geometrySummary(row.geometry),
        reasonSummary(row.reason),
        row.classificationCorrect ? "yes" : "no",
        "pending",
        ""
      ])
    ),
    "",
    "## Detected Semantic Labels",
    "",
    markdownRow([
      "Label",
      "Semantic row",
      "Detected type",
      "Station",
      "Confidence",
      "Source text ids",
      "Geometry/entity/block",
      "Confidence/reason"
    ]),
    "|---|---|---|---|---:|---|---|---|",
    ...report.detectedLabels.map((row) =>
      markdownRow([
        row.label,
        row.labelType,
        row.detectedType,
        row.stationId ?? "-",
        row.confidence?.toFixed(2) ?? "-",
        row.sourceTextEntityIds.join("; "),
        geometrySummary(row.geometry),
        reasonSummary(row.reason)
      ])
    ),
    "",
    "## Missing / Uncertain Items",
    "",
    markdownRow(["Label", "Issue", "Detected type", "Station", "Confidence", "Geometry/entity/block", "Reason"]),
    "|---|---|---|---|---:|---|---|",
    ...(report.uncertainLabels.length > 0
      ? report.uncertainLabels.map((row) =>
          markdownRow([
            row.label,
            row.issue,
            row.detectedType,
            row.stationId ?? "-",
            row.confidence?.toFixed(2) ?? "-",
            geometrySummary(row.geometry),
            reasonSummary(row.reason)
          ])
        )
      : [markdownRow(["none", "-", "-", "-", "-", "-", "-"])]),
    "",
    "## Unknown / Unclassified Labels",
    "",
    markdownRow(["Label", "Source text ids"]),
    "|---|---|",
    ...(report.unknownLabels.length > 0
      ? report.unknownLabels.map((row) => markdownRow([row.label, row.sourceTextEntityIds.join("; ")]))
      : [markdownRow(["none", "-"])]),
    "",
    "## Duplicate Labels",
    "",
    markdownRow(["Normalized label", "Count", "Source text ids", "Raw labels"]),
    "|---|---:|---|---|",
    ...(report.duplicateLabels.length > 0
      ? report.duplicateLabels.map((row) =>
          markdownRow([row.normalizedLabel, row.count, row.sourceTextEntityIds.join("; "), row.rawLabels.join("; ")])
        )
      : [markdownRow(["none", 0, "-", "-"])]),
    "",
    "## Manual Review Status",
    "",
    "- [ ] Required Scott labels visually checked in the viewer.",
    "- [ ] Associated geometry/entity/block references checked against the drawing.",
    "- [ ] Unknown and duplicate labels reviewed.",
    "- [ ] False positives, false negatives, and bad associations recorded.",
    "",
    "ISSUE-019 remains manual-review pending until George records visual QA evidence. This report is deterministic review input, not persisted project truth.",
    ""
  ];

  return `${lines.join("\n")}\n`;
}

export function exportSemanticQaReportJson(report: SemanticQaReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
