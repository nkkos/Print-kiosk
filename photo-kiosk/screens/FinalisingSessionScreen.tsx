// Mirrors src/features/finalising-session/FinalisingSessionScreen.tsx —
// shown after a successful (simulated) print, instead of silently resetting
// to Welcome. Unlike Payment/Print, the order has now been delivered, so
// End Session is available again here (PhotoKioskApp.tsx's sessionActive
// no longer excludes this screen).
//
// The prompt below is deliberate, not decorative: an abandoned cart can
// leave the NEXT customer able to see the previous one's photo thumbnail
// (see the cart-item TTL sweep in PhotoKioskApp.tsx for the automatic
// backstop) — asking the customer to explicitly end the session themselves
// is the first, immediate line of defense, so it's called out as clearly as
// the "Спасибо" message itself, with a visual arrow toward the actual
// header button rather than relying on the button's mere presence.
export function FinalisingSessionScreen() {
  return (
    <div className="pk-screen pk-screen-center" id="view-finalising-session">
      <p className="pk-title">Ваши фотографии распечатаны. Спасибо!</p>
      <div className="pk-end-session-hint" id="finalising-end-session-hint">
        <span className="pk-end-session-hint-arrow" aria-hidden="true">
          ↗
        </span>
        <p className="pk-end-session-hint-text">
          Пожалуйста, нажмите «Завершить и очистить данные», чтобы удалить свои фото и защитить
          личные данные от следующего посетителя.
        </p>
      </div>
    </div>
  );
}
