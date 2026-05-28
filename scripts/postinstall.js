// Cross-platform postinstall: install the dashboard's dependencies if a
// dashboard/ workspace exists. Replaces the previous bash one-liner
// (`[ -d dashboard ] && ...`) which failed on Windows cmd.exe.
const { existsSync } = require('fs');
const { spawnSync } = require('child_process');
const { join } = require('path');

const dashboardDir = join(__dirname, '..', 'dashboard');

if (!existsSync(join(dashboardDir, 'package.json'))) {
  // No dashboard workspace — nothing to do.
  process.exit(0);
}

// Avoid an infinite loop: the dashboard install must not re-trigger this.
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npm, ['install'], {
  cwd: dashboardDir,
  stdio: 'inherit',
  // shell:true lets Windows resolve npm.cmd via PATHEXT reliably.
  shell: process.platform === 'win32',
});

if (result.error) {
  console.warn('[postinstall] dashboard install skipped:', result.error.message);
  process.exit(0); // non-fatal — backend can still build/run headless
}
process.exit(result.status ?? 0);
