import { useEffect, useState } from 'react';
import {
  listCountries,
  listDocumentsForCountry,
  type PhotoCountry,
  type PhotoDocument,
} from '../services/photoKioskApi';

interface SelectCountryScreenProps {
  onSelectDocument: (document: PhotoDocument, countryName: string) => void;
}

export function SelectCountryScreen({ onSelectDocument }: SelectCountryScreenProps) {
  const [countries, setCountries] = useState<PhotoCountry[] | null>(null);
  const [search, setSearch] = useState('');
  const [selectedCountryId, setSelectedCountryId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<PhotoDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCountries()
      .then(setCountries)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, []);

  useEffect(() => {
    if (!selectedCountryId) {
      setDocuments(null);
      return;
    }
    listDocumentsForCountry(selectedCountryId)
      .then(setDocuments)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, [selectedCountryId]);

  const visibleCountries = (countries ?? []).filter((country) =>
    country.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="pk-screen" id="view-select-country">
      <h1 className="pk-title">Выбрать страну</h1>

      {error && <p className="pk-error">{error}</p>}

      <input
        type="text"
        id="select-country-search"
        className="pk-input"
        placeholder="Поиск…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="pk-chip-row" id="select-country-list">
        {visibleCountries.map((country) => (
          <button
            type="button"
            key={country.id}
            id={`select-country-${country.id}`}
            className={`pk-chip${selectedCountryId === country.id ? ' active' : ''}`}
            onClick={() => setSelectedCountryId(country.id)}
          >
            {country.name}
          </button>
        ))}
        {countries && visibleCountries.length === 0 && (
          <p className="pk-empty-note">Ничего не найдено.</p>
        )}
      </div>

      {selectedCountryId && (
        <div className="pk-document-list" id="select-country-documents">
          {documents === null ? (
            <p className="pk-empty-note">Загрузка…</p>
          ) : documents.length === 0 ? (
            <p className="pk-empty-note">Для этой страны пока нет документов в базе.</p>
          ) : (
            documents.map((doc) => {
              const countryName = countries?.find((c) => c.id === selectedCountryId)?.name ?? '';
              return (
                <button
                  type="button"
                  key={doc.id}
                  id={`select-country-document-${doc.id}`}
                  className="pk-document-row"
                  onClick={() => onSelectDocument(doc, countryName)}
                >
                  {countryName}: {doc.label}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
