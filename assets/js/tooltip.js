// Floating card with title + description. Owns its own placement so that
// callers only pass the pin's position; the tooltip clamps itself inside its
// bounds container, flips above↔below if needed, and exposes an --arrow-x CSS
// var so the arrow keeps pointing at the pin even when the card is shifted
// to stay on-screen.
const MARGIN = 8;           // gap from container edge
const ARROW_MARGIN = 16;    // gap from tooltip edge so arrow stays inside the rounded corner
const POINTER_OFFSET = 14;  // gap between pin and the tooltip card

export class Tooltip {
  constructor(rootEl, containerEl) {
    this.root = rootEl;
    this.container = containerEl;
    this.titleEl = rootEl.querySelector(".tooltip__title");
    this.descEl = rootEl.querySelector(".tooltip__description");
    this._size = null;
    this._containerSize = null;
  }

  show({ x, y, title, description }) {
    this.titleEl.textContent = title;
    this.descEl.textContent = description;
    this.root.hidden = false;
    this._refreshSizes();
    this._position(x, y);
    requestAnimationFrame(() => {
      this.root.dataset.visible = "true";
    });
  }

  move(x, y) {
    if (this.root.hidden) return;
    // Cheap: re-read container/tooltip rects each frame so that the card stays
    // fitted even during a viewBox animation or a window resize.
    this._refreshSizes();
    this._position(x, y);
  }

  hide() {
    this.root.dataset.visible = "false";
    setTimeout(() => {
      if (this.root.dataset.visible === "false") {
        this.root.hidden = true;
        this._size = null;
        this._containerSize = null;
      }
    }, 200);
  }

  _refreshSizes() {
    const cRect = this.container.getBoundingClientRect();
    const maxW = cRect.width * 0.75;
    // "min width is 250px or 50% of the map area, whichever is less."
    const minW = Math.min(250, cRect.width * 0.5);
    this.root.style.maxWidth = `${maxW}px`;
    this.root.style.minWidth = `${minW}px`;
    const tRect = this.root.getBoundingClientRect();
    this._size = { w: tRect.width, h: tRect.height };
    this._containerSize = { w: cRect.width, h: cRect.height };
  }

  _position(pinX, pinY) {
    const { w, h } = this._size;
    const { w: cW, h: cH } = this._containerSize;

    // Default placement: above the pin, centered horizontally.
    let left = pinX - w / 2;
    let top = pinY - h - POINTER_OFFSET;

    // Clamp horizontally inside the container.
    left = Math.max(MARGIN, Math.min(cW - w - MARGIN, left));

    // If the card would clip the top of the container, flip below the pin —
    // but only if it actually fits there; otherwise just clamp to the top.
    let placement = "above";
    if (top < MARGIN) {
      const tryBelow = pinY + POINTER_OFFSET;
      if (tryBelow + h <= cH - MARGIN) {
        top = tryBelow;
        placement = "below";
      } else {
        top = MARGIN;
      }
    }
    // Clamp bottom as a safety net (e.g. container shorter than tooltip).
    top = Math.min(top, cH - h - MARGIN);
    top = Math.max(MARGIN, top);

    // Arrow points at the pin, but stays inside the tooltip's rounded corners.
    const arrowX = Math.max(ARROW_MARGIN, Math.min(w - ARROW_MARGIN, pinX - left));

    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
    this.root.dataset.placement = placement;
    this.root.style.setProperty("--arrow-x", `${arrowX}px`);
  }
}
