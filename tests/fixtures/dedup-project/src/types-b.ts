enum Mode {
  Development = 'dev',
  Production = 'prod',
}

export function getMode(): Mode {
  return Mode.Development;
}
