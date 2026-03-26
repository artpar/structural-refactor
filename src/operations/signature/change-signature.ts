import { Project, Node, SyntaxKind } from 'ts-morph';
import type { ChangeSet, FileChange } from '../../core/change-set.js';
import { createChangeSet } from '../../core/change-set.js';
import type { Logger } from '../../core/logger.js';

export interface ParamToAdd {
  name: string;
  type: string;
  defaultValue?: string;
}

export interface ChangeSignatureArgs {
  filePath: string;
  functionName: string;
  addParams?: ParamToAdd[];
  removeParams?: string[];
  logger: Logger;
}

export function changeSignature(project: Project, args: ChangeSignatureArgs): ChangeSet {
  const { filePath, functionName, addParams, removeParams, logger } = args;

  const sourceFile = project.getSourceFile(filePath);
  if (!sourceFile) {
    logger.warn('change-signature', 'source file not found', { filePath });
    return createChangeSet('Change signature (no changes)', []);
  }

  const fnDecl = sourceFile.getFunction(functionName);
  if (!fnDecl) {
    logger.warn('change-signature', 'function not found', { functionName, filePath });
    return createChangeSet('Change signature (function not found)', []);
  }

  logger.info('change-signature', 'changing signature', {
    functionName, filePath,
    addCount: addParams?.length ?? 0,
    removeCount: removeParams?.length ?? 0,
  });

  // Capture originals
  const originalContents = new Map<string, string>();
  for (const sf of project.getSourceFiles()) {
    originalContents.set(sf.getFilePath(), sf.getFullText());
  }

  // Track which param indices to remove (for updating call sites)
  const removedIndices: number[] = [];
  if (removeParams) {
    const params = fnDecl.getParameters();
    for (let i = params.length - 1; i >= 0; i--) {
      if (removeParams.includes(params[i].getName())) {
        removedIndices.push(i);
        params[i].remove();
      }
    }
  }

  // Add new parameters
  const addedDefaults: string[] = [];
  if (addParams) {
    for (const param of addParams) {
      fnDecl.addParameter({
        name: param.name,
        type: param.type,
        initializer: param.defaultValue,
      });
      addedDefaults.push(param.defaultValue ?? 'undefined');
    }
  }

  // Update all call sites
  const refs = fnDecl.findReferences();
  for (const refGroup of refs) {
    for (const ref of refGroup.getReferences()) {
      const refNode = ref.getNode();
      if (refNode.getStart() === fnDecl.getNameNode()!.getStart()) continue;

      const parent = refNode.getParent();
      if (parent && Node.isCallExpression(parent)) {
        // Remove args at removed indices (reverse order to preserve positions)
        const sortedRemoved = [...removedIndices].sort((a, b) => b - a);
        for (const idx of sortedRemoved) {
          const callArgs = parent.getArguments();
          if (idx < callArgs.length) {
            parent.removeArgument(idx);
          }
        }

        // Add default values for new params
        for (const defaultVal of addedDefaults) {
          parent.addArgument(defaultVal);
        }
      }
    }
  }

  // Collect changes
  const files: FileChange[] = [];
  for (const sf of project.getSourceFiles()) {
    const sfPath = sf.getFilePath();
    const original = originalContents.get(sfPath);
    const modified = sf.getFullText();
    if (original !== undefined && original !== modified) {
      files.push({ path: sfPath, original, modified });
    }
  }

  logger.info('change-signature', 'signature changed', {
    functionName, filesChanged: files.length,
  });

  return createChangeSet(`Change signature of '${functionName}'`, files);
}
