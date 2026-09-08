import { useEffect, useState } from 'react';
import {
  listPhotoCountries,
  createPhotoCountry,
  deletePhotoCountry,
  listPhotoDocuments,
  createPhotoDocument,
  updatePhotoDocument,
  type PhotoCountry,
  type PhotoDocument,
  type PhotoDocumentFormFields,
} from '../services/adminApi';
import type { AdminSession } from '../adminSession';

interface PhotoDocumentsScreenProps {
  session: AdminSession;
}

function emptyForm(countryId: string): PhotoDocumentFormFields {
  return {
    countryId,
    label: '',
    photoWidthMm: 35,
    photoHeightMm: 45,
    dpi: 600,
    headHeightMinMm: 32,
    headHeightMaxMm: 36,
    eyeLineFromBottomMm: 30,
    marginTopMm: undefined,
    headWidthMinMm: undefined,
    headWidthMaxMm: undefined,
    backgroundRequirement: '',
    printNotes: '',
    copiesPerSheet: 6,
    priceCents: 500,
    instructions: '',
  };
}

// Same euro<->cents input pattern as admin/screens/ShopCatalogScreen.tsx's
// own priceInput handling.
function centsToEuroInput(cents: number): string {
  return (cents / 100).toFixed(2);
}
function euroInputToCents(value: string): number {
  return Math.round(parseFloat(value || '0') * 100);
}

// Photo kiosk's Country -> Document requirement data (docs/photo-kiosk-requirements.md's
// "Requirement data model") — same "real form, not a script" pattern as the shop
// catalog's own admin screen, extended with the two-level hierarchy this data
// actually has (different documents in the same country can have genuinely
// different photo requirements, confirmed 2026-08-25 — not a shared spec).
export function PhotoDocumentsScreen({ session }: PhotoDocumentsScreenProps) {
  const [countries, setCountries] = useState<PhotoCountry[] | null>(null);
  const [documents, setDocuments] = useState<PhotoDocument[] | null>(null);
  const [selectedCountryId, setSelectedCountryId] = useState<string | null>(null);
  const [newCountryName, setNewCountryName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PhotoDocumentFormFields | null>(null);
  const [priceInput, setPriceInput] = useState('5.00');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reloadCountries() {
    listPhotoCountries(session.sessionToken)
      .then(setCountries)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }
  function reloadDocuments() {
    listPhotoDocuments(session.sessionToken)
      .then(setDocuments)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }

  useEffect(reloadCountries, [session.sessionToken]);
  useEffect(reloadDocuments, [session.sessionToken]);

  async function handleAddCountry(e: React.FormEvent) {
    e.preventDefault();
    if (!newCountryName.trim()) return;
    const country = await createPhotoCountry(session.sessionToken, newCountryName.trim());
    setNewCountryName('');
    reloadCountries();
    setSelectedCountryId(country.id);
  }

  async function handleDeleteCountry(id: string) {
    await deletePhotoCountry(session.sessionToken, id);
    if (selectedCountryId === id) setSelectedCountryId(null);
    reloadCountries();
    reloadDocuments();
  }

  function startNewDocument() {
    if (!selectedCountryId) return;
    setEditingId('new');
    setForm(emptyForm(selectedCountryId));
    setPriceInput('5.00');
  }

  function startEditDocument(doc: PhotoDocument) {
    setEditingId(doc.id);
    setForm({
      countryId: doc.countryId,
      label: doc.label,
      photoWidthMm: doc.photoWidthMm,
      photoHeightMm: doc.photoHeightMm,
      dpi: doc.dpi,
      headHeightMinMm: doc.headHeightMinMm,
      headHeightMaxMm: doc.headHeightMaxMm,
      eyeLineFromBottomMm: doc.eyeLineFromBottomMm ?? undefined,
      marginTopMm: doc.marginTopMm ?? undefined,
      headWidthMinMm: doc.headWidthMinMm ?? undefined,
      headWidthMaxMm: doc.headWidthMaxMm ?? undefined,
      backgroundRequirement: doc.backgroundRequirement ?? '',
      printNotes: doc.printNotes ?? '',
      copiesPerSheet: doc.copiesPerSheet,
      priceCents: doc.priceCents,
      instructions: doc.instructions ?? '',
    });
    setPriceInput(centsToEuroInput(doc.priceCents));
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(null);
  }

  async function handleSaveDocument(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (form.eyeLineFromBottomMm == null && form.marginTopMm == null) {
      setError('Укажите линию глаз или отступ от верха — нужен хотя бы один ориентир.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const fields = { ...form, priceCents: euroInputToCents(priceInput) };
      if (editingId === 'new') {
        await createPhotoDocument(session.sessionToken, fields);
      } else if (editingId) {
        await updatePhotoDocument(session.sessionToken, editingId, fields);
      }
      cancelEdit();
      reloadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(doc: PhotoDocument) {
    await updatePhotoDocument(session.sessionToken, doc.id, { active: !doc.active });
    reloadDocuments();
  }

  const documentsForSelectedCountry = (documents ?? []).filter(
    (doc) => doc.countryId === selectedCountryId,
  );

  return (
    <section className="view" id="view-photo-documents">
      <div className="view-header">
        <div>
          <h1 className="view-title">Фото на документы — страны и документы</h1>
          <p className="view-sub">docs/photo-kiosk-requirements.md — справочник требований</p>
        </div>
      </div>

      {error && <p className="login-error">{error}</p>}

      <div className="calc" style={{ marginBottom: '1.5rem' }}>
        <div className="calc-form">
          <span className="field-label">Страны</span>
          <form
            onSubmit={handleAddCountry}
            style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}
          >
            <input
              type="text"
              className="admin-input"
              id="photo-country-new-name"
              placeholder="Новая страна"
              value={newCountryName}
              onChange={(e) => setNewCountryName(e.target.value)}
            />
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }}>
              Добавить
            </button>
          </form>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {(countries ?? []).map((country) => (
              <button
                type="button"
                key={country.id}
                id={`photo-country-${country.id}`}
                className={`shop-chip${selectedCountryId === country.id ? ' active' : ''}`}
                onClick={() => setSelectedCountryId(country.id)}
                style={{
                  border: '1px solid var(--border-strong)',
                  borderRadius: '999px',
                  padding: '0.35rem 0.8rem',
                  background:
                    selectedCountryId === country.id ? 'var(--accent-soft)' : 'var(--surface)',
                  color: selectedCountryId === country.id ? 'var(--accent)' : 'var(--ink)',
                  cursor: 'pointer',
                }}
              >
                {country.name}
                <span
                  role="button"
                  id={`photo-country-delete-${country.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteCountry(country.id);
                  }}
                  style={{ marginLeft: '0.5rem', color: 'var(--ink-faint)' }}
                >
                  ×
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {selectedCountryId && (
        <>
          <div className="view-header">
            <h2 className="view-title" style={{ fontSize: '1.15rem' }}>
              Документы: {countries?.find((c) => c.id === selectedCountryId)?.name}
            </h2>
            {!editingId && (
              <button
                type="button"
                className="btn btn-primary"
                id="photo-document-new"
                onClick={startNewDocument}
                style={{ width: 'auto' }}
              >
                + Новый документ
              </button>
            )}
          </div>

          {editingId && form && (
            <form className="calc" onSubmit={handleSaveDocument} style={{ marginBottom: '1.5rem' }}>
              <div className="calc-form">
                <input
                  type="text"
                  className="admin-input"
                  placeholder="Название (например, Туристическая виза)"
                  id="photo-document-form-label"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  required
                />
                <div className="stepper-row">
                  <div>
                    <span className="stepper-label">Ширина фото, мм</span>
                    <input
                      type="number"
                      className="admin-input"
                      id="photo-document-form-width"
                      value={form.photoWidthMm}
                      onChange={(e) => setForm({ ...form, photoWidthMm: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <span className="stepper-label">Высота фото, мм</span>
                    <input
                      type="number"
                      className="admin-input"
                      id="photo-document-form-height"
                      value={form.photoHeightMm}
                      onChange={(e) => setForm({ ...form, photoHeightMm: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <span className="stepper-label">DPI</span>
                    <input
                      type="number"
                      className="admin-input"
                      id="photo-document-form-dpi"
                      value={form.dpi}
                      onChange={(e) => setForm({ ...form, dpi: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="stepper-row">
                  <div>
                    <span className="stepper-label">Высота головы мин, мм</span>
                    <input
                      type="number"
                      className="admin-input"
                      id="photo-document-form-head-min"
                      value={form.headHeightMinMm}
                      onChange={(e) =>
                        setForm({ ...form, headHeightMinMm: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div>
                    <span className="stepper-label">Высота головы макс, мм</span>
                    <input
                      type="number"
                      className="admin-input"
                      id="photo-document-form-head-max"
                      value={form.headHeightMaxMm}
                      onChange={(e) =>
                        setForm({ ...form, headHeightMaxMm: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div>
                    <span className="stepper-label">Линия глаз от низа, мм</span>
                    <input
                      type="number"
                      className="admin-input"
                      id="photo-document-form-eye-line"
                      placeholder="если не задано — используем отступ сверху"
                      value={form.eyeLineFromBottomMm ?? ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          eyeLineFromBottomMm:
                            e.target.value === '' ? undefined : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
                <p className="empty-note" style={{ margin: '-0.5rem 0 0.75rem' }}>
                  Нужен хотя бы один вертикальный ориентир — линия глаз или отступ сверху (некоторые
                  страны, например Китай, задают только отступ и не публикуют линию глаз).
                </p>
                <div className="stepper-row">
                  <div>
                    <span className="stepper-label">Отступ от верха до макушки, мм</span>
                    <input
                      type="number"
                      className="admin-input"
                      id="photo-document-form-margin-top"
                      placeholder="напр. 3–5 (Китай)"
                      value={form.marginTopMm ?? ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          marginTopMm: e.target.value === '' ? undefined : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div>
                    <span className="stepper-label">Ширина головы мин, мм</span>
                    <input
                      type="number"
                      className="admin-input"
                      id="photo-document-form-head-width-min"
                      placeholder="необязательно"
                      value={form.headWidthMinMm ?? ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          headWidthMinMm:
                            e.target.value === '' ? undefined : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div>
                    <span className="stepper-label">Ширина головы макс, мм</span>
                    <input
                      type="number"
                      className="admin-input"
                      id="photo-document-form-head-width-max"
                      placeholder="необязательно"
                      value={form.headWidthMaxMm ?? ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          headWidthMaxMm:
                            e.target.value === '' ? undefined : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
                <input
                  type="text"
                  className="admin-input"
                  placeholder="Требование к фону (например, белый)"
                  id="photo-document-form-background"
                  value={form.backgroundRequirement}
                  onChange={(e) => setForm({ ...form, backgroundRequirement: e.target.value })}
                />
                <input
                  type="text"
                  className="admin-input"
                  placeholder="Заметки по печати"
                  id="photo-document-form-print-notes"
                  value={form.printNotes}
                  onChange={(e) => setForm({ ...form, printNotes: e.target.value })}
                />
                <div className="stepper-row">
                  <div>
                    <span className="stepper-label">Копий на листе А4</span>
                    <input
                      type="number"
                      className="admin-input"
                      id="photo-document-form-copies"
                      min={1}
                      value={form.copiesPerSheet}
                      onChange={(e) => setForm({ ...form, copiesPerSheet: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <span className="stepper-label">Цена за копию, €</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="admin-input"
                      id="photo-document-form-price"
                      value={priceInput}
                      onChange={(e) => setPriceInput(e.target.value)}
                    />
                  </div>
                </div>
                <textarea
                  className="admin-input"
                  placeholder="Инструкции для клиента (нейтральное выражение лица, без очков с бликами и т.д.)"
                  id="photo-document-form-instructions"
                  value={form.instructions}
                  onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                  rows={3}
                />
                <div style={{ display: 'flex', gap: '0.6rem' }}>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    id="photo-document-form-save"
                    disabled={saving}
                  >
                    {saving ? 'Сохраняем…' : editingId === 'new' ? 'Добавить' : 'Сохранить'}
                  </button>
                  <button type="button" className="btn" onClick={cancelEdit}>
                    Отмена
                  </button>
                </div>
              </div>
            </form>
          )}

          {!documents ? (
            <p className="empty-note">Загрузка…</p>
          ) : documentsForSelectedCountry.length === 0 ? (
            <p className="empty-note">Для этой страны пока нет документов.</p>
          ) : (
            <div className="incident-feed" id="photo-document-list">
              {documentsForSelectedCountry.map((doc) => (
                <div className="incident-row incident-row-static" key={doc.id}>
                  <span className="incident-code">{doc.label}</span>
                  <span className="incident-target">
                    {doc.photoWidthMm}×{doc.photoHeightMm} мм
                  </span>
                  <span className="incident-target">{doc.copiesPerSheet} копий/лист</span>
                  <span className="incident-target">{(doc.priceCents / 100).toFixed(2)} €</span>
                  <span className="incident-target">{doc.active ? 'активен' : 'скрыт'}</span>
                  <button
                    type="button"
                    className="filter-reset"
                    id={`photo-document-edit-${doc.id}`}
                    onClick={() => startEditDocument(doc)}
                  >
                    Изменить
                  </button>
                  <button
                    type="button"
                    className="filter-reset"
                    id={`photo-document-toggle-${doc.id}`}
                    onClick={() => toggleActive(doc)}
                  >
                    {doc.active ? 'Скрыть' : 'Показать'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
