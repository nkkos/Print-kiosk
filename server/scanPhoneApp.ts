// Phone-Camera Scan's phone-facing flow (docs/scan-upload-requirements.md,
// docs/screens/scan-spec.md, "Phone-facing flow") — five screens (P1-P5) as
// one plain HTML/CSS/vanilla-JS page, served directly by this backend (same
// reasoning as server/routes.ts's existing `/upload/:sessionId` QR-upload
// page: the phone's request never needs CORS if it's same-origin). Not a
// bundled TypeScript app and not the kiosk's React SPA/component library
// (docs/screens/scan-spec.md, "Design system reuse") — it draws from the
// same token *values* (colors/radius/type below are copied from
// src/styles/tokens.css, not imported — this page is intentionally outside
// that build) rather than being a sixth consumer of it.
//
// State (current photo, corners, captured pages, login) lives entirely in
// this page's own JS variables — there is nothing else to share it with, so
// no framework/store is warranted (same "extract only once two consumers
// exist" reasoning CLAUDE.md documents for the kiosk app itself).

export function renderScanPhoneApp(scanSessionId: string, portalUrl: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Scan a document</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&display=swap" />
<style>
  :root {
    --space-s: 8px; --space-m: 16px; --space-l: 32px;
    --radius-small: 6px; --radius-medium: 12px; --radius-large: 24px;
    --color-background: #f2f6f5; --color-surface: #ffffff;
    --color-surface-sunken: #e8eeec; --color-border: #d7e0de;
    --color-border-strong: #b7c4c1; --color-ink: #101817; --color-ink-soft: #56635f;
    --color-accent: #0c6e68; --color-accent-strong: #094f4b; --color-accent-soft: #dcefec;
    --color-danger: #b3261e;
    --font-family-base: 'Manrope', system-ui, sans-serif;
  }
  * { box-sizing: border-box; }
  /* The [hidden] attribute's UA-stylesheet display:none is low-specificity
     and gets silently overridden by any later same-specificity type
     selector (button { display: inline-flex } below, in particular) —
     confirmed live: #reset-submit stayed visible after being hidden by JS.
     !important pins "hidden means hidden" regardless of what else targets
     the element. */
  [hidden] { display: none !important; }
  body {
    margin: 0; font-family: var(--font-family-base); background: var(--color-background);
    color: var(--color-ink); padding: var(--space-m);
  }
  h1 { font: 700 1.5rem/1.3 var(--font-family-base); margin: 0 0 var(--space-s); }
  p { font: 500 1rem/1.5 var(--font-family-base); color: var(--color-ink-soft); }
  .screen { max-width: 480px; margin: 0 auto; }
  button, .button-like {
    display: inline-flex; align-items: center; justify-content: center;
    font: 600 1rem/1.2 var(--font-family-base); border-radius: var(--radius-medium);
    padding: 14px 20px; border: none; cursor: pointer; width: 100%; margin-top: var(--space-s);
  }
  .primary { background: var(--color-accent); color: #fff; }
  .primary:disabled { background: var(--color-border); color: var(--color-ink-soft); cursor: not-allowed; }
  .secondary { background: var(--color-surface); color: var(--color-ink); border: 1px solid var(--color-border-strong); }
  .actions { display: flex; gap: var(--space-s); margin-top: var(--space-m); }
  .actions > * { margin-top: 0; }
  .canvas-wrap { width: 100%; touch-action: none; border-radius: var(--radius-medium); overflow: hidden; background: #000; }
  #adjust-canvas { display: block; width: 100%; touch-action: none; }
  #scan-page-preview { width: 100%; border-radius: var(--radius-medium); border: 1px solid var(--color-border); }
  .thumb-strip { display: flex; gap: var(--space-s); overflow-x: auto; margin-top: var(--space-s); }
  .thumb-strip img { height: 64px; border-radius: var(--radius-small); border: 1px solid var(--color-border); }
  label.checkbox-row { display: flex; align-items: center; gap: var(--space-s); font: 500 1rem var(--font-family-base); margin-top: var(--space-m); }
  input[type="email"], input[type="password"], input[type="text"] {
    width: 100%; padding: 12px; border-radius: var(--radius-small); border: 1px solid var(--color-border-strong);
    font: 500 1rem var(--font-family-base); margin-top: var(--space-s);
  }
  #account-login { background: var(--color-surface); border-radius: var(--radius-medium); padding: var(--space-m); margin-top: var(--space-s); }
  .error { color: var(--color-danger); font-weight: 600; }
  .card { background: var(--color-surface); border-radius: var(--radius-large); padding: var(--space-l) var(--space-m); text-align: center; }
</style>
</head>
<body>
<main id="app">
  <section id="screen-start" class="screen">
    <div class="card">
      <h1>Scan a document</h1>
      <p>Take a clear, well-lit photo of one page of your document.</p>
      <label class="button-like primary" id="scan-take-photo" for="photo-input">Take photo</label>
      <input type="file" accept="image/*" capture="environment" id="photo-input" hidden />
    </div>
  </section>

  <section id="screen-adjust" class="screen" hidden>
    <h1>Adjust corners</h1>
    <p id="adjust-hint">Drag the corners to match the edges of the page.</p>
    <p id="adjust-detecting" hidden>Detecting document edges…</p>
    <p id="adjust-detect-status" class="error" hidden></p>
    <div class="canvas-wrap" id="canvas-wrap" hidden><canvas id="adjust-canvas"></canvas></div>
    <div class="actions">
      <button id="scan-retake" class="secondary">Retake</button>
      <button id="scan-confirm-corners" class="primary" disabled>Confirm</button>
    </div>
  </section>

  <section id="screen-preview" class="screen" hidden>
    <h1>Page <span id="preview-page-number"></span></h1>
    <img id="scan-page-preview" alt="Processed page preview" />
    <div id="thumb-strip" class="thumb-strip"></div>
    <div class="actions">
      <button id="scan-add-page" class="secondary">Add another page</button>
      <button id="scan-finish" class="primary">Finish</button>
    </div>
  </section>

  <section id="screen-deliver" class="screen" hidden>
    <h1>Get your document</h1>
    <label class="checkbox-row"><input type="checkbox" id="scan-deliver-email" /> Email it to me</label>
    <input type="email" id="scan-email-input" placeholder="you@example.com" hidden />
    <label class="checkbox-row"><input type="checkbox" id="scan-deliver-link" /> Give me a download link</label>
    <label class="checkbox-row"><input type="checkbox" id="scan-deliver-account" /> Save to my Personal Account</label>
    <div id="account-login" hidden>
      <div id="login-form">
        <p style="margin-top:0">Log in to save this scan to your account.</p>
        <input type="email" id="login-email" placeholder="Email" />
        <input type="password" id="login-password" placeholder="Password" />
        <p class="error" id="login-error" hidden>Incorrect email or password.</p>
        <button id="login-submit" class="secondary">Log in</button>
        <p><a id="login-forgot-password" href="#">Forgot password?</a></p>
        <p>No account? <a id="login-register-link" href="#" target="_blank" rel="noopener">Register on the portal</a>, then come back here.</p>
      </div>
      <div id="login-forgot-panel" hidden>
        <p style="margin-top:0">Enter your email and we'll send reset instructions.</p>
        <input type="email" id="reset-email" placeholder="Email" />
        <button id="reset-submit" class="secondary">Send reset instructions</button>
        <p id="reset-sent" hidden>If an account with that email exists, reset instructions were sent.</p>
        <p><a id="login-back-to-login" href="#">Back to log in</a></p>
      </div>
    </div>
    <button id="scan-deliver-done" class="primary" disabled>Finish</button>
  </section>

  <section id="screen-done" class="screen" hidden>
    <div class="card">
      <h1>Done!</h1>
      <div id="scan-done-summary"></div>
    </div>
  </section>
</main>
<script>
(function () {
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
        if (!data.corners) showDetectStatus('Auto-detect found no document — using default corners.');
        return data.corners ? toCornersObject(data.corners) : null;
      })
      .catch(function (err) {
        showDetectStatus('Auto-detect request failed (' + err.message + ') — using default corners.');
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
    ctx.fillStyle = 'rgba(16,24,23,0.45)';
    ctx.fill('evenodd');
    ctx.restore();
    ctx.strokeStyle = '#0c6e68';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j].x, pts[j].y);
    ctx.closePath();
    ctx.stroke();
    pts.forEach(function (p) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#0c6e68';
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
    btn.textContent = 'Processing…';
    var formData = new FormData();
    formData.append('photo', currentPhoto);
    formData.append('corners', JSON.stringify([currentCorners.tl, currentCorners.tr, currentCorners.br, currentCorners.bl]));
    fetch('/api/scan-sessions/' + scanSessionId + '/pages', { method: 'POST', body: formData })
      .then(function (res) { if (!res.ok) throw new Error('upload failed'); return res.json(); })
      .then(function (page) { return waitForPageReady(page.id); })
      .then(openPreviewScreen)
      .catch(function () { alert('Something went wrong processing this page. Please try again.'); })
      .finally(function () { btn.disabled = false; btn.textContent = 'Confirm'; });
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
    document.getElementById('preview-page-number').textContent = last.pageNumber;
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
    doneButton.textContent = 'Finishing…';
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
        alert('Delivery failed. Please try again.');
        doneButton.disabled = false;
        doneButton.textContent = 'Finish';
      });
  });

  function openDoneScreen(methods) {
    var lines = [];
    if (methods.indexOf('email') !== -1) lines.push('<p>Sent to your email.</p>');
    if (methods.indexOf('link') !== -1) {
      lines.push('<p><a href="/api/scan-sessions/' + scanSessionId + '/download">Download your document</a></p>');
    }
    if (methods.indexOf('account') !== -1) lines.push('<p>Saved to your Personal Account.</p>');
    document.getElementById('scan-done-summary').innerHTML = lines.join('');
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
