const assetPattern = (tag) => new RegExp(`${tag}="([^"]+\\.(?:css|js))"`, 'i');

export function parseEnvText(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || match[1].startsWith('#')) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

export function inspectMobileStyles(html, css) {
  return {
    viewportFit: /name="viewport"[^>]*viewport-fit=cover/i.test(html),
    coarsePointerLayout: /\(\s*pointer\s*:\s*coarse\s*\)/i.test(css),
    transactionGrid: /\.transaction-list li\{display:grid;grid-template-columns:minmax\(0,1fr\) auto/i.test(css),
    fourColumnCategories: /repeat\(4,minmax\(0,1fr\)\)/i.test(css),
    dynamicViewport: /100dvh/i.test(css),
    safeArea: /safe-area-inset-(?:top|bottom)/i.test(css),
  };
}

export async function runProductionSmoke({ siteUrl, supabaseUrl, publishableKey, fetchImpl = fetch }) {
  const checks = [];
  const record = (name, ok, details = '') => checks.push({ name, ok, details });
  let base;
  try { base = new URL(siteUrl); } catch { return { ok: false, checks: [{ name: 'site URL', ok: false, details: 'invalid URL' }] }; }
  if (!['https:', 'http:'].includes(base.protocol)) return { ok: false, checks: [{ name: 'site URL', ok: false, details: 'unsupported protocol' }] };
  if (!base.pathname.endsWith('/')) base.pathname += '/';

  let html;
  try {
    const response = await fetchImpl(base);
    record('app home HTTP 200', response.status === 200, `HTTP ${response.status}`);
    if (!response.ok) return { ok: false, checks };
    html = await response.text();
  } catch (error) { record('app home HTTP 200', false, error.message); return { ok: false, checks }; }

  const cssPath = html.match(assetPattern('href'))?.[1];
  const jsPath = html.match(assetPattern('src'))?.[1];
  record('viewport safe-area metadata', /name="viewport"[^>]*viewport-fit=cover/i.test(html), '');
  let css = '';
  for (const [name, asset] of [['production CSS', cssPath], ['production JS', jsPath], ['PWA service worker', new URL('sw.js', base).href]]) {
    if (!asset) { record(`${name} reference`, false, 'asset reference missing'); continue; }
    try {
      const response = await fetchImpl(new URL(asset, base));
      record(`${name} HTTP 200`, response.status === 200, `HTTP ${response.status}`);
      if (response.ok && name === 'production CSS') css = await response.text();
    } catch (error) { record(`${name} HTTP 200`, false, error.message); }
  }
  const mobile = inspectMobileStyles(html, css);
  record('iPhone coarse-pointer layout', mobile.coarsePointerLayout);
  record('transaction row layout', mobile.transactionGrid);
  record('four-column category layout', mobile.fourColumnCategories);
  record('dynamic viewport and safe areas', mobile.dynamicViewport && mobile.safeArea);

  if (!supabaseUrl || !publishableKey) record('Supabase Auth health', false, 'public client configuration missing');
  else {
    try {
      const endpoint = new URL('/auth/v1/health', supabaseUrl);
      const response = await fetchImpl(endpoint, { headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` } });
      record('Supabase Auth health', response.status === 200, `HTTP ${response.status}`);
    } catch (error) { record('Supabase Auth health', false, error.message); }
  }
  return { ok: checks.every((check) => check.ok), checks };
}
