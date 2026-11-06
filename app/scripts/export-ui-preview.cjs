// Export the real product components without importing native ML modules into a browser.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const packagePath = path.join(root, 'package.json');
const original = fs.readFileSync(packagePath, 'utf8');
const config = JSON.parse(original);
if (config.main !== 'index.ts') throw new Error('Unexpected production entry; refusing to modify it.');
let result;
try {
  fs.writeFileSync(packagePath, JSON.stringify({ ...config, main: 'design-system.preview.tsx' }, null, 2) + '\n');
  result = spawnSync(process.execPath, [require.resolve('expo/bin/cli'), 'export', '--platform', 'web', '--output-dir', '../artifacts/ui-preview'], { cwd: root, stdio: 'inherit' });
} finally {
  fs.writeFileSync(packagePath, original);
}
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
