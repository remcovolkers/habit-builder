import { fill, h } from '../dom.js';
import { nl } from '../../content/nl.js';

/**
 * Modale dialoog op basis van <dialog>.
 * actions: [{ label, variant: 'primary'|'secondary'|'danger', onClick }] — de dialoog sluit na onClick,
 * tenzij die `false` teruggeeft (bv. bij een validatiefout).
 */
export function openDialog({ title, description = null, content = null, actions = [], cancelLabel = nl.app.cancel, onClose = null }) {
  const dialog = h('dialog', { class: 'dialog', 'aria-labelledby': 'dialog-title' });
  const close = () => dialog.close();

  const buttons = actions.map(({ label, variant = 'secondary', onClick }) =>
    h('button', {
      type: 'button',
      class: `button button--${variant}`,
      onclick: async () => {
        if ((await onClick?.()) !== false) close();
      },
    }, label),
  );
  if (cancelLabel) buttons.push(h('button', { type: 'button', class: 'button button--ghost', onclick: close }, cancelLabel));

  fill(
    dialog,
    h('h2', { id: 'dialog-title', class: 'dialog__title' }, title),
    description ? h('p', { class: 'dialog__text' }, description) : null,
    content,
    h('div', { class: 'dialog__actions' }, ...buttons),
  );
  dialog.addEventListener('close', () => {
    dialog.remove();
    onClose?.();
  });
  document.body.append(dialog);
  dialog.showModal();
  return { close };
}
