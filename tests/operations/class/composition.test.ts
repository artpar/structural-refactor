import { describe, it, expect } from 'vitest';
import { Project, SyntaxKind } from 'ts-morph';
import { replaceInheritanceWithComposition } from '../../../src/operations/class/composition.js';
import { createLogger, type LogEntry } from '../../../src/core/logger.js';
import { makeLogger, makeProject, parseAst } from "../../helpers/index.js";
describe('replaceInheritanceWithComposition', () => {
  it('replaces extends with a delegate field and forwarding methods', () => {
    const code = `class Animal {
  speak() { return "..."; }
  move() { return "moving"; }
}

class Dog extends Animal {
  bark() { return "woof"; }
}
`;
    const project = makeProject({ '/src/app.ts': code });
    const { logger } = makeLogger();

    const cs = replaceInheritanceWithComposition(project, {
      filePath: '/src/app.ts',
      className: 'Dog',
      logger,
    });

    expect(cs.files).toHaveLength(1);
    const sf = parseAst(cs.files[0].modified);
    const cls = sf.getClassOrThrow('Dog');

    // Should not extend Animal anymore
    const extendsClause = cls.getExtends();
    expect(extendsClause).toBeUndefined();

    // Should have a delegate field
    const delegate = cls.getProperty('_animal');
    expect(delegate).toBeDefined();

    // Should have forwarding methods for parent's methods
    const methods = cls.getMethods().map((m) => m.getName());
    expect(methods).toContain('speak');
    expect(methods).toContain('move');
    expect(methods).toContain('bark');
  });

  it('returns empty changeset for class without extends', () => {
    const code = 'class Foo { bar() {} }\n';
    const project = makeProject({ '/src/app.ts': code });
    const { logger } = makeLogger();

    const cs = replaceInheritanceWithComposition(project, {
      filePath: '/src/app.ts',
      className: 'Foo',
      logger,
    });

    expect(cs.files).toHaveLength(0);
  });

  it('logs the operation', () => {
    const code = 'class A {}\nclass B extends A {}\n';
    const project = makeProject({ '/src/app.ts': code });
    const { logger, entries } = makeLogger();

    replaceInheritanceWithComposition(project, {
      filePath: '/src/app.ts',
      className: 'B',
      logger,
    });

    const logs = entries.filter((e) => e.scope === 'composition');
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});
