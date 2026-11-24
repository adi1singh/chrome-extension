export class DocumentDownloadError extends Error {
  constructor(code, message) { super(message); this.name = 'DocumentDownloadError'; this.code = code; }
}

// Existing adapters name their uploads .pdf. Refuse HTML/login/error bodies.
export async function downloadPdf(url, { timeoutMs = 30000, maxBytes = 20 * 1024 * 1024, signal } = {}) {
  let parsed;
  try { parsed = new URL(url); } catch { /* Rejected below. */ }
  if (parsed?.protocol !== 'https:') throw new DocumentDownloadError('INVALID_DOCUMENT_URL', 'The document URL is unavailable or unsupported.');
  if (signal?.aborted) throw new DocumentDownloadError('CANCELLED', 'The document download was interrupted.');
  const initialPage = globalThis.location?.href;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new DocumentDownloadError('DOCUMENT_HTTP_ERROR', 'The document could not be downloaded.');
    if (Number(response.headers?.get('content-length')) > maxBytes) throw new DocumentDownloadError('DOCUMENT_TOO_LARGE', 'The document is too large for automatic upload.');
    let blob;
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      const chunks = []; let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) {
            await reader.cancel();
            throw new DocumentDownloadError('DOCUMENT_TOO_LARGE', 'The document is too large for automatic upload.');
          }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      blob = new Blob(chunks);
    } else { blob = await response.blob(); }
    if (initialPage !== undefined && globalThis.location?.href !== initialPage) throw new DocumentDownloadError('CANCELLED', 'The page changed during document download. Review the application before continuing.');
    if (!blob.size) throw new DocumentDownloadError('EMPTY_DOCUMENT', 'The document is empty.');
    if (blob.size > maxBytes) throw new DocumentDownloadError('DOCUMENT_TOO_LARGE', 'The document is too large for automatic upload.');
    const header = await blob.slice(0, 5).text();
    if (header !== '%PDF-') throw new DocumentDownloadError('INVALID_DOCUMENT', 'The downloaded file is not a PDF. Review it before uploading.');
    if (controller.signal.aborted) throw new DocumentDownloadError(signal?.aborted ? 'CANCELLED' : 'DOCUMENT_TIMEOUT', 'The document download was interrupted.');
    return blob.slice(0, blob.size, 'application/pdf');
  } catch (error) {
    if (error instanceof DocumentDownloadError) throw error;
    if (controller.signal.aborted) throw new DocumentDownloadError(signal?.aborted ? 'CANCELLED' : 'DOCUMENT_TIMEOUT', 'The document download was interrupted.');
    throw new DocumentDownloadError('DOCUMENT_NETWORK_ERROR', 'The document could not be downloaded.');
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
