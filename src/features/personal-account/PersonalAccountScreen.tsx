import { useState } from 'react';
import { KioskScreenLayout } from '../../layouts/KioskScreenLayout/KioskScreenLayout';
import { Button } from '../../components/Button/Button';
import { OptionCard } from '../../components/OptionCard/OptionCard';
import {
  ACCOUNT_FOLDERS,
  ACCOUNT_ROOT_FILES,
  ALL_ACCOUNT_FILES,
  MOCK_PAID_ORDERS,
} from './mockAccountData';
import { useTranslation } from '../../i18n';
import type { Language } from '../../i18n';
import type { PrintOrder } from '../../types/kiosk';
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
  onFileSelect: (fileName: string) => void;
  onConfigureSelectedFiles: (fileNames: string[]) => void;
  onAddPaidOrderToCart: (order: PrintOrder) => void;
  initialTab?: 'files' | 'orders';
  onBack: () => void;
  onHome: () => void;
  onEndSession: () => void;
  cartItems: PrintOrder[];
  onQuantityChange: (id: string, quantity: number) => void;
  onRemoveItem: (id: string) => void;
  onProceedToPayment: (selectedItems: PrintOrder[]) => void;
  cartOpenOnMount?: boolean;
  isConnectionLost: boolean;
  onSimulateConnectionLost: () => void;
  onSimulateConnectionRestored: () => void;
  onLogin: (username: string) => void;
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

  const openFolder = ACCOUNT_FOLDERS.find((folder) => folder.id === openFolderId) ?? null;
  const visibleFiles = openFolder ? openFolder.files : ACCOUNT_ROOT_FILES;

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
    const fileNames = ALL_ACCOUNT_FILES.filter((file) => selectedFileIds.has(file.id)).map(
      (file) => file.fileName,
    );
    onConfigureSelectedFiles(fileNames);
  }

  // Hides a paid order once it's in Cart (docs/personal-account-requirements.md,
  // "Paid orders awaiting print") — otherwise it could be added repeatedly,
  // each copy pricing at $0. Reappears here if that Cart item is removed.
  const addedPaidOrderIds = new Set(
    cartItems.map((item) => item.sourcePaidOrderId).filter((id) => id !== undefined),
  );
  const availablePaidOrders = MOCK_PAID_ORDERS.filter((order) => !addedPaidOrderIds.has(order.id));

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
              ACCOUNT_FOLDERS.length > 0 && (
                <div className={styles.folderList}>
                  {ACCOUNT_FOLDERS.map((folder) => (
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
              {visibleFiles.map((file) => (
                <div key={file.id} className={styles.fileRow}>
                  <input
                    type="checkbox"
                    id={`account-file-${file.id}-select`}
                    checked={selectedFileIds.has(file.id)}
                    onChange={() => toggleFileSelected(file.id)}
                  />
                  <Button
                    id={`account-file-${file.id}`}
                    label={file.fileName}
                    onClick={() => onFileSelect(file.fileName)}
                  />
                </div>
              ))}
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
                    onActivate={() => onAddPaidOrderToCart(order)}
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
