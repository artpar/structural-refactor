import { describe, it, expect } from 'vitest';
import { createProgram } from '../../src/cli/index.js';

describe('CLI program', () => {
  it('creates a commander program', () => {
    const program = createProgram();
    expect(program.name()).toBe('sref');
  });

  it('has all 10 command categories registered', () => {
    const program = createProgram();
    const commands = program.commands.map((c) => c.name());
    expect(commands).toContain('rename');
    expect(commands).toContain('extract');
    expect(commands).toContain('inline');
    expect(commands).toContain('move');
    expect(commands).toContain('member');
    expect(commands).toContain('signature');
    expect(commands).toContain('type');
    expect(commands).toContain('module');
    expect(commands).toContain('quality');
    expect(commands).toContain('class');
    expect(commands).toContain('analyze');
    expect(commands).toContain('discover');
    expect(commands).toContain('patterns');
    expect(commands).toContain('undo');
    expect(commands).toContain('modify');
    expect(commands).toContain('init');
    expect(commands).toHaveLength(16);
  });

  it('has global options', () => {
    const program = createProgram();
    const optionNames = program.options.map((o) => o.long);
    expect(optionNames).toContain('--dry-run');
    expect(optionNames).toContain('--json');
    expect(optionNames).toContain('--verbose');
    expect(optionNames).toContain('--tsconfig');
    expect(optionNames).toContain('--scope');
    expect(optionNames).toContain('--no-confirm');
    expect(optionNames).toContain('--no-color');
  });

  describe('rename subcommands', () => {
    it('has symbol and file subcommands', () => {
      const program = createProgram();
      const rename = program.commands.find((c) => c.name() === 'rename')!;
      const subs = rename.commands.map((c) => c.name());
      expect(subs).toContain('symbol');
      expect(subs).toContain('file');
    });
  });

  describe('extract subcommands', () => {
    it('has expected subcommands', () => {
      const program = createProgram();
      const extract = program.commands.find((c) => c.name() === 'extract')!;
      const subs = extract.commands.map((c) => c.name());
      expect(subs).toContain('function');
      expect(subs).toContain('variable');
      expect(subs).toContain('interface');
    });
  });

  describe('move subcommands', () => {
    it('has expected subcommands', () => {
      const program = createProgram();
      const move = program.commands.find((c) => c.name() === 'move')!;
      const subs = move.commands.map((c) => c.name());
      expect(subs).toContain('symbol');
      expect(subs).toContain('file');
      expect(subs).toContain('member');
    });
  });
});
