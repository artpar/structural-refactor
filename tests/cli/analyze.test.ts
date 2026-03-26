import { describe, it, expect } from 'vitest';
import { createProgram } from '../../src/cli/index.js';

describe('CLI analyze commands', () => {
  it('has analyze command registered', () => {
    const program = createProgram();
    const commands = program.commands.map((c) => c.name());
    expect(commands).toContain('analyze');
  });

  it('has analyze subcommands', () => {
    const program = createProgram();
    const analyze = program.commands.find((c) => c.name() === 'analyze')!;
    const subs = analyze.commands.map((c) => c.name());
    expect(subs).toContain('info');
    expect(subs).toContain('deps');
    expect(subs).toContain('graph');
    expect(subs).toContain('exports');
    expect(subs).toContain('imports');
    expect(subs).toContain('cfg');
    expect(subs).toContain('dfg');
    expect(subs).toContain('call-graph');
  });
});
