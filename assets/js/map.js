import { geoToSvg } from "./projection.js";

const SVG_NS = "http://www.w3.org/2000/svg";

// MapController owns the SVG and the viewBox state machine.
// Public surface: load(), computeAnchor(), renderOverviewPins(), focus(), reset(),
// getPinScreenPoint(). Knows nothing about events, groups, or DOM outside its container.
export class MapController {
  constructor(container) {
    this.container = container;
    this.svg = null;
    this.baseViewBox = null;     // [x,y,w,h]
    this.currentViewBox = null;
    this.targetViewBox = null;
    this.animationFrame = null;
    this.animationStart = 0;
    this.animationFrom = null;
    this.animationTo = null;
    this.animationDuration = 380;
    this.highlightedEl = null;
    this.pinEl = null;
    this.pinAnchor = null;       // {x, y} in SVG user coords (pre-zoom)
    this.overviewLayer = null;   // <g class="overview-pins">
  }

  async load(svgUrl) {
    const res = await fetch(svgUrl, { headers: { Accept: "image/svg+xml" } });
    if (!res.ok) throw new Error(`load ${svgUrl} -> ${res.status}`);
    const text = await res.text();
    this.container.innerHTML = text;
    this.svg = this.container.querySelector("svg");
    if (!this.svg) throw new Error("world.svg has no <svg> root");

    // The shipped SVG declares width/height but no viewBox; add one so we
    // can pan/zoom by mutating it. Stash the original as the "home" view.
    if (!this.svg.hasAttribute("viewBox")) {
      const w = parseFloat(this.svg.getAttribute("width")) || 1009.6727;
      const h = parseFloat(this.svg.getAttribute("height")) || 665.96301;
      this.svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    }
    // Make the SVG responsive — let CSS size it.
    this.svg.removeAttribute("width");
    this.svg.removeAttribute("height");
    this.svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    this.baseViewBox = parseViewBox(this.svg.getAttribute("viewBox"));
    this.currentViewBox = [...this.baseViewBox];
  }

  /**
   * Compute the SVG-space anchor for an event: explicit lat/lng if provided,
   * otherwise the centroid of the country path's bounding box.
   * Returns null if the country path isn't in the SVG.
   */
  computeAnchor({ country, lat, lng }) {
    if (typeof lat === "number" && typeof lng === "number") {
      return geoToSvg(lng, lat);
    }
    if (!this.svg || !country) return null;
    const path = this.svg.querySelector(`path[id="${cssEscape(country)}"]`);
    if (!path) return null;
    const b = path.getBBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }

  /**
   * Render a small static pin for every event so the default world view shows
   * all locations at a glance. Items: [{ anchor: {x,y}, color }]
   *
   * Each pin is a <g transform="translate(x y) scale(s)"> wrapper around a
   * unit-positioned circle. The scale s is the inverse of the current viewBox
   * zoom (updated in #updateAllPinScales) so the pin keeps a constant on-screen
   * size — same idea as vector-effect:non-scaling-stroke, but for the geometry.
   */
  renderOverviewPins(items) {
    if (!this.svg) return;
    if (this.overviewLayer && this.overviewLayer.parentNode) {
      this.overviewLayer.parentNode.removeChild(this.overviewLayer);
    }
    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class", "overview-pins");
    for (const item of items) {
      if (!item.anchor) continue;
      const wrapper = document.createElementNS(SVG_NS, "g");
      wrapper.setAttribute("class", "overview-pin-wrapper");
      wrapper.dataset.x = String(item.anchor.x);
      wrapper.dataset.y = String(item.anchor.y);
      const c = document.createElementNS(SVG_NS, "circle");
      c.setAttribute("class", "overview-pin");
      c.setAttribute("cx", "0");
      c.setAttribute("cy", "0");
      c.setAttribute("r", "4");
      c.style.fill = item.color;
      wrapper.appendChild(c);
      g.appendChild(wrapper);
    }
    this.svg.appendChild(g);
    this.overviewLayer = g;
    this.#updateAllPinScales();
  }

  /**
   * Focus on a country (and optionally an explicit lat/lng for the pin).
   * Cancels any in-flight animation — quick mouse moves never deadlock.
   */
  focus({ iso, color, lat, lng }) {
    if (!this.svg) return null;
    const path = this.svg.querySelector(`path[id="${cssEscape(iso)}"]`);
    if (!path) {
      console.warn(`map: no country path for ${iso}`);
      return null;
    }

    this.#clearHighlight();
    this.highlightedEl = path;
    path.classList.add("is-highlighted");
    path.style.fill = color;

    const bbox = path.getBBox();
    const targetVB = expandedViewBox(bbox, this.baseViewBox, 1.6);
    this.#animateViewBox(targetVB);

    // City-state countries (SG ≈ 1 SVG unit wide, MC, LI, etc.) become
    // sub-pixel-invisible once their fill is applied. Add a visible halo
    // marker so "highlighted" actually reads as such.
    this.#renderSmallCountryMarker(bbox, color);

    const pin = computePinAnchor({ bbox, lat, lng });
    this.#renderPin(pin, color);
    this.#setOverviewPinsHidden(true);

    this.container.dataset.state = "active";
    return path;
  }

  reset() {
    if (!this.svg) return;
    this.#clearHighlight();
    this.#removeSmallCountryMarker();
    this.#removePin();
    this.#setOverviewPinsHidden(false);
    this.#animateViewBox(this.baseViewBox);
    this.container.dataset.state = "idle";
  }

  #renderSmallCountryMarker(bbox, color) {
    this.#removeSmallCountryMarker();
    // Threshold picked from measured bboxes: SG=0.97, MC=0.39, VA=0.06,
    // LI/AD ≈ 0.5–0.7. Anything ≥ ~5 SVG units (e.g. EG=34) renders fine.
    if (Math.max(bbox.width, bbox.height) >= 5) return;
    const cx = bbox.x + bbox.width / 2;
    const cy = bbox.y + bbox.height / 2;
    // Wrapped so #updateAllPinScales can apply the inverse-zoom scale and
    // keep the halo a constant on-screen size, otherwise it engulfs the
    // country once you're zoomed in.
    const wrapper = document.createElementNS(SVG_NS, "g");
    wrapper.setAttribute("class", "small-marker-wrapper");
    wrapper.dataset.x = String(cx);
    wrapper.dataset.y = String(cy);
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("class", "small-country-marker");
    c.setAttribute("cx", "0");
    c.setAttribute("cy", "0");
    c.setAttribute("r", "8");
    c.style.fill = color;
    wrapper.appendChild(c);
    this.svg.appendChild(wrapper);
    this.smallMarkerEl = wrapper;
    this.#updateAllPinScales();
  }

  #removeSmallCountryMarker() {
    if (this.smallMarkerEl?.parentNode) this.smallMarkerEl.parentNode.removeChild(this.smallMarkerEl);
    this.smallMarkerEl = null;
  }

  #setOverviewPinsHidden(hidden) {
    if (!this.overviewLayer) return;
    this.overviewLayer.classList.toggle("is-hidden", hidden);
  }

  /** Returns the pin's current screen-space position (for the tooltip). */
  getPinScreenPoint() {
    if (!this.svg || !this.pinAnchor) return null;
    const point = this.svg.createSVGPoint();
    point.x = this.pinAnchor.x;
    point.y = this.pinAnchor.y;
    const ctm = this.svg.getScreenCTM();
    if (!ctm) return null;
    const screen = point.matrixTransform(ctm);
    // Container-relative coords (the tooltip is positioned inside .map).
    const rect = this.container.getBoundingClientRect();
    return { x: screen.x - rect.left, y: screen.y - rect.top };
  }

  // ---- internals --------------------------------------------------------

  #clearHighlight() {
    if (!this.highlightedEl) return;
    this.highlightedEl.classList.remove("is-highlighted");
    this.highlightedEl.style.fill = "";
    this.highlightedEl = null;
  }

  #renderPin({ x, y }, color) {
    this.#removePin();
    // pinAnchor is owned here so the remove/render cycle stays consistent —
    // #removePin clears it, #renderPin sets the new one.
    this.pinAnchor = { x, y };
    // Two-layer pin: outer <g> holds the SVG translate + inverse zoom scale;
    // inner <g> takes the CSS scale/opacity entrance animation. Mixing
    // translate + scale on the same element causes the CSS transform to
    // clobber the SVG transform attribute.
    const wrapper = document.createElementNS(SVG_NS, "g");
    wrapper.setAttribute("class", "map-pin-wrapper");
    wrapper.dataset.x = String(x);
    wrapper.dataset.y = String(y);
    wrapper.style.color = color;

    const inner = document.createElementNS(SVG_NS, "g");
    inner.setAttribute("class", "map-pin");

    const halo = document.createElementNS(SVG_NS, "circle");
    halo.setAttribute("class", "map-pin__halo");
    halo.setAttribute("r", "6");
    inner.appendChild(halo);

    const ring = document.createElementNS(SVG_NS, "circle");
    ring.setAttribute("class", "map-pin__ring");
    ring.setAttribute("r", "5");
    inner.appendChild(ring);

    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("class", "map-pin__dot");
    dot.setAttribute("r", "2.4");
    inner.appendChild(dot);

    wrapper.appendChild(inner);
    this.svg.appendChild(wrapper);
    this.pinEl = wrapper;
    this.#updateAllPinScales();
  }

  #removePin() {
    if (this.pinEl && this.pinEl.parentNode) this.pinEl.parentNode.removeChild(this.pinEl);
    this.pinEl = null;
    this.pinAnchor = null;
  }

  /**
   * Apply an inverse-zoom scale to every pin wrapper so pins stay a constant
   * size in screen pixels regardless of how far the user zoomed in. Runs on
   * every viewBox animation tick and after each pin (re)render.
   */
  #updateAllPinScales() {
    if (!this.svg || !this.baseViewBox || !this.currentViewBox) return;
    const inverseScale = this.currentViewBox[2] / this.baseViewBox[2];
    const apply = (wrapper) => {
      if (!wrapper) return;
      const x = wrapper.dataset.x;
      const y = wrapper.dataset.y;
      wrapper.setAttribute("transform", `translate(${x} ${y}) scale(${inverseScale})`);
    };
    if (this.overviewLayer) {
      for (const w of this.overviewLayer.children) apply(w);
    }
    apply(this.pinEl);
    apply(this.smallMarkerEl);
  }

  #animateViewBox(target) {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      this.svg.setAttribute("viewBox", target.join(" "));
      this.currentViewBox = [...target];
      this.#updateAllPinScales();
      return;
    }
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    this.animationFrom = [...this.currentViewBox];
    this.animationTo = [...target];
    this.animationStart = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - this.animationStart) / this.animationDuration);
      const k = easeOutCubic(t);
      const vb = [
        lerp(this.animationFrom[0], this.animationTo[0], k),
        lerp(this.animationFrom[1], this.animationTo[1], k),
        lerp(this.animationFrom[2], this.animationTo[2], k),
        lerp(this.animationFrom[3], this.animationTo[3], k),
      ];
      this.svg.setAttribute("viewBox", vb.join(" "));
      this.currentViewBox = vb;
      this.#updateAllPinScales();
      if (t < 1) {
        this.animationFrame = requestAnimationFrame(tick);
      } else {
        this.animationFrame = null;
      }
    };
    this.animationFrame = requestAnimationFrame(tick);
  }
}

function parseViewBox(str) {
  return str.split(/[\s,]+/).map(Number);
}

function expandedViewBox(bbox, base, padFactor) {
  // Center on the country bbox, then expand to padFactor * max(bbox dim),
  // keeping the SVG aspect ratio and clamping inside the base viewBox.
  const [bx, by, bw, bh] = base;
  const baseAspect = bw / bh;

  const cx = bbox.x + bbox.width / 2;
  const cy = bbox.y + bbox.height / 2;

  // Minimum zoomed extents so tiny countries (Andorra) don't look microscopic.
  const minW = bw * 0.12;
  const minH = bh * 0.12;
  let targetW = Math.max(bbox.width * padFactor, minW);
  let targetH = Math.max(bbox.height * padFactor, minH);

  // Fit to base aspect ratio.
  if (targetW / targetH > baseAspect) {
    targetH = targetW / baseAspect;
  } else {
    targetW = targetH * baseAspect;
  }

  // Cap so we never zoom out beyond the base.
  targetW = Math.min(targetW, bw);
  targetH = Math.min(targetH, bh);

  let x = cx - targetW / 2;
  let y = cy - targetH / 2;
  // Clamp inside the base viewBox.
  x = Math.max(bx, Math.min(x, bx + bw - targetW));
  y = Math.max(by, Math.min(y, by + bh - targetH));
  return [x, y, targetW, targetH];
}

function computePinAnchor({ bbox, lat, lng }) {
  if (typeof lat === "number" && typeof lng === "number") {
    return geoToSvg(lng, lat);
  }
  return { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// Country codes are alpha-2 so they're always CSS-safe, but escape defensively.
function cssEscape(s) {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(s) : String(s).replace(/"/g, '\\"');
}
