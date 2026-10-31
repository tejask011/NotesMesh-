/** Remove only characters that are illegal in file names, so non-Latin titles survive. */
export function safeFileName(name: string, fallback = 'untitled'): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/[. ]+$/, '')
    .trim();
  return cleaned.slice(0, 120) || fallback;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoking synchronously can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(text: string, fileName: string, type: string): void {
  downloadBlob(new Blob([text], { type }), fileName);
}

/** Promise wrapper around FileReader so read failures surface as rejections. */
export function readFileBytes(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('The file could not be read.'));
    reader.onabort = () => reject(new Error('Reading the file was cancelled.'));
    reader.readAsArrayBuffer(file);
  });
}

export async function readFileText(file: File): Promise<string> {
  return new TextDecoder('utf-8').decode(await readFileBytes(file));
}
