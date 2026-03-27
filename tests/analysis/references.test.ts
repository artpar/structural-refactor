import { describe, it, expect } from 'vitest';
import { Project, SyntaxKind } from 'ts-morph';
import {
  findAllReferences,
  type ReferenceInfo,
  type ReferenceContext,
} from '../../src/analysis/references.js';
import { createLogger } from '../../src/core/logger.js';
import { makeProject } from "../helpers/index.js";

function makeLogger() {
  return createLogger({ level: 'trace', sink: () => {} });
}

describe('findAllReferences', () => {
  describe('JSX expression bindings', () => {
    it('finds variable references in JSX expression containers', () => {
      const code = `function App() {
  const title = "hello";
  return <h1>{title}</h1>;
}`;
      const project = makeProject({ '/src/app.tsx': code });

      const refs = findAllReferences(project, '/src/app.tsx', 'title', makeLogger());

      expect(refs.length).toBeGreaterThanOrEqual(2); // definition + JSX usage
      const jsxRef = refs.find((r) => r.context === 'jsx-expression');
      expect(jsxRef).toBeDefined();
    });

    it('finds handler references in JSX attributes', () => {
      const code = `function App() {
  const handleClick = () => {};
  return <button onClick={handleClick}>Click</button>;
}`;
      const project = makeProject({ '/src/app.tsx': code });

      const refs = findAllReferences(project, '/src/app.tsx', 'handleClick', makeLogger());

      expect(refs.length).toBeGreaterThanOrEqual(2);
      const attrRef = refs.find((r) => r.context === 'jsx-attribute');
      expect(attrRef).toBeDefined();
    });

    it('finds component references in JSX tags', () => {
      const code = `function Header() { return <h1>Hi</h1>; }
function App() {
  return <Header />;
}`;
      const project = makeProject({ '/src/app.tsx': code });

      const refs = findAllReferences(project, '/src/app.tsx', 'Header', makeLogger());

      expect(refs.length).toBeGreaterThanOrEqual(2); // definition + JSX element
      const jsxRef = refs.find((r) => r.context === 'jsx-element');
      expect(jsxRef).toBeDefined();
    });
  });

  describe('template literal references', () => {
    it('finds variable references in template expressions', () => {
      const code = 'const userName = "world";\nconst msg = `hello ${userName}`;\n';
      const project = makeProject({ '/src/app.ts': code });

      const refs = findAllReferences(project, '/src/app.ts', 'userName', makeLogger());

      expect(refs.length).toBeGreaterThanOrEqual(2);
      const templateRef = refs.find((r) => r.context === 'template-expression');
      expect(templateRef).toBeDefined();
    });
  });

  describe('decorator references', () => {
    it('finds type references in decorators', () => {
      const code = `function Injectable() { return (t: any) => t; }
@Injectable()
class Service {}`;
      const project = makeProject({ '/src/app.ts': code });

      const refs = findAllReferences(project, '/src/app.ts', 'Injectable', makeLogger());

      expect(refs.length).toBeGreaterThanOrEqual(2); // definition + decorator usage
      const decoratorRef = refs.find((r) => r.context === 'decorator');
      expect(decoratorRef).toBeDefined();
    });
  });

  describe('type annotation references', () => {
    it('finds type references in annotations', () => {
      const code = 'interface User { name: string; }\nconst u: User = { name: "a" };\n';
      const project = makeProject({ '/src/app.ts': code });

      const refs = findAllReferences(project, '/src/app.ts', 'User', makeLogger());

      expect(refs.length).toBeGreaterThanOrEqual(2);
      const typeRef = refs.find((r) => r.context === 'type-annotation');
      expect(typeRef).toBeDefined();
    });
  });

  describe('spread/destructure references', () => {
    it('finds references in spread expressions', () => {
      const code = 'const base = { a: 1 };\nconst extended = { ...base, b: 2 };\n';
      const project = makeProject({ '/src/app.ts': code });

      const refs = findAllReferences(project, '/src/app.ts', 'base', makeLogger());

      expect(refs.length).toBeGreaterThanOrEqual(2);
      const spreadRef = refs.find((r) => r.context === 'spread');
      expect(spreadRef).toBeDefined();
    });
  });

  describe('cross-file references', () => {
    it('tracks references across imports', () => {
      const project = makeProject({
        '/src/types.ts': 'export interface Config { debug: boolean; }\n',
        '/src/app.ts': 'import { Config } from "./types";\nconst cfg: Config = { debug: true };\n',
      });

      const refs = findAllReferences(project, '/src/types.ts', 'Config', makeLogger());

      // Should find definition in types.ts and usage in app.ts
      const filesWithRefs = [...new Set(refs.map((r) => r.filePath))];
      expect(filesWithRefs.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('returns empty for nonexistent symbol', () => {
    const project = makeProject({ '/src/app.ts': 'const x = 1;\n' });
    const refs = findAllReferences(project, '/src/app.ts', 'nope', makeLogger());
    expect(refs).toEqual([]);
  });

  it('logs the operation', () => {
    const code = 'const x = 1;\nconsole.log(x);\n';
    const project = makeProject({ '/src/app.ts': code });
    const entries: any[] = [];
    const logger = createLogger({ level: 'trace', sink: (e) => entries.push(e) });

    findAllReferences(project, '/src/app.ts', 'x', logger);

    const logs = entries.filter((e: any) => e.scope === 'references');
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});
