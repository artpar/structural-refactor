import { formatDate } from './canonical';

export function displayDate(d: Date): string {
  return `Today: ${formatDate(d)}`;
}
