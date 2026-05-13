import { normalizeDeviceText, type DeviceKind } from "./deviceDictionary";
import type { DeviceSemantic, LayoutSemantics } from "./layoutSemantics";

export type ScottRequiredSemanticLabel = {
  label: string;
  expectedKind: DeviceKind;
  expectedStationId: string;
  reviewFocus: string;
};

export type SemanticQaRequiredLabelResult = ScottRequiredSemanticLabel & {
  found: boolean;
  deviceId?: string;
  actualKind?: DeviceKind;
  stationId?: string;
  confidence?: number;
  associationStatus?: DeviceSemantic["associationStatus"];
  associationConfidence?: number;
  linkedEntityCount?: number;
  candidateGroupIds: string[];
  riskMarkers: SemanticQaRiskMarker[];
};

export type SemanticQaRiskMarker =
  | "OK"
  | "REVIEW_REQUIRED"
  | "MISSING_REQUIRED_LABEL"
  | "LOW_CONFIDENCE"
  | "UNLINKED"
  | "AMBIGUOUS"
  | "KIND_MISMATCH"
  | "POSSIBLE_STATION_DEVICE_CONFUSION";

export type SemanticQaDeviceRow = {
  label: string;
  deviceId: string;
  kind: DeviceKind;
  stationId?: string;
  confidence: number;
  associationStatus: DeviceSemantic["associationStatus"];
  associationConfidence: number;
  linkedEntityCount: number;
  candidateGroupIds: string[];
  reason: string[];
  riskMarkers: SemanticQaRiskMarker[];
};

export type SemanticQaReport = {
  sourcePath?: string;
  status: "manual-review-pending";
  counts: {
    stations: number;
    devices: number;
    linkedDevices: number;
    ambiguousDevices: number;
    unlinkedDevices: number;
    unknownLabels: number;
    requiredLabelsFound: number;
    requiredLabelsMissing: number;
    riskItems: number;
  };
  requiredLabels: SemanticQaRequiredLabelResult[];
  devices: SemanticQaDeviceRow[];
  risks: Array<{
    label: string;
    deviceId?: string;
    risk: string;
    details: string;
  }>;
};

export const SCOTT_REQUIRED_SEMANTIC_LABELS: readonly ScottRequiredSemanticLabel[] = [
  {
    label: "7B-020L-04",
    expectedKind: "device_number",
    expectedStationId: "7B-020L",
    reviewFocus: "numeric station suffix should be treated as a device tag, not a station"
  },
  {
    label: "7B-070L-DN1",
    expectedKind: "dunnage",
    expectedStationId: "7B-070L",
    reviewFocus: "DN1 should classify as dunnage and link to nearby rack/dunnage geometry"
  },
  {
    label: "7B-070L-DN2",
    expectedKind: "dunnage",
    expectedStationId: "7B-070L",
    reviewFocus: "DN2 should classify as dunnage and link to nearby rack/dunnage geometry"
  },
  {
    label: "7B-060L-1N",
    expectedKind: "nest",
    expectedStationId: "7B-060L",
    reviewFocus: "1N should classify as nest and link to nearby nest/tooling geometry"
  }
] as const;

const LOW_CONFIDENCE_THRESHOLD = 0.55;

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

function sourceDescription(sourcePath: string | undefined): string {
  if (!sourcePath) return "current viewer scene";
  if (/^[A-Za-z]:[\\/]/.test(sourcePath) || sourcePath.includes("\\") || sourcePath.includes("/")) {
    return "local DXF source (path intentionally omitted)";
  }
  return sourcePath;
}

function deviceLabel(device: DeviceSemantic): string {
  return device.associationText ?? device.rawText ?? device.displayText ?? device.labelText;
}

function normalizedLabel(value: string | undefined): string {
  return normalizeDeviceText(value ?? "");
}

function deviceMatchesRequiredLabel(device: DeviceSemantic, requiredLabel: string): boolean {
  const expected = normalizedLabel(requiredLabel);
  return [
    device.associationText,
    device.labelText,
    device.rawText,
    device.displayText,
    device.normalizedText
  ].some((value) => normalizedLabel(value) === expected);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function deviceRiskMarkers(device: DeviceSemantic): SemanticQaRiskMarker[] {
  const markers: SemanticQaRiskMarker[] = [];
  if (device.associationStatus === "ambiguous") markers.push("AMBIGUOUS");
  if (device.associationStatus === "unlinked") markers.push("UNLINKED");
  if (device.confidence < LOW_CONFIDENCE_THRESHOLD) markers.push("LOW_CONFIDENCE");
  if (!device.stationId || device.linkedEntityIds.length === 0 || device.isLongText) markers.push("REVIEW_REQUIRED");
  if (device.kind === "station_device_tag") markers.push("POSSIBLE_STATION_DEVICE_CONFUSION");
  return markers.length > 0 ? unique(markers) as SemanticQaRiskMarker[] : ["OK"];
}

function requiredLabelRiskMarkers(
  required: ScottRequiredSemanticLabel,
  device: DeviceSemantic | undefined
): SemanticQaRiskMarker[] {
  if (!device) return ["MISSING_REQUIRED_LABEL"];
  const markers = deviceRiskMarkers(device).filter((marker) => marker !== "OK");
  if (device.kind !== required.expectedKind) {
    markers.push("KIND_MISMATCH");
    if (required.expectedKind === "device_number") markers.push("POSSIBLE_STATION_DEVICE_CONFUSION");
  }
  if (!device.stationId || device.stationId !== required.expectedStationId) markers.push("REVIEW_REQUIRED");
  return markers.length > 0 ? unique(markers) as SemanticQaRiskMarker[] : ["OK"];
}

function bestDeviceForRequiredLabel(semantics: LayoutSemantics, requiredLabel: string): DeviceSemantic | undefined {
  const matches = semantics.devices.filter((device) => deviceMatchesRequiredLabel(device, requiredLabel));
  return matches.sort(
    (left, right) =>
      right.confidence - left.confidence ||
      right.associationConfidence - left.associationConfidence ||
      right.linkedEntityIds.length - left.linkedEntityIds.length ||
      left.id.localeCompare(right.id)
  )[0];
}

function candidateIds(device: DeviceSemantic): string[] {
  return device.associationCandidates.map((candidate) => candidate.groupId);
}

function rowForDevice(device: DeviceSemantic): SemanticQaDeviceRow {
  return {
    label: deviceLabel(device),
    deviceId: device.id,
    kind: device.kind,
    stationId: device.stationId,
    confidence: device.confidence,
    associationStatus: device.associationStatus,
    associationConfidence: device.associationConfidence,
    linkedEntityCount: device.linkedEntityIds.length,
    candidateGroupIds: candidateIds(device),
    reason: unique([...device.evidence, ...device.associationReason]).slice(0, 8),
    riskMarkers: deviceRiskMarkers(device)
  };
}

export function buildScottSemanticQaReport(semantics: LayoutSemantics, sourcePath?: string): SemanticQaReport {
  const requiredLabels = SCOTT_REQUIRED_SEMANTIC_LABELS.map((required) => {
    const device = bestDeviceForRequiredLabel(semantics, required.label);
    return {
      ...required,
      found: Boolean(device),
      deviceId: device?.id,
      actualKind: device?.kind,
      stationId: device?.stationId,
      confidence: device?.confidence,
      associationStatus: device?.associationStatus,
      associationConfidence: device?.associationConfidence,
      linkedEntityCount: device?.linkedEntityIds.length,
      candidateGroupIds: device ? candidateIds(device) : [],
      riskMarkers: requiredLabelRiskMarkers(required, device)
    };
  });

  const devices = semantics.devices.map(rowForDevice).sort(
    (left, right) =>
      (left.stationId ?? "").localeCompare(right.stationId ?? "") ||
      left.label.localeCompare(right.label) ||
      left.deviceId.localeCompare(right.deviceId)
  );

  const risks = [
    ...requiredLabels.flatMap((entry) =>
      entry.riskMarkers
        .filter((risk) => risk !== "OK")
        .map((risk) => ({
        label: entry.label,
        deviceId: entry.deviceId,
        risk,
        details: entry.reviewFocus
      }))
    ),
    ...devices.flatMap((device) =>
      device.riskMarkers
        .filter((risk) => risk !== "OK")
        .map((risk) => ({
        label: device.label,
        deviceId: device.deviceId,
        risk,
        details: `${device.associationStatus} / confidence ${device.confidence.toFixed(2)} / linked ${device.linkedEntityCount}`
      }))
    )
  ];

  return {
    sourcePath,
    status: "manual-review-pending",
    counts: {
      stations: semantics.stations.length,
      devices: semantics.devices.length,
      linkedDevices: semantics.devices.filter((device) => device.associationStatus === "linked").length,
      ambiguousDevices: semantics.devices.filter((device) => device.associationStatus === "ambiguous").length,
      unlinkedDevices: semantics.devices.filter((device) => device.associationStatus === "unlinked").length,
      unknownLabels: semantics.unknownTextEntities.length,
      requiredLabelsFound: requiredLabels.filter((entry) => entry.found).length,
      requiredLabelsMissing: requiredLabels.filter((entry) => !entry.found).length,
      riskItems: risks.length
    },
    requiredLabels,
    devices,
    risks
  };
}

export function exportScottSemanticQaMarkdown(report: SemanticQaReport): string {
  const requiredRows = report.requiredLabels.map((entry) =>
    markdownRow([
      entry.label,
      entry.expectedKind,
      entry.expectedStationId,
      entry.found ? "yes" : "no",
      entry.actualKind ?? "-",
      entry.stationId ?? "-",
      entry.confidence?.toFixed(2) ?? "-",
      entry.associationStatus ? `${entry.associationStatus} (${entry.associationConfidence?.toFixed(2) ?? "-"})` : "-",
      entry.linkedEntityCount ?? 0,
      entry.candidateGroupIds.join("; "),
      entry.riskMarkers.join("; "),
      "",
      ""
    ])
  );

  const deviceRows = report.devices.map((device) =>
    markdownRow([
      device.label,
      device.kind,
      device.stationId ?? "-",
      device.confidence.toFixed(2),
      `${device.associationStatus} (${device.associationConfidence.toFixed(2)})`,
      device.linkedEntityCount,
      device.candidateGroupIds.join("; "),
      device.riskMarkers.join("; "),
      device.reason.join("; "),
      "",
      ""
    ])
  );

  const riskRows = report.risks.map((risk) =>
    markdownRow([risk.risk, risk.label, risk.deviceId ?? "-", risk.details, "", ""])
  );

  const lines = [
    "# Scott Semantic QA Report",
    "",
    `Source: ${sourceDescription(report.sourcePath)}`,
    "",
    `Status: **manual visual QA pending**`,
    "",
    "## Counts",
    "",
    `- Stations: ${report.counts.stations}`,
    `- Devices: ${report.counts.devices}`,
    `- Linked devices: ${report.counts.linkedDevices}`,
    `- Ambiguous devices: ${report.counts.ambiguousDevices}`,
    `- Unlinked devices: ${report.counts.unlinkedDevices}`,
    `- Unknown labels: ${report.counts.unknownLabels}`,
    `- Required labels found: ${report.counts.requiredLabelsFound}/${report.requiredLabels.length}`,
    `- Risk items: ${report.counts.riskItems}`,
    "",
    "## Required Label Checks",
    "",
    markdownRow([
      "Label",
      "Expected type",
      "Expected station",
      "Found",
      "Actual type",
      "Station",
      "Confidence",
      "Association",
      "Linked entities",
      "Candidate groups",
      "Automated risks",
      "Reviewer result",
      "Reviewer notes"
    ]),
    "|---|---|---|---|---|---|---:|---|---:|---|---|---|---|",
    ...requiredRows,
    "",
    "## Risk Review Queue",
    "",
    markdownRow(["Risk", "Label", "Device id", "Details", "Reviewer result", "Reviewer notes"]),
    "|---|---|---|---|---|---|",
    ...(riskRows.length > 0 ? riskRows : [markdownRow(["none", "-", "-", "No automated risk items.", "", ""])]),
    "",
    "## Device Association Review",
    "",
    markdownRow([
      "Label",
      "Type",
      "Station",
      "Confidence",
      "Association",
      "Linked entities",
      "Candidate groups",
      "Automated risks",
      "Evidence",
      "Reviewer result",
      "Reviewer notes"
    ]),
    "|---|---|---|---:|---|---:|---|---|---|---|---|",
    ...deviceRows,
    "",
    "## Reviewer Signoff",
    "",
    "- [ ] Required labels are visible in the viewer.",
    "- [ ] Required labels classify as the expected device/nest/dunnage type.",
    "- [ ] Linked geometry visually matches the intended device or support item.",
    "- [ ] Ambiguous and unlinked rows have reviewer notes.",
    "- [ ] JSON/Markdown/advanced layout exports are useful for concept quote layout review.",
    "",
    "## Known Limits",
    "",
    "- This report is generated from heuristic semantic associations, not authoritative CAD ownership.",
    "- Manual overrides are session-only until ISSUE-018 adds persistence.",
    "- Linked entity counts can identify candidate geometry volume but cannot prove visual correctness.",
    "- `REVIEW_REQUIRED` means a human must inspect the viewer before using the row as quote evidence.",
    ""
  ];

  return `${lines.join("\n")}\n`;
}
