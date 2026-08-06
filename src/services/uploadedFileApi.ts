// Real document preview (src/features/print-order-configuration/PrintOrderConfigurationScreen.tsx)
// — just the URL, since the caller consumes the response directly (via
// fetch + pdfjs-dist, or an <img> src), not JSON.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

export function getUploadedFileContentUrl(fileId: string): string {
  return `${API_BASE_URL}/api/uploaded-files/${fileId}/content`;
}
