import { h } from './dom.js';
import { buildExport } from '../app/backup.js';

/** Downloadt alle gegevens als JSON-bestand (de back-up uit Instellingen; ook bij uitloggen en accountwissel). */
export async function downloadBackup(repo, today) {
  const snapshot = await repo.snapshot();
  const json = JSON.stringify(buildExport(snapshot), null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = h('a', { href: url, download: `habit-builder-backup-${today}.json` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
