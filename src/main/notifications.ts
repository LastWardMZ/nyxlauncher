import { Notification } from 'electron'
import { getSettings } from './store'

export function notify(title: string, body: string): void {
  if (!getSettings().notificationsEnabled) return
  if (!Notification.isSupported()) return
  new Notification({ title, body }).show()
}
