import { useEffect, useState } from 'react';
import { KioskScreenLayout } from '../../layouts/KioskScreenLayout/KioskScreenLayout';
import { Button } from '../../components/Button/Button';
import { OptionCard } from '../../components/OptionCard/OptionCard';
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
  onFileSelect: (fileId: string, fileName: string) => void;
  onConfigureSelectedFiles: (files: { fileId: string; fileName: string }[]) => void;
  onAddPaidOrderToCart: (order: PrintOrder) => void;
  initialTab?: 'files' | 'orders';
  onBack: () => void;
  onHome: () => void;
  onEndSession: (reason: EndSessionReason) => void;
  cartItems: PrintOrder[];
  onQuantityChange: (id: string, quantity: number) => void;
  onRemoveItem: (id: string) => void;
  onProceedToPayment: (selectedItems: PrintOrder[]) => void;
  cartOpenOnMount?: boolean;
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
  onFileSelect,
  onConfigureSelectedFiles,
  onAddPaidOrderToCart,
  initialTab = 'files',
  onBack,
  onHome,
  onEndSession,
  cartItems,
  onQuantityChange,
  onRemoveItem,
  onProceedToPayment,
  cartOpenOnMount,
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
    if (!accountId) return;
    listAccountFolders(accountId).then(setFolders);
    listAccountFiles(accountId).then(setFiles);
    listAccountOrders(accountId).then(setOrders);
  }, [accountId]);

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

  function handleConfigureSelected() {
    const selected = files
      .filter((file) => selectedFileIds.has(file.id))
      .map((file) => ({ fileId: file.id, fileName: file.fileName }));
    onConfigureSelectedFiles(selected);
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
      onQuantityChange={onQuantityChange}
      onRemoveItem={onRemoveItem}
      onProceedToPayment={onProceedToPayment}
      initialCartOpen={cartOpenOnMount}
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
      <div className={styles.body}>
        <div className={styles.tabs}>
          {activeTab === 'files' ? (
            <span className={styles.activeTab}>{t.personalAccount.myFiles}</span>
          ) : (
            <Button
              id="account-tab-files"
              label={t.personalAccount.myFiles}
              onClick={() => setActiveTab('files')}
            />
          )}
          {activeTab === 'orders' ? (
            <span className={styles.activeTab}>{t.personalAccount.myOrders}</span>
          ) : (
            <Button
              id="account-tab-orders"
              label={t.personalAccount.myOrders}
              onClick={() => setActiveTab('orders')}
            />
          )}
          <Button id="account-logout" label={t.personalAccount.logOut} onClick={onLogout} />
        </div>

        {activeTab === 'files' && (
          <div className={styles.filesTab}>
            {openFolder ? (
              <div className={styles.folderHeader}>
                <Button
                  id="account-folder-back"
                  label={t.personalAccount.backToMyFiles}
                  onClick={() => setOpenFolderId(null)}
                />
                <h3 className={styles.folderName}>{openFolder.name}</h3>
              </div>
            ) : (
              folders.length > 0 && (
                <div className={styles.folderList}>
                  {folders.map((folder) => (
                    <Button
                      key={folder.id}
                      id={`account-folder-${folder.id}`}
                      label={folder.name}
                      onClick={() => setOpenFolderId(folder.id)}
                    />
                  ))}
                </div>
              )
            )}

            <div className={styles.fileList}>
              {visibleFiles.map((file) => {
                const isReady = file.status === 'ready';
                // Same scanning-status vocabulary as QR/Email
                // (src/features/qr-upload/QrUploadScreen.tsx) — files
                // uploaded via the portal go through the identical
                // AV-scan/conversion pipeline (server/fileScanning.ts).
                const description =
                  file.status === 'ready'
                    ? t.common.tapToConfigurePrinting
                    : file.status === 'rejected'
                      ? t.common.blockedVirusScan
                      : file.status === 'scan-unavailable'
                        ? t.common.scanUnavailable
                        : file.status === 'converting'
                          ? t.common.preparingForPrint
                          : t.common.scanningForViruses;
                return (
                  <div key={file.id} className={styles.fileRow}>
                    <input
                      type="checkbox"
                      id={`account-file-${file.id}-select`}
                      checked={selectedFileIds.has(file.id)}
                      onChange={() => toggleFileSelected(file.id)}
                      disabled={!isReady}
                    />
                    <Button
                      id={`account-file-${file.id}`}
                      label={`${file.fileName} — ${description}`}
                      onClick={isReady ? () => onFileSelect(file.id, file.fileName) : undefined}
                      disabled={!isReady}
                    />
                  </div>
                );
              })}
            </div>

            <Button
              id="account-configure-selected"
              label={t.personalAccount.configureSelected}
              onClick={handleConfigureSelected}
              disabled={selectedFileIds.size === 0}
            />
          </div>
        )}

        {activeTab === 'orders' && (
          <div className={styles.ordersTab}>
            {availablePaidOrders.length === 0 ? (
              <p className={styles.empty}>{t.personalAccount.noOrdersAwaitingPrint}</p>
            ) : (
              <div className={styles.orderList}>
                {availablePaidOrders.map((order) => (
                  <OptionCard
                    key={order.id}
                    id={`account-order-${order.id}`}
                    title={order.fileName}
                    description={t.personalAccount.orderDescription(order.quantity)}
                    onActivate={() => onAddPaidOrderToCart(toPrintOrder(order))}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </KioskScreenLayout>
  );
}
