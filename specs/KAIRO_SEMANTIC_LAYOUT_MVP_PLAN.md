# Kairo DXF-to-Semantic-Layout MVP Plan

Last updated: 2026-06-05

## Purpose

Turn the current DXF viewer and semantic QA work into a small Advanced Engineering layout-intelligence MVP. The MVP should import a real DXF, detect practical equipment/station objects, attach enough footprint metadata to validate a layout, and export reviewable BOM and QA data.

This is not an auto-layout engine yet. Do not start generative placement, detailed CAD editing, or persistence-heavy workflows until the review/export loop is trusted.

## Smallest MVP

The smallest useful MVP is:

1. Load a DXF or `.kairo` package into the viewer.
2. Detect stations and high-value equipment labels from text.
3. Associate each detected device to nearby DXF geometry or leave it explicitly uncertain.
4. Map detected device types to a small Kairo equipment library.
5. Compute a 2D footprint envelope, clearance envelope, and padding envelope for each mapped device.
6. Run simple layout validation rules against those envelopes.
7. Export deterministic QA, Advanced Engineering layout summary, and BOM-like rows for review.
8. Keep all uncertain items visible in export so George can correct the rules later.

Success means a coder can run tests, open the viewer, export QA/BOM data, and know exactly which labels/geometry still need manual review.

## Current Building Blocks

Already present:

- `packages/importer-dxf`: DXF import into neutral scene packages.
- `packages/schema`: neutral scene entities, including curve/text entities.
- `packages/core`: scene helpers and job layout-map coordinate metadata.
- `apps/viewer/src/semantic`: text extraction, station parsing, device classification, geometry association, semantic QA report.
- `apps/viewer/src/advancedEngineering`: line/station/device/annotation export model.
- Viewer export actions for semantic summary, semantic QA, and Advanced Engineering JSON/CSV/Markdown.

Keep the next implementation inside these boundaries unless a shared model clearly belongs in `packages/core`.

## Architecture

Target pipeline:

```text
DXF / .kairo package
  -> ScenePackage
  -> LayoutSemantics
  -> EquipmentMapping
  -> SemanticLayoutModel
  -> ValidationReport + BomRows + QA exports
```

Recommended package/module split for the next slices:

- `apps/viewer/src/semantic`: keep DXF text/geometry detection heuristics here for now.
- `apps/viewer/src/equipment`: add the first equipment library and mapping rules here first.
- `apps/viewer/src/layoutValidation`: add envelope and rule checks here first.
- `apps/viewer/src/advancedEngineering`: consume the semantic layout model for exports.
- Promote stable types/helpers to `packages/core` only after the data shape survives one review pass.

Do not add a database, server, solver, or new renderer for the MVP.

## Data Models

Keep models flat and export-friendly. IDs should be deterministic.

```ts
type EquipmentLibraryItem = {
  equipmentTypeId: string;
  displayName: string;
  deviceKinds: DeviceKind[];
  defaultBomCategory: "robot" | "dunnage" | "nest" | "panel" | "fence" | "tooling" | "unknown";
  footprint: FootprintSpec;
  clearance: ClearanceSpec;
  defaultPaddingMm: number;
  metadata: {
    vendor?: string;
    model?: string;
    requiresReview?: boolean;
  };
};

type FootprintSpec = {
  source: "geometry-bounds" | "library-default" | "manual";
  widthMm: number;
  depthMm: number;
  rotationDeg?: number;
};

type ClearanceSpec = {
  frontMm: number;
  rearMm: number;
  leftMm: number;
  rightMm: number;
  heightMm?: number;
  reason: string;
};

type SemanticLayoutDevice = {
  id: string;
  label: string;
  deviceKind: DeviceKind;
  equipmentTypeId?: string;
  stationId?: string;
  linkedEntityIds: string[];
  confidence: number;
  reviewStatus: "detected" | "needs-review" | "accepted" | "rejected";
  footprintBounds: Bounds3;
  clearanceBounds: Bounds3;
  paddedBounds: Bounds3;
  evidence: string[];
};

type LayoutValidationIssue = {
  id: string;
  severity: "info" | "warning" | "critical";
  ruleId: string;
  deviceIds: string[];
  entityIds: string[];
  message: string;
  suggestedAction: string;
};

type BomRow = {
  id: string;
  stationId?: string;
  equipmentTypeId?: string;
  deviceKind: DeviceKind;
  label: string;
  quantity: number;
  confidence: number;
  sourceDeviceIds: string[];
  reviewStatus: "ready" | "needs-review";
};
```

For the first implementation, these can live beside the viewer code. Avoid schema/package churn until the fields prove useful.

## DXF Import Scope

Use the current importer output. Do not expand DXF coverage just to satisfy semantic layout planning.

MVP assumptions:

- Text labels are the primary semantic source.
- Existing curve bounds are good enough for approximate footprints.
- Block insert provenance is preferred when present.
- Unimported hatches/dimensions/splines remain documented limitations.

Next DXF import work should only happen when QA shows a specific missing entity prevents footprint, clearance, or BOM review.

## Object Detection Scope

Detection remains conservative:

- Stations: station label parser.
- Robots: protected labels like `7B-020L-04`, robot labels/models/layer or block hints.
- Dunnage: `DN1`/`DN2` style station-device labels and dunnage layer/block hints.
- Nests: `1N` style station-device labels and nest/process tooling hints.
- Panels/support equipment: existing device dictionary terms.
- Unknown: anything not defensible.

Every detected object must carry:

- source text entity IDs
- linked entity IDs or candidate group IDs
- confidence
- evidence/reasons
- review status

No unlabeled-device inference in the MVP unless a rule is explicitly validated against the Scott layout.

## Kairo Equipment Library

Start with a tiny static library. The first goal is consistent metadata, not completeness.

Initial entries:

| Equipment type | Device kinds | Footprint source | Clearance default |
|---|---|---|---|
| `robot.generic` | `robot`, `robot_model`, `device_number` | geometry bounds, fallback 2500 x 2500 | 1000 mm all sides |
| `dunnage.station` | `dunnage` | geometry bounds, fallback 1800 x 1200 | 750 mm front, 500 mm others |
| `nest.station` | `nest` | geometry bounds, fallback 1500 x 1200 | 750 mm front, 500 mm others |
| `panel.electrical` | `pdp_panel`, `robot_controller` | geometry bounds, fallback 900 x 400 | 1000 mm front, 300 mm others |
| `fence.panel` | `fence` | geometry bounds | 100 mm padding |

Mapping rule:

```text
DeviceSemantic.kind -> EquipmentLibraryItem.deviceKinds
```

If multiple entries match, choose the most specific item and mark `requiresReview`.

## Footprint, Clearance, And Padding

MVP geometry should be 2D and axis-aligned in layout coordinates.

Definitions:

- Footprint: detected equipment occupied envelope.
- Clearance: working/service envelope around the footprint.
- Padding: small safety expansion used to avoid near-touch false negatives.

Implementation rules:

- Use linked geometry group bounds when association is `linked`.
- Use label bounds plus library fallback footprint when unlinked.
- For ambiguous devices, compute an envelope from the best candidate but mark `needs-review`.
- Expand clearance by side-specific library defaults.
- Expand padding uniformly by `defaultPaddingMm`.
- Record whether footprint came from geometry, library default, or manual override.

Do not implement rotated polygons yet. Axis-aligned bounding boxes are enough for the MVP and easier to test.

## Layout Validation Rules

First rules should be deterministic and explainable:

| Rule ID | Severity | Description |
|---|---|---|
| `DEVICE_UNLINKED_GEOMETRY` | warning | Device has no linked geometry and uses fallback footprint. |
| `DEVICE_AMBIGUOUS_GEOMETRY` | warning | Device has multiple plausible geometry groups. |
| `MISSING_EQUIPMENT_LIBRARY_MATCH` | warning | Device kind has no equipment library mapping. |
| `FOOTPRINT_OVERLAP` | critical | Two device footprints overlap beyond tolerance. |
| `CLEARANCE_OVERLAP` | warning | A clearance envelope overlaps another footprint. |
| `OUTSIDE_STATION_NEIGHBORHOOD` | info | Device with station ID is far outside station bounds or neighborhood. |
| `LOW_CONFIDENCE_BOM_ROW` | info | BOM row is exportable but needs review. |

The validation output should feed both the viewer diagnostics/export and tests. Avoid adding UI until exported issues are useful.

## BOM Extraction

MVP BOM rows are counts, not purchasing records.

Group by:

- station ID
- equipment type ID
- device kind
- normalized label when no equipment type exists

Each row should include:

- quantity
- confidence, as the minimum confidence of included devices
- source device IDs
- linked entity IDs, if useful for traceability
- review status: `ready` only when all source devices are linked and mapped

Do not add pricing, vendors, part numbers, or quote math yet.

## Future Auto-Layout Scoring

Auto-layout is future work. The MVP only prepares the scoring inputs.

Potential future scores:

- footprint overlap penalty
- clearance violation penalty
- station assignment penalty
- travel/path adjacency score
- preferred-side/orientation score
- move cost from imported DXF position
- manual lock penalty
- BOM completeness confidence

Do not implement placement search, dragging, annealing, genetic algorithms, or constraint solvers yet. When validation and BOM outputs are stable, scoring can start as a read-only score for the imported layout.

## Test Plan

Add tests before broadening heuristics:

1. Equipment library mapping:
   - `robot` maps to `robot.generic`
   - `dunnage` maps to `dunnage.station`
   - unknown kinds produce a review issue
2. Footprint envelopes:
   - linked geometry bounds become footprint
   - unlinked device uses library fallback
   - clearance and padding expand deterministically
3. Validation rules:
   - overlapping footprints produce `FOOTPRINT_OVERLAP`
   - clearance touching footprint produces `CLEARANCE_OVERLAP`
   - ambiguous/unlinked devices produce review warnings
4. BOM extraction:
   - devices group by station/equipment type
   - confidence is deterministic
   - rows are stable sorted output
5. Regression fixture:
   - protected P736 labels produce expected device kinds and BOM rows

Use synthetic scene/semantic fixtures first. Add Scott-layout golden expectations only after manual QA confirms the expected values.

## Next Implementation Steps

1. Add `apps/viewer/src/equipment/equipmentLibrary.ts` with static MVP entries and mapping tests. Done in `apps/viewer/src/equipment`.
2. Add envelope helpers for footprint, clearance, and padding using `Bounds3`. Done in `apps/viewer/src/equipment/equipmentEnvelope.ts`.
3. Add `apps/viewer/src/layoutValidation/layoutRules.ts` with the deterministic rules above. Done in `apps/viewer/src/layoutValidation/layoutRules.ts`.
4. Add `buildSemanticLayoutModel(scenePackage, layoutSemantics)` that joins devices to equipment metadata and validation issues.
5. Extend Advanced Engineering export with `bomRows`, `validationIssues`, and envelope source fields.
6. Add export tests for P736 labels: robot, dunnage, dunnage, nest.
7. Only then expose a viewer download/copy action if the JSON/Markdown is useful in tests.

## Non-Goals For This MVP

- No auto-placement or solver.
- No interactive move/push/space tools.
- No database or backend.
- No pricing or purchasing BOM.
- No authoritative CAD ownership claims.
- No broad DXF importer rewrite.
- No rotated polygon collision engine.
- No persistent reviewed overrides until the export shape is proven.

## Done Criteria

The MVP planning slice is done when:

- This plan is committed and linked from current planning docs.
- The next coder can identify the first three implementation files to create.
- The data model and test plan cover DXF import, object detection, equipment library, footprints/clearances/padding, layout validation, BOM extraction, and future auto-layout scoring without overbuilding.
