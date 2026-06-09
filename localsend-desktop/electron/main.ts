import { app, BrowserWindow, ipcMain, Notification, dialog } from 'electron' // <-- AGREGAMOS dialog
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import dgram from 'node:dgram'
import os from 'node:os'
import http from 'node:http'
import fs from 'node:fs'
import Store from 'electron-store' 

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

// Inicializamos la base de datos local
const store = new Store({
  defaults: {
    alias: os.hostname(), 
    downloadPath: app.getPath('downloads')
  }
})

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
    const text = msg.toString()

    if (text === 'LOCALSEND_DISCOVERY') {
      const responseInfo = {
        alias: store.get('alias') as string,
        deviceType: 'desktop',
        tcpPort: 53318 
      }
      const responseBuffer = Buffer.from(JSON.stringify(responseInfo))
      udpServer.send(responseBuffer, 0, responseBuffer.length, rinfo.port, rinfo.address)
    } 
    else {
      try {
        const data = JSON.parse(text)
        if (data.alias && data.deviceType) {
          win?.webContents.send('device-found', {
            alias: data.alias,
            ip: rinfo.address, 
            deviceType: data.deviceType
          })
        }
      } catch (error) {}
    }
  })

  udpServer.bind(53317, () => {
    console.log('🟢 Servidor UDP escuchando en el puerto 53317 (Radar Activo)')
    udpServer.setBroadcast(true)
    setInterval(() => {
      const ping = Buffer.from('LOCALSEND_DISCOVERY')
      udpServer.send(ping, 0, ping.length, 53317, '255.255.255.255')
    }, 3000)
  })
}

// --- HITO 3: Servidor TCP (Receptor) ---
function startFileServer() {
  const fileServer = http.createServer((req, res) => {
    if (req.method === 'POST') {
      const fileName = req.headers['x-file-name'] as string || 'archivo_desconocido'
      const totalSize = parseInt(req.headers['content-length'] as string || '0', 10)
      
      req.pause()
      
      if (win) {
        win.webContents.send('ask-confirmation', { fileName, size: totalSize })
      }

      ipcMain.once('transfer-response', (event, response) => {
        if (response === 'reject') {
          res.writeHead(403, { 'Content-Type': 'text/plain' })
          res.end('Transferencia rechazada')
          req.destroy()
          return
        }

        const currentDownloadPath = store.get('downloadPath') as string
        let finalPath = path.join(currentDownloadPath, fileName)
        let counter = 1
        while (fs.existsSync(finalPath)) {
          const ext = path.extname(fileName)
          const nameWithoutExt = path.basename(fileName, ext)
          finalPath = path.join(currentDownloadPath, `${nameWithoutExt}_(${counter})${ext}`)
          counter++
        }

        if (Notification.isSupported()) {
          new Notification({ title: 'Recibiendo archivo...', body: path.basename(finalPath) }).show()
        }

        win?.webContents.send('transfer-progress', {
          fileName: path.basename(finalPath), progress: 0, speed: '0.00', eta: 0
        })

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
            const progress = totalSize > 0 ? Math.round((receivedBytes / totalSize) * 100) : 0
            win?.webContents.send('transfer-progress', {
              fileName: path.basename(finalPath), progress, speed: speedMBps, eta: 0
            })
            lastTime = now
            bytesSinceLastCalc = 0
          }
        })

        req.pipe(writeStream)
        req.resume()

        writeStream.on('finish', () => {
          win?.webContents.send('transfer-complete', { status: 'success', path: finalPath })
          res.writeHead(200)
          res.end('Archivo recibido con éxito')
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

// --- HITO 4: El Cañón Emisor ---
ipcMain.on('send-file', (event, data: { filePath: string, targetIp: string }) => {
  const { filePath, targetIp } = data
  const fileName = path.basename(filePath)
  const stat = fs.statSync(filePath)
  const totalSize = stat.size

  const options = {
    hostname: targetIp, port: 53318, path: '/', method: 'POST',
    headers: { 'x-file-name': encodeURIComponent(fileName), 'content-length': totalSize }
  }

  const req = http.request(options, (res) => {
    if (res.statusCode === 200) win?.webContents.send('send-complete', { status: 'success' })
    else if (res.statusCode === 403) win?.webContents.send('send-complete', { status: 'error', message: 'El usuario rechazó la transferencia' })
  })

  req.on('error', (e) => win?.webContents.send('send-complete', { status: 'error', message: 'No se pudo conectar' }))

  const readStream = fs.createReadStream(filePath)
  let sentBytes = 0
  let lastTime = Date.now()
  let bytesSinceLastCalc = 0

  readStream.on('data', (chunk) => {
    sentBytes += chunk.length
    bytesSinceLastCalc += chunk.length
    const now = Date.now()
    const timeDiff = (now - lastTime) / 1000

    if (timeDiff >= 0.5) {
      const speedBps = bytesSinceLastCalc / timeDiff
      const speedMBps = (speedBps / (1024 * 1024)).toFixed(2)
      const progress = totalSize > 0 ? Math.round((sentBytes / totalSize) * 100) : 0
      win?.webContents.send('send-progress', { progress, speed: speedMBps })
      lastTime = now
      bytesSinceLastCalc = 0
    }
  })

  readStream.pipe(req)
})

// --- HITO 5: Lógica de la Configuración (Settings) ---
ipcMain.on('get-settings', () => {
  win?.webContents.send('settings-loaded', {
    alias: store.get('alias'),
    downloadPath: store.get('downloadPath')
  })
})

ipcMain.on('save-settings', (event, newAlias: string) => {
  store.set('alias', newAlias)
  win?.webContents.send('settings-loaded', {
    alias: store.get('alias'),
    downloadPath: store.get('downloadPath')
  })
})

// NUEVO: Abrir ventana de Windows para elegir carpeta
ipcMain.on('select-folder', async () => {
  if (!win) return
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'] 
  })
  
  if (!result.canceled && result.filePaths.length > 0) {
    const newPath = result.filePaths[0]
    store.set('downloadPath', newPath) 
    
    win.webContents.send('settings-loaded', {
      alias: store.get('alias'),
      downloadPath: store.get('downloadPath')
    })
  }
})

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
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.whenReady().then(() => {
  createWindow()
  startUDPServer()
  startFileServer() 
})