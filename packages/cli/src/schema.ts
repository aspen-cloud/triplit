import path from 'node:path';
import fs from 'node:fs';
import ts from 'typescript';
import { getTriplitDir } from './filesystem.js';

export async function readLocalSchema() {
  const triplitDir = getTriplitDir();
  const schemaPath = path.join(triplitDir, 'schema.ts');
  const tmpDir = path.join(triplitDir, 'tmp');
  const transpiledJsPath = path.join(tmpDir, '_schema.js');
  try {
    if (!fs.existsSync(schemaPath)) return undefined;
    const transpiledJs = transpileTsFile(schemaPath);
    fs.mkdirSync(path.dirname(transpiledJsPath), { recursive: true });
    fs.writeFileSync(transpiledJsPath, transpiledJs, 'utf8');
    const { schema } = await import(transpiledJsPath);
    return schema;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function transpileTsFile(filename: string) {
  const source = fs.readFileSync(filename, 'utf8');
  return transpileTsString(source);
}

export function transpileTsString(source: string) {
  const isModule = isCallerModule();
  const result = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: isModule ? ts.ModuleKind.ESNext : ts.ModuleKind.CommonJS,
    },
  });
  return result.outputText;
}

function findClosestPackageJson(startPath: string) {
  let dir = startPath;
  while (dir !== path.parse(dir).root) {
    const potentialPath = path.join(dir, 'package.json');
    if (fs.existsSync(potentialPath)) {
      return potentialPath;
    }
    dir = path.dirname(dir);
  }
  return null;
}

function getModuleType(callerPath: string) {
  const packageJsonPath = findClosestPackageJson(callerPath);

  if (!packageJsonPath) {
    // default to commonjs
    return 'commonjs';
  }

  const packageData = fs.readFileSync(packageJsonPath, 'utf-8');
  const packageJson = JSON.parse(packageData);

  return packageJson.type === 'module' ? 'esm' : 'commonjs';
}

function isCallerModule() {
  return getModuleType(process.cwd()) === 'esm';
}
