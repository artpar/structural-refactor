import { describe, it, expect } from 'vitest';
import { Project, SyntaxKind } from 'ts-morph';
import { encapsulateField } from '../../../src/operations/member/encapsulate.js';
import { createLogger, type LogEntry } from '../../../src/core/logger.js';
import { makeLogger, makeProject, parseAst } from "../../helpers/index.js";
describe('encapsulateField', () => {
  it('generates getter and setter for a public field', () => {
    const code = 'class User {\n  name: string = "";\n}\n';
    const project = makeProject({ '/src/app.ts': code });
    const { logger } = makeLogger();

    const cs = encapsulateField(project, {
      filePath: '/src/app.ts',
      className: 'User',
      fieldName: 'name',
      logger,
    });

    expect(cs.files).toHaveLength(1);
    const sf = parseAst(cs.files[0].modified);
    const cls = sf.getClassOrThrow('User');

    // Field should be private with underscore prefix
    const privateProp = cls.getProperty('_name');
    expect(privateProp).toBeDefined();

    // Should have getter
    const getter = cls.getGetAccessor('name');
    expect(getter).toBeDefined();

    // Should have setter
    const setter = cls.getSetAccessor('name');
    expect(setter).toBeDefined();
  });

  it('returns empty changeset for nonexistent class', () => {
    const project = makeProject({ '/src/app.ts': 'const x = 1;\n' });
    const { logger } = makeLogger();

    const cs = encapsulateField(project, {
      filePath: '/src/app.ts',
      className: 'Nope',
      fieldName: 'x',
      logger,
    });

    expect(cs.files).toHaveLength(0);
  });

  it('returns empty changeset for nonexistent field', () => {
    const code = 'class User { age = 0; }\n';
    const project = makeProject({ '/src/app.ts': code });
    const { logger } = makeLogger();

    const cs = encapsulateField(project, {
      filePath: '/src/app.ts',
      className: 'User',
      fieldName: 'nope',
      logger,
    });

    expect(cs.files).toHaveLength(0);
  });

  it('logs the operation', () => {
    const code = 'class Foo { bar = 1; }\n';
    const project = makeProject({ '/src/app.ts': code });
    const { logger, entries } = makeLogger();

    encapsulateField(project, {
      filePath: '/src/app.ts',
      className: 'Foo',
      fieldName: 'bar',
      logger,
    });

    const logs = entries.filter((e) => e.scope === 'encapsulate-field');
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});
