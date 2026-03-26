export interface SrefConfig {
  tsconfig: string;
  plugins: string[];
  exclude: string[];
}

export function defaultConfig(): SrefConfig {
  return {
    tsconfig: 'tsconfig.json',
    plugins: [],
    exclude: [],
  };
}

export function mergeConfig(base: SrefConfig, overrides: Partial<SrefConfig>): SrefConfig {
  return { ...base, ...overrides };
}
