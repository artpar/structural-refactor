import { add } from './math';

export function processValue(x: number): string {
  if (x > 0) {
    const result = add(x, 1);
    return `positive: ${result}`;
  } else if (x === 0) {
    return 'zero';
  } else {
    return 'negative';
  }
}

export function loopSum(values: number[]): number {
  let total = 0;
  for (const v of values) {
    if (v < 0) continue;
    total = add(total, v);
  }
  return total;
}

export function tryCatch(): string {
  try {
    const data = JSON.parse('{}');
    return data.value ?? 'default';
  } catch (e) {
    return 'error';
  } finally {
    console.log('done');
  }
}

export function switchCase(status: string): number {
  switch (status) {
    case 'active': return 1;
    case 'inactive': return 0;
    case 'pending': return -1;
    default: return -2;
  }
}
