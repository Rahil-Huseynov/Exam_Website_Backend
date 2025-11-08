export function ensureAbsoluteUrl(url: string | null | undefined, base: string): string | null {
  if (!url) return null;
  const trimmed = String(url).trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const b = (base || '').replace(/\/+$/, '');
  const p = trimmed.replace(/^\/+/, '');    
  if (!b) return '/' + p;
  return `${b}/${p}`;
}

export function normalizeUrl(url: string | null | undefined, base?: string) {
  if (!url) return '';
  return base ? ensureAbsoluteUrl(url, base) || '' : url;
}
