// Linear projection calibrated against actual country bboxes in world.svg.
// The SVG ships with a mapsvg:geoViewBox attribute, but the rendered paths
// don't follow that geometry verbatim — the map is rendered with a tweaked
// projection (centered on ~10°E, vertically scaled). Rather than trust the
// metadata, the coefficients below were fit from three well-known countries
// whose bboxes we can read directly from the SVG:
//   DE  (10.4°E, 51.0°N) → (504, 295)
//   EG  (30.5°E, 27.0°N) → (561, 385)
//   AU  (134.5°E, -25.7°N) → (856, 569)
// Slopes are consistent in x (~2.836 px/°) and roughly linear in y (~-3.6).
//
// Output is in SVG user coordinates (pre-zoom), so callers can apply
// getScreenCTM() to convert to screen space.
const X_SCALE = 2.836;
const X_OFFSET = 474.5;
const Y_SCALE = -3.6;
const Y_OFFSET = 478.6;

// SVG visible x-range (pixels). Used to wrap lng around the dateline so that,
// e.g., Samoa at lng=-172 lands at the far-right side rather than off-canvas.
const SVG_WIDTH = 1009.6727;

export function geoToSvg(lng, lat /*, svgWidth, svgHeight */) {
  let x = X_SCALE * lng + X_OFFSET;
  // Wrap around the dateline cut (the SVG draws a single world tile centered
  // on ~10°E, so values that fall past either edge wrap to the other side).
  while (x < 0) x += SVG_WIDTH;
  while (x > SVG_WIDTH) x -= SVG_WIDTH;
  const y = Y_SCALE * lat + Y_OFFSET;
  return { x, y };
}
