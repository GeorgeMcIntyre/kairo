# Kairo Viewer Stability

## Goal

The viewer must behave the same at normal browser zoom and zoomed browser DPR values. Browser zoom can change `window.devicePixelRatio`, but it must not change world-space camera fit, picking math, or canvas layout.

## Browser Zoom And DPR

The renderer is sized from CSS pixels:

- `container.clientWidth`
- `container.clientHeight`
- `renderer.setSize(width, height, false)`

Device pixel ratio is capped and used only for backing-buffer sharpness:

- `renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))`

Fit calculations use world bounds plus CSS-pixel viewport aspect ratio. They do not use backing-buffer dimensions, `window.innerWidth`, or `window.innerHeight`.

## Camera Fit

Orthographic fit resets the camera view volume and `camera.zoom` so repeated fits are deterministic after manual zooming or browser zoom changes. Perspective fit updates `camera.aspect` from the CSS viewport before updating the projection matrix.

Normal startup and resize use robust `fitBounds`. `Fit raw` is the explicit path for framing every entity, including outliers.

## Pointer Mapping

Picking converts pointer coordinates with the canvas DOM rectangle:

- `canvas.getBoundingClientRect()`
- `(clientX - rect.left) / rect.width`
- `(clientY - rect.top) / rect.height`

This keeps picking independent of browser zoom and high-DPR backing-buffer size.

## Diagnostics

The diagnostics panel reports:

- window DPR
- renderer pixel ratio
- CSS viewport size
- canvas backing size
- camera zoom
- fit bounds size

## Known Limitations

- Manual browser zoom should be checked visually at 80%, 90%, 100%, 110%, 125%, and 150% because browser resize event timing differs by browser.
- The viewer still uses line raycasting thresholds for curve selection; dense overlapping DXF curves can still select the front-most or nearest batched segment rather than a semantic object.

## Next Recommended Work

Add browser automation coverage that loads the public demo scene, sets DPR/viewport variants where supported, clicks known label locations, and verifies the selected source entity remains stable.
