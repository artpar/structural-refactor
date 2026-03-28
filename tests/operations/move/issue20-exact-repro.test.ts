import { describe, it, expect } from 'vitest';
import { moveSymbol } from '../../../src/operations/move/move-symbol.js';
import { makeLogger, makeProject, parseAst } from '../../helpers/index.js';

describe('issue #20 exact repro', () => {
  it('first skip-copy move adds import when no existing import from target', () => {
    // Target ALREADY has all 3 icons (from previous moves from a different file)
    const project = makeProject({
      '/src/icons.ts': 'export const LinkIcon = () => "link";\nexport const GlobeIcon = () => "globe";\nexport const LockIcon = () => "lock";\n',
      '/src/DataViewer.tsx': [
        'import "./viewer.css";',
        'import { ListFilter } from "lucide-react";',
        '// Link icon',
        'const LinkIcon = () => <svg>link</svg>;',
        '// Globe icon',
        'const GlobeIcon = () => <svg>globe</svg>;',
        '// Lock icon',
        'const LockIcon = () => <svg>lock</svg>;',
        'export function DataViewer() { return <div><LinkIcon /><GlobeIcon /><LockIcon /><ListFilter /></div>; }',
        '',
      ].join('\n'),
    });
    const { logger, entries } = makeLogger();

    // All 3 are "skip copy" moves since target already has them
    console.log('=== Move 1: LinkIcon ===');
    const cs1 = moveSymbol(project, { symbolName: 'LinkIcon', fromFile: '/src/DataViewer.tsx', toFile: '/src/icons.ts', logger });
    const dv1 = project.getSourceFile('/src/DataViewer.tsx')!.getFullText();
    console.log(dv1);

    console.log('=== Move 2: GlobeIcon ===');
    const cs2 = moveSymbol(project, { symbolName: 'GlobeIcon', fromFile: '/src/DataViewer.tsx', toFile: '/src/icons.ts', logger });
    const dv2 = project.getSourceFile('/src/DataViewer.tsx')!.getFullText();
    console.log(dv2);

    console.log('=== Move 3: LockIcon ===');
    const cs3 = moveSymbol(project, { symbolName: 'LockIcon', fromFile: '/src/DataViewer.tsx', toFile: '/src/icons.ts', logger });
    const dv3 = project.getSourceFile('/src/DataViewer.tsx')!.getFullText();
    console.log(dv3);

    // Final state: DataViewer must import ALL THREE from icons
    const finalImports = project.getSourceFile('/src/DataViewer.tsx')!.getImportDeclarations();
    const iconsImport = finalImports.find((d) => d.getModuleSpecifierValue() === './icons');
    expect(iconsImport).toBeDefined();
    const names = iconsImport!.getNamedImports().map((n) => n.getName()).sort();
    console.log('Final icons import names:', names);
    expect(names).toEqual(['GlobeIcon', 'LinkIcon', 'LockIcon']);

    // Must preserve side-effect and lucide imports
    expect(dv3).toContain('./viewer.css');
    expect(dv3).toContain('ListFilter');
  });
});
