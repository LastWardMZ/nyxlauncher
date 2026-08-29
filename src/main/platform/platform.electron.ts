import { app, dialog, Notification, safeStorage, type BrowserWindow } from 'electron'
import { getSettings } from '../store'
import { checkForUpdatesNow } from '../autoUpdate'
import type { Platform, WindowHandle } from './platform'

function asWindow(win: WindowHandle): BrowserWindow | null {
  return win as BrowserWindow | null
}

export const electronPlatform: Platform = {
  getDataDir: () => app.getPath('userData'),
  getTempDir: () => app.getPath('temp'),
  getAppVersion: () => app.getVersion(),
  isPackaged: () => app.isPackaged,

  async pickDirectory(win) {
    const w = asWindow(win)
    if (!w) return null
    const result = await dialog.showOpenDialog(w, { properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  },

  async pickFile(win, filters) {
    const w = asWindow(win)
    if (!w) return null
    const result = await dialog.showOpenDialog(w, { properties: ['openFile'], filters })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  },

  async pickFilesToImport(win) {
    const w = asWindow(win)
    if (!w) return []
    const result = await dialog.showOpenDialog(w, { properties: ['openFile', 'multiSelections'] })
    if (result.canceled) return []
    return result.filePaths
  },

  async pickSaveFile(win, defaultName) {
    const w = asWindow(win)
    if (!w) return null
    const result = await dialog.showSaveDialog(w, { defaultPath: defaultName })
    if (result.canceled || !result.filePath) return null
    return result.filePath
  },

  notify(title, body) {
    if (!getSettings().notificationsEnabled) return
    if (!Notification.isSupported()) return
    new Notification({ title, body }).show()
  },

  setLaunchOnStartup(enabled) {
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: enabled })
  },

  checkForUpdates() {
    checkForUpdatesNow()
  },

  encryptString(plain) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('El cifrado seguro del sistema operativo no está disponible en esta máquina')
    }
    return safeStorage.encryptString(plain).toString('base64')
  },

  decryptString(blob) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('El cifrado seguro del sistema operativo no está disponible en esta máquina')
    }
    try {
      return safeStorage.decryptString(Buffer.from(blob, 'base64'))
    } catch {
      throw new Error('No se pudieron leer los secretos de acceso remoto (¿se movió el perfil de usuario de Windows?)')
    }
  }
}
