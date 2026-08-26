import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './assets/main.css'
import './lib/monacoSetup'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
