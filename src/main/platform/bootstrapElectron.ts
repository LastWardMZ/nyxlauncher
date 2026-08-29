// Import this module FIRST in index.ts, before any other local import.
// Several files compute paths from `platform.getDataDir()` at module top
// level (e.g. remoteAccess/caddyManager.ts's `EXE_DIR`) — since ES module
// imports evaluate depth-first in the order they're written, this file's
// `setPlatform()` call only runs before theirs if this import statement
// itself comes before the ones that transitively reach those modules.
import { setPlatform } from './platform'
import { electronPlatform } from './platform.electron'

setPlatform(electronPlatform)
