import type { LauncherApi } from './index'

declare global {
  interface Window {
    launcher: LauncherApi
  }
}
