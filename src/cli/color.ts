import chalk from 'chalk';

function isColorEnabled(): boolean {
  return !process.env['NO_COLOR'] && process.stderr.isTTY !== false;
}

function colorize(fn: (s: string) => string, text: string): string {
  return isColorEnabled() ? fn(text) : text;
}

export function colorDiff(diff: string): string {
  if (!isColorEnabled()) return diff;

  return diff
    .split('\n')
    .map((line) => {
      if (line.startsWith('+++') || line.startsWith('---')) return chalk.bold(line);
      if (line.startsWith('@@')) return chalk.cyan(line);
      if (line.startsWith('+')) return chalk.green(line);
      if (line.startsWith('-')) return chalk.red(line);
      return line;
    })
    .join('\n');
}

export function errorText(msg: string): string {
  return colorize(chalk.red, msg);
}

export function warnText(msg: string): string {
  return colorize(chalk.yellow, msg);
}

export function successText(msg: string): string {
  return colorize(chalk.green, msg);
}

export function dimText(msg: string): string {
  return colorize(chalk.dim, msg);
}
