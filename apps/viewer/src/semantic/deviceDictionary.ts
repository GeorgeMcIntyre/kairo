export type DeviceKind =
  | "robot_controller"
  | "pdp_panel"
  | "base_plate"
  | "material_handling_robot_or_tooling"
  | "robot_model"
  | "rivet_process"
  | "lift_tilt"
  | "fence"
  | "cable_tray"
  | "service_drop"
  | "device_number"
  | "dunnage"
  | "nest"
  | "station_device_tag";

export const DEVICE_KINDS: readonly DeviceKind[] = [
  "robot_controller",
  "pdp_panel",
  "base_plate",
  "material_handling_robot_or_tooling",
  "robot_model",
  "rivet_process",
  "lift_tilt",
  "fence",
  "cable_tray",
  "service_drop",
  "device_number",
  "dunnage",
  "nest",
  "station_device_tag"
];

export type DeviceDictionaryMatch = {
  kind: DeviceKind;
  confidence: number;
  evidence: string[];
  parentStationId?: string;
  tagSuffix?: string;
};

export type ParsedStationDeviceTag = {
  parentStationId: string;
  suffix: string;
  kind: "device_number" | "dunnage" | "nest" | "station_device_tag";
};

export function normalizeDeviceText(text: string): string {
  return text
    .replace(/\\P/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function match(kind: DeviceKind, confidence: number, evidence: string[]): DeviceDictionaryMatch {
  return { kind, confidence, evidence };
}

const STATION_DEVICE_TAG_PATTERN = /^([A-Z0-9]+-\d{3}[LR])-(.+)$/i;

export function parseStationDeviceTag(text: string): ParsedStationDeviceTag | undefined {
  const normalized = normalizeDeviceText(text);
  const tagMatch = normalized.match(STATION_DEVICE_TAG_PATTERN);
  if (!tagMatch) return undefined;

  const suffix = tagMatch[2];
  if (/^\d+$/.test(suffix)) {
    return { parentStationId: tagMatch[1], suffix, kind: "device_number" };
  }

  if (/^DN\d+$/i.test(suffix)) {
    return { parentStationId: tagMatch[1], suffix, kind: "dunnage" };
  }

  if (/^\d+N$/i.test(suffix)) {
    return { parentStationId: tagMatch[1], suffix, kind: "nest" };
  }

  return { parentStationId: tagMatch[1], suffix, kind: "station_device_tag" };
}

export function parseDeviceText(text: string): DeviceDictionaryMatch | undefined {
  const normalized = normalizeDeviceText(text);
  if (!normalized) return undefined;

  const stationDeviceTag = parseStationDeviceTag(normalized);
  if (stationDeviceTag) {
    return {
      kind: stationDeviceTag.kind,
      confidence: stationDeviceTag.kind === "station_device_tag" ? 0.7 : 0.88,
      evidence: [`parent station ${stationDeviceTag.parentStationId}`, `suffix ${stationDeviceTag.suffix}`],
      parentStationId: stationDeviceTag.parentStationId,
      tagSuffix: stationDeviceTag.suffix
    };
  }

  if (/\bROBOT\s+CONTROLLER\b/.test(normalized)) {
    return match("robot_controller", 0.94, ["ROBOT CONTROLLER"]);
  }

  if (/\bPDP\b/.test(normalized) && /\b(PANEL|400A)\b/.test(normalized)) {
    return match("pdp_panel", 0.92, ["PDP", "PANEL/400A"]);
  }

  if (/\bROBOT\s+PDP\b/.test(normalized)) {
    return match("pdp_panel", 0.82, ["ROBOT PDP"]);
  }

  if (/\bPANEL\s+400A\b/.test(normalized)) {
    return match("pdp_panel", 0.78, ["PANEL 400A"]);
  }

  if (/\bPDP\b/.test(normalized)) {
    return match("pdp_panel", 0.74, ["PDP"]);
  }

  if (/\bBASE\s+PLATE\b/.test(normalized)) {
    return match("base_plate", 0.9, ["BASE PLATE"]);
  }

  if (/\bM\/H\b/.test(normalized) || /\bMATERIAL\s+HANDLING\b/.test(normalized)) {
    return match("material_handling_robot_or_tooling", 0.86, ["M/H or MATERIAL HANDLING"]);
  }

  if (/\bR-?2000I?C-?210[A-Z]?\b/.test(normalized)) {
    return match("robot_model", 0.9, ["R2000IC-210 series"]);
  }

  if (/\bLIFT\s*&\s*TILT\b/.test(normalized) || /\bLIFT\s+AND\s+TILT\b/.test(normalized)) {
    return match("lift_tilt", 0.88, ["LIFT & TILT"]);
  }

  if (/\bCABLE\s+TRAY\b/.test(normalized)) {
    return match("cable_tray", 0.86, ["CABLE TRAY"]);
  }

  if (/\bFENCE\s+PANEL\b/.test(normalized) || /\bFENCE\b/.test(normalized)) {
    return match("fence", 0.82, ["FENCE"]);
  }

  if (/\b(RESPOT|RIVET)\b/.test(normalized)) {
    return match("rivet_process", 0.8, ["RESPOT or RIVET"]);
  }

  if (/\bDROP\b/.test(normalized)) {
    return match("service_drop", 0.72, ["DROP"]);
  }

  return undefined;
}
