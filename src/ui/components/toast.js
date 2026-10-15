import { fill, h } from '../dom.js';

let timer = null;

function region() {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', class: 'toast-region', 'aria-live': 'polite' });
    document.body.append(el);
  }
  return el;
}

/** Eén toast tegelijk; optioneel met een actieknop (bv. "Ongedaan maken"). */
export function showToast({ message, actionLabel = null, onAction = null, ms = 6000 }) {
  const el = region();
  clearTimeout(timer);
  const dismiss = () => fill(el);
  const children = [h('span', { class: 'toast__text' }, message)];
  if (actionLabel && onAction) {
    children.push(
      h('button', {
        type: 'button',
        class: 'toast__action',
        onclick: async () => {
          dismiss();
          await onAction();
        },
      }, actionLabel),
    );
  }
  fill(el, h('div', { class: 'toast' }, ...children));
  timer = setTimeout(dismiss, ms);
}
