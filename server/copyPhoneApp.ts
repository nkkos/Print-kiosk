// Copy's phone-facing flow (docs/copy-upload-requirements.md,
// docs/screens/copy-spec.md, "Phone-facing flow") — four screens (P1-P3 +
// a terminal "done" screen) as one plain HTML/CSS/vanilla-JS page, same
// architecture as server/scanPhoneApp.ts (served directly by this backend,
// no bundler, no framework — see that file's own header comment for the
// full reasoning, unchanged here). P2's corner-adjust canvas logic below is
// deliberately near-identical to scanPhoneApp.ts's — same interaction, same
// server-side detection endpoint shape — just re-hosted under Copy's own
// element ids and session routes per docs/screens/copy-spec.md's "Reuse
// decision" (ids stay traceable to exactly one flow even where the
// underlying behavior is shared).
//
// What's different from Scan: no delivery step (P4/P5) — "Finish" combines
// the pages straight into a real uploaded file and shows a plain "go back
// to the kiosk" message; no login anywhere, since Copy's output never
// leaves the Kiosk Session.

export function renderCopyPhoneApp(copySessionId: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Copy a document</title>
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
  /* See server/scanPhoneApp.ts's own comment here — the [hidden] attribute
     needs !important to actually win over the later button { display }
     rule below, confirmed live on that page. */
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
  #copy-page-preview { width: 100%; border-radius: var(--radius-medium); border: 1px solid var(--color-border); }
  .thumb-strip { display: flex; gap: var(--space-s); overflow-x: auto; margin-top: var(--space-s); }
  .thumb-strip img { height: 64px; border-radius: var(--radius-small); border: 1px solid var(--color-border); }
  .error { color: var(--color-danger); font-weight: 600; }
  .card { background: var(--color-surface); border-radius: var(--radius-large); padding: var(--space-l) var(--space-m); text-align: center; }
</style>
</head>
<body>
<main id="app">
  <section id="screen-start" class="screen">
    <div class="card">
      <h1>Copy a document</h1>
      <p>To print a copy, first scan the document with your phone.</p>
      <label class="button-like primary" id="copy-take-photo" for="photo-input">Take photo</label>
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
      <button id="copy-retake" class="secondary">Retake</button>
      <button id="copy-confirm-corners" class="primary" disabled>Confirm</button>
    </div>
  </section>

  <section id="screen-preview" class="screen" hidden>
    <h1>Page <span id="preview-page-number"></span></h1>
    <img id="copy-page-preview" alt="Processed page preview" />
    <div id="thumb-strip" class="thumb-strip"></div>
    <div class="actions">
      <button id="copy-add-page" class="secondary">Add another page</button>
      <button id="copy-finish" class="primary">Finish</button>
    </div>
  </section>

  <section id="screen-done" class="screen" hidden>
    <div class="card">
      <h1>All set</h1>
      <p id="copy-done-message">Your document is ready. You can put your phone away — go back to the kiosk to choose your print settings.</p>
    </div>
  </section>
</main>
<script>
(function () {
  var copySessionId = ${JSON.stringify(copySessionId)};

  var currentPhoto = null;
  var currentCorners = null;
  var pages = [];
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

  // Best-effort auto-detection — same server-side OpenCV pipeline and same
  // client wiring as server/scanPhoneApp.ts's own P2 (docs/copy-upload-requirements.md
  // confirms corner adjustment is unchanged for Copy); see that file for the
  // history behind this approach.
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
    document.getElementById('copy-confirm-corners').disabled = true;

    var url = URL.createObjectURL(file);
    var imageReady = new Promise(function (resolve) {
      img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve();
      };
      img.src = url;
    });

    var formData = new FormData();
    formData.append('photo', file);
    var detectionDone = fetch('/api/copy-sessions/' + copySessionId + '/detect-corners', {
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
      document.getElementById('copy-confirm-corners').disabled = false;

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

  document.getElementById('copy-retake').addEventListener('click', function () {
    currentPhoto = null;
    document.getElementById('photo-input').value = '';
    show('screen-start');
  });

  document.getElementById('copy-confirm-corners').addEventListener('click', function () {
    var btn = document.getElementById('copy-confirm-corners');
    btn.disabled = true;
    btn.textContent = 'Processing…';
    var formData = new FormData();
    formData.append('photo', currentPhoto);
    formData.append('corners', JSON.stringify([currentCorners.tl, currentCorners.tr, currentCorners.br, currentCorners.bl]));
    fetch('/api/copy-sessions/' + copySessionId + '/pages', { method: 'POST', body: formData })
      .then(function (res) { if (!res.ok) throw new Error('upload failed'); return res.json(); })
      .then(function (page) { return waitForPageReady(page.id); })
      .then(openPreviewScreen)
      .catch(function () { alert('Something went wrong processing this page. Please try again.'); })
      .finally(function () { btn.disabled = false; btn.textContent = 'Confirm'; });
  });

  function waitForPageReady(pageId) {
    return new Promise(function (resolve, reject) {
      (function poll() {
        fetch('/api/copy-sessions/' + copySessionId)
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
    document.getElementById('copy-page-preview').src = '/api/copy-sessions/' + copySessionId + '/pages/' + last.id + '/content';
    var strip = document.getElementById('thumb-strip');
    strip.innerHTML = '';
    if (pages.length > 1) {
      pages.forEach(function (p, i) {
        var thumb = document.createElement('img');
        thumb.src = '/api/copy-sessions/' + copySessionId + '/pages/' + p.id + '/content';
        thumb.id = 'copy-page-thumb-' + (i + 1);
        strip.appendChild(thumb);
      });
    }
    show('screen-preview');
  }

  document.getElementById('copy-add-page').addEventListener('click', function () {
    document.getElementById('photo-input').value = '';
    show('screen-start');
  });

  document.getElementById('copy-finish').addEventListener('click', function () {
    var btn = document.getElementById('copy-finish');
    btn.disabled = true;
    btn.textContent = 'Finishing…';
    fetch('/api/copy-sessions/' + copySessionId + '/finish', { method: 'POST' })
      .then(function (res) { if (!res.ok) throw new Error('finish failed'); })
      .then(function () { show('screen-done'); })
      .catch(function () {
        alert('Something went wrong finishing this document. Please try again.');
        btn.disabled = false;
        btn.textContent = 'Finish';
      });
  });

  // Resume on load — same reasoning as server/scanPhoneApp.ts's own resume
  // block: a full reload shouldn't silently lose already-captured pages
  // just because this page's JS memory reset.
  fetch('/api/copy-sessions/' + copySessionId)
    .then(function (res) { return res.json(); })
    .then(function (data) {
      pages = data.pages || [];
      if (data.resultFileId) {
        show('screen-done');
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
