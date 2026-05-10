# Next Phase Recommendation

Last updated: 2026-05-10

---

## Current Position

Phase 10T-A complete. Visual QA via new `scene-outliers` CLI verified that post-Phase-10S transform pipeline is mathematically correct: top-6 outliers' centroids match raw block + insert math to within 1 mm. No transform bug. See `specs/PHASE_10T_VISUAL_QA_REPORT.md`.

Phase 10S complete. All 130 `DXF_BLOCK_INSERT_TRANSFORM_UNSUPPORTED` warnings resolved. Scott DXF2013 entity count: 142,393 → 244,953.

Warning breakdown (Scott DXF2013, post Phase 10S):
- DXF_BLOCK_PARTIAL_EXPAND: 550
- DXF_INSERT_Z_FLATTENED: 140
- DXF_INSERT_MIRROR_FLATTENED: 132
- DXF_POLYLINE_SPLINE_APPROXIMATED: 15
- DXF_BLOCK_INSERT_NESTED_UNSUPPORTED: 14
- DXF_BLOCK_INSERT_TRANSFORM_UNSUPPORTED: 0

---

## Recommended: Phase 10T-B — Text/ATTDEF Rendering

**Status: NEXT — ready to implement**

George reports the current viewer is missing all text labels visible in the
reference renderer (image 2): large station headers like `7B-070L RACK LOAD`
and small annotations like `7B-070L-DN1`. Phase 10O-A audit found:

- TEXT: 148 (all in block definitions)
- ATTDEF: 261 (all in block definitions)
- MTEXT: 0
- ATTRIB: 0

**Approach:** HTML overlay above the Three.js canvas. Avoids Three.js
TextGeometry (which would create thousands of mesh instances). 409 total
text items easily handled by browser DOM.

**Schema:** new `text` entity type with `text`, `position`, `rotationDeg`,
`height`, `layer`, `origin (TEXT|ATTDEF)`, `tag`, `sourceRef`.

**Importer:** extract direct TEXT entities; extract TEXT/ATTDEF inside block
definitions during INSERT expansion (apply `transformBlockPoint` for
position, mirror-aware rotation transform analogous to `transformArcAngles`).

**Viewer:** new `<SceneTextOverlay>` React component, screen-space projection
from world coords on each rAF, layer toggling via store, font-size clamped
4px–48px, items below threshold removed from DOM.

**Acceptance:** large station labels and small annotations visible in viewer
matching reference image (image 2); layer toggle hides text on hidden
layers; Scott DXF2013 import: 244,953 + ~409 text entities, validation
passes; bundle size growth < 30 KB.

See full plan in the previous /plan response (Track B section).

---

## Other Options (Lower Priority)

| Option | Unlocks | Risk |
|---|---|---|
| Depth-3+ nested INSERT expansion | 14 instances | Low value; depth guard exists for a reason |
| Non-uniform scale INSERT expansion | 0 in Scott DXF2013 | N/A for this file |
| TASK-004: CLI scene-stats command | Developer QA tooling | Low; reuses viewer logic |
| Hatch/dimension import | Unknown entities | Medium |
