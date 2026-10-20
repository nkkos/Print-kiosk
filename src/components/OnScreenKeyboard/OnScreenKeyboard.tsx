import { useEffect, useState, type PointerEvent } from 'react';
import { ArrowBigUp, ChevronDown, CornerDownLeft, Delete } from 'lucide-react';
import { useTranslation } from '../../i18n';
import styles from './OnScreenKeyboard.module.css';

// The kiosk's own keyboard (docs/design/kiosk-redesign-plan.md, batch 7,
// decided 2026-10-20): the stand has no physical keyboard, and the Windows
// touch keyboard in Chrome kiosk mode appears unreliably, covers half the
// screen and may offer a way out of the kiosk. So every text field gets
// `inputmode="none"` (no system keyboard) while focused, and this one slides
// up instead. Latin letters only — what's typed here is an e-mail address or
// a password; e-mail fields get "@", ".sk" and ".com" keys.
//
// Self-contained: it follows focus in the whole document, types into the
// focused field the way a real key press would (so React's onChange fires),
// and keeps the focus there — every key acts on pointerdown with the
// default prevented. "Next" moves to the next field in the same popup or
// screen, or hides the keyboard on the last one.

const TEXT_TYPES = ['text', 'email', 'password', 'search', 'tel', 'url'];

const LETTER_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];
const SYMBOL_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['!', '#', '$', '%', '&', '*', '+', '=', '?', '/'],
  ['(', ')', ':', ';', ',', "'", '"', '^', '~'],
  ['[', ']', '{', '}', '<', '>', '|'],
];

function isTextField(element: Element | null): element is HTMLInputElement {
  return (
    element instanceof HTMLInputElement &&
    TEXT_TYPES.includes(element.type) &&
    !element.readOnly &&
    !element.disabled
  );
}

// Sets the value the way typing would, so React sees the change.
function setValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

export function OnScreenKeyboard({
  onVisibleChange,
}: {
  onVisibleChange: (open: boolean) => void;
}) {
  const t = useTranslation();
  const [target, setTarget] = useState<HTMLInputElement | null>(null);
  const [shift, setShift] = useState(false);
  const [symbols, setSymbols] = useState(false);

  useEffect(() => {
    function handleFocusIn(event: FocusEvent) {
      const element = event.target as Element | null;
      if (!isTextField(element)) return;
      element.inputMode = 'none';
      setTarget(element);
      setShift(false);
      setSymbols(false);
      // After the page has made room for the keyboard.
      requestAnimationFrame(() => element.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    }
    function handleFocusOut() {
      // Focus moving to another field arrives as its own focusin; anything
      // else (a button, the background) hides the keyboard.
      setTimeout(() => {
        if (!isTextField(document.activeElement)) setTarget(null);
      }, 0);
    }
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  // A field that leaves the page (its popup closed) takes the keyboard with it.
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => {
      if (!target.isConnected) setTarget(null);
    }, 500);
    return () => clearInterval(id);
  }, [target]);

  useEffect(() => {
    onVisibleChange(target !== null);
  }, [target, onVisibleChange]);

  if (!target) return null;
  const input = target;
  const isEmail = input.type === 'email';

  // Keeps the focus in the field: keys act on pointerdown.
  function press(action: () => void) {
    return (event: PointerEvent) => {
      event.preventDefault();
      action();
    };
  }

  function type(text: string) {
    setValue(input, input.value + text);
    if (shift) setShift(false);
  }

  function backspace() {
    setValue(input, input.value.slice(0, -1));
  }

  // The next field in the same popup (or screen), else hide.
  function next() {
    const scope = input.closest('[data-osk-scope]') ?? input.closest('main') ?? document.body;
    const fields = Array.from(scope.querySelectorAll('input')).filter(isTextField);
    const following = fields[fields.indexOf(input) + 1];
    if (following) {
      following.focus();
    } else {
      input.blur();
    }
  }

  const rows = symbols ? SYMBOL_ROWS : LETTER_ROWS;
  const isLast = (() => {
    const scope = input.closest('[data-osk-scope]') ?? input.closest('main') ?? document.body;
    const fields = Array.from(scope.querySelectorAll('input')).filter(isTextField);
    return fields.indexOf(input) === fields.length - 1;
  })();

  return (
    <div className={styles.root} id="on-screen-keyboard" role="group">
      <div className={styles.keys}>
        {rows.map((row, rowIndex) => (
          <div className={styles.row} key={rowIndex}>
            {rowIndex === 3 && !symbols && (
              <button
                type="button"
                id="osk-shift"
                className={`${styles.key} ${styles.wide}`}
                aria-label={t.common.keyboardShift}
                aria-pressed={shift}
                onPointerDown={press(() => setShift(!shift))}
              >
                <ArrowBigUp size={30} strokeWidth={1.75} />
              </button>
            )}
            {row.map((key) => {
              const label = shift ? key.toUpperCase() : key;
              return (
                <button
                  type="button"
                  key={key}
                  className={styles.key}
                  onPointerDown={press(() => type(label))}
                >
                  {label}
                </button>
              );
            })}
            {rowIndex === 3 && (
              <button
                type="button"
                id="osk-backspace"
                className={`${styles.key} ${styles.wide}`}
                aria-label={t.common.keyboardBackspace}
                onPointerDown={press(backspace)}
              >
                <Delete size={30} strokeWidth={1.75} />
              </button>
            )}
          </div>
        ))}
        <div className={styles.row}>
          <button
            type="button"
            id="osk-symbols"
            className={`${styles.key} ${styles.wide}`}
            onPointerDown={press(() => setSymbols(!symbols))}
          >
            {symbols ? 'abc' : '#+='}
          </button>
          {isEmail ? (
            <>
              <button type="button" className={styles.key} onPointerDown={press(() => type('@'))}>
                @
              </button>
              <button type="button" className={styles.key} onPointerDown={press(() => type('.'))}>
                .
              </button>
              <button type="button" className={styles.key} onPointerDown={press(() => type('-'))}>
                -
              </button>
              <button type="button" className={styles.key} onPointerDown={press(() => type('_'))}>
                _
              </button>
              <button
                type="button"
                className={`${styles.key} ${styles.wide}`}
                onPointerDown={press(() => type('.sk'))}
              >
                .sk
              </button>
              <button
                type="button"
                className={`${styles.key} ${styles.wide}`}
                onPointerDown={press(() => type('.com'))}
              >
                .com
              </button>
            </>
          ) : (
            <>
              <button type="button" className={styles.key} onPointerDown={press(() => type('@'))}>
                @
              </button>
              <button
                type="button"
                id="osk-space"
                className={`${styles.key} ${styles.space}`}
                onPointerDown={press(() => type(' '))}
              >
                {t.common.keyboardSpace}
              </button>
              <button type="button" className={styles.key} onPointerDown={press(() => type('.'))}>
                .
              </button>
            </>
          )}
          <button
            type="button"
            id="osk-next"
            className={`${styles.key} ${styles.action}`}
            onPointerDown={press(next)}
          >
            {isLast ? t.common.keyboardDone : t.common.keyboardNext}
            <CornerDownLeft size={24} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </div>
      <button
        type="button"
        id="osk-hide"
        className={styles.hide}
        aria-label={t.common.keyboardHide}
        onPointerDown={press(() => input.blur())}
      >
        <ChevronDown size={30} strokeWidth={2} />
      </button>
    </div>
  );
}
