import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// --- EXPLICACIÓN PARA LA DEFENSA ---
// Extendemos la interfaz global de Window para que TypeScript reconozca
// nuestro puente seguro (contextBridge) sin tirar errores de tipado.
declare global {
  interface Window {
    ipcRenderer: {
      send: (channel: string, data: any) => void;
      on: (channel: string, func: (...args: any[]) => void) => void;
    }
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Este es un mensaje de prueba que configuramos en main.ts
// Usamos nuestro puente tipado de forma segura
if (window.ipcRenderer) {
  window.ipcRenderer.on('main-process-message', (message: string) => {
    console.log('Mensaje del proceso Main:', message)
  })
}