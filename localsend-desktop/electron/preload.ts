import { ipcRenderer, contextBridge } from 'electron'

contextBridge.exposeInMainWorld('ipcRenderer', {
  send: (channel: string, data?: any) => {
    // Agregamos 'get-settings' y 'save-settings'
    const validChannels = ['drop-files', 'transfer-response', 'send-file', 'get-settings', 'save-settings']
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data)
    }
  },

  on: (channel: string, func: (...args: any[]) => void) => {
    // Agregamos 'settings-loaded'
    const validChannels = ['device-found', 'transfer-progress', 'transfer-complete', 'ask-confirmation', 'send-progress', 'send-complete', 'settings-loaded']
    if (validChannels.includes(channel)) {
      ipcRenderer.removeAllListeners(channel)
      ipcRenderer.on(channel, (event, ...args) => func(...args))
    }
  }
})