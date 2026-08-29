// Import this module FIRST in coreIndex.ts — see bootstrapElectron.ts for
// why import order matters here.
import { setPlatform } from './platform'
import { nodePlatform } from './platform.node'

setPlatform(nodePlatform)
