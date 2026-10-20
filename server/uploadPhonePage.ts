import { icon } from './phoneIcons.js';
import {
  escapeHtml,
  format,
  phoneHead,
  PHONE_STRINGS,
  type PhoneLanguage,
} from './phonePageKit.js';

// QR upload's phone page (docs/qr-upload-requirements.md) — the kiosk's QR
// code opens it (2026-10 redesign, batch 8). A plain form post, no script
// needed to work: choose files, upload, come back to the same page with
// "done" or what was wrong. The small script only shows how many files are
// chosen and dims the button while uploading.

export interface UploadPageOptions {
  sessionId: string;
  language: PhoneLanguage;
  uploaded: boolean;
  error: 'size' | 'format' | null;
  acceptedExtensions: readonly string[];
  maxFileSizeMb: number;
}

export function renderUploadPhonePage(options: UploadPageOptions): string {
  const { sessionId, language, uploaded, error, acceptedExtensions, maxFileSizeMb } = options;
  const s = PHONE_STRINGS[language];
  const formats = acceptedExtensions
    .map((extension) => extension.slice(1).toUpperCase())
    .join(', ');
  const action = `/api/qr-sessions/${encodeURIComponent(sessionId)}/files?lang=${language}`;
  const errorText =
    error === 'size'
      ? format(s.uploadErrorSize, { mb: maxFileSizeMb })
      : error === 'format'
        ? format(s.uploadErrorFormat, { formats })
        : null;

  return `${phoneHead(language, s.uploadTitle, EXTRA_STYLES)}
<main class="screen">
  ${uploaded ? `<div class="notice success" id="upload-done">${icon('circleCheck', 22)}<span>${escapeHtml(s.uploadDone)}</span></div>` : ''}
  ${errorText ? `<div class="notice error" id="upload-error">${icon('circleAlert', 22)}<span>${escapeHtml(errorText)}</span></div>` : ''}
  <form class="card center" method="post" action="${action}" enctype="multipart/form-data" id="upload-form">
    <span class="badge">${icon('upload', 34)}</span>
    <h1>${escapeHtml(s.uploadTitle)}</h1>
    <p>${escapeHtml(s.uploadSubtitle)}</p>
    <label class="picker" for="upload-files">
      ${icon('fileText', 26)}
      <span id="upload-picked">${escapeHtml(s.uploadChoose)}</span>
    </label>
    <input type="file" name="files" id="upload-files" multiple required accept="${acceptedExtensions.join(',')}" />
    <button type="submit" class="primary" id="upload-submit" disabled>${escapeHtml(s.uploadSubmit)}</button>
    <p class="hint">${escapeHtml(format(s.uploadFormats, { formats, mb: maxFileSizeMb }))}</p>
  </form>
  <p class="privacy">${icon('shieldCheck', 20)}<span>${escapeHtml(s.privacy)}</span></p>
</main>
<script>
(function () {
  var chosen = ${JSON.stringify(s.uploadChosen)};
  var choose = ${JSON.stringify(s.uploadChoose)};
  var sending = ${JSON.stringify(s.uploadSending)};
  var input = document.getElementById('upload-files');
  var picked = document.getElementById('upload-picked');
  var submit = document.getElementById('upload-submit');
  input.addEventListener('change', function () {
    var count = input.files ? input.files.length : 0;
    picked.textContent = count > 0 ? chosen.replace('{count}', count) : choose;
    submit.disabled = count === 0;
  });
  document.getElementById('upload-form').addEventListener('submit', function () {
    submit.disabled = true;
    submit.textContent = sending;
  });
})();
</script>
</body>
</html>`;
}

// The file input itself stays in the page (it's what the form posts) but
// out of sight — the big dashed "choose files" area is its label.
const EXTRA_STYLES = `
  #upload-files { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
  .picker { display: flex; align-items: center; justify-content: center; gap: var(--space-s); width: 100%;
    min-height: 96px; padding: var(--space-m); border: 2px dashed var(--color-border-strong);
    border-radius: var(--radius-large); background: var(--color-surface-sunken); color: var(--color-ink);
    font: 700 1.05rem/1.3 var(--font); cursor: pointer; }
  .picker svg { color: var(--color-accent); flex: none; }
`;
