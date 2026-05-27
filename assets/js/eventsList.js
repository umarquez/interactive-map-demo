// Renders the sidebar list of groups + events.
// Emits hover/leave/activate via the callbacks injected in render().
// Knows nothing about the map.
export function renderEventsList(container, groups, handlers) {
  const groupTpl = document.getElementById("tpl-group");
  const eventTpl = document.getElementById("tpl-event");
  container.replaceChildren();

  groups.forEach((group, gIdx) => {
    const node = groupTpl.content.firstElementChild.cloneNode(true);
    node.style.setProperty("--group-color", group.color);
    node.querySelector(".group__name").textContent = group.name;
    node.querySelector(".group__count").textContent = `${group.events.length}`;
    const list = node.querySelector(".group__events");

    group.events.forEach((event, eIdx) => {
      const li = eventTpl.content.firstElementChild.cloneNode(true);
      li.style.setProperty("--group-color", group.color);
      li.dataset.groupId = group.id;
      li.dataset.eventIndex = String(eIdx);
      li.querySelector(".event__title").textContent = event.title;
      li.querySelector(".event__description").textContent = event.description;
      li.querySelector(".event__country").textContent = event.country;

      const payload = { group, event, element: li, key: `${gIdx}.${eIdx}` };

      // Mouse → hover (pointerenter/leave). Touch/pen → tap (click). Keyboard
      // → Enter/Space. We split mouse vs touch on click via pointerdown's
      // pointerType so that clicking while hovering on desktop is a no-op
      // (otherwise click-toggle would deactivate the hover).
      let lastPointerType = null;
      li.addEventListener("pointerenter", (e) => {
        if (e.pointerType !== "mouse") return;
        handlers.onEnter(payload);
      });
      li.addEventListener("pointerleave", (e) => {
        if (e.pointerType !== "mouse") return;
        handlers.onLeave(payload);
      });
      li.addEventListener("pointerdown", (e) => { lastPointerType = e.pointerType; });
      li.addEventListener("click", () => {
        if (lastPointerType === "mouse") return;
        handlers.onActivate(payload);
      });
      li.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          handlers.onActivate(payload);
        }
      });

      list.appendChild(li);
    });

    container.appendChild(node);
  });
}

export function setActiveEvent(container, key) {
  container.querySelectorAll(".event.is-active").forEach((el) => el.classList.remove("is-active"));
  if (!key) return;
  const [gIdx, eIdx] = key.split(".");
  const target = container.querySelectorAll(".group")[Number(gIdx)]
    ?.querySelectorAll(".event")[Number(eIdx)];
  if (target) target.classList.add("is-active");
}
