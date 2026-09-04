// Forked from src/features/ending-session/EndingSessionScreen.tsx — shown
// while End Session's cleanup runs (PhotoKioskApp.tsx's handleEndSession). No
// header/footer here: nothing is actionable while photo data is being
// cleared from memory.
export function EndingSessionScreen() {
  return (
    <div className="pk-screen pk-screen-center" id="view-ending-session">
      <p>Завершаем сеанс и очищаем данные…</p>
    </div>
  );
}
