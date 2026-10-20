// Copy's phone-facing flow (docs/copy-upload-requirements.md,
// docs/screens/copy-spec.md, "Phone-facing flow") — four screens (P1-P3 +
// a terminal "done" screen) as one plain HTML/CSS/vanilla-JS page, same
// architecture as server/scanPhoneApp.ts (served directly by this backend,
// no bundler, no framework — see that file's own header comment for the
// full reasoning; look and languages from server/phonePageKit.ts). P2's
// corner-adjust canvas logic below is deliberately near-identical to
// scanPhoneApp.ts's — same interaction, same server-side detection endpoint
// shape — just re-hosted under Copy's own element ids and session routes per
// docs/screens/copy-spec.md's "Reuse decision" (ids stay traceable to
// exactly one flow even where the underlying behavior is shared).
//
// What's different from Scan: no delivery step (P4/P5) — "Finish" combines
// the pages straight into a real uploaded file and shows a plain "go back
// to the kiosk" message; no login anywhere, since Copy's output never
// leaves the Kiosk Session.

import { icon } from './phoneIcons.js';
import {
  escapeHtml as esc,
  format,
  FORMAT_SCRIPT,
  phoneHead,
  PHONE_STRINGS,
  type PhoneLanguage,
} from './phonePageKit.js';

const TOTAL = 3;

export function renderCopyPhoneApp(copySessionId: string, language: PhoneLanguage): string {
  const s = PHONE_STRINGS[language];
  return `${phoneHead(language, s.copyTitle, STYLES)}
<main id="app">
  <section id="screen-start" class="screen">
    <div class="card center">
      <span class="step">${esc(format(s.stepOf, { step: 1, total: TOTAL }))}</span>
      <span class="badge">${icon('copy', 34)}</span>
      <h1>${esc(s.copyTitle)}</h1>
      <p>${esc(s.copyStart)}</p>
      <label class="button-like primary" id="copy-take-photo" for="photo-input">${icon('camera', 24)}${esc(s.takePhoto)}</label>
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
      <button id="copy-retake" class="secondary">${esc(s.retake)}</button>
      <button id="copy-confirm-corners" class="primary" disabled>${esc(s.confirm)}</button>
    </div>
  </section>

  <section id="screen-preview" class="screen" hidden>
    <span class="step">${esc(format(s.stepOf, { step: 3, total: TOTAL }))}</span>
    <h1 id="preview-title"></h1>
    <img id="copy-page-preview" class="page-preview" alt="" />
    <div id="thumb-strip" class="thumb-strip"></div>
    <div class="actions">
      <button id="copy-add-page" class="secondary">${esc(s.addPage)}</button>
      <button id="copy-finish" class="primary">${esc(s.finish)}</button>
    </div>
  </section>

  <section id="screen-done" class="screen" hidden>
    <div class="card center">
      <span class="badge success">${icon('circleCheck', 36)}</span>
      <h1>${esc(s.copyDoneTitle)}</h1>
      <p id="copy-done-message">${esc(s.copyDoneText)}</p>
    </div>
  </section>
</main>
<script>
(function () {
  var S = ${JSON.stringify(s)};
  ${FORMAT_SCRIPT}
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

  document.getElementById('copy-retake').addEventListener('click', function () {
    currentPhoto = null;
    document.getElementById('photo-input').value = '';
    show('screen-start');
  });

  document.getElementById('copy-confirm-corners').addEventListener('click', function () {
    var btn = document.getElementById('copy-confirm-corners');
    btn.disabled = true;
    btn.textContent = S.processing;
    var formData = new FormData();
    formData.append('photo', currentPhoto);
    formData.append('corners', JSON.stringify([currentCorners.tl, currentCorners.tr, currentCorners.br, currentCorners.bl]));
    fetch('/api/copy-sessions/' + copySessionId + '/pages', { method: 'POST', body: formData })
      .then(function (res) { if (!res.ok) throw new Error('upload failed'); return res.json(); })
      .then(function (page) { return waitForPageReady(page.id); })
      .then(openPreviewScreen)
      .catch(function () { alert(S.processFailed); })
      .finally(function () { btn.disabled = false; btn.textContent = S.confirm; });
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
    document.getElementById('preview-title').textContent = fmt(S.pageTitle, { number: last.pageNumber });
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
    btn.textContent = S.finishing;
    fetch('/api/copy-sessions/' + copySessionId + '/finish', { method: 'POST' })
      .then(function (res) { if (!res.ok) throw new Error('finish failed'); })
      .then(function () { show('screen-done'); })
      .catch(function () {
        alert(S.copyFinishFailed);
        btn.disabled = false;
        btn.textContent = S.finish;
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

const STYLES = `
  .canvas-wrap { width: 100%; touch-action: none; border-radius: var(--radius-large); overflow: hidden; background: #0d1a45; }
  #adjust-canvas { display: block; width: 100%; touch-action: none; }
  .page-preview { width: 100%; border-radius: var(--radius-large); border: 1.5px solid var(--color-border); background: #fff; }
  .thumb-strip { display: flex; gap: var(--space-s); overflow-x: auto; }
  .thumb-strip img { height: 72px; border-radius: var(--radius-small); border: 1.5px solid var(--color-border); }
`;
