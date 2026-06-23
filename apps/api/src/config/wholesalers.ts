export type FeedSource = {
  label: string;
  url: string | undefined;
  file: string | undefined;
};

function splitList(value?: string) {
  return (value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getFeedSources(): FeedSource[] {
  const urlLabels = splitList(process.env['WHOLESALERS_LABELS']);
  const urls = splitList(process.env['WHOLESALERS_URLS']);
  const files = splitList(process.env['WHOLESALERS_FILES']);

  const sources: FeedSource[] = [];

  for (let i = 0; i < Math.max(urls.length, files.length); i++) {
    const label = urlLabels[i] || `source-${i + 1}`;
    const url: string | undefined = typeof urls[i] === 'string' ? urls[i] : undefined;
    const file: string | undefined = typeof files[i] === 'string' ? files[i] : undefined;
    if (url || file) {
      sources.push({ label, url, file });
    }
  }

  return sources;
}
