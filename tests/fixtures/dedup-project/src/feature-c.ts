function formatDate(d: Date, locale: string): string {
  return d.toLocaleDateString(locale);
}

export function renderDateC(d: Date): string {
  return `Local: ${formatDate(d, 'en-US')}`;
}
