# @kairo/importer-dxf

Minimal DXF importer for Kairo.

Implemented first-slice scope:

- `LINE`
- `LWPOLYLINE`
- `CIRCLE`
- `ARC`
- `LAYER`
- basic AutoCAD color index mapping to layer colors
- `$INSUNITS` mapping where supported
- deterministic warnings for unsupported parsed entities
- `INSERT` detection with a block/insert unsupported warning

Public API:

```ts
import { importDxfToKairo, writeScenePackage } from "@kairo/importer-dxf";

const result = await importDxfToKairo("input.dxf");
await writeScenePackage("output-scene", result.scenePackage);
```

This package does not implement DXF export, DWG support, hatches, dimensions, text geometry, splines, or block expansion.
