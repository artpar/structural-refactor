import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { extractInterface } from '../../../src/operations/extract/extract-interface.js';
import { createLogger, type LogEntry } from '../../../src/core/logger.js';
import { makeLogger, makeProject, parseAst } from "../../helpers/index.js";
describe('extractInterface', () => {
  it('extracts public methods and properties into an interface', () => {
    const code = `export class UserService {
  name: string;
  age: number;
  getName() { return this.name; }
  getAge() { return this.age; }
  private secret() { return "hidden"; }
}
`;
    const project = makeProject({ '/src/service.ts': code });
    const { logger } = makeLogger();

    const cs = extractInterface(project, {
      filePath: '/src/service.ts',
      className: 'UserService',
      interfaceName: 'IUserService',
      logger,
    });

    expect(cs.files).toHaveLength(1);
    const sf = parseAst(cs.files[0].modified);

    // Should have the interface
    const iface = sf.getInterface('IUserService');
    expect(iface).toBeDefined();

    // Interface should have public members
    const memberNames = iface!.getMembers().map((m) => {
      if ('getName' in m && typeof m.getName === 'function') return m.getName();
      return '';
    });
    expect(memberNames).toContain('name');
    expect(memberNames).toContain('age');
    expect(memberNames).toContain('getName');
    expect(memberNames).toContain('getAge');
    // Private method should NOT be in the interface
    expect(memberNames).not.toContain('secret');

    // Class should implement the interface
    const cls = sf.getClass('UserService');
    const implements_ = cls!.getImplements().map((i) => i.getText());
    expect(implements_).toContain('IUserService');
  });

  it('returns empty changeset for nonexistent class', () => {
    const project = makeProject({ '/src/app.ts': 'const x = 1;\n' });
    const { logger } = makeLogger();

    const cs = extractInterface(project, {
      filePath: '/src/app.ts',
      className: 'NonExistent',
      interfaceName: 'INonExistent',
      logger,
    });

    expect(cs.files).toHaveLength(0);
  });

  it('logs the operation', () => {
    const code = 'class Foo { bar() {} }\n';
    const project = makeProject({ '/src/app.ts': code });
    const { logger, entries } = makeLogger();

    extractInterface(project, {
      filePath: '/src/app.ts',
      className: 'Foo',
      interfaceName: 'IFoo',
      logger,
    });

    const logs = entries.filter((e) => e.scope === 'extract-interface');
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});
