"use client";

/** Keep departing items visible until the request and its short exit animation finish. */
export function fadeMindItems(container: HTMLElement | null, ids: Set<string>) {
  const animations: Animation[] = [];
  if (container && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    for (const element of container.querySelectorAll<HTMLElement | SVGElement>("[data-node],[data-edge]")) {
      if (!ids.has(element.getAttribute("data-node") ?? element.getAttribute("data-edge") ?? "")) continue;
      animations.push(element.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 130, easing: "ease-out", fill: "forwards" }));
    }
  }
  return { finished: Promise.all(animations.map(a => a.finished.catch(() => {}))), cancel: () => animations.forEach(a => a.cancel()) };
}
