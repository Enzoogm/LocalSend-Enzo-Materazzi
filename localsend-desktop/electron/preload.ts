import { ipcRenderer, contextBridge } from 'electron'

contextBridge.exposeInMainWorld('ipcRenderer', {
  // Función para enviar cosas de React al Backend (Main)
  send: (channel: string, data: any) => {
    // NUEVO: Agregamos 'transfer-response' a la lista permitida
    const validChannels = ['drop-files', 'transfer-response']
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data)
    }
  },

  // Función para recibir cosas del Backend (Main) hacia React
  on: (channel: string, func: (...args: any[]) => void) => {
    // NUEVO: Agregamos 'ask-confirmation' a la lista permitida
    const validChannels = ['device-found', 'transfer-progress', 'transfer-complete', 'ask-confirmation']
    if (validChannels.includes(channel)) {
      ipcRenderer.removeAllListeners(channel)
      ipcRenderer.on(channel, (event, ...args) => func(...args))
    }
  }
})