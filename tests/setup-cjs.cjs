const fs = require('node:fs');
fs.writeFileSync('.test-build/package.json', JSON.stringify({ type: 'commonjs' }));
