import type { Request } from 'express';

// What the three phone pages share (2026-10 redesign, batch 8): QR upload
// (/upload/:id), Scan (server/scanPhoneApp.ts) and Copy
// (server/copyPhoneApp.ts). They're plain HTML served by this backend,
// outside the kiosk's React build, so the look is restated here from the
// same token values (src/styles/tokens.css): the kiosk's blue and white,
// Manrope, big touch targets. And they speak the language the customer
// picked on the kiosk — the QR code carries it as `?lang=`
// (src/components/QrCard/QrCard.tsx), with the phone's own language as the
// fallback.

export type PhoneLanguage = 'en' | 'sk' | 'de' | 'ru' | 'uk';
const LANGUAGES: PhoneLanguage[] = ['en', 'sk', 'de', 'ru', 'uk'];

export function phoneLanguage(req: Request): PhoneLanguage {
  const asked = typeof req.query.lang === 'string' ? req.query.lang : '';
  if ((LANGUAGES as string[]).includes(asked)) return asked as PhoneLanguage;
  const accepted = (req.headers['accept-language'] ?? '')
    .split(',')
    .map((part) => part.trim().slice(0, 2).toLowerCase());
  return (accepted.find((code) => (LANGUAGES as string[]).includes(code)) as PhoneLanguage) ?? 'en';
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** `{name}` placeholders, filled the same way on the server and in the
 * pages' own scripts (see FORMAT_SCRIPT). */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));
}

export const FORMAT_SCRIPT = `function fmt(t, v) { return t.replace(/\\{(\\w+)\\}/g, function (_, k) { return v[k] == null ? '' : String(v[k]); }); }`;

export const PHONE_STYLES = `
  :root {
    --space-xs: 4px; --space-s: 8px; --space-m: 16px; --space-l: 24px; --space-xl: 32px;
    --radius-small: 8px; --radius-medium: 14px; --radius-large: 22px; --radius-pill: 999px;
    --color-background: #f4f7fc; --color-surface: #ffffff; --color-surface-sunken: #eef2f9;
    --color-border: #dfe6f1; --color-border-strong: #c3cde0;
    --color-ink: #0d1a45; --color-ink-soft: #66708f;
    --color-accent: #1257ff; --color-accent-strong: #0a43d1; --color-accent-soft: #e7eeff;
    --color-success: #14a37f; --color-success-soft: #ddf5ee;
    --color-warning: #b26a00; --color-warning-soft: #fdf0d9; --color-danger: #c62828;
    --font: 'Manrope', system-ui, -apple-system, 'Segoe UI', sans-serif;
  }
  * { box-sizing: border-box; }
  /* [hidden] must win over later display rules (button { display } etc.). */
  [hidden] { display: none !important; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0; min-height: 100vh; font-family: var(--font); background: var(--color-background);
    color: var(--color-ink); padding: var(--space-m) var(--space-m) var(--space-xl);
  }
  .brand { display: flex; align-items: center; gap: var(--space-s); max-width: 480px; margin: 0 auto var(--space-l);
    font: 800 1.05rem/1 var(--font); color: var(--color-ink); }
  .brand-mark { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px;
    border-radius: 10px; background: var(--color-accent-soft); color: var(--color-accent); }
  .screen { max-width: 480px; margin: 0 auto; display: flex; flex-direction: column; gap: var(--space-m); }
  .card { display: flex; flex-direction: column; gap: var(--space-m); padding: var(--space-l);
    border: 1.5px solid var(--color-border); border-radius: var(--radius-large); background: var(--color-surface);
    box-shadow: 0 1px 2px rgb(13 26 69 / 5%), 0 10px 28px rgb(13 26 69 / 6%); }
  .card.center { align-items: center; text-align: center; }
  .badge { display: inline-flex; align-items: center; justify-content: center; width: 72px; height: 72px;
    border-radius: var(--radius-pill); background: var(--color-accent-soft); color: var(--color-accent); }
  .badge.success { background: var(--color-success-soft); color: var(--color-success); }
  .step { align-self: flex-start; padding: var(--space-xs) var(--space-m); border-radius: var(--radius-pill);
    background: var(--color-accent-soft); color: var(--color-accent-strong); font: 700 0.85rem/1.4 var(--font); }
  h1 { margin: 0; font: 800 1.6rem/1.2 var(--font); letter-spacing: -0.01em; }
  p { margin: 0; font: 500 1rem/1.5 var(--font); color: var(--color-ink-soft); }
  .hint { font-size: 0.9rem; }
  button, .button-like {
    display: inline-flex; align-items: center; justify-content: center; gap: var(--space-s);
    width: 100%; min-height: 56px; padding: 0 var(--space-l); border: 1.5px solid transparent;
    border-radius: var(--radius-medium); font: 700 1.05rem/1.2 var(--font); cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  a.button-like { text-decoration: none; }
  button:active:not(:disabled), .button-like:active { transform: scale(0.98); }
  .primary { background: var(--color-accent); color: #fff; }
  .primary:disabled { background: var(--color-surface-sunken); color: #a3abbf; cursor: not-allowed; }
  .secondary { background: var(--color-surface); color: var(--color-ink); border-color: var(--color-border-strong); }
  .actions { display: flex; gap: var(--space-s); }
  .notice { display: flex; gap: var(--space-s); align-items: flex-start; padding: var(--space-m);
    border-radius: var(--radius-medium); font: 600 0.95rem/1.45 var(--font); }
  .notice svg { flex: none; }
  .notice.success { background: var(--color-success-soft); color: #0b6b53; }
  .notice.error { background: #fdecec; color: var(--color-danger); }
  .notice.info { background: var(--color-accent-soft); color: var(--color-accent-strong); }
  .error { color: var(--color-danger); font-weight: 600; }
  .privacy { display: flex; gap: var(--space-s); align-items: flex-start; max-width: 480px; margin: var(--space-l) auto 0;
    font: 500 0.85rem/1.45 var(--font); color: var(--color-ink-soft); }
  .privacy svg { flex: none; color: var(--color-accent); }
  input[type="email"], input[type="password"], input[type="text"] {
    width: 100%; min-height: 52px; padding: 0 var(--space-m); border: 1.5px solid var(--color-border-strong);
    border-radius: var(--radius-medium); background: var(--color-surface); color: var(--color-ink);
    font: 500 1rem var(--font);
  }
  input:focus-visible { outline: 3px solid var(--color-accent-soft); border-color: var(--color-accent); }
  a { color: var(--color-accent); font-weight: 700; }
`;

/** `<head>` plus the brand row, shared by the three pages. */
export function phoneHead(language: PhoneLanguage, title: string, extraStyles = ''): string {
  return `<!doctype html>
<html lang="${language}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#f4f7fc" />
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&display=swap" />
<style>${PHONE_STYLES}${extraStyles}</style>
</head>
<body>
<div class="brand"><span class="brand-mark" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg></span>Future Print</div>`;
}

// Every phone-page string, per language. `{name}` placeholders are filled
// with format() / the pages' fmt().
const EN = {
  privacy: 'Your files are seen only on this kiosk and deleted when you finish the session.',
  // QR upload
  uploadTitle: 'Upload files to the kiosk',
  uploadSubtitle: 'Choose your documents — they appear on the kiosk screen straight away.',
  uploadChoose: 'Choose files',
  uploadChosen: 'Files chosen: {count}',
  uploadSubmit: 'Upload',
  uploadSending: 'Uploading…',
  uploadDone: 'Done! Your files are on the kiosk screen. You can add more.',
  uploadErrorSize: 'This file is too large — up to {mb} MB per file. Please choose a smaller one.',
  uploadErrorFormat: 'This format isn’t supported. You can upload: {formats}.',
  uploadFormats: '{formats} · up to {mb} MB per file',
  // Scan and copy, shared
  stepOf: 'Step {step} of {total}',
  takePhoto: 'Take a photo',
  photoTip: 'Lay the page flat in good light, the whole sheet in the frame.',
  adjustTitle: 'Adjust the corners',
  adjustHint: 'Drag the dots onto the corners of the page.',
  detecting: 'Finding the edges of the page…',
  detectNone: 'Couldn’t find the edges — place the corners yourself.',
  retake: 'Retake',
  confirm: 'Continue',
  processing: 'Processing…',
  pageTitle: 'Page {number}',
  addPage: 'Add a page',
  finish: 'Finish',
  finishing: 'Finishing…',
  processFailed: 'Something went wrong with this page. Please try again.',
  // Scan
  scanTitle: 'Scan a document',
  scanStart: 'Photograph the pages one by one — then choose where to send the scan. It’s free.',
  deliverTitle: 'Where should we send it?',
  deliverEmail: 'To my e-mail',
  deliverLink: 'A download link',
  deliverAccount: 'To my account',
  emailPlaceholder: 'you@example.com',
  loginIntro: 'Log in to save the scan to your account.',
  email: 'E-mail',
  password: 'Password',
  loginError: 'Wrong e-mail or password.',
  logIn: 'Log in',
  forgotPassword: 'Forgot your password?',
  noAccount: 'No account?',
  register: 'Register on the website',
  registerAfter: ', then come back here.',
  resetIntro: 'Enter your e-mail and we’ll send you a link to set a new password.',
  sendReset: 'Send the link',
  resetSent: 'If an account with this e-mail exists, we’ve sent the link.',
  backToLogin: 'Back to log in',
  send: 'Send',
  sending: 'Sending…',
  deliverFailed: 'Couldn’t send the scan. Please try again.',
  doneTitle: 'Done!',
  doneEmail: 'Sent to your e-mail.',
  doneDownload: 'Download the scan',
  doneLinkNote: 'The link works for up to 24 hours.',
  doneAccount: 'Saved to your account.',
  // Copy
  copyTitle: 'Copy a document',
  copyStart: 'Photograph the document with your phone — then print the copy at the kiosk.',
  copyDoneTitle: 'All set',
  copyDoneText:
    'Your copy is ready. Put your phone away and choose the print settings on the kiosk.',
  copyFinishFailed: 'Couldn’t finish the document. Please try again.',
};

export type PhoneStrings = typeof EN;

const RU: PhoneStrings = {
  privacy: 'Файлы видны только на этом киоске и удаляются, когда вы завершите сеанс.',
  uploadTitle: 'Загрузите файлы на киоск',
  uploadSubtitle: 'Выберите документы — они сразу появятся на экране киоска.',
  uploadChoose: 'Выбрать файлы',
  uploadChosen: 'Выбрано файлов: {count}',
  uploadSubmit: 'Загрузить',
  uploadSending: 'Загружаем…',
  uploadDone: 'Готово! Файлы на экране киоска. Можно добавить ещё.',
  uploadErrorSize: 'Файл слишком большой — до {mb} МБ на файл. Выберите файл поменьше.',
  uploadErrorFormat: 'Этот формат не поддерживается. Можно загрузить: {formats}.',
  uploadFormats: '{formats} · до {mb} МБ на файл',
  stepOf: 'Шаг {step} из {total}',
  takePhoto: 'Сфотографировать',
  photoTip: 'Положите лист ровно при хорошем свете, чтобы он целиком попал в кадр.',
  adjustTitle: 'Поправьте углы',
  adjustHint: 'Перетащите точки на углы страницы.',
  detecting: 'Ищем края страницы…',
  detectNone: 'Не удалось найти края — расставьте углы сами.',
  retake: 'Переснять',
  confirm: 'Дальше',
  processing: 'Обрабатываем…',
  pageTitle: 'Страница {number}',
  addPage: 'Добавить страницу',
  finish: 'Готово',
  finishing: 'Завершаем…',
  processFailed: 'Со страницей что-то пошло не так. Попробуйте ещё раз.',
  scanTitle: 'Сканирование документа',
  scanStart:
    'Сфотографируйте страницы по очереди — потом выберите, куда отправить скан. Это бесплатно.',
  deliverTitle: 'Куда отправить скан?',
  deliverEmail: 'На мой e-mail',
  deliverLink: 'Ссылка для скачивания',
  deliverAccount: 'В мой аккаунт',
  emailPlaceholder: 'you@example.com',
  loginIntro: 'Войдите, чтобы сохранить скан в аккаунт.',
  email: 'E-mail',
  password: 'Пароль',
  loginError: 'Неверный e-mail или пароль.',
  logIn: 'Войти',
  forgotPassword: 'Забыли пароль?',
  noAccount: 'Нет аккаунта?',
  register: 'Зарегистрируйтесь на сайте',
  registerAfter: ', затем вернитесь сюда.',
  resetIntro: 'Введите e-mail — мы пришлём ссылку, чтобы задать новый пароль.',
  sendReset: 'Отправить ссылку',
  resetSent: 'Если аккаунт с этим e-mail есть, мы отправили ссылку.',
  backToLogin: 'Назад ко входу',
  send: 'Отправить',
  sending: 'Отправляем…',
  deliverFailed: 'Не удалось отправить скан. Попробуйте ещё раз.',
  doneTitle: 'Готово!',
  doneEmail: 'Отправлено на ваш e-mail.',
  doneDownload: 'Скачать скан',
  doneLinkNote: 'Ссылка работает не дольше 24 часов.',
  doneAccount: 'Сохранено в вашем аккаунте.',
  copyTitle: 'Копирование документа',
  copyStart: 'Сфотографируйте документ телефоном — копию распечатаете на киоске.',
  copyDoneTitle: 'Всё готово',
  copyDoneText: 'Копия готова. Уберите телефон и выберите настройки печати на киоске.',
  copyFinishFailed: 'Не удалось завершить документ. Попробуйте ещё раз.',
};

const SK: PhoneStrings = {
  privacy: 'Súbory vidno len na tomto kiosku a vymažú sa, keď reláciu ukončíte.',
  uploadTitle: 'Nahrajte súbory do kiosku',
  uploadSubtitle: 'Vyberte dokumenty — hneď sa zobrazia na obrazovke kiosku.',
  uploadChoose: 'Vybrať súbory',
  uploadChosen: 'Vybrané súbory: {count}',
  uploadSubmit: 'Nahrať',
  uploadSending: 'Nahrávame…',
  uploadDone: 'Hotovo! Súbory sú na obrazovke kiosku. Môžete pridať ďalšie.',
  uploadErrorSize: 'Súbor je príliš veľký — najviac {mb} MB na súbor. Vyberte menší.',
  uploadErrorFormat: 'Tento formát nie je podporovaný. Môžete nahrať: {formats}.',
  uploadFormats: '{formats} · do {mb} MB na súbor',
  stepOf: 'Krok {step} z {total}',
  takePhoto: 'Odfotiť',
  photoTip: 'Položte list rovno pri dobrom svetle, celý v zábere.',
  adjustTitle: 'Upravte rohy',
  adjustHint: 'Potiahnite body na rohy strany.',
  detecting: 'Hľadáme okraje strany…',
  detectNone: 'Okraje sa nenašli — umiestnite rohy sami.',
  retake: 'Odfotiť znova',
  confirm: 'Ďalej',
  processing: 'Spracúvame…',
  pageTitle: 'Strana {number}',
  addPage: 'Pridať stranu',
  finish: 'Hotovo',
  finishing: 'Dokončujeme…',
  processFailed: 'So stranou sa niečo pokazilo. Skúste to znova.',
  scanTitle: 'Skenovanie dokumentu',
  scanStart: 'Odfoťte strany po jednej — potom vyberte, kam sken poslať. Je to zadarmo.',
  deliverTitle: 'Kam poslať sken?',
  deliverEmail: 'Na môj e-mail',
  deliverLink: 'Odkaz na stiahnutie',
  deliverAccount: 'Do môjho účtu',
  emailPlaceholder: 'vy@priklad.sk',
  loginIntro: 'Prihláste sa a sken sa uloží do vášho účtu.',
  email: 'E-mail',
  password: 'Heslo',
  loginError: 'Nesprávny e-mail alebo heslo.',
  logIn: 'Prihlásiť sa',
  forgotPassword: 'Zabudli ste heslo?',
  noAccount: 'Nemáte účet?',
  register: 'Zaregistrujte sa na webe',
  registerAfter: ' a vráťte sa sem.',
  resetIntro: 'Zadajte e-mail — pošleme vám odkaz na nové heslo.',
  sendReset: 'Poslať odkaz',
  resetSent: 'Ak účet s týmto e-mailom existuje, odkaz sme poslali.',
  backToLogin: 'Späť na prihlásenie',
  send: 'Poslať',
  sending: 'Posielame…',
  deliverFailed: 'Sken sa nepodarilo poslať. Skúste to znova.',
  doneTitle: 'Hotovo!',
  doneEmail: 'Poslané na váš e-mail.',
  doneDownload: 'Stiahnuť sken',
  doneLinkNote: 'Odkaz platí najviac 24 hodín.',
  doneAccount: 'Uložené vo vašom účte.',
  copyTitle: 'Kopírovanie dokumentu',
  copyStart: 'Odfoťte dokument telefónom — kópiu vytlačíte na kiosku.',
  copyDoneTitle: 'Všetko je pripravené',
  copyDoneText: 'Kópia je pripravená. Odložte telefón a vyberte nastavenia tlače na kiosku.',
  copyFinishFailed: 'Dokument sa nepodarilo dokončiť. Skúste to znova.',
};

const DE: PhoneStrings = {
  privacy:
    'Ihre Dateien sind nur an diesem Kiosk zu sehen und werden gelöscht, wenn Sie die Sitzung beenden.',
  uploadTitle: 'Dateien zum Kiosk hochladen',
  uploadSubtitle: 'Wählen Sie Ihre Dokumente — sie erscheinen sofort auf dem Kiosk-Bildschirm.',
  uploadChoose: 'Dateien wählen',
  uploadChosen: 'Gewählte Dateien: {count}',
  uploadSubmit: 'Hochladen',
  uploadSending: 'Wird hochgeladen…',
  uploadDone: 'Fertig! Ihre Dateien sind auf dem Kiosk-Bildschirm. Sie können weitere hinzufügen.',
  uploadErrorSize: 'Die Datei ist zu groß — bis {mb} MB pro Datei. Bitte wählen Sie eine kleinere.',
  uploadErrorFormat: 'Dieses Format wird nicht unterstützt. Möglich sind: {formats}.',
  uploadFormats: '{formats} · bis {mb} MB pro Datei',
  stepOf: 'Schritt {step} von {total}',
  takePhoto: 'Foto aufnehmen',
  photoTip: 'Legen Sie das Blatt flach und gut beleuchtet hin, ganz im Bild.',
  adjustTitle: 'Ecken anpassen',
  adjustHint: 'Ziehen Sie die Punkte auf die Ecken der Seite.',
  detecting: 'Die Seitenränder werden gesucht…',
  detectNone: 'Keine Ränder gefunden — setzen Sie die Ecken selbst.',
  retake: 'Neu aufnehmen',
  confirm: 'Weiter',
  processing: 'Wird verarbeitet…',
  pageTitle: 'Seite {number}',
  addPage: 'Seite hinzufügen',
  finish: 'Fertig',
  finishing: 'Wird abgeschlossen…',
  processFailed: 'Mit dieser Seite ist etwas schiefgegangen. Bitte versuchen Sie es erneut.',
  scanTitle: 'Dokument scannen',
  scanStart:
    'Fotografieren Sie die Seiten nacheinander — dann wählen Sie, wohin der Scan geht. Kostenlos.',
  deliverTitle: 'Wohin soll der Scan?',
  deliverEmail: 'An meine E-Mail',
  deliverLink: 'Ein Download-Link',
  deliverAccount: 'In mein Konto',
  emailPlaceholder: 'sie@beispiel.de',
  loginIntro: 'Melden Sie sich an, um den Scan in Ihrem Konto zu speichern.',
  email: 'E-Mail',
  password: 'Passwort',
  loginError: 'Falsche E-Mail oder falsches Passwort.',
  logIn: 'Anmelden',
  forgotPassword: 'Passwort vergessen?',
  noAccount: 'Kein Konto?',
  register: 'Registrieren Sie sich auf der Website',
  registerAfter: ' und kommen Sie dann hierher zurück.',
  resetIntro: 'Geben Sie Ihre E-Mail ein — wir senden Ihnen einen Link für ein neues Passwort.',
  sendReset: 'Link senden',
  resetSent: 'Falls es ein Konto mit dieser E-Mail gibt, haben wir den Link gesendet.',
  backToLogin: 'Zurück zur Anmeldung',
  send: 'Senden',
  sending: 'Wird gesendet…',
  deliverFailed: 'Der Scan konnte nicht gesendet werden. Bitte versuchen Sie es erneut.',
  doneTitle: 'Fertig!',
  doneEmail: 'An Ihre E-Mail gesendet.',
  doneDownload: 'Scan herunterladen',
  doneLinkNote: 'Der Link gilt höchstens 24 Stunden.',
  doneAccount: 'In Ihrem Konto gespeichert.',
  copyTitle: 'Dokument kopieren',
  copyStart: 'Fotografieren Sie das Dokument mit dem Handy — die Kopie drucken Sie am Kiosk.',
  copyDoneTitle: 'Alles bereit',
  copyDoneText:
    'Ihre Kopie ist bereit. Legen Sie das Handy weg und wählen Sie die Druckeinstellungen am Kiosk.',
  copyFinishFailed:
    'Das Dokument konnte nicht abgeschlossen werden. Bitte versuchen Sie es erneut.',
};

const UK: PhoneStrings = {
  privacy: 'Файли видно лише на цьому кіоску, і вони видаляються, коли ви завершите сеанс.',
  uploadTitle: 'Завантажте файли на кіоск',
  uploadSubtitle: 'Виберіть документи — вони одразу з’являться на екрані кіоску.',
  uploadChoose: 'Вибрати файли',
  uploadChosen: 'Вибрано файлів: {count}',
  uploadSubmit: 'Завантажити',
  uploadSending: 'Завантажуємо…',
  uploadDone: 'Готово! Файли на екрані кіоску. Можна додати ще.',
  uploadErrorSize: 'Файл завеликий — до {mb} МБ на файл. Виберіть менший.',
  uploadErrorFormat: 'Цей формат не підтримується. Можна завантажити: {formats}.',
  uploadFormats: '{formats} · до {mb} МБ на файл',
  stepOf: 'Крок {step} з {total}',
  takePhoto: 'Сфотографувати',
  photoTip: 'Покладіть аркуш рівно при доброму світлі, щоб він цілком потрапив у кадр.',
  adjustTitle: 'Поправте кути',
  adjustHint: 'Перетягніть точки на кути сторінки.',
  detecting: 'Шукаємо краї сторінки…',
  detectNone: 'Не вдалося знайти краї — розставте кути самі.',
  retake: 'Перезняти',
  confirm: 'Далі',
  processing: 'Обробляємо…',
  pageTitle: 'Сторінка {number}',
  addPage: 'Додати сторінку',
  finish: 'Готово',
  finishing: 'Завершуємо…',
  processFailed: 'Зі сторінкою щось пішло не так. Спробуйте ще раз.',
  scanTitle: 'Сканування документа',
  scanStart:
    'Сфотографуйте сторінки по черзі — потім виберіть, куди надіслати скан. Це безкоштовно.',
  deliverTitle: 'Куди надіслати скан?',
  deliverEmail: 'На мій e-mail',
  deliverLink: 'Посилання для завантаження',
  deliverAccount: 'У мій акаунт',
  emailPlaceholder: 'you@example.com',
  loginIntro: 'Увійдіть, щоб зберегти скан в акаунті.',
  email: 'E-mail',
  password: 'Пароль',
  loginError: 'Неправильний e-mail або пароль.',
  logIn: 'Увійти',
  forgotPassword: 'Забули пароль?',
  noAccount: 'Немає акаунта?',
  register: 'Зареєструйтеся на сайті',
  registerAfter: ', потім поверніться сюди.',
  resetIntro: 'Введіть e-mail — ми надішлемо посилання, щоб задати новий пароль.',
  sendReset: 'Надіслати посилання',
  resetSent: 'Якщо акаунт із цим e-mail існує, ми надіслали посилання.',
  backToLogin: 'Назад до входу',
  send: 'Надіслати',
  sending: 'Надсилаємо…',
  deliverFailed: 'Не вдалося надіслати скан. Спробуйте ще раз.',
  doneTitle: 'Готово!',
  doneEmail: 'Надіслано на ваш e-mail.',
  doneDownload: 'Завантажити скан',
  doneLinkNote: 'Посилання діє не довше 24 годин.',
  doneAccount: 'Збережено у вашому акаунті.',
  copyTitle: 'Копіювання документа',
  copyStart: 'Сфотографуйте документ телефоном — копію надрукуєте на кіоску.',
  copyDoneTitle: 'Усе готово',
  copyDoneText: 'Копія готова. Приберіть телефон і виберіть налаштування друку на кіоску.',
  copyFinishFailed: 'Не вдалося завершити документ. Спробуйте ще раз.',
};

export const PHONE_STRINGS: Record<PhoneLanguage, PhoneStrings> = {
  en: EN,
  sk: SK,
  de: DE,
  ru: RU,
  uk: UK,
};
