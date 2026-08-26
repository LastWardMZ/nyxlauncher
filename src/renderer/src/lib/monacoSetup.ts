import * as monaco from 'monaco-editor'
import { loader } from '@monaco-editor/react'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'

// @monaco-editor/react defaults to loading Monaco from a CDN at runtime,
// which our CSP (script-src 'self') blocks and which wouldn't work offline
// anyway. Point it at the copy Vite already bundled instead.
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === 'json') return new jsonWorker()
    return new editorWorker()
  }
}

loader.config({ monaco })

export { monaco }
