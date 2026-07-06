/**
 * Copy text to the clipboard in BOTH secure and insecure contexts.
 *
 * `navigator.clipboard` only exists over https or on localhost. This app is
 * frequently served over plain http on a LAN/tailnet (e.g.
 * http://stefan-nuc:3000), where that API is `undefined` — so we fall back to
 * the legacy `execCommand('copy')` via an off-screen textarea. Returns whether
 * the copy actually succeeded.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // blocked or permission denied — fall through to the legacy path
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    // keep it off-screen so selecting it doesn't scroll or flash
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
