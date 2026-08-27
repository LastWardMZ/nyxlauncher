// Renames a GitHub release (title + body) after `npm run release:win` publishes it.
// electron-builder always creates the release with the bare version number as its
// name and no body — this fills in a proper title/changelog immediately after.
//
// Usage:
//   GH_TOKEN=... node scripts/setReleaseNotes.mjs --name "Parche de X — v0.2.8" --body "- Corrige Y"
//   (add --tag v0.2.8 to target a tag other than the current package.json version)

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const OWNER = 'LastWardMZ'
const REPO = 'nyxlauncher'

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2)
      args[key] = argv[i + 1]
      i++
    }
  }
  return args
}

const args = parseArgs(process.argv.slice(2))
if (!args.name) {
  console.error('Usage: node scripts/setReleaseNotes.mjs --name "<title>" --body "<changelog>" [--tag vX.Y.Z]')
  process.exit(1)
}

const token = process.env.GH_TOKEN
if (!token) {
  console.error('GH_TOKEN env var is required (same one used for `npm run release:win`).')
  process.exit(1)
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'))
const tag = args.tag ?? `v${pkg.version}`

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'Content-Type': 'application/json',
  'X-GitHub-Api-Version': '2022-11-28'
}

const getRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/tags/${tag}`, { headers })
if (!getRes.ok) {
  console.error(`Could not find a release for tag ${tag}:`, getRes.status, await getRes.text())
  process.exit(1)
}
const release = await getRes.json()

const patchRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/${release.id}`, {
  method: 'PATCH',
  headers,
  body: JSON.stringify({ name: args.name, body: args.body ?? '' })
})
if (!patchRes.ok) {
  console.error(`Failed to update release ${tag}:`, patchRes.status, await patchRes.text())
  process.exit(1)
}
console.log(`OK ${tag} -> "${args.name}"`)
