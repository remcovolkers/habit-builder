// Wat de app lokaal onthoudt over feedback: sinds wanneer je de app gebruikt, wanneer we er voor het laatst om vroegen, en wanneer je voor het laatst
// iets stuurde. Alleen tijdstippen op dit apparaat; er gaat niets naar de server. Zie app/feedback.js (inviteDue) voor wat ermee gebeurt.
import { inviteDue } from '../app/feedback.js';

const FIRST_RUN = 'hb-first-run';
const ASKED = 'hb-feedback-asked';
const SENT = 'hb-feedback-sent';

function read(key) {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* opslag geblokkeerd: dan vragen we gewoon niet */
  }
}

/** Bij het starten: onthoud de eerste keer (en laat het daarna met rust). */
export function markFirstRun(now = Date.now()) {
  if (read(FIRST_RUN) === null) write(FIRST_RUN, now);
}

/** Moet de uitnodiging nu getoond worden? Bij geblokkeerde opslag nooit (we kunnen dan niet onthouden dat je "Niet nu" koos). */
export function feedbackInviteDue(now = Date.now()) {
  return inviteDue({ now, firstRun: read(FIRST_RUN), lastAsked: read(ASKED), lastSent: read(SENT) });
}

export const snoozeFeedbackInvite = (now = Date.now()) => write(ASKED, now);
export const markFeedbackSent = (now = Date.now()) => write(SENT, now);
