import { useState, useEffect } from 'react'
import './App.css'

interface Device {
  alias: string;
  ip: string;
  deviceType: string;
  lastSeen: number;
}

interface TransferStats {
  fileName: string;
  progress: number;
  speed: string;
  eta: number;
}

function App() {
  const [isListening] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
  const [devices, setDevices] = useState<Device[]>([])
  const [droppedFiles, setDroppedFiles] = useState<string[]>([]) 

  const [transferStatus, setTransferStatus] = useState<'idle' | 'transferring' | 'success' | 'error'>('idle')
  const [stats, setStats] = useState<TransferStats | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [incomingRequest, setIncomingRequest] = useState<{fileName: string, size: number} | null>(null)

  // ESTADOS PARA LA CONFIGURACIÓN (con valores por defecto seguros)
  const [showSettings, setShowSettings] = useState(false)
  const [currentSettings, setCurrentSettings] = useState({ alias: 'Cargando...', downloadPath: '' })
  const [aliasInput, setAliasInput] = useState('')

  useEffect(() => {
    if (window.ipcRenderer) {
      window.ipcRenderer.send('get-settings')

      // Listener ultra-defensivo: toma args[1] si viene con event, o args[0] si viene directo
      window.ipcRenderer.on('settings-loaded', (...args: any[]) => {
        const payload = args.length > 1 && args[1] !== undefined ? args[1] : args[0]
        if (payload && typeof payload === 'object') {
          const safeAlias = payload.alias || 'Equipo Local'
          const safePath = payload.downloadPath || ''
          setCurrentSettings({ alias: safeAlias, downloadPath: safePath })
          setAliasInput(safeAlias)
        }
        setShowSettings(false) 
      })

      window.ipcRenderer.on('device-found', (...args: any[]) => {
        const payload = args.length > 1 && args[1] !== undefined ? args[1] : args[0]
        if (!payload || !payload.ip) return

        setDevices((prev) => {
          const exists = prev.find(d => d && d.ip === payload.ip)
          if (exists) {
            return prev.map(d => (d && d.ip === payload.ip) ? { ...d, lastSeen: Date.now() } : d)
          }
          return [...prev, { ...payload, lastSeen: Date.now() }]
        })
      })

      window.ipcRenderer.on('ask-confirmation', (...args: any[]) => {
        const payload = args.length > 1 && args[1] !== undefined ? args[1] : args[0]
        if (payload && payload.fileName) {
          setIncomingRequest(payload)
        }
      })

      window.ipcRenderer.on('transfer-progress', (...args: any[]) => {
        const payload = args.length > 1 && args[1] !== undefined ? args[1] : args[0]
        if (payload && payload.fileName !== undefined) {
          setTransferStatus('transferring')
          setStats(payload)
        }
      })

      window.ipcRenderer.on('transfer-complete', (...args: any[]) => {
        const payload = args.length > 1 && args[1] !== undefined ? args[1] : args[0]
        if (!payload) return

        setTransferStatus(payload.status)
        if (payload.status === 'error' && payload.message) {
          setErrorMessage(payload.message)
        } else if (payload.status === 'success') {
          setStats(prev => prev ? { ...prev, progress: 100, speed: '0.00', eta: 0 } : null)
          setTimeout(() => {
            setTransferStatus('idle')
            setStats(null)
          }, 5000)
        }
      })
      
      window.ipcRenderer.on('send-complete', (...args: any[]) => {
        const payload = args.length > 1 && args[1] !== undefined ? args[1] : args[0]
        if (!payload) return

        if (payload.status === 'success') {
          alert('¡Archivo enviado con éxito!')
        } else {
          alert(`Error al enviar: ${payload.message || 'Error desconocido'}`)
        }
        setDroppedFiles([]) 
      })
    }

    const interval = setInterval(() => {
      const now = Date.now()
      setDevices(prev => prev.filter(device => device && (now - device.lastSeen) < 6000))
    }, 3000)

    return () => clearInterval(interval)
  }, [])

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const filePaths = Array.from(e.dataTransfer.files).map((file: any) => file.path)
    if (filePaths.length > 0) {
      setDroppedFiles(filePaths) 
      if (window.ipcRenderer) window.ipcRenderer.send('drop-files', filePaths)
    }
  }

  const respondTransfer = (response: 'accept' | 'reject') => {
    if (window.ipcRenderer) {
      window.ipcRenderer.send('transfer-response', response)
    }
    setIncomingRequest(null)
  }

  const handleSendToDevice = (targetIp: string) => {
    if (droppedFiles.length === 0) {
      alert('Primero arrastrá un archivo a la zona punteada.')
      return
    }
    if (window.ipcRenderer) {
      window.ipcRenderer.send('send-file', { filePath: droppedFiles[0], targetIp: targetIp })
    }
  }

  const saveSettings = () => {
    if (window.ipcRenderer) {
      window.ipcRenderer.send('save-settings', aliasInput)
    }
  }

  const handleSelectFolder = () => {
    if (window.ipcRenderer) {
      window.ipcRenderer.send('select-folder')
    }
  }

  return (
    <div className="app-container">
      
      {/* Modal de Configuración */}
      {showSettings && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>⚙️ Configuración</h2>
            <div style={{ marginBottom: '15px' }}>
              <label className="settings-label">Tu Alias en la red:</label>
              <input 
                type="text" 
                value={aliasInput} 
                onChange={(e) => setAliasInput(e.target.value)}
                className="settings-input"
              />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label className="settings-label">Carpeta de descargas:</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input 
                  type="text" 
                  value={currentSettings?.downloadPath || ''} 
                  disabled
                  className="settings-input"
                  style={{ flex: 1 }}
                />
                <button 
                  onClick={handleSelectFolder}
                  style={{ padding: '0 15px', borderRadius: '6px', border: 'none', backgroundColor: '#646cff', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Cambiar
                </button>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-reject" onClick={() => setShowSettings(false)}>Cancelar</button>
              <button className="btn-accept" onClick={saveSettings}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Oscuro de Confirmación */}
      {incomingRequest && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Solicitud de Transferencia</h2>
            <p>Alguien quiere enviarte el archivo:</p>
            <p className="file-name">{incomingRequest?.fileName}</p>
            <p className="file-size">Peso: {incomingRequest?.size ? (incomingRequest.size / (1024 * 1024)).toFixed(2) : '0'} MB</p>
            <div className="modal-actions">
              <button className="btn-reject" onClick={() => respondTransfer('reject')}>Rechazar</button>
              <button className="btn-accept" onClick={() => respondTransfer('accept')}>Aceptar</button>
            </div>
          </div>
        </div>
      )}

      <header className="header">
        <div className="header-left">
          <h1>LocalSend</h1>
          <div className="status-indicator">
            <span className={`led ${isListening ? 'led-green' : 'led-red'}`}></span>
            {isListening ? `Activo como: ${currentSettings?.alias || 'Iniciando...'}` : 'Servidor Apagado'}
          </div>
        </div>
        <button 
          onClick={() => setShowSettings(true)}
          style={{ background: '#242424', border: '1px solid #444', color: '#fff', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          ⚙️ Ajustes
        </button>
      </header>

      <main>
        {transferStatus !== 'idle' && stats && (
          <div className="transfer-monitor">
            <h3>📥 Recibiendo archivo...</h3>
            <p className="file-name">{stats?.fileName}</p>
            <div className="progress-container">
              <div className={`progress-bar ${transferStatus === 'error' ? 'error' : ''}`} style={{ width: `${stats?.progress || 0}%` }}></div>
            </div>
            <div className="transfer-details">
              <span>{stats?.progress || 0}% Completado</span>
              {transferStatus === 'transferring' && <span>🚀 {stats?.speed} MB/s</span>}
              {transferStatus === 'success' && <span style={{color: '#4ade80'}}>¡Transferencia completada!</span>}
              {transferStatus === 'error' && <span style={{color: '#f87171'}}>Error: {errorMessage}</span>}
            </div>
          </div>
        )}

        <div className={`drop-zone ${isDragging ? 'active' : ''}`} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
          <h2>Arrastrá tus archivos acá</h2>
          <p>o hacé clic para seleccionar desde Windows</p>
          {droppedFiles.length > 0 && (
            <div className="file-ready">
              <strong>✓ Archivo listo para enviar:</strong><br />
              <span>{droppedFiles[0]}</span>
            </div>
          )}
        </div>

        <div className="devices-panel">
          <h3>Radar de Dispositivos (Red Local)</h3>
          <div className="devices-list">
            {devices.length === 0 ? (
              <p className="no-devices">Buscando dispositivos...</p>
            ) : (
              devices.filter(Boolean).map((device, index) => (
                <div 
                  key={index} 
                  className="device-item" 
                  onClick={() => device?.ip && handleSendToDevice(device.ip)}
                  style={{ cursor: droppedFiles.length > 0 ? 'pointer' : 'not-allowed' }}
                  title={droppedFiles.length > 0 ? 'Clic para enviar archivo' : 'Arrastrá un archivo primero'}
                >
                  📱 <strong>{device?.alias || 'Dispositivo'}</strong> ({device?.ip})
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

export default App