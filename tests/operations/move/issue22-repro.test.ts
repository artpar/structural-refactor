import { describe, it, expect } from 'vitest';
import { moveSymbol } from '../../../src/operations/move/move-symbol.js';
import { makeLogger, makeProject, parseAst } from '../../helpers/index.js';

describe('issue #22 repro: full SVG icon extraction scenario', () => {
  it('handles sequential moves with side-effect imports, comments, and duplicates', () => {
    const project = makeProject({
      '/src/AiUi.tsx': [
        'import "./styles.css";',
        'import { CalendarIcon } from "lucide-react";',
        '// Link icon SVG',
        'const LinkIcon = () => <svg>link</svg>;',
        '// Globe icon SVG',
        'const GlobeIcon = () => <svg>globe</svg>;',
        '// Lock icon SVG',
        'const LockIcon = () => <svg>lock</svg>;',
        'export function AiUi() { return <div><LinkIcon /><GlobeIcon /><LockIcon /><CalendarIcon /></div>; }',
        '',
      ].join('\n'),
      '/src/DataViewer.tsx': [
        'import "./viewer.css";',
        'import { ListFilter } from "lucide-react";',
        '// Link icon SVG',
        'const LinkIcon = () => <svg>link</svg>;',
        '// Globe icon SVG',
        'const GlobeIcon = () => <svg>globe</svg>;',
        '// Lock icon SVG',
        'const LockIcon = () => <svg>lock</svg>;',
        'export function DataViewer() { return <div><LinkIcon /><GlobeIcon /><LockIcon /><ListFilter /></div>; }',
        '',
      ].join('\n'),
      '/src/icons.ts': '',
    });
    const { logger } = makeLogger();

    // Move all 6 icons (3 from each file)
    const moves = [
      { symbol: 'LinkIcon', from: '/src/AiUi.tsx' },
      { symbol: 'LinkIcon', from: '/src/DataViewer.tsx' },
      { symbol: 'GlobeIcon', from: '/src/AiUi.tsx' },
      { symbol: 'GlobeIcon', from: '/src/DataViewer.tsx' },
      { symbol: 'LockIcon', from: '/src/AiUi.tsx' },
      { symbol: 'LockIcon', from: '/src/DataViewer.tsx' },
    ];

    for (const { symbol, from } of moves) {
      moveSymbol(project, {
        symbolName: symbol,
        fromFile: from,
        toFile: '/src/icons.ts',
        logger,
      });
    }

    // Check AiUi.tsx
    const aiUi = project.getSourceFile('/src/AiUi.tsx')!;
    const aiUiText = aiUi.getFullText();
    console.log('=== AiUi.tsx ===');
    console.log(aiUiText);

    // Must preserve side-effect CSS import
    expect(aiUiText).toContain('./styles.css');
    // Must preserve CalendarIcon lucide import
    expect(aiUiText).toContain('CalendarIcon');
    // Must import all 3 icons from icons.ts
    const aiUiImports = aiUi.getImportDeclarations();
    const iconsImport = aiUiImports.find((d) => d.getModuleSpecifierValue() === './icons');
    expect(iconsImport).toBeDefined();
    const aiUiIconNames = iconsImport!.getNamedImports().map((n) => n.getName()).sort();
    expect(aiUiIconNames).toEqual(['GlobeIcon', 'LinkIcon', 'LockIcon']);

    // Check DataViewer.tsx
    const dv = project.getSourceFile('/src/DataViewer.tsx')!;
    const dvText = dv.getFullText();
    console.log('=== DataViewer.tsx ===');
    console.log(dvText);

    // Must preserve side-effect CSS import
    expect(dvText).toContain('./viewer.css');
    // Must preserve ListFilter lucide import
    expect(dvText).toContain('ListFilter');
    // Must import all 3 icons from icons.ts
    const dvImports = dv.getImportDeclarations();
    const dvIconsImport = dvImports.find((d) => d.getModuleSpecifierValue() === './icons');
    expect(dvIconsImport).toBeDefined();
    const dvIconNames = dvIconsImport!.getNamedImports().map((n) => n.getName()).sort();
    expect(dvIconNames).toEqual(['GlobeIcon', 'LinkIcon', 'LockIcon']);

    // Check icons.ts — should have 3 exports, no duplicated comments
    const icons = project.getSourceFile('/src/icons.ts')!;
    const iconsText = icons.getFullText();
    console.log('=== icons.ts ===');
    console.log(iconsText);

    // Each comment should appear exactly once
    expect((iconsText.match(/Link icon SVG/g) || []).length).toBe(1);
    expect((iconsText.match(/Globe icon SVG/g) || []).length).toBe(1);
    expect((iconsText.match(/Lock icon SVG/g) || []).length).toBe(1);

    // Should have all 3 declarations
    expect(iconsText).toContain('export const LinkIcon');
    expect(iconsText).toContain('export const GlobeIcon');
    expect(iconsText).toContain('export const LockIcon');
  });
});
