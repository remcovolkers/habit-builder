// Kleine DOM-builder. Tekst gaat ALTIJD via tekstnodes, nooit via HTML-strings (XSS, zie PLAN R8).

const toNodes = (children) =>
  children
    .flat()
    .filter((child) => child != null && child !== false)
    .map((child) => (child instanceof Node ? child : document.createTextNode(String(child))));

/**
 * Vervangt de inhoud van `parent`. Gebruik dit in plaats van replaceChildren()/append():
 * die maken van `null` de letterlijke tekst "null"; deze functie slaat lege waarden over.
 */
export function fill(parent, ...children) {
  parent.replaceChildren(...toNodes(children));
  return parent;
}

/**
 * h('a', { class: 'x', href: '#/today', onclick: fn }, 'tekst', childNode)
 * props: class, dataset, on<event> handlers, overige keys worden attributen (false/null = weglaten).
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') {
      for (const [name, data] of Object.entries(value)) if (data != null && data !== false) el.dataset[name] = String(data);
    }
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else el.setAttribute(key, value === true ? '' : String(value));
  }
  return fill(el, ...children);
}
