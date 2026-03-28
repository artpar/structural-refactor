interface Config {
  host: string;
  port: number;
}

export function createConfig(): Config {
  return { host: 'localhost', port: 3000 };
}
