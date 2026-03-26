import { add } from './math';

export function sum(numbers: number[]): number {
  return numbers.reduce((acc, n) => add(acc, n), 0);
}

export type NumberList = number[];
