// Kleine DOM-builder. Tekst gaat ALTIJD via tekstnodes, nooit via HTML-strings (XSS, zie PLAN R8).

/**
 * h('a', { class: 'x', href: '#/today', onclick: fn }, 'tekst', childNode)
 * props: class, dataset, on<event> handlers, overige keys worden attributen (false/null = weglaten).
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}
