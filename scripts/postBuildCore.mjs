// The root package.json says "type": "module" (needed for the Electron
// desktop build's ESM main-process entry). tsc's plain multi-file output
// for the headless core (tsconfig.core.json) emits CommonJS, and the
// existing codebase's relative imports omit file extensions everywhere
// (e.g. `from './ipc'`) — which Node's CommonJS resolver accepts but its
// strict ESM resolver does not. Dropping this package.json into out/core/
// makes Node treat that subtree as CommonJS regardless of the outer one,
// without touching any import statement in the source.
import { writeFileSync } from 'fs'

writeFileSync('out/core/package.json', JSON.stringify({ type: 'commonjs' }, null, 2))
