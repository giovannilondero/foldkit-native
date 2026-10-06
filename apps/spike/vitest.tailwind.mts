import { execFileSync } from 'node:child_process'

// `node metro.config.js` runs `withTailwind` once, without a watcher: the
// tests style the app with the same sheet Metro bundles.
export default function setup(): void {
  execFileSync(process.execPath, ['metro.config.js'], { cwd: import.meta.dirname, stdio: 'inherit' })
}
