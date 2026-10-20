import {
  Check,
  Copy,
  CreditCard,
  FileUp,
  Inbox,
  LogOut,
  ScanLine,
  ShieldCheck,
  SlidersHorizontal,
  Timer,
  Trash2,
} from 'lucide-react';
import { InfoList } from '../../components/InfoList/InfoList';
import { LANGUAGE_NAMES, useTranslation } from '../../i18n';
import type { Language } from '../../i18n';
import { acceptedFormatsLabel, MAX_FILE_SIZE_MB } from '../../utils/fileLimits';
import { formatEuroCents } from '../../utils/pricing';
import { OFFERED_PAPER_SIZES, supportsDuplex } from '../../utils/printCapabilities';
import { MIN_CARD_PAYMENT_CENTS, RATE_PER_SIDE_CENTS } from '../../utils/tariff';
import styles from './InfoPanels.module.css';

// The footer's Help and Prices, the header's "your data is protected" and
// the language picker (2026-10 redesign, batch 6) — what each popup says.
// Everything here is a confirmed fact: the rates come from the one price
// list (src/utils/tariff.ts), the data rules from
// docs/data-privacy-requirements.md and docs/scan-upload-requirements.md.

const ICON = { size: 36, strokeWidth: 1.75 } as const;

export function HelpPanel() {
  const t = useTranslation();
  const k = t.kioskLayout;
  return (
    <div className={styles.root} id="help-panel">
      <div className={styles.intro}>
        <h2 className={styles.title}>{k.helpTitle}</h2>
        <p className={styles.subtitle}>{k.helpSubtitle}</p>
      </div>
      <InfoList
        numbered
        items={[
          {
            icon: <FileUp {...ICON} />,
            title: k.helpUploadTitle,
            text: k.helpUploadText(acceptedFormatsLabel(), MAX_FILE_SIZE_MB),
          },
          { icon: <SlidersHorizontal {...ICON} />, title: k.helpSetupTitle, text: k.helpSetupText },
          {
            icon: <CreditCard {...ICON} />,
            title: k.helpPayTitle,
            text: k.helpPayText(formatEuroCents(MIN_CARD_PAYMENT_CENTS)),
          },
          { icon: <Inbox {...ICON} />, title: k.helpPickupTitle, text: k.helpPickupText },
        ]}
      />
      <p className={styles.footnote}>
        <LogOut size={24} aria-hidden="true" />
        {k.helpFinish}
      </p>
    </div>
  );
}

export function TariffsPanel() {
  const t = useTranslation();
  const k = t.kioskLayout;
  const colors = [
    { key: 'bw', label: t.common.colorBw },
    { key: 'color', label: t.common.colorColor },
  ];
  return (
    <div className={styles.root} id="tariffs-panel">
      <h2 className={styles.title}>{k.tariffsTitle}</h2>
      {OFFERED_PAPER_SIZES.map((size) => (
        <table className={styles.table} key={size}>
          <thead>
            <tr>
              <th scope="col">
                <span className={styles.unit}>{size === 'A4' ? k.tariffsPerPage : `${size}`}</span>
              </th>
              <th scope="col">{t.common.sidesSingle}</th>
              {supportsDuplex(size) && <th scope="col">{t.common.sidesDouble}</th>}
            </tr>
          </thead>
          <tbody>
            {colors.map(({ key, label }) => (
              <tr key={key}>
                <th scope="row">
                  <span className={styles.swatch} data-color={key} aria-hidden="true" />
                  {label}
                </th>
                <td>{formatEuroCents(RATE_PER_SIDE_CENTS[`${size}-${key}-single`] ?? 0)}</td>
                {supportsDuplex(size) && (
                  <td>{formatEuroCents(RATE_PER_SIDE_CENTS[`${size}-${key}-double`] ?? 0)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      ))}
      <div className={styles.services}>
        <span className={styles.service}>
          <ScanLine {...ICON} aria-hidden="true" />
          <span className={styles.serviceName}>{k.tariffsScan}</span>
          <span className={styles.free}>{t.scan.free}</span>
        </span>
        <span className={styles.service}>
          <Copy {...ICON} aria-hidden="true" />
          <span className={styles.serviceName}>{k.tariffsCopy}</span>
          <span className={styles.serviceValue}>{k.tariffsCopyText}</span>
        </span>
      </div>
      <p className={styles.footnote}>
        {k.tariffsVat} {t.cart.minimumCharge(formatEuroCents(MIN_CARD_PAYMENT_CENTS))}
      </p>
    </div>
  );
}

export function PrivacyPanel() {
  const t = useTranslation();
  const k = t.kioskLayout;
  return (
    <div className={styles.root} id="privacy-panel">
      <div className={styles.intro}>
        <h2 className={styles.title}>{k.privacyTitle}</h2>
        <p className={styles.subtitle}>{k.privacySubtitle}</p>
      </div>
      <InfoList
        items={[
          {
            icon: <ShieldCheck {...ICON} />,
            title: k.privacySessionTitle,
            text: k.privacySessionText,
          },
          { icon: <Trash2 {...ICON} />, title: k.privacyDeleteTitle, text: k.privacyDeleteText },
          { icon: <Check {...ICON} />, title: k.privacyVirusTitle, text: k.privacyVirusText },
          { icon: <CreditCard {...ICON} />, title: k.privacyCardTitle, text: k.privacyCardText },
          { icon: <Timer {...ICON} />, title: k.privacyScanTitle, text: k.privacyScanText },
        ]}
      />
    </div>
  );
}

export function LanguagePanel({
  current,
  onSelect,
}: {
  current: Language;
  onSelect: (language: Language) => void;
}) {
  const t = useTranslation();
  return (
    <div className={styles.root} id="language-panel">
      <h2 className={styles.title}>{t.kioskLayout.selectLanguage}</h2>
      <div className={styles.languages}>
        {(Object.keys(LANGUAGE_NAMES) as Language[]).map((language) => (
          <button
            type="button"
            key={language}
            id={`language-option-${language}`}
            className={styles.language}
            aria-pressed={language === current}
            onClick={() => onSelect(language)}
          >
            <span className={styles.languageCode} aria-hidden="true">
              {language.toUpperCase()}
            </span>
            {LANGUAGE_NAMES[language]}
            {language === current && <Check size={26} strokeWidth={2.5} aria-hidden="true" />}
          </button>
        ))}
      </div>
    </div>
  );
}
