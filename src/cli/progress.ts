const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export interface Spinner {
  stop(): void;
}

export function startSpinner(message: string): Spinner {
  if (!process.stderr.isTTY || process.env['NO_COLOR'] || process.env['CI']) {
    return { stop() {} };
  }

  let i = 0;
  const interval = setInterval(() => {
    process.stderr.write(`\r${FRAMES[i % FRAMES.length]} ${message}`);
    i++;
  }, 80);

  return {
    stop() {
      clearInterval(interval);
      process.stderr.write('\r' + ' '.repeat(message.length + 3) + '\r');
    },
  };
}
