// Captured at first import, before anything has a chance to polyfill
// `window.launcher` — true only when there's no Electron preload (i.e. this
// page was served by remoteServer.ts to a plain browser), false inside the
// real desktop app.
export const isRemoteBrowser = typeof window !== 'undefined' && typeof window.launcher === 'undefined'
