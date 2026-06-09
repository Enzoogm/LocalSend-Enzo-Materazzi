import { useState, useEffect, useCallback, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native'
import { Stack, router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import * as Network from 'expo-network'
import * as FileSystem from 'expo-file-system/legacy'
import { getAlias } from '../utils/storage'

export default function HomeScreen() {
  const [alias, setAlias] = useState('Usuario Móvil')
  const [selectedFile, setSelectedFile] = useState<any>(null)
  
  // ESTADOS DEL RADAR Y TRANSFERENCIA
  const [isScanning, setIsScanning] = useState(false)
  const [devices, setDevices] = useState<{ip: string, alias: string}[]>([])
  const [isSending, setIsSending] = useState(false)
  
  // MÉTRICAS DE CARGA
  const [progress, setProgress] = useState(0)
  const [metrics, setMetrics] = useState({ speed: '0 MB/s', eta: '0s', sent: '0 MB' })
  const lastUpdate = useRef({ time: Date.now(), bytes: 0 });

  // Actualizamos el alias cada vez que la pantalla gana foco (vuelves de ajustes)
  useFocusEffect(
    useCallback(() => {
      const loadData = async () => {
        const storedAlias = await getAlias()
        if (storedAlias) setAlias(storedAlias)
      }
      loadData()
    }, [])
  )

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true })
      if (!result.canceled && result.assets.length > 0) {
        setSelectedFile({ name: result.assets[0].name, size: result.assets[0].size, uri: result.assets[0].uri })
      }
    } catch (err) { console.error("Error al seleccionar archivo:", err) }
  }

  const pickImageFromGallery = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (permissionResult.granted === false) {
      Alert.alert("Permisos denegados", "Se requieren permisos para continuar.")
      return 
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 1 })
    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0]
      setSelectedFile({ name: asset.fileName || 'media_asset.jpg', size: asset.fileSize || 0, uri: asset.uri })
    }
  }

  const scanNetwork = async () => {
    setIsScanning(true)
    setDevices([]) 
    try {
      const myIp = await Network.getIpAddressAsync()
      if (!myIp || myIp === '0.0.0.0') return setIsScanning(false)
      const baseIp = myIp.substring(0, myIp.lastIndexOf('.'))
      
      const checkIp = async (i: number) => {
        const targetIp = `${baseIp}.${i}`
        if (targetIp === myIp) return 
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 800)
          const response = await fetch(`http://${targetIp}:53318/`, { method: 'GET', signal: controller.signal })
          clearTimeout(timeoutId)
          if (response.status === 405) setDevices(prev => [...prev, { ip: targetIp, alias: `Estación de Trabajo` }])
        } catch (error) {}
      }
      await Promise.all(Array.from({ length: 254 }, (_, i) => checkIp(i + 1)))
    } catch (error) { console.error("Error de escaneo:", error) }
    setIsScanning(false)
  }

  const sendFileToDevice = async (targetIp: string) => {
    if (!selectedFile) {
      Alert.alert("Atención", "Debe seleccionar un archivo.")
      return
    }
    setIsSending(true)
    setProgress(0)
    lastUpdate.current = { time: Date.now(), bytes: 0 }

    const callback = (p: any) => {
      const now = Date.now();
      const timeDiff = (now - lastUpdate.current.time) / 1000;
      if (timeDiff >= 0.5) {
        const bytesDiff = p.totalBytesSent - lastUpdate.current.bytes;
        const speedBps = bytesDiff / timeDiff;
        const remainingBytes = p.totalBytesExpectedToSend - p.totalBytesSent;
        const eta = Math.round(remainingBytes / speedBps);
        setMetrics({
          speed: (speedBps / (1024 * 1024)).toFixed(2) + ' MB/s',
          eta: eta > 3600 ? '+1h' : eta + 's',
          sent: (p.totalBytesSent / (1024 * 1024)).toFixed(2) + ' MB'
        });
        lastUpdate.current = { time: now, bytes: p.totalBytesSent };
      }
      setProgress(p.totalBytesSent / p.totalBytesExpectedToSend);
    };

    try {
      const uploadTask = FileSystem.createUploadTask(`http://${targetIp}:53318/`, selectedFile.uri, {
        headers: {
          'x-file-name': encodeURIComponent(selectedFile.name),
          'x-sender-alias': encodeURIComponent(alias),
        },
        httpMethod: 'POST',
      }, callback);

      const result = await uploadTask.uploadAsync();
      if (result?.status === 200) {
        Alert.alert("Éxito", "Archivo transferido correctamente.")
        setSelectedFile(null)
      } else Alert.alert("Error", "El destino rechazó la transferencia.")
    } catch (error) { Alert.alert("Error de Conexión", "No se pudo establecer comunicación.") }
    setIsSending(false)
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{
        title: 'LocalSend Pro',
        headerStyle: { backgroundColor: '#1a1a1a' },
        headerTintColor: '#fff',
        headerRight: () => (
          <TouchableOpacity onPress={() => router.push('/settings')}>
            <Ionicons name="settings" size={24} color="#fff" style={{ marginRight: 15 }} />
          </TouchableOpacity>
        )
      }} />

      {isSending && (
        <View style={[styles.card, { marginTop: 20 }]}>
          <Text style={styles.cardTitle}>Transfiriendo: {selectedFile?.name}</Text>
          <View style={styles.progressBg}><View style={[styles.progressBar, { width: `${progress * 100}%` }]} /></View>
          <View style={styles.metricsRow}>
            <Text style={styles.metricText}>🚀 {metrics.speed}</Text>
            <Text style={styles.metricText}>📦 {metrics.sent}</Text>
            <Text style={styles.metricText}>⏱️ {metrics.eta}</Text>
          </View>
        </View>
      )}

      <View style={[styles.card, { marginTop: 20 }]}>
        <Text style={styles.cardTitle}>1. Selección de Archivo</Text>
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.button} onPress={pickFile} disabled={isSending}><Text style={styles.buttonText}>📁 Documento</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.buttonGallery]} onPress={pickImageFromGallery} disabled={isSending}><Text style={styles.buttonText}>🖼️ Multimedia</Text></TouchableOpacity>
        </View>
        {selectedFile && <Text style={styles.fileName}>Seleccionado: {selectedFile.name}</Text>}
      </View>

      <View style={[styles.card, { marginTop: 20 }]}>
        <View style={styles.radarHeader}>
          <Text style={styles.cardTitle}>2. Dispositivos Cercanos</Text>
          <TouchableOpacity onPress={scanNetwork} disabled={isScanning || isSending}><Text style={{ color: '#4ade80', fontWeight: 'bold' }}>{isScanning ? 'Buscando...' : '🔄 Escanear'}</Text></TouchableOpacity>
        </View>
        {isScanning && <ActivityIndicator size="large" color="#646cff" style={{ marginVertical: 20 }} />}
        {devices.map((device, index) => (
          <TouchableOpacity key={index} style={styles.deviceItem} onPress={() => sendFileToDevice(device.ip)}>
            <Text style={styles.deviceName}>💻 {device.alias}</Text>
            <Text style={styles.sendBadge}>🚀 Transferir</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#1a1a1a', padding: 20 },
  card: { backgroundColor: '#242424', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#444' },
  cardTitle: { color: '#aaa', fontSize: 16, marginBottom: 15 },
  buttonContainer: { flexDirection: 'row', gap: 10 },
  button: { flex: 1, backgroundColor: '#646cff', padding: 16, borderRadius: 10, alignItems: 'center' },
  buttonGallery: { backgroundColor: '#ec4899' },
  buttonText: { color: '#fff', fontWeight: 'bold' },
  fileName: { color: '#ccc', marginTop: 10, fontSize: 12 },
  radarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  deviceItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#333', padding: 15, borderRadius: 8, marginTop: 10 },
  deviceName: { color: '#fff', fontWeight: 'bold' },
  sendBadge: { color: '#4ade80', fontWeight: 'bold' },
  progressBg: { height: 10, backgroundColor: '#333', borderRadius: 5, overflow: 'hidden' },
  progressBar: { height: '100%', backgroundColor: '#4ade80' },
  metricsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  metricText: { color: '#fff', fontSize: 11, fontWeight: 'bold' }
})