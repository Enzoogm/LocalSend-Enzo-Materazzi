import { ipcRenderer, contextBridge } from 'electron'

contextBridge.exposeInMainWorld('ipcRenderer', {
  send: (channel: string, data?: any) => {
    const validChannels = ['drop-files', 'transfer-response', 'send-file', 'get-settings', 'save-settings', 'select-folder']
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data)
    }
  },

  on: (channel: string, func: (...args: any[]) => void) => {
    const validChannels = ['device-found', 'transfer-progress', 'transfer-complete', 'ask-confirmation', 'send-progress', 'send-complete', 'settings-loaded']
    if (validChannels.includes(channel)) {
      ipcRenderer.removeAllListeners(channel)
      ipcRenderer.on(channel, (event, ...args) => func(...args))
    }
  }
})