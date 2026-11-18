import { GLOSSARY_ENTRIES, GLOSSARY_CATEGORIES } from './glossaryData.js';

/** @param {string} text */
const normalize = text => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
/** Match words across names, aliases, definitions and category labels; never interpret query markup. @param {string} query @param {string} [category] */
export function searchGlossary(query, category = '') {
  const phrase = normalize(query);
  const words = phrase.split(/\s+/).filter(Boolean);
  return GLOSSARY_ENTRIES.filter(entry => {
    if (category && entry.category !== category) return false;
    const text = normalize([entry.term, ...entry.aliases, entry.definition,
      GLOSSARY_CATEGORIES.find(c => c.id === entry.category)?.label || ''].join(' '));
    return words.every(word => text.includes(word));
  }).sort((a, b) => rank(a) - rank(b));
  /** Exact terms and aliases precede incidental definition matches. @param {import('./glossaryData.js').GlossaryEntry} entry */
  function rank(entry) {
    if (!phrase) return 0;
    const labels = [entry.term, ...entry.aliases].map(normalize);
    if (labels.includes(phrase)) return 0;
    if (labels.some(label => label.startsWith(phrase))) return 1;
    return words.every(word => labels.join(' ').includes(word)) ? 2 : 3;
  }
}
/** Static, validated term IDs only. Labels use plain text in the rendered button. @param {string} id @param {string} [label] */
export function glossaryLink(id, label = 'Explain this term') {
  if (!GLOSSARY_ENTRIES.some(e => e.id === id)) throw new Error(`Unknown glossary term: ${id}`);
  // Labels are passed through the same DOM text boundary as definitions.
  const node = document.createElement('button');
  node.type = 'button'; node.className = 'term-help';
  node.dataset.glossary = id; node.textContent = label;
  node.setAttribute('aria-haspopup', 'dialog');
  return node.outerHTML;
}
/** @type {HTMLDialogElement | null} */
let dialog = null;
/** @type {HTMLElement | null} */
let returnFocus = null;
let previousOverflow = '';
let selectedTerm = '';
/** @returns {HTMLInputElement} */
function searchInput() { return /** @type {HTMLInputElement} */ (document.getElementById('glossary-search')); }
/** @returns {HTMLSelectElement} */
function categoryInput() { return /** @type {HTMLSelectElement} */ (document.getElementById('glossary-category')); }
function renderResults() {
  const root = document.getElementById('glossary-results');
  const count = document.getElementById('glossary-count');
  if (!root || !count) return;
  const query = searchInput().value;
  const entries = searchGlossary(query, categoryInput().value);
  count.textContent = `${entries.length} of ${GLOSSARY_ENTRIES.length} terms`;
  root.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No matching terms. Try another word or clear the filters.';
    root.append(empty); return;
  }
  for (const entry of entries) {
    const details = document.createElement('details');
    details.className = 'glossary-entry'; details.id = `glossary-term-${entry.id}`;
    details.open = !!query.trim() || entry.id === selectedTerm;
    const summary = document.createElement('summary'); summary.textContent = entry.term;
    const category = document.createElement('small');
    category.textContent = GLOSSARY_CATEGORIES.find(c => c.id === entry.category)?.label || '';
    const definition = document.createElement('p'); definition.textContent = entry.definition;
    details.append(summary, category, definition); root.append(details);
  }
  root.scrollTop = 0;
}
/** Opening never changes workspace data or persists search history. @param {string} [id] */
export function openGlossary(id = '') {
  if (!dialog) return;
  if (!dialog.open) {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previousOverflow = document.body.style.overflow;
    dialog.showModal(); document.body.style.overflow = 'hidden';
  }
  const entry = GLOSSARY_ENTRIES.find(e => e.id === id);
  selectedTerm = entry?.id || '';
  searchInput().value = entry?.term || '';
  categoryInput().value = '';
  renderResults();
  searchInput().focus(); searchInput().select();
  if (entry) document.getElementById(`glossary-term-${entry.id}`)?.scrollIntoView({block:'nearest'});
}
export function closeGlossary() { dialog?.close(); }

/** Install once at startup; delegated help buttons also work in rerendered views. */
export function initGlossary() {
  const node = document.getElementById('glossary-dialog');
  if (!(node instanceof HTMLDialogElement) || node === dialog) return;
  dialog = node;
  const category = categoryInput();
  for (const item of GLOSSARY_CATEGORIES) {
    const option = document.createElement('option'); option.value = item.id; option.textContent = item.label;
    category.append(option);
  }
  searchInput().addEventListener('input', () => { selectedTerm = ''; renderResults(); });
  category.addEventListener('change', () => { selectedTerm = ''; renderResults(); });
  document.getElementById('glossary-clear')?.addEventListener('click', () => {
    searchInput().value = ''; category.value = ''; selectedTerm = ''; renderResults(); searchInput().focus();
  });
  document.getElementById('glossary-close')?.addEventListener('click', closeGlossary);
  dialog.addEventListener('keydown', event => {
    // Keep application shortcuts (including workspace undo) out of this read-only dialog.
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); closeGlossary(); return; }
    if (event.key !== 'Tab' || !dialog) return;
    const controls = [...dialog.querySelectorAll('button, input, select, summary, a[href], [tabindex]')]
      .filter((el) => el instanceof HTMLElement && el.tabIndex >= 0 && el.getClientRects().length > 0);
    const first = controls[0]; const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first && last instanceof HTMLElement) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last && first instanceof HTMLElement) {
      event.preventDefault(); first.focus();
    }
  });
  dialog.addEventListener('close', () => {
    document.body.style.overflow = previousOverflow;
    const fallback = document.getElementById('glossary-open');
    (returnFocus?.isConnected ? returnFocus : fallback)?.focus({preventScroll:true});
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog || !dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeGlossary();
  });
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('button[data-glossary]') : null;
    if (target instanceof HTMLButtonElement) openGlossary(target.dataset.glossary);
  });
}
