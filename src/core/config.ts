export interface SrefConfig {
  tsconfig: string;
  exclude: string[];
}

export function defaultConfig(): SrefConfig {
  return {
    tsconfig: 'tsconfig.json',
    exclude: [],
  };
}

export function mergeConfig(base: SrefConfig, overrides: Partial<SrefConfig>): SrefConfig {
  return { ...base, ...overrides };
}
