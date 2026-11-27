/** Geometry shared by the demo disclosure and tour. No saved preferences or workspace changes. */
let stopObserving = () => {};

/** Includes a small gap below the currently visible sticky strip. */
export function demoBannerClearance() {
  const banner = document.getElementById('demo-banner');
  return (banner && !banner.hidden ? banner.getBoundingClientRect().height : 0) + 12;
}

export function updateDemoClearance() {
  const clearance = demoBannerClearance();
  document.body.style.setProperty('--demo-banner-clearance', `${clearance}px`);
  return clearance;
}

export function closeDemoDetails() {
  const details = document.getElementById('demo-details');
  if (details instanceof HTMLDetailsElement) details.open = false;
  updateDemoClearance();
}

/** Explicit user navigation only; never scroll a modal's underlying page.
 * @param {Element | null} element
 */
export function revealDemoElement(element) {
  if (!element || element.closest('[aria-modal="true"]')) return;
  updateDemoClearance();
  if (element instanceof HTMLElement) element.style.scrollMarginTop = 'var(--demo-banner-clearance, 12px)';
  element.scrollIntoView?.({ block: 'start', behavior: 'instant' });
}

/** Resize/toggle updates must not steal focus from a disclosure or work-order form. */
function layoutChanged() {
  const clearance = updateDemoClearance();
  const focused = document.activeElement;
  if (!(focused instanceof HTMLElement) || focused.closest('[aria-modal="true"]')) return;
  if (!focused.closest('#demo-tour') && !focused.classList.contains('demo-tour-target')) return;
  const bounds = focused.getBoundingClientRect();
  if (bounds.bottom > 0 && bounds.top < clearance) revealDemoElement(focused);
}

/** Reinitialization disconnects old listeners and the old ResizeObserver. */
export function initDemoLayout() {
  disposeDemoLayout();
  const banner = document.getElementById('demo-banner');
  const details = document.getElementById('demo-details');
  if (!banner || banner.hidden || !(details instanceof HTMLDetailsElement)) return;
  details.open = false;
  details.addEventListener('toggle', layoutChanged);
  window.addEventListener('resize', layoutChanged);
  window.visualViewport?.addEventListener('resize', layoutChanged);
  /** @param {Event} event */
  const beforeChoice = event => {
    if (event.target instanceof Element && event.target.closest('#demo-choices')) closeDemoDetails();
  };
  // Close before the button's tour handler calculates its heading position.
  banner.addEventListener('click', beforeChoice, true);
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(layoutChanged);
  observer?.observe(banner);
  stopObserving = () => {
    observer?.disconnect();
    details.removeEventListener('toggle', layoutChanged);
    window.removeEventListener('resize', layoutChanged);
    window.visualViewport?.removeEventListener('resize', layoutChanged);
    banner.removeEventListener('click', beforeChoice, true);
  };
  layoutChanged();
}

export function disposeDemoLayout() {
  stopObserving();
  stopObserving = () => {};
  document.body.style.removeProperty('--demo-banner-clearance');
}
