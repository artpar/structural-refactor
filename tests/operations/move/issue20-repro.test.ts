import { describe, it, expect } from 'vitest';
import { moveSymbol } from '../../../src/operations/move/move-symbol.js';
import { makeLogger, makeProject, parseAst } from '../../helpers/index.js';

describe('issue #20 repro: sequential moves of non-exported symbol', () => {
  it('adds import in second source file when target already has symbol', () => {
    const project = makeProject({
      '/src/a.tsx': '// icon A\nconst LinkIcon = () => <svg>A</svg>;\nexport function PageA() { return <div><LinkIcon /></div>; }\n',
      '/src/b.tsx': '// icon B\nconst LinkIcon = () => <svg>B</svg>;\nexport function PageB() { return <div><LinkIcon /></div>; }\n',
      '/src/icons.ts': '',
    });
    const { logger } = makeLogger();

    // First move: a.tsx -> icons.ts
    const cs1 = moveSymbol(project, {
      symbolName: 'LinkIcon',
      fromFile: '/src/a.tsx',
      toFile: '/src/icons.ts',
      logger,
    });

    console.log('=== Move 1 results ===');
    for (const f of cs1.files) {
      console.log(`--- ${f.path} ---`);
      console.log(f.modified);
    }

    // Verify first move worked
    expect(cs1.files.length).toBeGreaterThanOrEqual(2);
    const a1 = cs1.files.find((f) => f.path === '/src/a.tsx')!;
    expect(a1).toBeDefined();
    expect(a1.modified).toContain('import');
    expect(a1.modified).toContain('LinkIcon');

    // Second move: b.tsx -> icons.ts (target already has LinkIcon)
    const cs2 = moveSymbol(project, {
      symbolName: 'LinkIcon',
      fromFile: '/src/b.tsx',
      toFile: '/src/icons.ts',
      logger,
    });

    console.log('=== Move 2 results ===');
    for (const f of cs2.files) {
      console.log(`--- ${f.path} ---`);
      console.log(f.modified);
    }

    // b.tsx should have an import for LinkIcon since PageB() still uses it
    const b2 = cs2.files.find((f) => f.path === '/src/b.tsx')!;
    expect(b2).toBeDefined();
    expect(b2.modified).toContain('LinkIcon');
    // Must have an import from icons
    const bSf = parseAst(b2.modified);
    const importDecl = bSf.getImportDeclarations().find(
      (d) => d.getModuleSpecifierValue() === './icons'
    );
    expect(importDecl).toBeDefined();
    expect(importDecl!.getNamedImports().some((n) => n.getName() === 'LinkIcon')).toBe(true);
  });
});
