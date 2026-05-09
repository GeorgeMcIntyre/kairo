# Examples

`example-scene/` is the first exploded Kairo scene package. It is intentionally small and deterministic so the validator, tests, and viewer all exercise the same source.

The sample includes:

- `manifest.json` with units, axis system, format version, and source format notes.
- `scene.json` with a root assembly, a mesh part, and a drawing reference node.
- `geometry/` with one mesh geometry document and one curve-set document.
- `layers.json`, `materials.json`, and `source-map.json`.
- `validation-report.json`, generated from the current validator rules.

This is not a JT export sample and is not a DWG parser sample. It is a neutral scene package that preserves engineering meaning across future import and export paths.
