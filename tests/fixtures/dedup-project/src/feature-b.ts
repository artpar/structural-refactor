function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

export function renderDateB(d: Date): string {
  return `Formatted: ${formatDate(d)}`;
}
