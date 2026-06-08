import { app, BrowserWindow, ipcMain, Notification } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import dgram from 'node:dgram'
import os from 'node:os'
import http from 'node:http'
import fs from 'node:fs'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

function createWindow() {
  win = new BrowserWindow({
    width: 900,
    height: 700,
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// --- HITO 1: Radar UDP ---
function startUDPServer() {
  const udpServer = dgram.createSocket('udp4')

  udpServer.on('error', (err) => {
    console.error(`Error del servidor UDP:\n${err.stack}`)
    udpServer.close()
  })

  udpServer.on('message', (msg, rinfo) => {
    if (msg.toString() === 'LOCALSEND_DISCOVERY') {
      const responseInfo = {
        alias: os.hostname(), 
        deviceType: 'desktop',
        tcpPort: 53318 
      }
      const responseBuffer = Buffer.from(JSON.stringify(responseInfo))
      udpServer.send(responseBuffer, 0, responseBuffer.length, rinfo.port, rinfo.address)
    }
  })

  udpServer.bind(53317, () => {
    console.log('🟢 Servidor UDP escuchando en el puerto 53317 (Radar Activo)')
  })
}

// --- HITO 3: Servidor TCP (Ahora con Handshake y Parche Visual) ---
function startFileServer() {
  const fileServer = http.createServer((req, res) => {
    if (req.method === 'POST') {
      const fileName = req.headers['x-file-name'] as string || 'archivo_desconocido'
      const totalSize = parseInt(req.headers['content-length'] as string || '0', 10)
      
      // BLINDAJE: Frenamos el flujo TCP en seco
      req.pause()
      
      // Le avisamos a React que alguien quiere mandar algo
      if (win) {
        win.webContents.send('ask-confirmation', { fileName, size: totalSize })
      }

      // Esperamos que el usuario toque un botón en la interfaz
      ipcMain.once('transfer-response', (event, response) => {
        if (response === 'reject') {
          console.log('❌ Transferencia rechazada por el usuario.')
          res.writeHead(403, { 'Content-Type': 'text/plain' })
          res.end('Transferencia rechazada')
          req.destroy() // Cortamos la conexión
          return
        }

        console.log('✅ Transferencia aceptada, abriendo válvulas...')

        let finalPath = path.join(app.getPath('downloads'), fileName)
        let counter = 1
        while (fs.existsSync(finalPath)) {
          const ext = path.extname(fileName)
          const nameWithoutExt = path.basename(fileName, ext)
          finalPath = path.join(app.getPath('downloads'), `${nameWithoutExt}_(${counter})${ext}`)
          counter++
        }

        if (Notification.isSupported()) {
          new Notification({ title: 'Recibiendo archivo...', body: path.basename(finalPath) }).show()
        }

        // --- EL PARCHE VISUAL ---
        // Forzamos la aparición de la barra en 0% apenas tocamos Aceptar
        win?.webContents.send('transfer-progress', {
          fileName: path.basename(finalPath),
          progress: 0,
          speed: '0.00',
          eta: 0
        })
        // ------------------------

        const writeStream = fs.createWriteStream(finalPath)
        let receivedBytes = 0
        let lastTime = Date.now()
        let bytesSinceLastCalc = 0

        req.on('data', (chunk) => {
          receivedBytes += chunk.length
          bytesSinceLastCalc += chunk.length
          const now = Date.now()
          const timeDiff = (now - lastTime) / 1000 

          if (timeDiff >= 0.5) {
            const speedBps = bytesSinceLastCalc / timeDiff
            const speedMBps = (speedBps / (1024 * 1024)).toFixed(2)
            const remainingBytes = totalSize - receivedBytes
            const etaSeconds = speedBps > 0 ? Math.round(remainingBytes / speedBps) : 0
            const progress = totalSize > 0 ? Math.round((receivedBytes / totalSize) * 100) : 0

            win?.webContents.send('transfer-progress', {
              fileName: path.basename(finalPath), progress, speed: speedMBps, eta: etaSeconds
            })
            lastTime = now
            bytesSinceLastCalc = 0
          }
        })

        // Soltamos el freno de mano y conectamos la tubería al disco duro
        req.pipe(writeStream)
        req.resume()

        writeStream.on('finish', () => {
          win?.webContents.send('transfer-complete', { status: 'success', path: finalPath })
          res.writeHead(200)
          res.end('Archivo recibido con éxito')
          if (Notification.isSupported()) {
            new Notification({ title: 'Transferencia Completa', body: `Se guardó ${path.basename(finalPath)}` }).show()
          }
        })

        writeStream.on('error', (err) => {
          win?.webContents.send('transfer-complete', { status: 'error', message: 'Error de escritura' })
          res.writeHead(500)
          res.end('Error interno')
        })

        req.on('error', (err) => {
          writeStream.destroy() 
          win?.webContents.send('transfer-complete', { status: 'error', message: 'Conexión interrumpida' })
        })
      })

    } else {
      res.writeHead(405)
      res.end('Solo se aceptan peticiones POST')
    }
  })

  fileServer.listen(53318, '0.0.0.0', () => {
    console.log('🔵 Servidor TCP/HTTP escuchando archivos en el puerto 53318')
  })
}

ipcMain.on('drop-files', (event, filePaths) => {
  console.log('📦 Rutas de archivos atajadas desde React:', filePaths)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  createWindow()
  startUDPServer()
  startFileServer() 
})