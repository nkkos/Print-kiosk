// Phone-Camera Scan's phone-facing flow (docs/scan-upload-requirements.md,
// docs/screens/scan-spec.md, "Phone-facing flow") — five screens (P1-P5) as
// one plain HTML/CSS/vanilla-JS page, served directly by this backend (same
// reasoning as the `/upload/:sessionId` QR-upload page: the phone's request
// never needs CORS if it's same-origin). Not a bundled TypeScript app and
// not the kiosk's React SPA — the look and the five languages come from
// server/phonePageKit.ts (2026-10 redesign, batch 8), shared with QR upload
// and Copy.
//
// State (current photo, corners, captured pages, login) lives entirely in
// this page's own JS variables — there is nothing else to share it with, so
// no framework/store is warranted (same "extract only once two consumers
// exist" reasoning CLAUDE.md documents for the kiosk app itself).

import { icon } from './phoneIcons.js';
import {
  escapeHtml as esc,
  format,
  FORMAT_SCRIPT,
  phoneHead,
  PHONE_STRINGS,
  type PhoneLanguage,
} from './phonePageKit.js';

const TOTAL = 4;

export function renderScanPhoneApp(
  scanSessionId: string,
  portalUrl: string,
  language: PhoneLanguage,
): string {
  const s = PHONE_STRINGS[language];
  return `${phoneHead(language, s.scanTitle, STYLES)}
<main id="app">
  <section id="screen-start" class="screen">
    <div class="card center">
      <span class="step">${esc(format(s.stepOf, { step: 1, total: TOTAL }))}</span>
      <span class="badge">${icon('scanLine', 34)}</span>
      <h1>${esc(s.scanTitle)}</h1>
      <p>${esc(s.scanStart)}</p>
      <label class="button-like primary" id="scan-take-photo" for="photo-input">${icon('camera', 24)}${esc(s.takePhoto)}</label>
      <input type="file" accept="image/*" capture="environment" id="photo-input" hidden />
      <p class="hint">${esc(s.photoTip)}</p>
    </div>
  </section>

  <section id="screen-adjust" class="screen" hidden>
    <span class="step">${esc(format(s.stepOf, { step: 2, total: TOTAL }))}</span>
    <h1>${esc(s.adjustTitle)}</h1>
    <p id="adjust-hint">${esc(s.adjustHint)}</p>
    <p id="adjust-detecting" hidden>${esc(s.detecting)}</p>
    <p id="adjust-detect-status" class="notice info" hidden></p>
    <div class="canvas-wrap" id="canvas-wrap" hidden><canvas id="adjust-canvas"></canvas></div>
    <div class="actions">
      <button id="scan-retake" class="secondary">${esc(s.retake)}</button>
      <button id="scan-confirm-corners" class="primary" disabled>${esc(s.confirm)}</button>
    </div>
  </section>

  <section id="screen-preview" class="screen" hidden>
    <span class="step">${esc(format(s.stepOf, { step: 3, total: TOTAL }))}</span>
    <h1 id="preview-title"></h1>
    <img id="scan-page-preview" class="page-preview" alt="" />
    <div id="thumb-strip" class="thumb-strip"></div>
    <div class="actions">
      <button id="scan-add-page" class="secondary">${esc(s.addPage)}</button>
      <button id="scan-finish" class="primary">${esc(s.finish)}</button>
    </div>
  </section>

  <section id="screen-deliver" class="screen" hidden>
    <span class="step">${esc(format(s.stepOf, { step: 4, total: TOTAL }))}</span>
    <h1>${esc(s.deliverTitle)}</h1>
    <label class="option"><input type="checkbox" id="scan-deliver-email" /><span class="option-icon">${icon('mail', 26)}</span><span>${esc(s.deliverEmail)}</span></label>
    <input type="email" id="scan-email-input" placeholder="${esc(s.emailPlaceholder)}" autocomplete="email" hidden />
    <label class="option"><input type="checkbox" id="scan-deliver-link" /><span class="option-icon">${icon('link2', 26)}</span><span>${esc(s.deliverLink)}</span></label>
    <label class="option"><input type="checkbox" id="scan-deliver-account" /><span class="option-icon">${icon('circleUserRound', 26)}</span><span>${esc(s.deliverAccount)}</span></label>
    <div id="account-login" class="card" hidden>
      <div id="login-form" class="stack">
        <p>${esc(s.loginIntro)}</p>
        <input type="email" id="login-email" placeholder="${esc(s.email)}" autocomplete="email" />
        <input type="password" id="login-password" placeholder="${esc(s.password)}" autocomplete="current-password" />
        <p class="error" id="login-error" hidden>${esc(s.loginError)}</p>
        <button id="login-submit" class="secondary">${esc(s.logIn)}</button>
        <p><a id="login-forgot-password" href="#">${esc(s.forgotPassword)}</a></p>
        <p>${esc(s.noAccount)} <a id="login-register-link" href="#" target="_blank" rel="noopener">${esc(s.register)}</a>${esc(s.registerAfter)}</p>
      </div>
      <div id="login-forgot-panel" class="stack" hidden>
        <p>${esc(s.resetIntro)}</p>
        <input type="email" id="reset-email" placeholder="${esc(s.email)}" autocomplete="email" />
        <button id="reset-submit" class="secondary">${esc(s.sendReset)}</button>
        <p id="reset-sent" hidden>${esc(s.resetSent)}</p>
        <p><a id="login-back-to-login" href="#">${esc(s.backToLogin)}</a></p>
      </div>
    </div>
    <button id="scan-deliver-done" class="primary" disabled>${esc(s.send)}</button>
  </section>

  <section id="screen-done" class="screen" hidden>
    <div class="card center">
      <span class="badge success">${icon('circleCheck', 36)}</span>
      <h1>${esc(s.doneTitle)}</h1>
      <div id="scan-done-summary" class="stack"></div>
    </div>
  </section>
</main>
<script>
(function () {
  var S = ${JSON.stringify(s)};
  ${FORMAT_SCRIPT}
  var scanSessionId = ${JSON.stringify(scanSessionId)};
  var portalUrl = ${JSON.stringify(portalUrl)};
  // returnTo (portal/RegisterPage.tsx) — so registering doesn't strand the
  // person on the portal's "check your email" screen with no way back to
  // this scan.
  document.getElementById('login-register-link').href =
    portalUrl + '/portal/register.html?returnTo=' + encodeURIComponent(window.location.href);

  var currentPhoto = null;
  var currentCorners = null;
  var pages = [];
  var sessionToken = null;
  var img = new Image();
  var canvas, ctx, scale = 1, dragging = null;
  var HIT_RADIUS = 28;

  function show(id) {
    document.querySelectorAll('.screen').forEach(function (el) { el.hidden = el.id !== id; });
  }

  function toCanvas(pt) { return { x: pt.x * scale, y: pt.y * scale }; }
  function toNatural(pt) { return { x: pt.x / scale, y: pt.y / scale }; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  document.getElementById('photo-input').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    currentPhoto = file;
    openAdjustScreen(file);
  });

  // Best-effort auto-detection (docs/scan-upload-requirements.md: "not a
  // hard requirement... manual adjustment is the actual requirement").
  // Two prior in-house Canvas heuristics (Sobel-edge extremes, then
  // brightness + largest-connected-component) each failed on a different
  // real photo (a wood-grain desk, then a light desk) — real document-
  // boundary detection is a genuinely non-trivial CV problem. This now
  // asks the backend (server/documentCornerDetector.ts, OpenCV.js's real
  // Canny+contour pipeline) instead of guessing client-side again — the
  // photo is uploaded once here (a throwaway copy, deleted server-side
  // right after detection; the real, kept copy is still only uploaded on
  // Confirm) and the backend hands back a suggested quad, or null if it
  // isn't confident, in which case this falls back to the same plain
  // inset-rectangle default as before.
  function defaultCorners(w, h) {
    return {
      tl: { x: w * 0.1, y: h * 0.1 },
      tr: { x: w * 0.9, y: h * 0.1 },
      br: { x: w * 0.9, y: h * 0.9 },
      bl: { x: w * 0.1, y: h * 0.9 },
    };
  }

  function toCornersObject(cornersArray) {
    return { tl: cornersArray[0], tr: cornersArray[1], br: cornersArray[2], bl: cornersArray[3] };
  }

  function showDetectStatus(message) {
    var el = document.getElementById('adjust-detect-status');
    el.textContent = message;
    el.hidden = false;
  }

  function openAdjustScreen(file) {
    show('screen-adjust');
    document.getElementById('adjust-hint').hidden = true;
    document.getElementById('adjust-detecting').hidden = false;
    document.getElementById('adjust-detect-status').hidden = true;
    document.getElementById('canvas-wrap').hidden = true;
    document.getElementById('scan-confirm-corners').disabled = true;

    // Waits on both the image decode (fast, local) and the detection
    // round-trip (network) before drawing — neither is guaranteed to
    // finish first. Sizing the canvas itself has to wait until canvas-wrap
    // is actually unhidden below, not here: reading wrap.clientWidth while
    // it's still display:none (the global [hidden] rule) returns 0, which
    // collapsed the canvas to zero height entirely (confirmed live).
    var url = URL.createObjectURL(file);
    var imageReady = new Promise(function (resolve) {
      img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve();
      };
      img.src = url;
    });

    // Temporary diagnostic surface (adjust-detect-status) — a prior silent
    // catch-and-fall-back made it impossible to tell "detection legitimately
    // found nothing" apart from "the request itself failed," which is
    // exactly the ambiguity blocking a live bug report right now.
    var formData = new FormData();
    formData.append('photo', file);
    var detectionDone = fetch('/api/scan-sessions/' + scanSessionId + '/detect-corners', {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(15000),
    })
      .then(function (res) {
        if (!res.ok) throw new Error('detect-corners returned HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data.corners) showDetectStatus(S.detectNone);
        return data.corners ? toCornersObject(data.corners) : null;
      })
      .catch(function (err) {
        console.warn('detect-corners failed', err); showDetectStatus(S.detectNone);
        return null;
      });

    Promise.all([imageReady, detectionDone]).then(function (results) {
      currentCorners = results[1] || defaultCorners(img.naturalWidth, img.naturalHeight);
      document.getElementById('adjust-hint').hidden = false;
      document.getElementById('adjust-detecting').hidden = true;
      document.getElementById('canvas-wrap').hidden = false;
      document.getElementById('scan-confirm-corners').disabled = false;

      canvas = document.getElementById('adjust-canvas');
      var wrap = document.getElementById('canvas-wrap');
      scale = wrap.clientWidth / img.naturalWidth;
      canvas.width = wrap.clientWidth;
      canvas.height = img.naturalHeight * scale;
      ctx = canvas.getContext('2d');
      drawCanvas();
    });
  }

  function drawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    var order = ['tl', 'tr', 'br', 'bl'];
    var pts = order.map(function (k) { return toCanvas(currentCorners[k]); });
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(13,26,69,0.45)';
    ctx.fill('evenodd');
    ctx.restore();
    ctx.strokeStyle = '#1257ff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j].x, pts[j].y);
    ctx.closePath();
    ctx.stroke();
    pts.forEach(function (p) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
      ctx.fillStyle = '#1257ff';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }

  function cornerAt(cx, cy) {
    var order = ['tl', 'tr', 'br', 'bl'];
    var closest = null, closestDist = Infinity;
    order.forEach(function (key) {
      var p = toCanvas(currentCorners[key]);
      var d = Math.hypot(p.x - cx, p.y - cy);
      if (d < closestDist) { closestDist = d; closest = key; }
    });
    return closestDist <= HIT_RADIUS ? closest : null;
  }

  function pointerPos(e) {
    var rect = canvas.getBoundingClientRect();
    return { x: clamp(e.clientX - rect.left, 0, canvas.width), y: clamp(e.clientY - rect.top, 0, canvas.height) };
  }

  document.getElementById('adjust-canvas').addEventListener('pointerdown', function (e) {
    var pos = pointerPos(e);
    dragging = cornerAt(pos.x, pos.y);
    if (dragging) canvas.setPointerCapture(e.pointerId);
  });
  document.addEventListener('pointermove', function (e) {
    if (!dragging || !canvas) return;
    var pos = pointerPos(e);
    currentCorners[dragging] = toNatural(pos);
    drawCanvas();
  });
  document.addEventListener('pointerup', function () { dragging = null; });
  document.addEventListener('pointercancel', function () { dragging = null; });

  document.getElementById('scan-retake').addEventListener('click', function () {
    currentPhoto = null;
    document.getElementById('photo-input').value = '';
    show('screen-start');
  });

  document.getElementById('scan-confirm-corners').addEventListener('click', function () {
    var btn = document.getElementById('scan-confirm-corners');
    btn.disabled = true;
    btn.textContent = S.processing;
    var formData = new FormData();
    formData.append('photo', currentPhoto);
    formData.append('corners', JSON.stringify([currentCorners.tl, currentCorners.tr, currentCorners.br, currentCorners.bl]));
    fetch('/api/scan-sessions/' + scanSessionId + '/pages', { method: 'POST', body: formData })
      .then(function (res) { if (!res.ok) throw new Error('upload failed'); return res.json(); })
      .then(function (page) { return waitForPageReady(page.id); })
      .then(openPreviewScreen)
      .catch(function () { alert(S.processFailed); })
      .finally(function () { btn.disabled = false; btn.textContent = S.confirm; });
  });

  function waitForPageReady(pageId) {
    return new Promise(function (resolve, reject) {
      (function poll() {
        fetch('/api/scan-sessions/' + scanSessionId)
          .then(function (res) { return res.json(); })
          .then(function (data) {
            pages = data.pages;
            var page = data.pages.find(function (p) { return p.id === pageId; });
            if (page && page.status === 'ready') return resolve();
            if (page && page.status === 'failed') return reject(new Error('processing failed'));
            setTimeout(poll, 1000);
          })
          .catch(reject);
      })();
    });
  }

  function openPreviewScreen() {
    var last = pages[pages.length - 1];
    document.getElementById('preview-title').textContent = fmt(S.pageTitle, { number: last.pageNumber });
    document.getElementById('scan-page-preview').src = '/api/scan-sessions/' + scanSessionId + '/pages/' + last.id + '/content';
    var strip = document.getElementById('thumb-strip');
    strip.innerHTML = '';
    if (pages.length > 1) {
      pages.forEach(function (p, i) {
        var thumb = document.createElement('img');
        thumb.src = '/api/scan-sessions/' + scanSessionId + '/pages/' + p.id + '/content';
        thumb.id = 'scan-page-thumb-' + (i + 1);
        strip.appendChild(thumb);
      });
    }
    show('screen-preview');
  }

  document.getElementById('scan-add-page').addEventListener('click', function () {
    document.getElementById('photo-input').value = '';
    show('screen-start');
  });
  document.getElementById('scan-finish').addEventListener('click', function () { show('screen-deliver'); });

  var emailCheckbox = document.getElementById('scan-deliver-email');
  var emailInput = document.getElementById('scan-email-input');
  var linkCheckbox = document.getElementById('scan-deliver-link');
  var accountCheckbox = document.getElementById('scan-deliver-account');
  var accountLogin = document.getElementById('account-login');
  var doneButton = document.getElementById('scan-deliver-done');

  function updateDoneButton() {
    var anyChecked = emailCheckbox.checked || linkCheckbox.checked || accountCheckbox.checked;
    var emailOk = !emailCheckbox.checked || emailInput.value.indexOf('@') > 0;
    var accountOk = !accountCheckbox.checked || sessionToken !== null;
    doneButton.disabled = !anyChecked || !emailOk || !accountOk;
  }

  emailCheckbox.addEventListener('change', function () { emailInput.hidden = !emailCheckbox.checked; updateDoneButton(); });
  emailInput.addEventListener('input', updateDoneButton);
  linkCheckbox.addEventListener('change', updateDoneButton);
  accountCheckbox.addEventListener('change', function () {
    accountLogin.hidden = !accountCheckbox.checked || sessionToken !== null;
    updateDoneButton();
  });

  document.getElementById('login-submit').addEventListener('click', function () {
    var email = document.getElementById('login-email').value;
    var password = document.getElementById('login-password').value;
    var errorEl = document.getElementById('login-error');
    errorEl.hidden = true;
    fetch('/api/accounts/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password }),
    })
      .then(function (res) { if (!res.ok) throw new Error('login failed'); return res.json(); })
      .then(function (data) {
        sessionToken = data.sessionToken;
        accountLogin.hidden = true;
        updateDoneButton();
      })
      .catch(function () { errorEl.hidden = false; });
  });

  var loginForm = document.getElementById('login-form');
  var forgotPanel = document.getElementById('login-forgot-panel');
  var resetSubmit = document.getElementById('reset-submit');
  var resetSent = document.getElementById('reset-sent');

  document.getElementById('login-forgot-password').addEventListener('click', function (e) {
    e.preventDefault();
    loginForm.hidden = true;
    forgotPanel.hidden = false;
  });
  document.getElementById('login-back-to-login').addEventListener('click', function (e) {
    e.preventDefault();
    forgotPanel.hidden = true;
    loginForm.hidden = false;
    resetSent.hidden = true;
    resetSubmit.hidden = false;
  });
  resetSubmit.addEventListener('click', function () {
    var email = document.getElementById('reset-email').value;
    // Same response either way regardless of outcome (docs/personal-account-requirements.md
    // / server/routes.ts's request-password-reset — never confirms whether an
    // email exists), so this always ends on "check your email," including on
    // a network error, same as the kiosk's own LoginPanel.
    fetch('/api/accounts/request-password-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email }),
    })
      .catch(function () {})
      .then(function () {
        resetSent.hidden = false;
        resetSubmit.hidden = true;
      });
  });

  doneButton.addEventListener('click', function () {
    doneButton.disabled = true;
    doneButton.textContent = S.sending;
    var methods = [];
    if (emailCheckbox.checked) methods.push('email');
    if (linkCheckbox.checked) methods.push('link');
    if (accountCheckbox.checked) methods.push('account');
    var headers = { 'Content-Type': 'application/json' };
    if (sessionToken) headers.Authorization = 'Bearer ' + sessionToken;
    fetch('/api/scan-sessions/' + scanSessionId + '/deliver', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ methods: methods, email: emailCheckbox.checked ? emailInput.value : undefined }),
    })
      .then(function (res) { if (!res.ok) throw new Error('delivery failed'); })
      .then(function () { openDoneScreen(methods); })
      .catch(function () {
        alert(S.deliverFailed);
        doneButton.disabled = false;
        doneButton.textContent = S.send;
      });
  });

  function openDoneScreen(methods) {
    var summary = document.getElementById('scan-done-summary');
    summary.innerHTML = '';
    function line(text) {
      var p = document.createElement('p');
      p.textContent = text;
      summary.appendChild(p);
    }
    if (methods.indexOf('email') !== -1) line(S.doneEmail);
    if (methods.indexOf('link') !== -1) {
      var a = document.createElement('a');
      a.className = 'button-like primary';
      a.href = '/api/scan-sessions/' + scanSessionId + '/download';
      a.textContent = S.doneDownload;
      summary.appendChild(a);
      line(S.doneLinkNote);
    }
    if (methods.indexOf('account') !== -1) line(S.doneAccount);
    show('screen-done');
  }

  // Resume on load — this page previously kept every bit of progress in JS
  // memory only, so any full reload (a real crash/refresh, or navigating
  // away to register an account and using its "Return to your scan" link,
  // which lands back here as a fresh page load, not a restored tab) silently
  // reset all the way back to Start even though the server still has the
  // captured pages. Checking the server's real state on load and jumping
  // straight to wherever it actually leaves off fixes both cases at once —
  // matches the "leaving and returning ... preserves ... current state"
  // persistence rule docs/screens/scan-spec.md already established for the
  // kiosk side of this same screen.
  fetch('/api/scan-sessions/' + scanSessionId)
    .then(function (res) { return res.json(); })
    .then(function (data) {
      pages = data.pages || [];
      if (data.deliveredAt) {
        openDoneScreen(data.deliveryMethods || []);
      } else if (pages.length > 0) {
        openPreviewScreen();
      }
    })
    .catch(function () {});
})();
</script>
</body>
</html>`;
}

const STYLES = `
  .canvas-wrap { width: 100%; touch-action: none; border-radius: var(--radius-large); overflow: hidden; background: #0d1a45; }
  #adjust-canvas { display: block; width: 100%; touch-action: none; }
  .page-preview { width: 100%; border-radius: var(--radius-large); border: 1.5px solid var(--color-border); background: #fff; }
  .thumb-strip { display: flex; gap: var(--space-s); overflow-x: auto; }
  .thumb-strip img { height: 72px; border-radius: var(--radius-small); border: 1.5px solid var(--color-border); }

  .stack { display: flex; flex-direction: column; gap: var(--space-s); }
  .option { display: flex; align-items: center; gap: var(--space-m); min-height: 64px; padding: 0 var(--space-m);
    border: 1.5px solid var(--color-border-strong); border-radius: var(--radius-medium); background: var(--color-surface);
    font: 700 1.05rem/1.3 var(--font); cursor: pointer; }
  .option input { width: 22px; height: 22px; accent-color: var(--color-accent); flex: none; }
  .option-icon { display: inline-flex; color: var(--color-accent); }
  .option:has(input:checked) { border-color: var(--color-accent); background: var(--color-accent-soft); }
`;
