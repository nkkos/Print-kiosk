import { useEffect, useState } from 'react';
import { KioskScreenLayout } from '../../layouts/KioskScreenLayout/KioskScreenLayout';
import { Button } from '../../components/Button/Button';
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  Folder,
  FolderOpen,
  LogOut,
  ReceiptText,
  ShoppingCart,
} from 'lucide-react';
import { FileRow } from '../../components/FileRow/FileRow';
import { fileStatusLabel } from '../../utils/fileStatusLabel';
import {
  listAccountFiles,
  listAccountFolders,
  listAccountOrders,
} from '../../services/accountFileApi';
import type { AccountFile, AccountFolder, AccountOrder } from '../../services/accountFileApi';
import { useTranslation } from '../../i18n';
import type { Language } from '../../i18n';
import type { EndSessionReason, PrintOrder } from '../../types/kiosk';
import styles from './PersonalAccountScreen.module.css';

// Personal Account screen — see docs/personal-account-requirements.md. Two
// tabs, both a deliberately reduced view of the web portal (the portal's
// other sections — invoices, promo codes, account info, payment methods —
// are not shown on the kiosk at all):
// - My files: read-only folder browsing (one level, no create/rename/move —
//   that's portal-only) plus multi-select "Configure printing for selected
//   files" (docs/personal-account-requirements.md, "Batch configure"), on
//   top of the ordinary tap-one-file-to-configure flow.
// - My orders: orders paid in advance via the portal, awaiting print
//   (docs/personal-account-requirements.md, "Paid orders awaiting print") —
//   tapping one adds it directly to Cart (already fully configured, so no
//   Print Order Configuration step) with `paidQuantity` set, making its
//   Cart price $0 unless the quantity is raised on-site.
interface PersonalAccountScreenProps {
  /** The kiosk login's session token (KioskSession.accountToken). */
  accountToken?: string;
  onFileSelect: (fileId: string, fileName: string) => void;
  onConfigureSelectedFiles: (files: { fileId: string; fileName: string }[]) => void;
  onAddPaidOrderToCart: (order: PrintOrder) => void;
  initialTab?: 'files' | 'orders';
  onBack: () => void;
  onHome: () => void;
  onEndSession: (reason: EndSessionReason) => void;
  cartItems: PrintOrder[];
  /** Opens the order review screen — the footer's btn-cart. */
  onOpenCart: () => void;
  isConnectionLost: boolean;
  onSimulateConnectionLost: () => void;
  onSimulateConnectionRestored: () => void;
  onLogin: (email: string, password: string) => Promise<void>;
  accountId: string | null;
  /** Navigates to the Personal Account screen (docs/personal-account-requirements.md)
   * — used by the footer's btn-account (a no-op destination-wise, since
   * that's already where this screen is). */
  onGoToPersonalAccount: () => void;
  /** Logs the account out of the Kiosk Session and returns to Upload Method
   * Selection (docs/personal-account-requirements.md, "Kiosk-side login"). */
  onLogout: () => void;
  hasPendingPaidOrders: boolean;
  onDismissPaidOrdersPrompt: () => void;
  onGoToPaidOrders: () => void;
  onLanguageChange: (language: Language) => void;
}

export function PersonalAccountScreen({
  accountToken,
  onFileSelect,
  onConfigureSelectedFiles,
  onAddPaidOrderToCart,
  initialTab = 'files',
  onBack,
  onHome,
  onEndSession,
  cartItems,
  onOpenCart,
  isConnectionLost,
  onSimulateConnectionLost,
  onSimulateConnectionRestored,
  onLogin,
  accountId,
  onGoToPersonalAccount,
  onLogout,
  hasPendingPaidOrders,
  onDismissPaidOrdersPrompt,
  onGoToPaidOrders,
  onLanguageChange,
}: PersonalAccountScreenProps) {
  const t = useTranslation();
  const [activeTab, setActiveTab] = useState<'files' | 'orders'>(initialTab);
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [folders, setFolders] = useState<AccountFolder[]>([]);
  const [files, setFiles] = useState<AccountFile[]>([]);
  const [orders, setOrders] = useState<AccountOrder[]>([]);

  // Real data from the web portal (docs/personal-account-requirements.md) —
  // the kiosk only ever browses/selects/prints what's already there, never
  // creates/renames/deletes folders or files itself.
  useEffect(() => {
    if (!accountId || !accountToken) return;
    listAccountFolders(accountId, accountToken).then(setFolders);
    listAccountFiles(accountId, accountToken).then(setFiles);
    listAccountOrders(accountId, accountToken).then(setOrders);
  }, [accountId, accountToken]);

  const openFolder = folders.find((folder) => folder.id === openFolderId) ?? null;
  const visibleFiles = files.filter((file) => file.folderId === openFolderId);

  function toggleFileSelected(id: string) {
    setSelectedFileIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  // One file goes through the ordinary single-file flow; several through
  // "Batch configure" (docs/personal-account-requirements.md).
  function handleConfigureSelected() {
    const selected = files
      .filter((file) => selectedFileIds.has(file.id))
      .map((file) => ({ fileId: file.id, fileName: file.fileName }));
    if (selected.length === 1) onFileSelect(selected[0].fileId, selected[0].fileName);
    else onConfigureSelectedFiles(selected);
  }

  // Hides a paid order once it's in Cart (docs/personal-account-requirements.md,
  // "Paid orders awaiting print") — otherwise it could be added repeatedly,
  // each copy pricing at $0. Reappears here if that Cart item is removed.
  const addedPaidOrderIds = new Set(
    cartItems.map((item) => item.sourcePaidOrderId).filter((id) => id !== undefined),
  );
  const availablePaidOrders = orders.filter((order) => !addedPaidOrderIds.has(order.id));

  // `unitPriceCents` -> dollars, matching every other PrintOrder's unitPrice
  // (src/utils/pricing.ts). `paidQuantity` equals `quantity` — accountOrderStore.ts
  // only ever creates fully-paid orders, so this Cart item prices at $0
  // unless the quantity is raised on-site.
  function toPrintOrder(order: AccountOrder): PrintOrder {
    return {
      id: order.id,
      fileName: order.fileName,
      paperSize: order.paperSize,
      sides: order.sides,
      color: order.color,
      orientation: order.orientation,
      scale: order.scale,
      pageRange: order.pageRange ?? undefined,
      pagesPerSheet: order.pagesPerSheet,
      quantity: order.quantity,
      unitPrice: order.unitPriceCents / 100,
      paidQuantity: order.quantity,
      sourceFileId: order.accountFileId ?? undefined,
      sourceFileOrigin: 'account',
    };
  }

  return (
    <KioskScreenLayout
      onEndSession={onEndSession}
      onBack={onBack}
      onHome={onHome}
      cartItems={cartItems}
      onOpenCart={onOpenCart}
      isConnectionLost={isConnectionLost}
      onSimulateConnectionLost={onSimulateConnectionLost}
      onSimulateConnectionRestored={onSimulateConnectionRestored}
      onLogin={onLogin}
      accountId={accountId}
      onGoToPersonalAccount={onGoToPersonalAccount}
      hasPendingPaidOrders={hasPendingPaidOrders}
      onDismissPaidOrdersPrompt={onDismissPaidOrdersPrompt}
      onGoToPaidOrders={onGoToPaidOrders}
      onLanguageChange={onLanguageChange}
    >
      <div className={styles.top}>
        <div className={styles.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            id="account-tab-files"
            className={styles.tab}
            aria-selected={activeTab === 'files'}
            onClick={() => setActiveTab('files')}
          >
            <FolderOpen size={26} strokeWidth={1.75} aria-hidden="true" />
            {t.personalAccount.myFiles}
          </button>
          <button
            type="button"
            role="tab"
            id="account-tab-orders"
            className={styles.tab}
            aria-selected={activeTab === 'orders'}
            onClick={() => setActiveTab('orders')}
          >
            <ReceiptText size={26} strokeWidth={1.75} aria-hidden="true" />
            {t.personalAccount.myOrders}
            {availablePaidOrders.length > 0 && (
              <span className={styles.count}>{availablePaidOrders.length}</span>
            )}
          </button>
        </div>
        <Button
          id="account-logout"
          variant="ghost"
          label={t.personalAccount.logOut}
          icon={<LogOut size={26} strokeWidth={2} />}
          onClick={onLogout}
        />
      </div>

      <div className={styles.intro}>
        <h1 className={styles.title}>
          {activeTab === 'files' ? t.personalAccount.filesTitle : t.personalAccount.ordersTitle}
        </h1>
        <p className={styles.subtitle}>
          {activeTab === 'files'
            ? t.personalAccount.filesSubtitle
            : t.personalAccount.ordersSubtitle}
        </p>
      </div>

      {activeTab === 'files' && (
        <div className={styles.filesTab}>
          {openFolder ? (
            <div className={styles.folderHeader}>
              <Button
                id="account-folder-back"
                variant="ghost"
                label={t.personalAccount.backToMyFiles}
                icon={<ArrowLeft size={26} strokeWidth={2} />}
                onClick={() => setOpenFolderId(null)}
              />
              <span className={styles.folderName}>
                <Folder size={26} strokeWidth={1.75} aria-hidden="true" />
                {openFolder.name}
              </span>
            </div>
          ) : (
            folders.length > 0 && (
              <div className={styles.folderList}>
                {folders.map((folder) => (
                  <button
                    type="button"
                    key={folder.id}
                    id={`account-folder-${folder.id}`}
                    className={styles.folder}
                    onClick={() => setOpenFolderId(folder.id)}
                  >
                    <Folder size={26} strokeWidth={1.75} aria-hidden="true" />
                    {folder.name}
                  </button>
                ))}
              </div>
            )
          )}

          <div className={styles.fileList}>
            {visibleFiles.length === 0 && (
              <p className={styles.empty}>{t.personalAccount.noFiles}</p>
            )}
            {visibleFiles.map((file) => (
              // Portal uploads go through the same AV-scan/conversion
              // pipeline as QR/e-mail (server/fileScanning.ts), so the same
              // status words apply.
              <FileRow
                key={file.id}
                id={`account-file-${file.id}`}
                fileName={file.fileName}
                status={file.status}
                statusLabel={fileStatusLabel(file.status, t.common)}
                selected={selectedFileIds.has(file.id)}
                onToggle={() => toggleFileSelected(file.id)}
              />
            ))}
          </div>

          <div className={styles.actionBar}>
            <span className={styles.selectedCount}>
              {t.personalAccount.selectedCount(selectedFileIds.size)}
            </span>
            <Button
              id="account-configure-selected"
              variant="primary"
              label={t.personalAccount.configurePrinting}
              trailingIcon={<ArrowRight size={26} strokeWidth={2.25} />}
              onClick={handleConfigureSelected}
              disabled={selectedFileIds.size === 0}
            />
          </div>
        </div>
      )}

      {activeTab === 'orders' && (
        <div className={styles.ordersTab}>
          {availablePaidOrders.length === 0 ? (
            <p className={styles.empty}>{t.personalAccount.noOrdersAwaitingPrint}</p>
          ) : (
            <div className={styles.orderList}>
              {availablePaidOrders.map((order) => (
                <div key={order.id} className={styles.order} id={`account-order-${order.id}`}>
                  <span className={styles.orderIcon} aria-hidden="true">
                    <FileText size={34} strokeWidth={1.5} />
                  </span>
                  <span className={styles.orderText}>
                    <span className={styles.orderName}>{order.fileName}</span>
                    <span className={styles.orderMeta}>
                      <span className={styles.paid}>{t.personalAccount.paid}</span>
                      {t.personalAccount.copies(order.quantity)}
                    </span>
                  </span>
                  <Button
                    id={`account-order-${order.id}-add`}
                    variant="primary"
                    label={t.personalAccount.addToCart}
                    icon={<ShoppingCart size={26} strokeWidth={2} />}
                    onClick={() => onAddPaidOrderToCart(toPrintOrder(order))}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </KioskScreenLayout>
  );
}
