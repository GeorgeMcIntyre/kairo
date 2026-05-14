import { computeRobustSceneBounds, flattenCurveEntities, type Bounds3 } from "@kairo/core";
import type { DeviceSemantic, LayoutSemantics } from "./layoutSemantics";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadPublicScenePackage } from "../sceneLoader";
import { computeLayoutSemantics, parseStationLabel } from "./layoutSemantics";
import { parseDeviceText, type DeviceKind } from "./deviceDictionary";
import { applySemanticDeviceOverrides } from "./semanticSummary";
import {
  buildScottSemanticQaReport,
  exportScottSemanticQaMarkdown,
  type SemanticQaRiskMarker
} from "./semanticQaReport";

const scottSceneName = "scott-dxf2013-import";
const scottSceneBasePath = `/scenes/${scottSceneName}`;
const scottSceneDir = path.resolve(process.cwd(), "apps/viewer/public/scenes", scottSceneName);
const emptyBounds: Bounds3 = { min: [0, 0, 0], max: [100, 100, 0] };

type FetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

function sceneAssetPath(url: string): string {
  const relative = url.replace(new RegExp(`^${scottSceneBasePath}/?`), "");
  return path.join(scottSceneDir, ...relative.split("/").map(decodeURIComponent));
}

async function fetchSceneAsset(url: string): Promise<FetchResponse> {
  const filePath = sceneAssetPath(url);
  if (!existsSync(filePath)) {
    return {
      ok: false,
      status: 404,
      json: async () => ({})
    };
  }

  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(await readFile(filePath, "utf8"))
  };
}

function labelResult(report: ReturnType<typeof buildScottSemanticQaReport>, label: string) {
  const entry = report.requiredLabels.find((candidate) => candidate.label === label);
  expect(entry, `missing required report row for ${label}`).toBeDefined();
  return entry!;
}

function assertRequiredLabel(
  report: ReturnType<typeof buildScottSemanticQaReport>,
  label: string,
  expectedKind: DeviceKind,
  expectedStationId: string
) {
  const entry = labelResult(report, label);
  expect(entry.found).toBe(true);
  expect(entry.actualKind).toBe(expectedKind);
  expect(entry.stationId).toBe(expectedStationId);
  expect(entry.confidence).toEqual(expect.any(Number));
  expect(entry.associationStatus).toMatch(/^(linked|ambiguous|unlinked)$/);
  expect(entry.associationConfidence).toEqual(expect.any(Number));
  expect(entry.linkedEntityCount).toEqual(expect.any(Number));
  expect(entry.candidateGroupIds).toEqual(expect.any(Array));
  expect(entry.riskMarkers.length).toBeGreaterThan(0);
  return entry;
}

function device(
  label: string,
  kind: DeviceKind,
  stationId: string | undefined,
  patch: Partial<DeviceSemantic> = {}
): DeviceSemantic {
  const associationStatus = patch.associationStatus ?? "linked";
  const linkedEntityIds = patch.linkedEntityIds ?? (associationStatus === "linked" ? [`entity-${label}`] : []);
  return {
    id: `device-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    kind,
    labelText: label,
    rawText: label,
    displayText: label,
    normalizedText: label,
    associationText: label,
    position: [0, 0, 0],
    rotationDeg: 0,
    height: 100,
    bounds: emptyBounds,
    centroid: [50, 50, 0],
    sourceTextEntityIds: [`text-${label}`],
    nearbyEntityIds: linkedEntityIds,
    linkedEntityIds,
    geometryGroupId: associationStatus === "linked" ? `group-${label}` : undefined,
    geometryGroupSource: associationStatus === "linked" ? "cluster" : undefined,
    stationId,
    stationAssociationMethod: stationId ? "station-id" : "none",
    tagSuffix: label.split("-").at(-1),
    confidence: 0.9,
    evidence: ["station-device suffix pattern"],
    associationStatus,
    associationConfidence: associationStatus === "linked" ? 0.86 : 0.32,
    associationReason: [associationStatus === "linked" ? "nearby geometry cluster" : "no nearby geometry group found"],
    associationCandidates: [
      {
        groupId: `group-${label}`,
        source: "cluster",
        entityIds: [`entity-${label}`],
        bounds: emptyBounds,
        centroid: [50, 50, 0],
        distanceToBounds: 120,
        distanceToCentroid: 180,
        confidence: 0.86,
        reason: ["nearby geometry cluster"]
      }
    ],
    ...patch
  };
}

function semantics(devices: DeviceSemantic[]): LayoutSemantics {
  return {
    textEntities: [],
    mergedTextLabels: [],
    geometryGroups: [],
    stations: [],
    devices,
    unknownTextEntities: []
  };
}

describe.skipIf(!existsSync(scottSceneDir))("Scott staged scene semantic machine QA", () => {
  it("loads the staged Scott scene and verifies required semantic QA labels without browser automation", async () => {
    const scenePackage = await loadPublicScenePackage(scottSceneBasePath, fetchSceneAsset);
    const robustBounds = computeRobustSceneBounds(flattenCurveEntities(scenePackage.geometry));
    const detectedSemantics = computeLayoutSemantics(scenePackage, robustBounds);
    const effectiveSemantics = applySemanticDeviceOverrides(detectedSemantics, {});
    const report = buildScottSemanticQaReport(effectiveSemantics, scenePackage.manifest.source.path);
    const markdown = exportScottSemanticQaMarkdown(report);
    const markdownAgain = exportScottSemanticQaMarkdown(report);

    expect(parseStationLabel("7B-020L-04")).toBeUndefined();
    expect(parseDeviceText("7B-020L-04")).toMatchObject({ kind: "device_number", parentStationId: "7B-020L" });
    expect(parseDeviceText("7B-070L-DN1")).toMatchObject({ kind: "dunnage", parentStationId: "7B-070L" });
    expect(parseDeviceText("7B-070L-DN2")).toMatchObject({ kind: "dunnage", parentStationId: "7B-070L" });
    expect(parseDeviceText("7B-060L-1N")).toMatchObject({ kind: "nest", parentStationId: "7B-060L" });

    const requiredResults = [
      assertRequiredLabel(report, "7B-020L-04", "device_number", "7B-020L"),
      assertRequiredLabel(report, "7B-070L-DN1", "dunnage", "7B-070L"),
      assertRequiredLabel(report, "7B-070L-DN2", "dunnage", "7B-070L"),
      assertRequiredLabel(report, "7B-060L-1N", "nest", "7B-060L")
    ];

    expect(report.counts.requiredLabelsFound).toBe(4);
    expect(report.counts.requiredLabelsMissing).toBe(0);
    expect(requiredResults.every((entry) => entry.linkedEntityCount !== undefined)).toBe(true);
    expect(requiredResults.every((entry) => entry.associationConfidence !== undefined)).toBe(true);
    expect(requiredResults.every((entry) => Array.isArray(entry.candidateGroupIds))).toBe(true);

    const robotBasePlate = effectiveSemantics.devices.find(
      (device) => device.labelText.replace(/\s+/g, " ").trim() === "7B-040L-03 (M/H) BASE PLATE"
    );
    expect(robotBasePlate).toMatchObject({
      kind: "device_number",
      stationId: "7B-040L",
      associationStatus: "linked",
      geometryGroupId: "insert-174bd-u36"
    });
    expect(robotBasePlate?.linkedEntityIds.length).toBeGreaterThan(0);
    expect(robotBasePlate?.associationReason.join(" ")).toContain("robot block ambiguity resolved");

    const robotBasePlateLabels = [
      "7B-040L-03 (M/H) BASE PLATE",
      "7B-050L-03 (M/H) BASE PLATE",
      "7B-060L-03 (M/H) BASE PLATE"
    ];
    for (const label of robotBasePlateLabels) {
      const device = effectiveSemantics.devices.find((candidate) => candidate.labelText.replace(/\s+/g, " ").trim() === label);
      expect(device, `missing robot base plate semantic ${label}`).toBeDefined();
      expect(device?.associationStatus).toBe("linked");
      expect(device?.geometryGroupId).toMatch(/-u36$/);
      expect(device?.geometryGroupId).not.toMatch(/controller/i);
      expect(device?.linkedEntityIds.length).toBeGreaterThan(0);
    }

    const robotControllerLabels = ["7B-040L-01", "7B-050L-01", "7B-060L-01"];
    for (const label of robotControllerLabels) {
      const device = effectiveSemantics.devices.find((candidate) => candidate.labelText.replace(/\s+/g, " ").trim() === label);
      expect(device, `missing robot controller semantic ${label}`).toBeDefined();
      expect(device).toMatchObject({
        kind: "robot_controller",
        associationStatus: "linked"
      });
      expect(device?.geometryGroupId).toMatch(/fanuc-henrob-controller/i);
      expect(device?.associationReason.join(" ")).toContain("robot controller block hint");
      expect(device?.evidence.join(" ")).toContain("geometry resolved device_number to robot_controller");
    }

    const linkedRobotModels = effectiveSemantics.devices.filter(
      (device) => device.kind === "robot_model" && device.associationStatus === "linked"
    );
    expect(linkedRobotModels.length).toBeGreaterThan(10);
    expect(linkedRobotModels.some((device) => /-u36$/.test(device.geometryGroupId ?? ""))).toBe(true);
    expect(linkedRobotModels.every((device) => !/controller/i.test(device.geometryGroupId ?? ""))).toBe(true);

    expect(markdown).toBe(markdownAgain);
    expect(markdown).toContain("Reviewer result");
    expect(markdown).toContain("Reviewer notes");
    expect(markdown).toContain("Automated risks");
    expect(markdown).toContain("manual visual QA pending");
    expect(markdown).toContain("local DXF source (path intentionally omitted)");
    expect(markdown).not.toContain(process.cwd());
    expect(markdown).not.toContain("C:\\Users\\");
    expect(markdown).not.toContain("Downloads\\ScottLayouts");
    expect(markdown).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  }, 240_000);
});

describe("Scott semantic QA report risk marker coverage", () => {
  it("keeps report risk markers deterministic for missing, ambiguous, unlinked, and low-confidence cases", () => {
    const report = buildScottSemanticQaReport(
      semantics([
        device("7B-020L-04", "device_number", "7B-020L", {
          associationStatus: "unlinked",
          confidence: 0.5,
          linkedEntityIds: [],
          nearbyEntityIds: [],
          associationCandidates: []
        }),
        device("7B-070L-DN1", "dunnage", "7B-070L", {
          associationStatus: "ambiguous",
          associationConfidence: 0.48,
          linkedEntityIds: [],
          associationReason: ["multiple nearby geometry groups scored similarly"]
        })
      ])
    );
    const riskMarkers = new Set<SemanticQaRiskMarker>(report.risks.map((risk) => risk.risk as SemanticQaRiskMarker));

    expect(labelResult(report, "7B-070L-DN2").riskMarkers).toContain("MISSING_REQUIRED_LABEL");
    expect(labelResult(report, "7B-020L-04").riskMarkers).toEqual(
      expect.arrayContaining(["UNLINKED", "LOW_CONFIDENCE", "REVIEW_REQUIRED"])
    );
    expect(labelResult(report, "7B-070L-DN1").riskMarkers).toEqual(
      expect.arrayContaining(["AMBIGUOUS", "REVIEW_REQUIRED"])
    );
    expect([...riskMarkers]).toEqual(
      expect.arrayContaining(["MISSING_REQUIRED_LABEL", "AMBIGUOUS", "UNLINKED", "LOW_CONFIDENCE"])
    );
    expect(exportScottSemanticQaMarkdown(report)).toBe(exportScottSemanticQaMarkdown(report));
  });
});
