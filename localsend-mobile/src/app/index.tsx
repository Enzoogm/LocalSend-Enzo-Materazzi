import { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import * as Network from 'expo-network'
import * as FileSystem from 'expo-file-system/legacy'

export default function HomeScreen() {
  const [selectedFile, setSelectedFile] = useState<any>(null)
  
  // ESTADOS DEL RADAR Y TRANSFERENCIA
  const [isScanning, setIsScanning] = useState(false)
  const [devices, setDevices] = useState<{ip: string, alias: string}[]>([])
  const [isSending, setIsSending] = useState(false)

  // --- 1. SECCIÓN DE ARCHIVOS ---
  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
      })
      if (!result.canceled && result.assets.length > 0) {
        setSelectedFile({
          name: result.assets[0].name,
          size: result.assets[0].size,
          uri: result.assets[0].uri
        })
      }
    } catch (err) {
      console.error("Error al seleccionar archivo:", err)
    }
  }

  const pickImageFromGallery = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (permissionResult.granted === false) {
      Alert.alert("Permisos denegados", "Se requieren permisos de acceso a la galería para continuar.")
      return 
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'], 
      quality: 1,
    })
    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0]
      setSelectedFile({
        name: asset.fileName || asset.uri.split('/').pop() || 'media_asset.jpg',
        size: asset.fileSize || 0,
        uri: asset.uri
      })
    }
  }

  // --- 2. SECCIÓN DEL RADAR ---
  const scanNetwork = async () => {
    setIsScanning(true)
    setDevices([]) 

    try {
      const myIp = await Network.getIpAddressAsync()
      if (!myIp || myIp === '0.0.0.0') {
        Alert.alert('Error', 'No se detectó una dirección IP válida.')
        setIsScanning(false)
        return
      }

      const baseIp = myIp.substring(0, myIp.lastIndexOf('.'))
      
      const checkIp = async (i: number) => {
        const targetIp = `${baseIp}.${i}`
        if (targetIp === myIp) return 

        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 800)

          const response = await fetch(`http://${targetIp}:53318/`, { 
            method: 'GET',
            signal: controller.signal 
          })
          clearTimeout(timeoutId)

          if (response.status === 405) {
            setDevices(prev => [...prev, { ip: targetIp, alias: `Estación de Trabajo` }])
          }
        } catch (error) {}
      }

      const promises = []
      for (let i = 1; i < 255; i++) {
        promises.push(checkIp(i))
      }
      await Promise.all(promises)

    } catch (error) {
      console.error("Error de escaneo:", error)
    }
    setIsScanning(false)
  }

  // --- 3. SECCIÓN DE TRANSFERENCIA ---
  const sendFileToDevice = async (targetIp: string) => {
    if (!selectedFile) {
      Alert.alert("Acción Requerida", "Debe seleccionar un archivo antes de iniciar la transferencia.")
      return
    }

    setIsSending(true)

    try {
      const uploadResult = await FileSystem.uploadAsync(
        `http://${targetIp}:53318/`, 
        selectedFile.uri, 
        {
          headers: {
            'x-file-name': encodeURIComponent(selectedFile.name),
          },
          httpMethod: 'POST',
        }
      )

      if (uploadResult.status === 200) {
        Alert.alert("Transferencia Exitosa", "El archivo se ha transferido correctamente al destino.")
        setSelectedFile(null) 
      } else if (uploadResult.status === 403) {
        Alert.alert("Transferencia Denegada", "El host de destino rechazó la solicitud.")
      } else {
        Alert.alert("Error en el Servidor", "Ocurrió un fallo durante el proceso de transferencia.")
      }

    } catch (error) {
      console.error("Error de conexión:", error)
      Alert.alert("Error de Conexión", "No se pudo establecer la comunicación con el host de destino.")
    }

    setIsSending(false)
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>LocalSend Pro</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>1. Selección de Archivo</Text>
        
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.button} onPress={pickFile} disabled={isSending}>
            <Text style={styles.buttonText}>📁 Documento</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.button, styles.buttonGallery]} onPress={pickImageFromGallery} disabled={isSending}>
            <Text style={styles.buttonText}>🖼️ Multimedia</Text>
          </TouchableOpacity>
        </View>

        {selectedFile && (
          <View style={styles.fileInfo}>
            <Text style={styles.fileLabel}>Archivo seleccionado para transferencia:</Text>
            <Text style={styles.fileName}>{selectedFile.name}</Text>
          </View>
        )}
      </View>

      <View style={[styles.card, { marginTop: 20 }]}>
        <View style={styles.radarHeader}>
          <Text style={styles.cardTitle}>2. Dispositivos en Red</Text>
          <TouchableOpacity onPress={scanNetwork} disabled={isScanning || isSending}>
            <Text style={{ color: isScanning ? '#888' : '#4ade80', fontWeight: 'bold' }}>
              {isScanning ? 'Escaneando...' : '🔄 Escanear'}
            </Text>
          </TouchableOpacity>
        </View>

        {isScanning && (
          <ActivityIndicator size="large" color="#646cff" style={{ marginVertical: 20 }} />
        )}

        {isSending && (
          <View style={{ marginVertical: 20, alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#4ade80" />
            <Text style={{ color: '#aaa', marginTop: 10, fontStyle: 'italic' }}>Transfiriendo datos...</Text>
          </View>
        )}

        {!isScanning && !isSending && devices.length === 0 && (
          <Text style={styles.noDevices}>Presione "Escanear" para detectar nodos en la red local.</Text>
        )}

        {!isScanning && !isSending && devices.map((device, index) => (
          <TouchableOpacity 
            key={index} 
            style={styles.deviceItem} 
            onPress={() => sendFileToDevice(device.ip)}
          >
            <Text style={styles.deviceIcon}>💻</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.deviceName}>{device.alias}</Text>
              <Text style={styles.deviceIp}>{device.ip}</Text>
            </View>
            <Text style={styles.sendBadge}>🚀 Transferir</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#1a1a1a', 
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 40,
    marginTop: 40,
  },
  card: {
    backgroundColor: '#242424',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#444',
  },
  cardTitle: {
    color: '#aaa',
    fontSize: 16,
    marginBottom: 15,
  },
  radarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    flex: 1,
    backgroundColor: '#646cff', 
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonGallery: {
    backgroundColor: '#ec4899', 
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  fileInfo: {
    marginTop: 20,
    backgroundColor: '#2a2a2a',
    padding: 15,
    borderRadius: 8,
  },
  fileLabel: {
    color: '#4ade80', 
    fontWeight: 'bold',
    marginBottom: 5,
  },
  fileName: {
    color: '#ccc',
    fontSize: 14,
  },
  noDevices: {
    color: '#888',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 10,
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333',
    padding: 15,
    borderRadius: 8,
    marginTop: 10,
  },
  deviceIcon: {
    fontSize: 24,
    marginRight: 15,
  },
  deviceName: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  deviceIp: {
    color: '#aaa',
    fontSize: 12,
  },
  sendBadge: {
    color: '#4ade80',
    fontWeight: 'bold',
    fontSize: 14,
  }
})