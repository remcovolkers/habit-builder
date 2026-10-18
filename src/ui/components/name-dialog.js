import { h } from '../dom.js';
import { openDialog } from './dialog.js';
import { showToast } from './toast.js';
import { charCounter } from './char-counter.js';
import { saveSettings } from '../state.js';
import { DISPLAY_NAME_MAX } from '../../app/settings.js';
import { nl } from '../../content/nl.js';

/**
 * Vraagt hoe de gebruiker genoemd wil worden. Overslaan of wegklikken telt als "gevraagd": we zeuren niet.
 * De keuze (en dat we het gevraagd hebben) staat in de instellingen en synchroniseert dus mee naar andere apparaten.
 */
export function openNameDialog({ initial = '', onSaved = null } = {}) {
  const t = nl.account.name;
  let saved = false;
  const error = h('p', { class: 'field__error', role: 'alert', hidden: true }, t.tooLong);
  const input = h('input', {
    id: 'nameInput', class: 'input', type: 'text', autocomplete: 'given-name',
    value: initial, 'aria-label': t.label,
    onkeydown: (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        document.querySelector('dialog .button--primary')?.click();
      }
    },
  });

  openDialog({
    title: t.title,
    description: t.text,
    content: h('div', { class: 'field' }, input, charCounter(input, DISPLAY_NAME_MAX), error),
    cancelLabel: t.skip,
    actions: [{
      label: t.save,
      variant: 'primary',
      onClick: async () => {
        const name = input.value.trim();
        if (name.length > DISPLAY_NAME_MAX) {
          error.hidden = false;
          return false;
        }
        await saveSettings({ displayName: name, nameAsked: true });
        saved = true;
        showToast({ message: t.saved });
        onSaved?.();
        return undefined;
      },
    }],
    onClose: () => {
      if (!saved) saveSettings({ nameAsked: true }).catch((e) => console.warn('naam-vlag opslaan mislukt', e));
    },
  });
  // geen focus in het veld: de naam is optioneel ("Overslaan"), en op een telefoon springt het toetsenbord dan ongevraagd omhoog
}
