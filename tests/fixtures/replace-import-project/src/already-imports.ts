import { toUpper } from './helpers';

function formatName(first: string, last: string): string {
  return `${first} ${last}`;
}

export function greetLoud(first: string, last: string): string {
  return toUpper(formatName(first, last));
}
