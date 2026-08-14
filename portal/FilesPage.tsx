import { useEffect, useRef, useState } from 'react';
import { usePortalSession } from './useSession';
import { PortalShell } from './PortalShell';
import { LoginForm } from './LoginForm';
import {
  createFolder,
  listMyFolders,
  renameFolder,
  deleteFolder,
  uploadFiles,
  listMyFiles,
  deleteFile,
  getAccountFileContentUrl,
  getAccountFileLimits,
  createOrder,
  payOrder,
  type AccountFolder,
  type AccountFile,
  type AccountFileLimits,
  type CreateOrderParams,
} from '../src/services/accountFileApi';
import { computeUnitPrice } from '../src/utils/pricing';
import {
  usePreview,
  usePageRangeSelection,
  renderPdfPageToCanvas,
} from '../src/utils/documentPreview';

// The portal's file/folder/order management — see
// docs/personal-account-requirements.md: "folder creation/management happens
// only on the web portal," and orders originate here too. The kiosk's
// Personal Account screen only ever reads what's created here
// (src/features/personal-account/PersonalAccountScreen.tsx).
//
// "Payment" is simulated (a button) — there's no real payment gateway
// anywhere in this project yet. Preview + page-range selection reuse the
// exact same logic as the kiosk's Print Order Configuration
// (src/utils/documentPreview.ts) so both surfaces offer identical fields;
// only the popup/overlay markup differs (the kiosk's Modal rules — never
// cover the header/footer — don't apply to this plain scrolling page).

const STATUS_LABEL: Record<AccountFile['status'], string> = {
  scanning: 'Scanning for viruses…',
  converting: 'Preparing for print…',
  ready: 'Ready',
  rejected: 'Blocked (failed virus scan)',
  'scan-unavailable': 'Scan unavailable',
};

interface ConfigureAndPayProps {
  sessionToken: string;
  file: AccountFile;
}

function ConfigureAndPay({ sessionToken, file }: ConfigureAndPayProps) {
  const [paperSize, setPaperSize] = useState<CreateOrderParams['paperSize']>('A4');
  const [sides, setSides] = useState<CreateOrderParams['sides']>('single');
  const [color, setColor] = useState<CreateOrderParams['color']>('bw');
  const [orientation, setOrientation] = useState<CreateOrderParams['orientation']>('portrait');
  const [scale, setScale] = useState<CreateOrderParams['scale']>('fit');
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<'none' | 'saved' | 'paid'>('none');

  const preview = usePreview(getAccountFileContentUrl(file.id));
  const {
    pageRangeMode,
    setPageRangeMode,
    rangeFrom,
    setRangeFrom,
    rangeTo,
    setRangeTo,
    pagesToPrint,
    pageRange,
  } = usePageRangeSelection(preview);
  const unitPrice = computeUnitPrice(pagesToPrint, paperSize, color, sides);

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [popupPage, setPopupPage] = useState(1);
  const thumbnailCanvasRef = useRef<HTMLCanvasElement>(null);
  const popupCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (preview.state !== 'ready' || preview.kind !== 'pdf' || !preview.pdf) return;
    const canvas = thumbnailCanvasRef.current;
    if (!canvas) return;
    renderPdfPageToCanvas(preview.pdf, 1, canvas, orientation === 'landscape' ? 90 : 0, {
      kind: 'fit-width',
      targetWidthPx: 160,
    }).catch(() => {});
  }, [preview.state, preview.kind, preview.pdf, orientation]);

  useEffect(() => {
    if (!isPreviewOpen) setPopupPage(1);
  }, [isPreviewOpen]);

  useEffect(() => {
    if (!isPreviewOpen || preview.kind !== 'pdf' || !preview.pdf) return;
    const canvas = popupCanvasRef.current;
    if (!canvas) return;
    renderPdfPageToCanvas(preview.pdf, popupPage, canvas, orientation === 'landscape' ? 90 : 0, {
      kind: 'fit-width',
      targetWidthPx: 480,
    }).catch(() => {});
  }, [isPreviewOpen, preview.kind, preview.pdf, popupPage, orientation]);

  const isPreviewClickable = preview.state === 'ready';

  function buildOrderParams(): CreateOrderParams {
    return {
      accountFileId: file.id,
      fileName: file.fileName,
      paperSize,
      sides,
      color,
      orientation,
      scale,
      pageRange,
      quantity,
      unitPriceCents: Math.round(unitPrice * 100),
    };
  }

  // Two distinct actions, not one (docs/screens/portal-personal-account-spec.md,
  // "My files") — "Save" makes the order status lifecycle's 'created,
  // awaiting payment' state actually reachable, without forcing an
  // immediate payment. "Pay now" still does both in one click for a user
  // who just wants the old single-step behavior.
  async function handleSave() {
    setIsSubmitting(true);
    setError(null);
    try {
      await createOrder(sessionToken, buildOrderParams());
      setResult('saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePay() {
    setIsSubmitting(true);
    setError(null);
    try {
      const order = await createOrder(sessionToken, buildOrderParams());
      await payOrder(sessionToken, order.id);
      setResult('paid');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (result === 'paid') {
    // Stays open (the parent's "Close" toggle dismisses it) rather than
    // auto-collapsing — closing immediately on success would unmount this
    // component before the confirmation ever painted.
    return <p className="success">Paid — this order is now waiting to be printed at the kiosk.</p>;
  }
  if (result === 'saved') {
    return (
      <p className="success">
        Saved — pay for it from <a href="./orders.html">My orders</a> to have it printed.
      </p>
    );
  }

  return (
    <div className="configurePanel">
      <div
        className="previewThumbnail"
        onClick={isPreviewClickable ? () => setIsPreviewOpen(true) : undefined}
        style={isPreviewClickable ? { cursor: 'pointer' } : undefined}
      >
        <canvas
          ref={thumbnailCanvasRef}
          hidden={!(preview.state === 'ready' && preview.kind === 'pdf')}
        />
        {preview.state === 'ready' && preview.kind === 'image' && preview.imageUrl && (
          <img src={preview.imageUrl} alt={file.fileName} className="previewThumbnailImg" />
        )}
        {preview.state === 'loading' && 'Loading preview…'}
        {preview.state === 'unavailable' && 'Preview unavailable'}
      </div>

      {isPreviewOpen && (
        <div className="previewOverlayBackdrop" onClick={() => setIsPreviewOpen(false)}>
          <div className="previewOverlayBox" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setIsPreviewOpen(false)}>
              Close
            </button>
            {preview.kind === 'pdf' && <canvas ref={popupCanvasRef} />}
            {preview.kind === 'image' && preview.imageUrl && (
              <img src={preview.imageUrl} alt={file.fileName} className="previewOverlayImg" />
            )}
            {preview.kind === 'pdf' && preview.numPages > 1 && (
              <div className="previewNav">
                <button
                  type="button"
                  onClick={() => setPopupPage((page) => Math.max(1, page - 1))}
                  disabled={popupPage <= 1}
                >
                  ‹
                </button>
                <span>
                  Page {popupPage} of {preview.numPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPopupPage((page) => Math.min(preview.numPages, page + 1))}
                  disabled={popupPage >= preview.numPages}
                >
                  ›
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <label>
        Paper size
        <select
          value={paperSize}
          onChange={(e) => setPaperSize(e.target.value as CreateOrderParams['paperSize'])}
        >
          <option value="A4">A4</option>
          <option value="A5">A5</option>
        </select>
      </label>
      <label>
        Sides
        <select
          value={sides}
          onChange={(e) => setSides(e.target.value as CreateOrderParams['sides'])}
        >
          <option value="single">Single-sided</option>
          <option value="double">Double-sided</option>
        </select>
      </label>
      <label>
        Color
        <select
          value={color}
          onChange={(e) => setColor(e.target.value as CreateOrderParams['color'])}
        >
          <option value="bw">Black & white</option>
          <option value="color">Color</option>
        </select>
      </label>
      <label>
        Orientation
        <select
          value={orientation}
          onChange={(e) => setOrientation(e.target.value as CreateOrderParams['orientation'])}
        >
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
        </select>
      </label>
      <label>
        Scale
        <select
          value={scale}
          onChange={(e) => setScale(e.target.value as CreateOrderParams['scale'])}
        >
          <option value="fit">Fit to page</option>
          <option value="original">Original size</option>
        </select>
      </label>

      {preview.kind === 'pdf' && preview.numPages > 1 && (
        <fieldset>
          <legend>Pages</legend>
          <label>
            <input
              type="radio"
              name={`pageRangeMode-${file.id}`}
              checked={pageRangeMode === 'all'}
              onChange={() => setPageRangeMode('all')}
            />
            All pages
          </label>
          <label>
            <input
              type="radio"
              name={`pageRangeMode-${file.id}`}
              checked={pageRangeMode === 'custom'}
              onChange={() => setPageRangeMode('custom')}
            />
            Custom range
          </label>
          {pageRangeMode === 'custom' && (
            <span className="pageRangeInputs">
              <input
                type="number"
                min={1}
                max={preview.numPages}
                value={rangeFrom}
                onChange={(e) => {
                  const value = Math.max(
                    1,
                    Math.min(preview.numPages, Number(e.target.value) || 1),
                  );
                  setRangeFrom(Math.min(value, rangeTo));
                }}
              />
              –
              <input
                type="number"
                min={1}
                max={preview.numPages}
                value={rangeTo}
                onChange={(e) => {
                  const value = Math.max(
                    1,
                    Math.min(preview.numPages, Number(e.target.value) || 1),
                  );
                  setRangeTo(Math.max(value, rangeFrom));
                }}
              />
            </span>
          )}
        </fieldset>
      )}

      <label>
        Quantity
        <input
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
        />
      </label>
      <p>Price: ${(unitPrice * quantity).toFixed(2)}</p>
      {error && <p className="error">{error}</p>}
      <button type="button" onClick={handleSave} disabled={isSubmitting}>
        Save
      </button>
      <button type="button" onClick={handlePay} disabled={isSubmitting}>
        Pay now (simulated)
      </button>
    </div>
  );
}

export function FilesPage() {
  const { session, login, logout } = usePortalSession();

  const [folders, setFolders] = useState<AccountFolder[]>([]);
  const [files, setFiles] = useState<AccountFile[]>([]);
  const [limits, setLimits] = useState<AccountFileLimits | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [pendingDeleteFolderId, setPendingDeleteFolderId] = useState<string | null>(null);
  const [pendingDeleteFileId, setPendingDeleteFileId] = useState<string | null>(null);
  const [uploadFolderId, setUploadFolderId] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [configuringFileId, setConfiguringFileId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refresh(sessionToken: string) {
    const [folderList, fileList] = await Promise.all([
      listMyFolders(sessionToken),
      listMyFiles(sessionToken),
    ]);
    setFolders(folderList);
    setFiles(fileList);
  }

  useEffect(() => {
    if (session) refresh(session.sessionToken);
  }, [session]);

  useEffect(() => {
    getAccountFileLimits().then(setLimits);
  }, []);

  async function handleCreateFolder(event: React.FormEvent) {
    event.preventDefault();
    if (!session || !newFolderName.trim()) return;
    await createFolder(session.sessionToken, newFolderName.trim());
    setNewFolderName('');
    refresh(session.sessionToken);
  }

  async function handleRenameFolder(id: string) {
    if (!session || !renameValue.trim()) return;
    await renameFolder(session.sessionToken, id, renameValue.trim());
    setRenamingFolderId(null);
    refresh(session.sessionToken);
  }

  async function handleDeleteFolder(id: string) {
    if (!session) return;
    await deleteFolder(session.sessionToken, id);
    setPendingDeleteFolderId(null);
    refresh(session.sessionToken);
  }

  async function handleUpload(event: React.FormEvent) {
    event.preventDefault();
    if (!session) return;
    const selected = fileInputRef.current?.files;
    if (!selected || selected.length === 0) return;
    setIsUploading(true);
    setUploadError(null);
    try {
      await uploadFiles(session.sessionToken, Array.from(selected), uploadFolderId || undefined);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await refresh(session.sessionToken);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDeleteFile(id: string) {
    if (!session) return;
    await deleteFile(session.sessionToken, id);
    setPendingDeleteFileId(null);
    if (configuringFileId === id) setConfiguringFileId(null);
    refresh(session.sessionToken);
  }

  if (!session) {
    return (
      <LoginForm
        onLogin={async (email, password) => {
          await login(email, password);
          window.location.href = './start.html';
        }}
      />
    );
  }

  const folderName = (id: string | null) =>
    id === null ? 'Root' : (folders.find((f) => f.id === id)?.name ?? 'Root');

  return (
    <PortalShell email={session.email} active="files" onLogout={logout}>
      <h1>My files</h1>
      {limits && (
        <p className="limitsNotice">
          Allowed formats are {limits.acceptedExtensions.join(', ')}. Files are kept for{' '}
          {limits.retentionDays} days. Maximum storage size {limits.maxTotalStorageMb} MB.
        </p>
      )}

      <h2>Folders</h2>
      <ul className="plainList">
        {folders.map((folder) => (
          <li key={folder.id}>
            {renamingFolderId === folder.id ? (
              <>
                <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
                <button type="button" onClick={() => handleRenameFolder(folder.id)}>
                  Save
                </button>
                <button type="button" onClick={() => setRenamingFolderId(null)}>
                  Cancel
                </button>
              </>
            ) : pendingDeleteFolderId === folder.id ? (
              <>
                <span className="error">Delete "{folder.name}"? Files inside move to Root.</span>
                <button type="button" onClick={() => handleDeleteFolder(folder.id)}>
                  Confirm delete
                </button>
                <button type="button" onClick={() => setPendingDeleteFolderId(null)}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                {folder.name}
                <button
                  type="button"
                  onClick={() => {
                    setRenamingFolderId(folder.id);
                    setRenameValue(folder.name);
                  }}
                >
                  Rename
                </button>
                <button type="button" onClick={() => setPendingDeleteFolderId(folder.id)}>
                  Delete
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={handleCreateFolder}>
        <label>
          New folder
          <input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} />
        </label>
        <button type="submit" id="add-folder">
          ADD FOLDER
        </button>
      </form>

      <h2>Upload files</h2>
      <form onSubmit={handleUpload}>
        <label>
          Files
          <input type="file" multiple ref={fileInputRef} />
        </label>
        <label>
          Folder
          <select value={uploadFolderId} onChange={(e) => setUploadFolderId(e.target.value)}>
            <option value="">Root</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </label>
        {uploadError && <p className="error">{uploadError}</p>}
        <button type="submit" id="add-files" disabled={isUploading}>
          ADD FILES
        </button>
      </form>

      <h2>Files</h2>
      {files.length === 0 ? (
        <p>No files yet.</p>
      ) : (
        <ul className="plainList">
          {files.map((file) => (
            <li key={file.id}>
              <div>
                <strong>{file.fileName}</strong> — {folderName(file.folderId)} —{' '}
                {STATUS_LABEL[file.status]}
              </div>
              {pendingDeleteFileId === file.id ? (
                <>
                  <span className="error">Delete "{file.fileName}"?</span>
                  <button type="button" onClick={() => handleDeleteFile(file.id)}>
                    Confirm delete
                  </button>
                  <button type="button" onClick={() => setPendingDeleteFileId(null)}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  {file.status === 'ready' && (
                    <button
                      type="button"
                      onClick={() =>
                        setConfiguringFileId(configuringFileId === file.id ? null : file.id)
                      }
                    >
                      {configuringFileId === file.id ? 'Close' : 'Configure & pay'}
                    </button>
                  )}
                  <button type="button" onClick={() => setPendingDeleteFileId(file.id)}>
                    Delete
                  </button>
                </>
              )}
              {configuringFileId === file.id && (
                <ConfigureAndPay sessionToken={session.sessionToken} file={file} />
              )}
            </li>
          ))}
        </ul>
      )}
    </PortalShell>
  );
}
