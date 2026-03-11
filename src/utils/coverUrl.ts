const base = import.meta.env.BASE_URL;

export function getCoverUrl(id: string): string {
  const stem = id.replace(/\.jpg$/, "");
  return `${base}covers/${stem}.webp`;
}

export function getCoverThumbUrl(id: string): string {
  const stem = id.replace(/\.jpg$/, "");
  return `${base}covers-thumb/${stem}.webp`;
}

export function getArchiveUrl(issue: string): string {
  // issue format: "2010/13" → https://www.zeit.de/2010/13/index
  return `https://www.zeit.de/${issue}/index`;
}
