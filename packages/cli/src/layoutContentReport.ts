import { computeRobustSceneBounds, flattenCurveEntities } from "@kairo/core";
import type { DxfBlockInsertInventory } from "@kairo/importer-dxf";
import type { DrawingEntity, ScenePackage, ValidationReport } from "@kairo/schema";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { computeLayoutSemantics } from "../../../apps/viewer/src/semantic/layoutSemantics";
import { buildSemanticSummary } from "../../../apps/viewer/src/semantic/semanticSummary";

export type LayoutContentCoveragePack = {
  markdown: string;
  csv: {
    "layers.csv": string;
    "labels.csv": string;
    "semantic-items.csv": string;
    "dxf-blocks.csv": string;
    "coverage-risks.csv": string;
  };
};

type LayerStats = {
  layerId: string;
  layerName: string;
  visible: boolean;
  entityCount: number;
  textCount: number;
  lineCount: number;
  polylineCount: number;
  circleCount: number;
  arcCount: number;
};

type RiskRow = {
  risk: string;
  severity: "info" | "warning" | "error";
  count: number;
  details: string;
};

function csvCell(value: unknown): string {
  const text = String(value ?? "").replace(/\r?\n/g, " ").trim();
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function csvRows(rows: readonly (readonly unknown[])[]): string {
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

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

function countBy<T extends string>(values: readonly T[]): Record<T, number> {
  const counts = {} as Record<T, number>;
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right))) as Record<T, number>;
}

function fixed(value: number | undefined, digits = 2): string {
  return Number.isFinite(value) ? value!.toFixed(digits) : "";
}

function fileNameOnly(filePath?: string): string {
  if (!filePath) return "source omitted";
  return path.basename(filePath);
}

function entityLayerId(entity: DrawingEntity, fallbackLayerId?: string) {
  return entity.layerId ?? fallbackLayerId ?? "none";
}

function layerStats(scenePackage: ScenePackage): LayerStats[] {
  const stats = new Map<string, LayerStats>();
  const layerNameById = new Map(scenePackage.layers.layers.map((layer) => [layer.id, layer.name]));

  for (const layer of scenePackage.layers.layers) {
    stats.set(layer.id, {
      layerId: layer.id,
      layerName: layer.name,
      visible: layer.visible,
      entityCount: 0,
      textCount: 0,
      lineCount: 0,
      polylineCount: 0,
      circleCount: 0,
      arcCount: 0
    });
  }

  for (const document of scenePackage.geometry) {
    for (const geometry of document.geometries) {
      if (geometry.kind !== "curve-set") continue;
      for (const entity of geometry.entities) {
        const layerId = entityLayerId(entity, geometry.layerId);
        const stat =
          stats.get(layerId) ??
          {
            layerId,
            layerName: layerNameById.get(layerId) ?? layerId,
            visible: true,
            entityCount: 0,
            textCount: 0,
            lineCount: 0,
            polylineCount: 0,
            circleCount: 0,
            arcCount: 0
          };
        stat.entityCount++;
        if (entity.type === "text") stat.textCount++;
        if (entity.type === "line") stat.lineCount++;
        if (entity.type === "polyline") stat.polylineCount++;
        if (entity.type === "circle") stat.circleCount++;
        if (entity.type === "arc") stat.arcCount++;
        stats.set(layerId, stat);
      }
    }
  }

  return [...stats.values()].sort((left, right) => left.layerName.localeCompare(right.layerName) || left.layerId.localeCompare(right.layerId));
}

function buildRisks(validationReport: ValidationReport, inventory: DxfBlockInsertInventory | undefined, semanticWarnings: readonly string[]): RiskRow[] {
  const rows: RiskRow[] = [];
  if (!validationReport.valid) {
    rows.push({
      risk: "VALIDATION_FAILED",
      severity: "error",
      count: validationReport.summary.errors,
      details: "The Kairo scene package did not validate."
    });
  }
  if (validationReport.summary.warnings > 0 || validationReport.summary.infos > 0) {
    rows.push({
      risk: "VALIDATION_FINDINGS",
      severity: "warning",
      count: validationReport.summary.warnings + validationReport.summary.infos,
      details: "Validation reported warnings or informational findings."
    });
  }
  if (inventory && !inventory.parser.ok) {
    rows.push({
      risk: "DXF_PARSE_FAILED",
      severity: "error",
      count: 1,
      details: inventory.parser.error?.message ?? "DXF parser failed."
    });
  }
  if (inventory?.missingBlockDefinitions.length) {
    rows.push({
      risk: "MISSING_BLOCK_DEFINITIONS",
      severity: "warning",
      count: inventory.missingBlockDefinitions.length,
      details: inventory.missingBlockDefinitions.slice(0, 10).join("; ")
    });
  }
  if (inventory && inventory.nestedInsertCountInsideBlocks > 0) {
    rows.push({
      risk: "NESTED_INSERTS_PRESENT",
      severity: "warning",
      count: inventory.nestedInsertCountInsideBlocks,
      details: "Nested INSERTs exist in source blocks and may need targeted import review."
    });
  }
  if (inventory && inventory.transformAudit.totalHardBlocked > 0) {
    rows.push({
      risk: "HARD_TRANSFORM_BLOCKED_INSERTS",
      severity: "warning",
      count: inventory.transformAudit.totalHardBlocked,
      details: "Some INSERTs have non-uniform or negative transforms that are not fully expanded."
    });
  }
  if (inventory?.textAudit.partialExpandTextSkipped.length) {
    rows.push({
      risk: "BLOCK_TEXT_SKIPPED",
      severity: "warning",
      count: inventory.textAudit.partialExpandTextSkipped.length,
      details: "Some partially expanded blocks contain text/attributes that were skipped."
    });
  }
  for (const warning of semanticWarnings) {
    rows.push({
      risk: "SEMANTIC_REVIEW_REQUIRED",
      severity: "warning",
      count: 1,
      details: warning
    });
  }
  if (rows.length === 0) {
    rows.push({
      risk: "NONE",
      severity: "info",
      count: 0,
      details: "No automated coverage risks were found."
    });
  }
  return rows.sort((left, right) => left.severity.localeCompare(right.severity) || left.risk.localeCompare(right.risk) || left.details.localeCompare(right.details));
}

export function buildLayoutContentCoveragePack(
  scenePackage: ScenePackage,
  validationReport: ValidationReport,
  inventory?: DxfBlockInsertInventory
): LayoutContentCoveragePack {
  const entities = flattenCurveEntities(scenePackage.geometry);
  const textEntities = entities.filter((entity): entity is Extract<DrawingEntity, { type: "text" }> => entity.type === "text");
  const robustBounds = computeRobustSceneBounds(entities);
  const semantics = computeLayoutSemantics(scenePackage, robustBounds);
  const semanticSummary = buildSemanticSummary(semantics);
  const layers = layerStats(scenePackage);
  const layerNameById = new Map(scenePackage.layers.layers.map((layer) => [layer.id, layer.name]));
  const entityTypes = countBy(entities.map((entity) => entity.type));
  const semanticByTextEntityId = new Map<
    string,
    { itemType: "station" | "device"; label: string; kind: string; confidence: number; associationStatus?: string }
  >();

  for (const station of semantics.stations) {
    for (const entityId of station.sourceTextEntityIds) {
      semanticByTextEntityId.set(entityId, {
        itemType: "station",
        label: station.stationId,
        kind: "station",
        confidence: station.confidence
      });
    }
  }
  for (const device of semantics.devices) {
    for (const entityId of device.sourceTextEntityIds) {
      semanticByTextEntityId.set(entityId, {
        itemType: "device",
        label: device.labelText,
        kind: device.kind,
        confidence: device.confidence,
        associationStatus: device.associationStatus
      });
    }
  }

  const risks = buildRisks(validationReport, inventory, semanticSummary.warnings);
  const sourceFileName = fileNameOnly(scenePackage.manifest.source.path);
  const rawDxfFileName = fileNameOnly(inventory?.filePath);

  const layersCsv = csvRows([
    ["layer_id", "layer_name", "visible", "entities", "text", "line", "polyline", "circle", "arc", "reviewer_result", "reviewer_notes"],
    ...layers.map((layer) => [
      layer.layerId,
      layer.layerName,
      layer.visible,
      layer.entityCount,
      layer.textCount,
      layer.lineCount,
      layer.polylineCount,
      layer.circleCount,
      layer.arcCount,
      "",
      ""
    ])
  ]);

  const labelsCsv = csvRows([
    [
      "entity_id",
      "label",
      "origin",
      "layer_name",
      "x",
      "y",
      "rotation_deg",
      "height",
      "semantic_item_type",
      "semantic_label",
      "semantic_kind",
      "confidence",
      "association_status",
      "reviewer_result",
      "reviewer_notes"
    ],
    ...textEntities
      .map((entity) => {
        const semantic = semanticByTextEntityId.get(entity.id);
        return [
          entity.id,
          entity.text,
          entity.origin,
          layerNameById.get(entity.layerId ?? "") ?? entity.layerId ?? "",
          fixed(entity.position[0]),
          fixed(entity.position[1]),
          fixed(entity.rotationDeg),
          fixed(entity.height),
          semantic?.itemType ?? "unclassified",
          semantic?.label ?? "",
          semantic?.kind ?? "",
          semantic ? fixed(semantic.confidence, 4) : "",
          semantic?.associationStatus ?? "",
          "",
          ""
        ];
      })
      .sort((left, right) => String(left[1]).localeCompare(String(right[1])) || String(left[0]).localeCompare(String(right[0])))
  ]);

  const semanticItemsCsv = csvRows([
    [
      "item_type",
      "id",
      "label",
      "kind",
      "station_id",
      "confidence",
      "association_status",
      "association_confidence",
      "linked_entity_count",
      "candidate_group_ids",
      "reviewer_result",
      "reviewer_notes"
    ],
    ...semantics.stations
      .map((station) => [
        "station",
        station.stationId,
        station.labelText,
        "station",
        station.stationId,
        fixed(station.confidence, 4),
        "",
        "",
        station.nearbyEntityIds.length,
        "",
        "",
        ""
      ])
      .sort((left, right) => String(left[1]).localeCompare(String(right[1]))),
    ...semanticSummary.devices
      .map((device) => [
        "device",
        device.deviceId,
        device.label,
        device.kind,
        device.stationId ?? "",
        fixed(device.confidence, 4),
        device.associationStatus,
        fixed(device.associationConfidence, 4),
        device.linkedEntityCount,
        device.candidateGroupIds.join(";"),
        "",
        ""
      ])
      .sort((left, right) => String(left[2]).localeCompare(String(right[2])) || String(left[1]).localeCompare(String(right[1])))
  ]);

  const dxfBlocksCsv = csvRows([
    ["block_name", "insert_count", "layers", "classification_counts", "entity_type_counts", "sample_handles", "reviewer_result", "reviewer_notes"],
    ...(inventory?.topInsertedBlockNames ?? []).map((block) => [
      block.blockName,
      block.insertCount,
      block.layerNames.join(";"),
      JSON.stringify(block.classificationCounts),
      JSON.stringify(block.blockDefinitionEntityTypeCounts),
      block.handleSamples.join(";"),
      "",
      ""
    ])
  ]);

  const coverageRisksCsv = csvRows([
    ["risk", "severity", "count", "details", "reviewer_result", "reviewer_notes"],
    ...risks.map((risk) => [risk.risk, risk.severity, risk.count, risk.details, "", ""])
  ]);

  const markdown = [
    "# Scott Layout Content Coverage",
    "",
    "This report is machine-generated from the staged Kairo scene and optional raw DXF audit. It is intended to help Scott review whether expected layout content is being found.",
    "",
    "**Manual visual geometry confirmation is still pending.**",
    "",
    "## Source",
    "",
    `- Scene source file: ${sourceFileName}`,
    `- Raw DXF audit file: ${rawDxfFileName}`,
    "- Local machine paths and timestamps are intentionally omitted.",
    "",
    "## Kairo Import Counts",
    "",
    `- Validation: ${validationReport.valid ? "pass" : "fail"} (${validationReport.summary.errors} errors, ${validationReport.summary.warnings} warnings, ${validationReport.summary.infos} infos)`,
    `- Geometry documents: ${scenePackage.geometry.length}`,
    `- Geometry entities: ${entities.length}`,
    `- Source-map rows: ${scenePackage.sourceMap.sources.length}`,
    `- Layers: ${scenePackage.layers.layers.length}`,
    `- Text labels: ${textEntities.length}`,
    `- Semantic stations: ${semanticSummary.counts.stations}`,
    `- Semantic devices/items: ${semanticSummary.counts.devices}`,
    `- Linked semantic items: ${semanticSummary.counts.linkedDevices}`,
    `- Ambiguous semantic items: ${semanticSummary.counts.ambiguousDevices}`,
    `- Unlinked semantic items: ${semanticSummary.counts.unlinkedDevices}`,
    "",
    "## Imported Entity Types",
    "",
    ...Object.entries(entityTypes).map(([type, count]) => `- ${type}: ${count}`),
    "",
    "## Raw DXF Audit Counts",
    "",
    inventory
      ? `- Parser ok: ${inventory.parser.ok}`
      : "- Raw DXF audit was not provided.",
    ...(inventory
      ? [
          `- DXF layers: ${inventory.layerCount}`,
          `- INSERT entities: ${inventory.totalInsertCount}`,
          `- Unique INSERT block names: ${inventory.uniqueInsertBlockNameCount}`,
          `- BLOCK definitions: ${inventory.blockDefinitionCount}`,
          `- Nested INSERTs inside blocks: ${inventory.nestedInsertCountInsideBlocks}`,
          `- TEXT: ${inventory.textAudit.totalTextCount}`,
          `- MTEXT: ${inventory.textAudit.totalMTextCount}`,
          `- ATTDEF: ${inventory.textAudit.totalAttdefCount}`,
          `- ATTRIB: ${inventory.textAudit.totalAttribCount}`,
          `- Hard-transform blocked INSERTs: ${inventory.transformAudit.totalHardBlocked}`
        ]
      : []),
    "",
    "## Semantic Device Types",
    "",
    ...Object.entries(semanticSummary.counts.byKind).map(([kind, count]) => `- ${kind}: ${count}`),
    Object.keys(semanticSummary.counts.byKind).length === 0 ? "- None" : "",
    "",
    "## Top Layers By Entity Count",
    "",
    markdownRow(["Layer", "Entities", "Text", "Line", "Polyline", "Circle", "Arc"]),
    "|---|---:|---:|---:|---:|---:|---:|",
    ...[...layers]
      .sort((left, right) => right.entityCount - left.entityCount || left.layerName.localeCompare(right.layerName))
      .slice(0, 20)
      .map((layer) => markdownRow([layer.layerName, layer.entityCount, layer.textCount, layer.lineCount, layer.polylineCount, layer.circleCount, layer.arcCount])),
    "",
    "## Coverage Risks",
    "",
    markdownRow(["Risk", "Severity", "Count", "Details", "Reviewer result", "Reviewer notes"]),
    "|---|---|---:|---|---|---|",
    ...risks.map((risk) => markdownRow([risk.risk, risk.severity, risk.count, risk.details, "", ""])),
    "",
    "## Files",
    "",
    "- `layers.csv`",
    "- `labels.csv`",
    "- `semantic-items.csv`",
    "- `dxf-blocks.csv`",
    "- `coverage-risks.csv`",
    ""
  ].join("\n");

  return {
    markdown,
    csv: {
      "layers.csv": layersCsv,
      "labels.csv": labelsCsv,
      "semantic-items.csv": semanticItemsCsv,
      "dxf-blocks.csv": dxfBlocksCsv,
      "coverage-risks.csv": coverageRisksCsv
    }
  };
}

export async function writeLayoutContentCoveragePack(pack: LayoutContentCoveragePack, outputDir: string): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(outputDir, "README.md"), pack.markdown),
    ...Object.entries(pack.csv).map(([fileName, content]) => writeFile(path.join(outputDir, fileName), content))
  ]);
}
