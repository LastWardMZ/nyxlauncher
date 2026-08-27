import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './assets/main.css'
import './lib/monacoSetup'
import { isRemoteBrowser } from './runtimeContext'
import { createRemoteLauncherClient } from './remoteLauncherClient'
import { RemoteLoginGate } from './components/RemoteLoginGate'

if (isRemoteBrowser) {
  window.launcher = createRemoteLauncherClient()
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RemoteLoginGate>
      <App />
    </RemoteLoginGate>
  </React.StrictMode>
)
