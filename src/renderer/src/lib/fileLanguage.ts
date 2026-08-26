const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  json: 'json',
  jsonc: 'json',
  yml: 'yaml',
  yaml: 'yaml',
  properties: 'ini',
  ini: 'ini',
  cfg: 'ini',
  conf: 'ini',
  toml: 'ini',
  log: 'plaintext',
  txt: 'plaintext',
  md: 'markdown',
  js: 'javascript',
  mjs: 'javascript',
  ts: 'typescript',
  sh: 'shell',
  bat: 'bat',
  ps1: 'powershell',
  xml: 'xml',
  html: 'html',
  css: 'css'
}

const EDITABLE_EXTENSIONS = new Set(Object.keys(EXTENSION_TO_LANGUAGE))

export function extensionOf(fileName: string): string {
  const idx = fileName.lastIndexOf('.')
  return idx === -1 ? '' : fileName.slice(idx + 1).toLowerCase()
}

export function languageForFile(fileName: string): string {
  return EXTENSION_TO_LANGUAGE[extensionOf(fileName)] ?? 'plaintext'
}

/** Best-effort guard: files without a recognized text extension are still
 * openable (many server config files have no extension at all), but we skip
 * files that are almost certainly binary. */
const KNOWN_BINARY_EXTENSIONS = new Set([
  'jar', 'zip', 'gz', 'tar', 'rar', '7z', 'png', 'jpg', 'jpeg', 'gif', 'webp',
  'ico', 'exe', 'dll', 'so', 'dylib', 'class', 'bin', 'dat', 'db', 'sqlite',
  'ttf', 'otf', 'woff', 'woff2', 'pdf'
])

export function isLikelyTextFile(fileName: string): boolean {
  const ext = extensionOf(fileName)
  if (!ext) return true
  if (EDITABLE_EXTENSIONS.has(ext)) return true
  return !KNOWN_BINARY_EXTENSIONS.has(ext)
}
