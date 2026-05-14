# Kairo Package QA

This report verifies that a `.kairo` package can be created, read back, validated, and compared to the source scene by machine-checkable counts.

Manual browser open/drop confirmation is still pending.

## Result

- Machine QA: PASS
- Source path mode: redacted
- Package bytes: 9835317
- Original validation: 0 errors, 0 warnings, 0 infos
- Packaged validation: 0 errors, 0 warnings, 0 infos
- Counts match: true
- Local source paths in packaged scene: 0
- Package geometry entries: 28

## Fingerprint

| Metric | Original | Packaged |
|---|---:|---:|
| rootName | DSP-B-01-7B-0001-24MY-P736-PRO-IMPBASE_20260504_DXF2013.dxf | DSP-B-01-7B-0001-24MY-P736-PRO-IMPBASE_20260504_DXF2013.dxf |
| units | millimeter | millimeter |
| nodeCount | 29 | 29 |
| geometryDocumentCount | 28 | 28 |
| geometryCount | 28 | 28 |
| entityCount | 246045 | 246045 |
| lineCount | 191577 | 191577 |
| polylineCount | 43641 | 43641 |
| circleCount | 1035 | 1035 |
| arcCount | 8700 | 8700 |
| textCount | 1092 | 1092 |
| layerCount | 160 | 160 |
| materialCount | 0 | 0 |
| sourceMapRows | 246046 | 246046 |

## Notes

- The package is a ZIP-backed `.kairo` neutral scene package.
- Redacted source path mode keeps source file names and removes local directory paths.
- This does not embed semantic review JSON in the package.
- This does not prove visual correctness; use the viewer for final browser confirmation.
