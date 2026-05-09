# DXF Import Investigation

Phase 8 is investigation only. This document defines a future minimal DXF importer direction without adding parser dependencies or importer behavior.

Phase 9 implementation note: the first importer slice now uses `@dxfjs/parser` in `packages/importer-dxf`. It imports `LINE`, `LWPOLYLINE`, `CIRCLE`, `ARC`, and `LAYER`; writes exploded Kairo scene folders; and exposes `kairo import-dxf <input.dxf> <output-dir>` through the CLI. `INSERT` is detected and warned as unsupported. Full block expansion, hatches, dimensions, text geometry, splines, DXF export, and DWG support remain out of scope.

## Current Repo Fit

The repo already has the right boundaries for a first importer:

- `packages/schema`: owns the Kairo JSON contract.
- `packages/validator`: owns semantic validation and stable validation codes.
- `packages/core`: owns shared scene helpers.
- `packages/importer-dxf`: currently a future package boundary and the right home for DXF import work.
- `packages/cli`: can later expose `kairo import-dxf`, but should call importer APIs rather than embed parsing logic.

No new schema is required for the first importer investigation. The existing `curve-set` geometry can represent lines, polylines, circles, and arcs, and `source-map.json` can preserve DXF file/entity provenance.

## A. Supported First-Slice DXF Scope

The first importer should be intentionally narrow:

- `LINE`: map to a Kairo `line` drawing entity.
- `LWPOLYLINE`: map to a Kairo `polyline`; preserve closed flag where available.
- `POLYLINE`: support simple 2D/3D vertex polylines if the selected parser exposes vertices plainly; otherwise report unsupported in the import report.
- `CIRCLE`: map to a Kairo `circle`.
- `ARC`: map to a Kairo `arc` with center, radius, start angle, and end angle.
- `LAYER`: map DXF layers to `layers.json`.
- Basic colors: map AutoCAD color index or true color to layer/entity color where exposed.
- Basic units: read header units when available, most likely `$INSUNITS`, and map to manifest units when confident.
- `INSERT` and `BLOCK`: investigate only. Do not implement block explosion in the first importer unless the parser gives a simple, deterministic block reference model.

The importer should support ASCII DXF first. Binary DXF should fail clearly unless the selected parser explicitly supports it.

## B. Explicitly Out Of Scope For First Importer

- Full AutoCAD fidelity.
- Hatches.
- Dimensions.
- Text and MTEXT, except possibly as simple metadata in a later slice.
- Splines and NURBS.
- Paper space and layout fidelity.
- Advanced line types.
- Full block explosion if transform nesting, attributes, or nested inserts become complex.
- DWG support. DWG must be converted to DXF before entering this importer.
- Rendering fidelity beyond preserving supported entity geometry and engineering references.

Unsupported entities must be listed in an import report. They must not be silently dropped.

## C. Proposed Kairo Mapping

### Layers

DXF `LAYER` table entries should become Kairo layer records:

- `id`: deterministic slug such as `dxf-layer-<normalized-name>` or a stable hash if names collide.
- `name`: original DXF layer name.
- `color`: layer color if available.
- `visible`: false only if DXF layer state is clearly off/frozen; otherwise true.
- `metadata`: optional DXF flags, raw color index, or line type name.

Every supported entity should carry its Kairo `layerId`.

### Source Map

DXF entity handles should become source map refs:

- `id`: deterministic value such as `src-dxf-<handle>` when a handle exists, otherwise `src-dxf-entity-<stable-index>`.
- `path`: original DXF input path.
- `format`: `DXF`.
- `entityType`: DXF entity type, for example `LINE`.
- `entityId`: DXF handle when available.
- `note`: importer warning context if useful.

Every imported entity should have a stable `sourceRef` where possible. If an entity has no handle, the importer must use a deterministic fallback derived from parse order and file identity.

### Geometry

Supported DXF entities should produce one or more Kairo `curve-set` geometry documents. Recommended first layout:

- One root scene node for the DXF file.
- One child node per DXF layer.
- One `curve-set` geometry per layer, containing supported entities for that layer.

Entity mapping:

- `LINE`: Kairo `line` with `start` and `end`.
- `LWPOLYLINE`: Kairo `polyline`; keep vertex order and closed flag.
- `POLYLINE`: Kairo `polyline` only for simple vertex polylines.
- `CIRCLE`: Kairo `circle`.
- `ARC`: Kairo `arc`.
- Unknown or unsupported entity: import report warning, no geometry.

Do not convert curves to mesh in the importer. Mesh conversion, tessellation, or display sampling belongs in viewer/exporter logic.

### Blocks And Inserts

`BLOCK` and `INSERT` should be handled in a later slice after explicit test files exist. Proposed strategy:

- Treat block definitions as reusable source structures, not top-level scene nodes by default.
- Treat each `INSERT` as a Kairo node with a local transform derived from insertion point, rotation, and scale.
- If block explosion is implemented, children inherit transformed geometry references or expanded geometry with source refs back to both the insert and original block entities.
- Nested inserts must have cycle protection and deterministic depth limits.

First importer recommendation: detect and report `INSERT`/`BLOCK` counts, preserve them in the import report, and do not silently drop them.

### Units

Use DXF header units when confidently available:

- `$INSUNITS` should map to Kairo manifest units when it is one of the Kairo-supported units.
- Unknown or unitless DXF should default to `millimeter` only if the importer option says so; otherwise require an option or emit a warning.
- Preserve the raw unit code in manifest/source metadata.

Potential schema gap: manifest currently supports `units` and source notes, but not structured raw source header metadata. This can be handled initially in node/package metadata or source-map notes; defer schema changes until importer tests prove a real need.

### Colors And Materials

First importer color mapping should stay basic:

- Layer color becomes Kairo layer color.
- Entity true color, if present, becomes entity color.
- AutoCAD color index can be mapped through a known ACI table.
- Materials are optional for curve-only imports; do not fabricate rich materials.

## D. Library Investigation

Research date: 2026-05-09.

| Package | Maintenance Risk | Supported Entities | TypeScript Friendliness | Suitability | Risks |
| --- | --- | --- | --- | --- | --- |
| `dxf` | Low to medium. npm shows version `5.3.1`, modified 2025-09-01, MIT. | npm README says important geometric entities are supported, but notes MTEXT, DIMENSION, and STYLE gaps. It is oriented toward parser plus SVG output. | No `types` field surfaced by `npm view`; likely needs type inspection or local wrapper types. | Good practical first candidate if raw entity data is accessible before SVG conversion. | Could bias toward rendering output rather than source-preserving entity mapping. Must verify handles, layers, arcs, and blocks survive parse output. |
| `@dxfjs/parser` | Medium to high. npm shows version `0.3.2`, modified 2023-09-29, MIT, low package activity. | README lists HEADER, CLASSES, TABLES, BLOCKS, ENTITIES, and entities including ARC, CIRCLE, INSERT, LINE, LWPOLYLINE, POLYLINE, SPLINE, and TEXT; OBJECTS is not complete. | Built-in declarations via `./lib/index.d.ts`. | Strong shape match for first importer because it exposes parsed DXF objects rather than a rendering product. | Smaller project and older publish date. Must validate output quality against real DXFs before adopting. |
| `dxf-parser` | High. npm shows version `1.1.2`, modified 2022-06-16, MIT. | Historically popular for readable JS object output; likely covers common entities. | Has declarations via `./dist/index.d.ts`. | Possible fallback or comparison parser. | Maintenance appears inactive. Avoid depending on it without a compatibility wrapper and golden tests. |
| `@jscad/dxf-deserializer` | Medium. npm showed newer activity, MIT, and the package docs list clear entity conversion behavior. | Docs list ARC, CIRCLE, LINE, LWPOLYLINE, POLYLINE variants, MESH, 3DFACE, ELLIPSE, and color conversion. | JS-first JSCAD API, not obviously a DXF AST API. | Useful reference or fallback for geometry conversion, but not ideal for preserving engineering metadata/source refs. | Converts to JSCAD geometry/scripts, which may lose DXF handles, layers, or exact entity provenance. |
| `@mlightcad/libredwg-web` | High for this repo. GPL-3.0, WebAssembly/native lineage, broader DWG/DXF goal. | Based on LibreDWG and can parse DWG/DXF in browser and Node contexts. | TypeScript surface exists but codebase is mostly C/WASM. | Not recommended for first importer. | GPL license, heavier runtime, DWG temptation, and scope creep risk. |

Recommendation outcome: `@dxfjs/parser` was selected for the first implementation slice because it exposes typed parsed entities, handles, layers, tables, header data, and inserts directly enough for deterministic source mapping. Keep `dxf` as a fallback candidate if broader real-world fixtures expose parser gaps.

Sources reviewed:

- `dxf` npm package: https://www.npmjs.com/package/dxf
- `@dxfjs/parser` npm package: https://www.npmjs.com/package/@dxfjs/parser
- `@jscad/dxf-deserializer` package docs: https://npm.io/package/%40jscad/dxf-deserializer
- `@mlightcad/libredwg-web` repository: https://github.com/mlightcad/libredwg-web

## E. Minimal Importer Design Proposal

Use the existing package boundary:

```text
packages/importer-dxf/
```

Proposed public API:

```ts
type DxfImportOptions = {
  defaultUnits?: "millimeter" | "centimeter" | "meter" | "inch" | "foot";
  includeUnsupportedReport?: boolean;
  sourcePath?: string;
};

type DxfImportReport = {
  supportedEntityCount: number;
  unsupportedEntityCount: number;
  layersFound: string[];
  warnings: Array<{
    code: string;
    message: string;
    entityType?: string;
    handle?: string;
  }>;
  skippedEntities: Array<{
    entityType: string;
    handle?: string;
    reason: string;
  }>;
};

type DxfImportResult = {
  scenePackage: ScenePackage;
  report: DxfImportReport;
};

async function importDxfToKairo(inputPath: string, options?: DxfImportOptions): Promise<DxfImportResult>;
```

Output should be in-memory `ScenePackage` first. A later CLI command can write an exploded Kairo scene folder:

```bash
kairo import-dxf input.dxf output-scene/
```

Validation handoff:

- `importDxfToKairo` must produce a scene package that passes `validateScenePackage`.
- If validation fails, the importer should return or throw a controlled importer error that includes the validation report.
- Import reports are separate from validation reports. Import reports describe DXF coverage and skipped features; validation reports describe Kairo package correctness.

Source map requirement:

- Every imported entity should have a stable source ref when the parser exposes a handle.
- Entities without handles should use deterministic fallback ids.
- Unsupported entities should still appear in `skippedEntities` with source information where available.

## F. Test Strategy

Future importer tests should use tiny text DXF fixtures committed under the importer package. Required tests:

- Tiny DXF with one `LINE`.
- Multiple layers with entities on each layer.
- `LWPOLYLINE` closed and open shape.
- Simple `POLYLINE` if supported by the selected parser.
- `CIRCLE`.
- `ARC`.
- Unsupported entity warning, for example `HATCH` or `TEXT`.
- `BLOCK`/`INSERT` detection report without full implementation.
- Deterministic output: same input produces identical scene package and import report.
- Validator pass after import.
- Unit handling: known `$INSUNITS` maps correctly or warns deterministically.

Test assertions should cover:

- Kairo node ids.
- Layer ids and names.
- Geometry entity coordinates.
- Source map refs and original handles.
- Import report counts.
- Validation report pass/fail.

## G. Risk Assessment

- Units and scale risk: DXF files may be unitless, incorrectly tagged, or authored in local conventions. Require explicit default-unit behavior and preserve raw unit metadata.
- Block and insert complexity: nested inserts, non-uniform scale, rotation, attributes, and missing block definitions can quickly exceed first-slice scope.
- Layer semantics risk: layers may encode process meaning, visibility, construction geometry, or downstream manufacturing semantics. Preserve names and flags; do not collapse layers.
- Geometry fidelity risk: bulged polylines, arcs, ellipse approximations, and spline omission can change engineering meaning. Report unsupported or approximated features clearly.
- Parser library abandonment risk: several DXF packages are old or rendering-oriented. Wrap the selected parser behind a narrow internal adapter and keep fixtures parser-independent.
- Large-file performance risk: full-file AST parsers can consume significant memory. Avoid broad imports until streaming or filtering behavior is understood.
- DWG scope creep risk: DXF importer work must not become direct DWG parsing. DWG remains out of scope.

## First Importer Recommendation

Implement only `LINE`, `LWPOLYLINE`, `CIRCLE`, `ARC`, `LAYER`, basic color, basic units, and unsupported-entity reporting. Treat `POLYLINE` as conditional on parser clarity. Treat `BLOCK`/`INSERT` as detection/reporting first, not geometry expansion.

The first implementation should prove provenance and determinism before coverage: every supported entity should map to a Kairo entity with layer, source ref, stable id, and validator-clean output.
