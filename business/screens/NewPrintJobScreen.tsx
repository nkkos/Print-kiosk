import { useEffect, useRef, useState } from 'react';
import {
  uploadFiles,
  listMyFiles,
  deleteFile,
  getAccountFileLimits,
  type AccountFile,
  type AccountFileLimits,
} from '../../src/services/accountFileApi';
import { ConfigureAndPay } from '../../portal/FilesPage';
import { payOrderForCompany } from '../services/businessApi';

interface NewPrintJobScreenProps {
  sessionToken: string;
  companyName: string;
}

const STATUS_LABEL: Record<AccountFile['status'], string> = {
  scanning: 'Scanning for viruses…',
  converting: 'Preparing for print…',
  ready: 'Ready',
  rejected: 'Blocked (failed virus scan)',
  'scan-unavailable': 'Scan unavailable',
};

// Reuses the exact upload/configure flow already built for the personal
// portal (portal/FilesPage.tsx) — accountFiles/printOrders don't care
// whether the account belongs to a company, only the final "how does this
// get paid" step differs (ConfigureAndPay's onPay/payLabel props, added
// specifically for this second consumer). No folder management here —
// unlike the personal portal, organizing files into folders isn't a real
// need for "upload a job, print it" B2B usage.
export function NewPrintJobScreen({ sessionToken, companyName }: NewPrintJobScreenProps) {
  const [files, setFiles] = useState<AccountFile[]>([]);
  const [limits, setLimits] = useState<AccountFileLimits | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [configuringFileId, setConfiguringFileId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function refresh() {
    listMyFiles(sessionToken)
      .then(setFiles)
      .catch(() => {});
  }

  useEffect(refresh, [sessionToken]);
  useEffect(() => {
    getAccountFileLimits().then(setLimits);
  }, []);

  async function handleUpload(event: React.FormEvent) {
    event.preventDefault();
    const selected = fileInputRef.current?.files;
    if (!selected || selected.length === 0) return;
    setIsUploading(true);
    setUploadError(null);
    try {
      await uploadFiles(sessionToken, Array.from(selected));
      if (fileInputRef.current) fileInputRef.current.value = '';
      refresh();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteFile(sessionToken, id);
    if (configuringFileId === id) setConfiguringFileId(null);
    refresh();
  }

  return (
    <section className="view" id="view-new-print-job">
      <div className="view-header">
        <div>
          <h1 className="view-title">New print job</h1>
          <p className="view-sub">Billed to {companyName} — no payment at checkout.</p>
        </div>
      </div>

      {limits && (
        <p className="empty-note">
          Accepted formats: {limits.acceptedExtensions.join(', ')}. Files are kept for{' '}
          {limits.retentionDays} days.
        </p>
      )}

      <form onSubmit={handleUpload} style={{ display: 'flex', gap: '0.6rem', margin: '1rem 0' }}>
        <input type="file" multiple ref={fileInputRef} className="admin-input" />
        {uploadError && <p className="login-error">{uploadError}</p>}
        <button
          type="submit"
          className="btn btn-primary"
          id="business-upload-submit"
          disabled={isUploading}
        >
          {isUploading ? 'Uploading…' : 'Upload'}
        </button>
      </form>

      {files.length === 0 ? (
        <p className="empty-note">No files yet.</p>
      ) : (
        <div className="incident-feed" id="business-files-list">
          {files.map((file) => (
            <div
              className="incident-row incident-row-static"
              key={file.id}
              style={{ flexWrap: 'wrap' }}
            >
              <span className="incident-code">{file.fileName}</span>
              <span className="incident-target">{STATUS_LABEL[file.status]}</span>
              {file.status === 'ready' && (
                <button
                  type="button"
                  className="filter-reset"
                  onClick={() =>
                    setConfiguringFileId(configuringFileId === file.id ? null : file.id)
                  }
                >
                  {configuringFileId === file.id ? 'Close' : 'Configure & print'}
                </button>
              )}
              <button type="button" className="filter-reset" onClick={() => handleDelete(file.id)}>
                Delete
              </button>
              {configuringFileId === file.id && (
                <div style={{ width: '100%' }}>
                  <ConfigureAndPay
                    sessionToken={sessionToken}
                    file={file}
                    onPay={(token, orderId) => payOrderForCompany(token, orderId)}
                    payLabel={`Bill to ${companyName}`}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
