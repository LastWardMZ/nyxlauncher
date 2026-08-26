import Store from 'electron-store'
import { DEFAULT_APP_SETTINGS } from '../shared/types'
import type { AppSettings, ServerConfig } from '../shared/types'

interface PersistedSchema {
  servers: ServerConfig[]
  settings: AppSettings
}

export const store = new Store<PersistedSchema>({
  name: 'nyxlauncher-config',
  defaults: {
    servers: [],
    settings: DEFAULT_APP_SETTINGS
  }
})

export function getServers(): ServerConfig[] {
  return store.get('servers')
}

export function saveServers(servers: ServerConfig[]): void {
  store.set('servers', servers)
}

export function getSettings(): AppSettings {
  return { ...DEFAULT_APP_SETTINGS, ...store.get('settings') }
}

export function saveSettings(settings: AppSettings): void {
  store.set('settings', settings)
}
