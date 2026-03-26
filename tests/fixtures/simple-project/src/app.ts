import { sum } from './utils';
import { PI } from './math';

const values = [1, 2, 3, 4, 5];
const total = sum(values);
const circumference = 2 * PI * 10;

console.log(total, circumference);
