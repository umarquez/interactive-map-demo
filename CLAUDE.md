# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Run / build / test

```bash
go run ./cmd/app                # serves at :8080 on all interfaces (LAN-reachable)
go run ./cmd/app -addr :9000    # custom port
go test ./...
go vet ./...
```

The server reads `locations.yaml` once at startup (`-data` flag overrides the path). Hot reload is intentionally not implemented — restart to pick up data changes.

Go module path is `github.com/0xC0D3/interactive-map-demo`; internal imports use that prefix.

## Architecture

Single Go process; one JSON endpoint plus static file serving for a vanilla-JS SPA. SOLID layering throughout — handler depends on a `GroupsReader` interface, never the concrete service.

### Backend layout
- `cmd/app/main.go` — wires `YAMLRepository → Service → GroupsHandler → Server`, handles graceful shutdown on SIGINT/SIGTERM.
- `internal/groups/model.go` — `Group`, `Event` (`Lat`/`Lng` are `*float64` so omission round-trips cleanly through both YAML and JSON).
- `internal/groups/repository.go` — `Repository` interface + `YAMLRepository`. Normalizes country codes to uppercase and trims color whitespace at parse time so the JSON output is consistent regardless of YAML quirks.
- `internal/groups/service.go` — caches the parsed groups (`Preload` runs at startup; data is read-only).
- `internal/httpapi/handler.go` — `GroupsReader` is the narrow interface the handler depends on. Returns `{"groups": [...]}` with nil-slice → `[]` so the JSON shape is stable.
- `internal/httpapi/server.go` — routes `/api/v1/groups`, `/`, `/assets/*`. Blocks `/locations.yaml` and directory listings explicitly. `noDirListing` MUST wrap from outside `http.StripPrefix` — `StripPrefix` mutates `r.URL.Path` and would defeat a check placed after it.

### Frontend layout (ES modules, no build step)
- `index.html` — minimal shell with `<template>` elements for groups/events; CSS is split across `assets/css/{reset,layout,events-list,map,tooltip}.css`.
- `assets/js/main.js` — composition root; wires `MapController` + `Tooltip` + `eventsList`.
- `assets/js/map.js` — owns the SVG and viewBox state machine. Loads `assets/world.svg`, adds a `viewBox` (the shipped SVG only has width/height), and exposes `focus({iso,color,lat,lng}) / reset() / getPinScreenPoint()`. Knows nothing about events or groups.
- `assets/js/eventsList.js` — renders groups/events from cloned `<template>`s. Emits hover/tap/keyboard callbacks. Knows nothing about the SVG.
- `assets/js/tooltip.js` — floating card positioned in screen-pixel space.
- `assets/js/projection.js` — see "Projection" below.
- `assets/js/api.js` — single `fetchGroups()` call against `/api/v1/groups`.

The three controllers meet only in `main.js`. That's the SOLID seam: switching map renderer or list rendering would only touch one file.

## Map interaction (important gotchas)

- **Country lookups** go through ISO 3166-1 alpha-2 codes, which match `<path id="…">` in `assets/world.svg` (e.g. `id="DE"`, `id="US"`). Normalize to uppercase before querying.
- **Pin placement**: explicit `lat`/`lng` on the event uses `geoToSvg`; otherwise the path's `getBBox()` center is used.
- **Pin animation requires a two-layer SVG group**. The outer `<g class="map-pin-wrapper">` carries the SVG `transform="translate(…)"` attribute; the inner `<g class="map-pin">` takes the CSS scale/opacity animation. Putting CSS `transform` on the same element that has an SVG `transform` attribute makes the CSS transform clobber the translate — the pin renders at SVG (0,0). Don't merge them back.
- **`pinAnchor` ownership**: `MapController.#renderPin` sets `pinAnchor`; `#removePin` clears it. Don't assign `pinAnchor` from the outside, since `#renderPin` internally calls `#removePin` first.
- **Touch vs mouse**: `eventsList.js` ignores `pointerenter/leave` for non-mouse pointer types and uses `click` (gated by the last `pointerdown` type) for touch/pen. Adding a `focus`/`blur` → enter/leave binding causes a touch tap to immediately deactivate (touch → enter → leave → focus → enter → click → toggle off).
- **Layout must clamp to viewport**: `.app` is `height: 100dvh` with `grid-template-rows: auto minmax(0, 1fr)` and `overflow: hidden`. Without the `minmax(0, …)`, the events list pushes the page taller than the viewport and `.events__scroll` never scrolls. The map and the events scrollbar are the only scrolling regions.

## Projection (`assets/js/projection.js`)

The SVG ships with `mapsvg:geoViewBox="-169.110266 83.600842 190.486279 -58.508473"`, but the rendered paths do NOT obey that metadata as a pure equirectangular mapping. Coefficients were fit against measured `getBBox()` centroids of DE/EG/AU:

```
x = 2.836 * lng + 474.5
y = -3.6  * lat + 478.6
```

X is consistent within ~1°. Y has ~5% non-linearity (the map seems to use a slightly stretched projection near the equator), which is fine for "pin lands inside the right country" but don't expect city-level precision. If you change the SVG asset, recalibrate by querying `path.getBBox()` on three well-known countries and re-solving.

`x` is wrapped into `[0, SVG_WIDTH]` so antimeridian-crossing points (e.g. lng ≈ -172) land on the visible side.

## Sample data convention (`locations.yaml`)

Top-level `groups:` list. Each group needs `id`, `name`, `color`, `events`. Each event needs `title`, `description`, `country` (alpha-2); `lat`/`lng` are optional. The file has an inline comment with the full schema — keep it accurate when extending.
