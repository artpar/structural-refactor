import { describe, it, expect } from 'vitest';
import { findDeadCode } from '../../../src/operations/quality/dead-code.js';
import { makeLogger, makeProject, parseAst } from '../../helpers/index.js';

describe('findDeadCode', () => {
  it('detects exported function with no importers as dead code', () => {
    const project = makeProject({
      '/src/utils.ts': 'export function unused() { return 1; }\nexport function used() { return 2; }\n',
      '/src/app.ts': 'import { used } from "./utils";\nconst x = used();\n',
    });
    const { logger } = makeLogger();

    const cs = findDeadCode(project, { logger });

    expect(cs.files.length).toBeGreaterThanOrEqual(1);
    const utilsChange = cs.files.find((f) => f.path === '/src/utils.ts')!;
    expect(utilsChange).toBeDefined();
    const sf = parseAst(utilsChange.modified);
    expect(sf.getFunction('unused')).toBeUndefined();
    expect(sf.getFunction('used')).toBeDefined();
  });

  it('does not report exported function that is imported', () => {
    const project = makeProject({
      '/src/utils.ts': 'export function helper() { return 1; }\n',
      '/src/app.ts': 'import { helper } from "./utils";\nconst x = helper();\n',
    });
    const { logger } = makeLogger();

    const cs = findDeadCode(project, { logger });

    // helper is used — no changes to utils.ts
    const utilsChange = cs.files.find((f) => f.path === '/src/utils.ts');
    expect(utilsChange).toBeUndefined();
  });

  it('respects scope option', () => {
    const project = makeProject({
      '/src/utils.ts': 'export function unused() { return 1; }\n',
      '/lib/helpers.ts': 'export function alsoUnused() { return 2; }\n',
    });
    const { logger } = makeLogger();

    const cs = findDeadCode(project, { scope: '/src', logger });

    // Only /src/utils.ts should be checked, not /lib/helpers.ts
    const libChange = cs.files.find((f) => f.path === '/lib/helpers.ts');
    expect(libChange).toBeUndefined();

    const srcChange = cs.files.find((f) => f.path === '/src/utils.ts');
    expect(srcChange).toBeDefined();
  });

  it('handles multiple dead exports in one file', () => {
    const project = makeProject({
      '/src/utils.ts': 'export function dead1() { return 1; }\nexport function dead2() { return 2; }\nexport function alive() { return 3; }\n',
      '/src/app.ts': 'import { alive } from "./utils";\nconst x = alive();\n',
    });
    const { logger } = makeLogger();

    const cs = findDeadCode(project, { logger });

    const utilsChange = cs.files.find((f) => f.path === '/src/utils.ts')!;
    expect(utilsChange).toBeDefined();
    const sf = parseAst(utilsChange.modified);
    expect(sf.getFunction('dead1')).toBeUndefined();
    expect(sf.getFunction('dead2')).toBeUndefined();
    expect(sf.getFunction('alive')).toBeDefined();
  });
});
