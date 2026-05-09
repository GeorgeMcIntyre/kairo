# Risk Assessment

## High Risk

- JT export: licensed Siemens C++ toolkit work is a later module, not part of this proof of concept.
- DWG direct parsing: direct DWG support is out of scope; use DWG to DXF first.
- Loss of engineering metadata: names, tree structure, transforms, source references, layers, and validation reports can be lost if importers flatten too early.
- Scope creep: the project can drift into a CAD replacement, DWG clone, or full JT exporter.
- Large file performance: real CAD assemblies can contain very large scene trees and geometry payloads.
- DXF unit ambiguity: many DXF files are unitless or inconsistently tagged.
- DXF block/insert complexity: nested inserts, transforms, attributes, and missing block definitions can expand scope quickly.
- DXF parser dependency risk: available TypeScript/Node parsers vary in maintenance, entity coverage, and metadata preservation.

## Controls

- Read-only proof of concept first.
- Schema validation for every internal package.
- Source mapping from nodes and geometry back to original files/entities.
- Import and export reports.
- Golden sample files under `examples/`.
- Invalid scene fixtures for validator regression coverage.
- Explicit version support: current supported format version is `0.1.0`.
- No silent data loss: unsupported features are reported clearly.
- Small vertical slices before broad format coverage.
- Keep JT export pencilled in as a later licensed Siemens toolkit module.
- Keep DXF importer scope limited to simple entities first and require unsupported-entity import reports.
- Wrap any future DXF parser behind a narrow adapter so parser replacement is possible.
- Keep the current DXF importer warning-driven for unsupported entities; do not expand unsupported geometry into approximate Kairo geometry without explicit tests.

## Current Scope Boundary

This repository currently proves the neutral middle layer, validator, sample package, and viewer. It does not attempt Siemens JT export, direct DWG parsing, full DXF coverage, database storage, auth, or cloud deployment.
