const fs = require('node:fs');
fs.writeFileSync('.test-build/package.json', JSON.stringify({ type: 'commonjs' }));
// tsc's file-list test builds do not emit the supplied JavaScript wind module.
const ts = require('typescript');
fs.mkdirSync('.test-build/world', { recursive: true });
fs.writeFileSync('.test-build/world/AuraliaFoliageWindV5.js', ts.transpileModule(
  fs.readFileSync('src/world/AuraliaFoliageWindV5.js', 'utf8')
    .replace("'./AuraliaWindSystem.ts'", "'./AuraliaWindSystem.js'"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
).outputText);
