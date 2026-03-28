function privateHelper(x: number): number {
  return x * 2;
}

export function publicFn(a: number, b: number): number {
  return privateHelper(a) + b;
}

export class MyClass {
  name: string;
  constructor(name: string) {
    this.name = name;
  }
  greet(): string {
    return `Hello, ${this.name}`;
  }
}

export const count = 42;

export interface Options {
  verbose: boolean;
}

export type Result = { ok: boolean; value: string };

export enum Status {
  Active = 'active',
  Inactive = 'inactive',
}
