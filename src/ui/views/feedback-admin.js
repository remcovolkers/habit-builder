// Het tabje Feedback voor de beheerder (#/feedback, docs/FEEDBACK.md): wat gebruikers hebben gestuurd, met filters en afhandelen. Alleen op de computer
// zichtbaar in de navigatie en alleen voor wie de server als beheerder kent; de server geeft een ander toch niets.
import { fill, h } from '../dom.js';
import { openDialog } from '../components/dialog.js';
import { showToast } from '../components/toast.js';
import { admin, onAdminChanged, refreshFeedbackCount } from '../admin.js';
import * as auth from '../../data/auth.js';
import { FEEDBACK_KINDS, deleteFeedback, listFeedback, setFeedbackStatus } from '../../data/feedback-remote.js';
import { countByStatus, filterFeedback } from '../../app/feedback.js';
import { nl } from '../../content/nl.js';

const a = nl.feedback.admin;
const getClient = () => auth.getClient();

const when = (iso) => new Date(iso).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' });

export function feedbackAdminView() {
  const root = h('div', { class: 'feedback-admin page' });
  const view = { items: null, error: false, status: 'new', kind: 'all' };

  async function load() {
    try {
      view.items = await listFeedback(getClient);
      view.error = false;
    } catch {
      view.error = true;
    }
    draw();
    refreshFeedbackCount();
  }

  async function act(task) {
    try {
      const ok = await task();
      if (!ok) throw new Error('geweigerd');
      await load();
      return true;
    } catch {
      showToast({ message: a.actionError });
      return false;
    }
  }

  const confirmRemove = (item) => openDialog({
    title: a.remove,
    description: a.confirmRemove,
    actions: [{ label: a.remove, variant: 'danger', onClick: async () => { if (await act(() => deleteFeedback(getClient, item.id))) showToast({ message: a.removed }); } }],
  });

  function itemCard(item) {
    const done = item.status === 'done';
    return h('li', { class: 'feedback-item', dataset: { status: item.status, kind: item.kind, id: item.id } },
      h('div', { class: 'feedback-item__head' },
        h('span', { class: `badge badge--kind badge--kind-${item.kind}` }, nl.feedback.kinds[item.kind] ?? item.kind),
        h('time', { class: 'feedback-item__when', dateTime: item.created_at }, when(item.created_at)),
        done ? null : h('span', { class: 'feedback-item__new' }, nl.feedback.admin.tabs.new)),
      h('p', { class: 'feedback-item__body' }, item.body),
      h('p', { class: 'feedback-item__meta' },
        item.contact_email
          ? h('a', { href: `mailto:${item.contact_email}`, 'aria-label': a.mailTo(item.contact_email) }, item.contact_email)
          : h('span', null, a.anonymous),
        item.route ? h('span', null, ` · ${item.route}`) : null,
        item.app_version ? h('span', null, ` · v${item.app_version}`) : null),
      h('div', { class: 'feedback-item__actions' },
        h('button', {
          type: 'button', class: 'button button--secondary button--small', dataset: { focusKey: `status:${item.id}` },
          onclick: () => act(() => setFeedbackStatus(getClient, item.id, done ? 'new' : 'done')),
        }, done ? a.reopen : a.markDone),
        h('button', { type: 'button', class: 'button button--ghost button--small', onclick: () => confirmRemove(item) }, a.remove)));
  }

  function draw() {
    if (admin.status === 'checking' || admin.status === 'unknown') { fill(root, h('p', { class: 'muted', role: 'status' }, a.checking)); return; }
    if (admin.status !== 'yes') { fill(root, h('h1', { class: 'page-title' }, a.title), h('p', { class: 'muted', id: 'feedbackOnlyAdmin' }, a.onlyAdmin)); return; }

    // een hertekening maakt nieuwe invoervelden: het filter waar je net op tikte houdt de focus (anders valt het toetsenbord eruit)
    const keepFocus = root.contains(document.activeElement) && ['feedbackStatus', 'feedbackKind'].includes(document.activeElement.name ?? document.activeElement.id);
    const counts = view.items ? countByStatus(view.items) : { new: 0, done: 0, all: 0 };
    const shown = view.items ? filterFeedback(view.items, { status: view.status, kind: view.kind }) : [];
    const select = h('select', { id: 'feedbackKind', class: 'input feedback-admin__kind', 'aria-label': a.kindFilter, onchange: (e) => { view.kind = e.target.value; draw(); } },
      h('option', { value: 'all', selected: view.kind === 'all' }, a.kindAll),
      ...FEEDBACK_KINDS.map((value) => h('option', { value, selected: view.kind === value }, nl.feedback.kinds[value])));

    fill(root,
      h('header', { class: 'page-header' },
        h('h1', { class: 'page-title' }, a.title),
        h('button', { type: 'button', id: 'feedbackRefresh', class: 'button button--ghost button--small', onclick: load }, a.refresh)),
      h('p', { class: 'section__hint' }, a.intro),
      h('div', { class: 'feedback-admin__tools' },
        h('div', { class: 'segmented', role: 'group', 'aria-label': a.title },
          ...['new', 'done', 'all'].map((key) => h('label', { class: 'segmented__item' },
            h('input', { class: 'choice__input', type: 'radio', name: 'feedbackStatus', value: key, checked: view.status === key, onchange: () => { view.status = key; draw(); } }),
            h('span', { class: 'segmented__face' }, `${a.tabs[key]} (${counts[key]})`)))),
        select),
      h('div', { class: 'page__scroll' },
        view.error
          ? h('p', { class: 'field__error', role: 'alert' }, a.loadError)
          : view.items === null
            ? h('p', { class: 'muted', role: 'status' }, nl.app.loading)
            : shown.length === 0
              ? h('p', { class: 'feedback-admin__empty' }, a.empty[view.status])
              : h('ul', { class: 'feedback-list' }, ...shown.map(itemCard))));
    if (keepFocus) (root.querySelector('input[name="feedbackStatus"]:checked') ?? select).focus();
  }

  const stop = onAdminChanged(() => {
    if (!root.isConnected) { stop(); return; }
    if (admin.status === 'yes' && view.items === null && !view.loading) { view.loading = true; load(); }
    else draw();
  });
  draw();
  if (admin.status === 'yes') { view.loading = true; load(); }
  return root;
}
