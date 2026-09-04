interface DocumentPhotoScreenProps {
  onSelectCountry: () => void;
  onSelectCustomSize: () => void;
}

export function DocumentPhotoScreen({
  onSelectCountry,
  onSelectCustomSize,
}: DocumentPhotoScreenProps) {
  return (
    <div className="pk-screen" id="view-document-photo">
      <h1 className="pk-title">Фото на документы</h1>
      <div className="pk-hero-actions">
        <button
          type="button"
          className="pk-btn pk-btn-primary"
          id="document-photo-select-country"
          onClick={onSelectCountry}
        >
          Выбрать страну
        </button>
        <button
          type="button"
          className="pk-btn pk-btn-ghost"
          id="document-photo-custom-size"
          onClick={onSelectCustomSize}
        >
          Произвольный размер
        </button>
      </div>
    </div>
  );
}
