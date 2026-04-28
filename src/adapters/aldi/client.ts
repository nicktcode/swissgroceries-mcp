const BASE = 'https://api.aldi-suisse.ch';
const UA = 'ALDI iOS App CH 9.2614.1 8';

export async function aldiFetch(path: string, query: Record<string, string | number | undefined> = {}): Promise<any> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': '*/*',
      'Accept-Language': 'de_CH',
    },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Aldi ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

export const ALDI_DEFAULT_SERVICE_POINT = 'E172';
