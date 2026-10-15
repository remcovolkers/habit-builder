// Inline SVG-iconen (uit het Moda-ontwerp). Gebouwd met createElementNS: geen HTML-strings, CSP-vriendelijk.
const NS = 'http://www.w3.org/2000/svg';

const ICONS = {
  today: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M8 12.5l3 3 5-6' }]],
  habits: [['path', { d: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01' }]],
  stats: [['path', { d: 'M4 20V10M10 20V4M16 20v-7M22 20H2' }]],
  achievements: [['circle', { cx: 12, cy: 9, r: 6 }], ['path', { d: 'M8.5 14L7 22l5-3 5 3-1.5-8' }]],
  settings: [
    ['circle', { cx: 12, cy: 12, r: 3 }],
    ['path', { d: 'M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1' }],
  ],
  check: [['path', { d: 'M5 12.5l4.5 4.5L19 7.5' }]],
  back: [['path', { d: 'M15 5l-7 7 7 7' }]],
  next: [['path', { d: 'M9 5l7 7-7 7' }]],
  close: [['path', { d: 'M6 6l12 12M18 6L6 18' }]],
};

/** icon('check', { strokeWidth: 3 }) -> <svg aria-hidden> */
export function icon(name, { strokeWidth = 2 } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  const attrs = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': strokeWidth, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' };
  for (const [key, value] of Object.entries(attrs)) svg.setAttribute(key, String(value));
  for (const [tag, props] of ICONS[name]) {
    const el = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(props)) el.setAttribute(key, String(value));
    svg.appendChild(el);
  }
  return svg;
}
