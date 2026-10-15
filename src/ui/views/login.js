import { fill, h } from '../dom.js';
import { account, activate, afterLogin } from '../account.js';
import { icon } from '../svg.js';
import { nl } from '../../content/nl.js';
import * as auth from '../../data/auth.js';

const RESEND_SECONDS = 30;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE = /^\d{6,10}$/;

/** Inloggen met Google of met een code per e-mail. Zonder account blijft de app gewoon lokaal werken. */
export function loginView() {
  const root = h('div', { class: 'login' });
  let step = 'choose'; // 'choose' | 'code'
  let email = '';
  let busy = false;
  let error = null;
  let cooldown = 0;
  let timer = null;

  const errorText = (key) => nl.login.errors[key] ?? nl.login.errors.unknown;
  const setError = (key) => { error = key; render(); };

  function startCooldown() {
    cooldown = RESEND_SECONDS;
    clearInterval(timer);
    timer = setInterval(() => {
      if (!root.isConnected) { clearInterval(timer); return; }
      cooldown -= 1;
      if (cooldown <= 0) clearInterval(timer);
      render();
    }, 1000);
  }

  async function run(task) {
    if (busy) return;
    busy = true;
    error = null;
    render();
    try {
      await task();
    } catch (err) {
      error = err?.key ?? auth.describeAuthError(err);
    } finally {
      busy = false;
      render();
    }
  }

  const google = () => run(() => auth.signInWithGoogle()); // navigeert weg naar Google

  const sendCode = (event) => {
    event?.preventDefault();
    const value = root.querySelector('#email')?.value.trim() ?? email;
    return run(async () => {
      if (!EMAIL.test(value)) throw Object.assign(new Error('email'), { key: 'invalid_email' });
      email = value;
      await auth.sendEmailCode(email);
      step = 'code';
      startCooldown();
    });
  };

  const verify = (event) => {
    event.preventDefault();
    const token = root.querySelector('#code')?.value.trim() ?? '';
    return run(async () => {
      if (!CODE.test(token)) throw Object.assign(new Error('code'), { key: 'code_format' });
      await auth.verifyEmailCode(email, token);
      await afterLogin();
      location.hash = '#/today';
    });
  };

  function chooseStep() {
    return [
      h('button', { type: 'button', id: 'googleLogin', class: 'button button--secondary button--block', disabled: busy, onclick: google }, nl.login.google),
      h('p', { class: 'divider' }, nl.login.or),
      h('form', { class: 'form', novalidate: true, onsubmit: sendCode },
        h('div', { class: 'field' },
          h('label', { class: 'field__label', for: 'email' }, nl.login.email),
          h('input', {
            id: 'email', class: 'input', type: 'email', inputmode: 'email', autocomplete: 'email', value: email,
            placeholder: nl.login.emailPlaceholder, 'aria-describedby': 'login-error', 'aria-invalid': error === 'invalid_email' ? 'true' : null,
          })),
        h('button', { type: 'submit', id: 'sendCode', class: 'button button--primary button--block', disabled: busy }, nl.login.sendCode)),
    ];
  }

  function codeStep() {
    return [
      h('p', { class: 'login__sent', role: 'status' }, nl.login.codeSent(email)),
      h('form', { class: 'form', novalidate: true, onsubmit: verify },
        h('div', { class: 'field' },
          h('label', { class: 'field__label', for: 'code' }, nl.login.code),
          h('input', {
            id: 'code', class: 'input input--code', type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code',
            maxlength: 10, 'aria-describedby': 'login-error code-hint', 'aria-invalid': error === 'invalid_code' || error === 'code_format' ? 'true' : null,
          }),
          h('p', { id: 'code-hint', class: 'field__hint' }, nl.login.codeHint)),
        h('button', { type: 'submit', id: 'verifyCode', class: 'button button--primary button--block', disabled: busy }, nl.login.verify)),
      h('div', { class: 'login__links' },
        h('button', { type: 'button', class: 'button button--ghost button--small', onclick: () => { step = 'choose'; error = null; render(); } }, nl.login.otherEmail),
        h('button', { type: 'button', id: 'resendCode', class: 'button button--ghost button--small', disabled: busy || cooldown > 0, onclick: () => sendCode() },
          cooldown > 0 ? nl.login.resendIn(cooldown) : nl.login.resend)),
    ];
  }

  function render() {
    if (account.status === 'signed-in') {
      fill(root,
        h('p', { class: 'muted' }, nl.login.alreadyIn),
        h('a', { class: 'button button--ghost', href: '#/settings' }, nl.login.back));
      return;
    }
    fill(root,
      h('a', { class: 'back-link', href: '#/settings' }, `‹ ${nl.login.back}`),
      h('p', { class: 'kicker' }, nl.login.kicker),
      h('h1', { class: 'page-title' }, nl.login.title),
      h('p', { class: 'muted login__intro' }, nl.login.intro),
      h('div', { class: 'login__body' }, ...(step === 'choose' ? chooseStep() : codeStep())),
      h('p', { id: 'login-error', class: 'field__error', role: 'alert', hidden: error === null }, error ? errorText(error) : ''),
      h('p', { class: 'xs muted login__privacy' }, icon('check'), nl.login.privacy));
    const focus = step === 'code' ? '#code' : null;
    if (focus && !busy) root.querySelector(focus)?.focus();
  }

  // de SDK alvast laden en luisteren naar de uitkomst, zodat inloggen meteen "pakt"
  activate().catch((err) => console.warn('SDK laden mislukt', err));
  render();
  return root;
}
