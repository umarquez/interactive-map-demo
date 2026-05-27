// Theme controller — owns the data-theme attribute and persists user choice.
// The initial value is set by an inline script in <head> (anti-FOUC).
const STORAGE_KEY = "dm-theme";
const root = document.documentElement;

export function getTheme() {
  return root.dataset.theme === "light" ? "light" : "dark";
}

export function setTheme(theme) {
  root.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch (_) {
    // localStorage may be unavailable (private mode, quota); the visual
    // change still happens, we just don't persist.
  }
}

export function toggleTheme() {
  setTheme(getTheme() === "dark" ? "light" : "dark");
}

/**
 * Wire a button element to toggle theme on click. Caller passes the element
 * so this module stays decoupled from any specific DOM structure.
 */
export function attachToggle(buttonEl) {
  if (!buttonEl) return;
  buttonEl.addEventListener("click", toggleTheme);
  // After the first paint, enable smooth transitions for subsequent toggles.
  requestAnimationFrame(() => {
    root.classList.add("theme-transitions");
  });
}
