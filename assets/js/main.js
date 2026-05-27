import { fetchGroups } from "./api.js";
import { renderEventsList, setActiveEvent } from "./eventsList.js";
import { MapController } from "./map.js";
import { Tooltip } from "./tooltip.js";
import { attachToggle } from "./theme.js";

const mapContainer = document.getElementById("map");
const tooltipEl = document.getElementById("tooltip");
const listContainer = document.getElementById("events-scroll");
const themeToggleEl = document.getElementById("theme-toggle");
// Tooltip lives inside the .map section, which is its offsetParent and the
// element whose bounds the tooltip must stay inside.
const mapSectionEl = tooltipEl.parentElement;

const map = new MapController(mapContainer);
const tooltip = new Tooltip(tooltipEl, mapSectionEl);

attachToggle(themeToggleEl);

let activeKey = null;          // event we're currently focused on
let tooltipTrackHandle = null; // for sticky pin-following on resize/scroll

async function boot() {
  try {
    await map.load("/assets/world.svg");
  } catch (err) {
    console.error("map load failed", err);
    mapContainer.innerHTML = `<p style="padding:16px;color:var(--fg-muted)">Failed to load map.</p>`;
    return;
  }

  let groups = [];
  try {
    groups = await fetchGroups();
  } catch (err) {
    console.error("groups fetch failed", err);
    listContainer.innerHTML = `<p style="padding:16px;color:var(--fg-muted)">Failed to load events.</p>`;
    return;
  }

  // Static dots for every event so the default view shows all locations at once.
  const overviewItems = groups.flatMap((g) =>
    g.events.map((e) => ({ color: g.color, anchor: map.computeAnchor(e) }))
  );
  map.renderOverviewPins(overviewItems);

  renderEventsList(listContainer, groups, {
    onEnter: handleEnter,
    onLeave: handleLeave,
    onActivate: handleActivate,
  });

  // Re-position the tooltip when the layout changes (window resize, scroll).
  window.addEventListener("resize", repositionTooltip, { passive: true });
  window.addEventListener("scroll", repositionTooltip, { passive: true });
  listContainer.addEventListener("scroll", repositionTooltip, { passive: true });
}

function handleEnter({ group, event, key }) {
  activeKey = key;
  setActiveEvent(listContainer, key);
  map.focus({ iso: event.country, color: group.color, lat: event.lat, lng: event.lng });
  scheduleTooltipShow(event);
}

function handleLeave({ key }) {
  if (activeKey !== key) return;
  activeKey = null;
  setActiveEvent(listContainer, null);
  map.reset();
  tooltip.hide();
}

// Tap-to-toggle on touch devices, since there's no real hover.
function handleActivate(payload) {
  if (activeKey === payload.key) {
    handleLeave(payload);
  } else {
    handleEnter(payload);
  }
}

function scheduleTooltipShow(event) {
  // Wait one frame so the SVG has its viewBox updated before we read coords;
  // the viewBox animation is async but the first frame already shifts the CTM.
  requestAnimationFrame(() => {
    const point = map.getPinScreenPoint();
    if (!point) return;
    tooltip.show({
      x: point.x,
      y: point.y,
      title: event.title,
      description: event.description,
    });
    if (tooltipTrackHandle) cancelAnimationFrame(tooltipTrackHandle);
    const track = () => {
      const p = map.getPinScreenPoint();
      if (p) tooltip.move(p.x, p.y);
      if (activeKey !== null) {
        tooltipTrackHandle = requestAnimationFrame(track);
      } else {
        tooltipTrackHandle = null;
      }
    };
    tooltipTrackHandle = requestAnimationFrame(track);
  });
}

function repositionTooltip() {
  if (activeKey === null) return;
  const p = map.getPinScreenPoint();
  if (p) tooltip.move(p.x, p.y);
}

boot();
