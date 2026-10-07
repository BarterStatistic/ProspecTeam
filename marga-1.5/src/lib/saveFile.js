// Saves a Blob as a file from the browser.
//
// iOS Safari — and every other iOS browser, since Apple forces them all onto
// the WebKit engine — does not honour the `download` attribute on <a>. A
// programmatic click just navigates to (or opens) the blob instead of saving
// it, so users see the image but nothing lands in Photos/Files. The fix is to
// prefer the native share sheet (`navigator.share` with a File), which does
// have a "Guardar imagen" action and is supported since iOS 15. Desktop/
// Android browsers, which handle `download` correctly, keep using the classic
// link trick as a fallback.
export async function saveBlob(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return; // user dismissed the share sheet
      // Any other share failure falls through to the link method below.
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  // Revoke late: an immediate revoke cancels the download in Edge, and can
  // race the async navigation some browsers do on click.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
