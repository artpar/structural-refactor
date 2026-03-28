function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

export function renderDateA(d: Date): string {
  return `Date: ${formatDate(d)}`;
}
