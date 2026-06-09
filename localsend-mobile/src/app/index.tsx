import { useState, useEffect, useCallback, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native'
import { Stack, router, useFocusEffect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { getAlias } from '../utils/storage'

// Lógica P2P Nativa
import dgram from 'react-native-udp';
import { Buffer } from 'buffer';

export default function HomeScreen() {
  const [alias, setAlias] = useState('Usuario Móvil')
  const [selectedFile, setSelectedFile] = useState<any>(null)
  const [devices, setDevices] = useState<{ip: string, alias: string}[]>([])
  const [isSending, setIsSending] = useState(false)
  const [progress, setProgress] = useState(0)
  const [metrics, setMetrics] = useState({ speed: '0 MB/s', eta: '0s', sent: '0 MB' })
  const lastUpdate = useRef({ time: Date.now(), bytes: 0 });

  // --- LÓGICA P2P: DESCUBRIMIENTO AUTOMÁTICO (CORREGIDA Y SIMÉTRICA) ---
  useEffect(() => {
    const socket = dgram.createSocket('udp4');

    socket.bind(53317, () => {
      socket.setBroadcast(true);
    });

    socket.on('message', (msg: any, rinfo: any) => {
      const text = msg.toString();
      
      // Si recibimos un grito de búsqueda, respondemos quiénes somos
      if (text === 'LOCALSEND_DISCOVERY') {
        const responseMsg = Buffer.from(JSON.stringify({
          alias: alias,
          deviceType: 'mobile',
          tcpPort: 53318 
        }));
        socket.send(responseMsg, 0, responseMsg.length, rinfo.port, rinfo.address);
      } 
      // Si recibimos un JSON, es alguien presentándose, lo guardamos
      else {
        try {
          const data = JSON.parse(text);
          if (data.alias && data.tcpPort) {
            setDevices(prev => {
              const exists = prev.find(d => d.ip === rinfo.address);
              if (exists) return prev;
              return [...prev, { ip: rinfo.address, alias: data.alias }];
            });
          }
        } catch (e) {}
      }
    });

    // Gritamos presencia cada 3 segundos
    const interval = setInterval(() => {
      const msg = Buffer.from('LOCALSEND_DISCOVERY');
      socket.send(msg, 0, msg.length, 53317, '255.255.255.255');
    }, 3000);

    return () => {
      clearInterval(interval);
      socket.close();
    };
  }, [alias]); // Importante: se actualiza si cambias tu alias

  useFocusEffect(useCallback(() => {
    getAlias().then(storedAlias => { if (storedAlias) setAlias(storedAlias) })
  }, []))

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true })
      if (!result.canceled && result.assets.length > 0) {
        setSelectedFile({ name: result.assets[0].name, size: result.assets[0].size, uri: result.assets[0].uri })
      }
    } catch (err) {}
  }

  const pickImageFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (perm.granted === false) return Alert.alert("Permisos denegados")
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 1 })
    if (!result.canceled && result.assets.length > 0) {
      setSelectedFile({ name: result.assets[0].fileName || 'media.jpg', size: result.assets[0].fileSize || 0, uri: result.assets[0].uri })
    }
  }

  const sendFileToDevice = async (targetIp: string) => {
    if (!selectedFile) return Alert.alert("Atención", "Seleccioná un archivo primero.")
    setIsSending(true); setProgress(0); lastUpdate.current = { time: Date.now(), bytes: 0 }

    const callback = (p: any) => {
      const now = Date.now(); const timeDiff = (now - lastUpdate.current.time) / 1000;
      if (timeDiff >= 0.5) {
        const speedBps = (p.totalBytesSent - lastUpdate.current.bytes) / timeDiff;
        const eta = Math.round((p.totalBytesExpectedToSend - p.totalBytesSent) / speedBps);
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
        headers: { 'x-file-name': encodeURIComponent(selectedFile.name), 'x-sender-alias': encodeURIComponent(alias) },
        httpMethod: 'POST',
      }, callback);
      const res = await uploadTask.uploadAsync();
      if (res?.status === 200) { Alert.alert("Éxito", "Archivo enviado"); setSelectedFile(null) }
      else Alert.alert("Error", "Rechazado")
    } catch (e) { Alert.alert("Error", "Fallo de conexión") }
    setIsSending(false)
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{
        title: 'LocalSend Pro', headerStyle: { backgroundColor: '#1a1a1a' }, headerTintColor: '#fff',
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
          <TouchableOpacity style={[styles.button, {backgroundColor: '#ec4899'}]} onPress={pickImageFromGallery} disabled={isSending}><Text style={styles.buttonText}>🖼️ Multimedia</Text></TouchableOpacity>
        </View>
        {selectedFile && <Text style={styles.fileName}>Seleccionado: {selectedFile.name}</Text>}
      </View>

      <View style={[styles.card, { marginTop: 20 }]}>
        <Text style={styles.cardTitle}>2. Dispositivos en Red (P2P)</Text>
        {devices.length === 0 && <Text style={{color: '#666', textAlign: 'center', marginTop: 10}}>Radar encendido. Escuchando red...</Text>}
        {devices.map((device, index) => (
          <TouchableOpacity key={index} style={styles.deviceItem} onPress={() => sendFileToDevice(device.ip)}>
            <Text style={styles.deviceName}>💻 {device.alias}</Text>
            <Text style={{color: '#4ade80', fontWeight: 'bold'}}>🚀 Transferir</Text>
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
  buttonText: { color: '#fff', fontWeight: 'bold' },
  fileName: { color: '#ccc', marginTop: 10, fontSize: 12 },
  deviceItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#333', padding: 15, borderRadius: 8, marginTop: 10 },
  deviceName: { color: '#fff', fontWeight: 'bold' },
  progressBg: { height: 10, backgroundColor: '#333', borderRadius: 5, overflow: 'hidden' },
  progressBar: { height: '100%', backgroundColor: '#4ade80' },
  metricsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  metricText: { color: '#fff', fontSize: 11, fontWeight: 'bold' }
})