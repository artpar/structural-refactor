export function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

export interface Config {
  host: string;
  port: number;
}

export enum Mode {
  Development = 'dev',
  Production = 'prod',
}
