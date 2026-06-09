import { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'

export default function HomeScreen() {
  const [selectedFile, setSelectedFile] = useState<any>(null)

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
      console.error("Error al elegir archivo:", err)
    }
  }

  const pickImageFromGallery = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync()

    if (permissionResult.granted === false) {
      Alert.alert(
        "Permisos denegados ❌", 
        "Necesitamos permisos para entrar a tu galería y enviar tus fotos. Podés darlos desde la configuración de tu celular."
      )
      return 
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      // EL FIX: Ahora le pasamos un arreglo con los tipos en vez de MediaTypeOptions
      mediaTypes: ['images', 'videos'], 
      quality: 1,
    })

    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0]
      setSelectedFile({
        name: asset.fileName || asset.uri.split('/').pop() || 'imagen.jpg',
        size: asset.fileSize || 0,
        uri: asset.uri
      })
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>LocalSend</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>1. Preparar la carga</Text>
        
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.button} onPress={pickFile}>
            <Text style={styles.buttonText}>📁 Archivo</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.button, styles.buttonGallery]} onPress={pickImageFromGallery}>
            <Text style={styles.buttonText}>🖼️ Galería</Text>
          </TouchableOpacity>
        </View>

        {selectedFile && (
          <View style={styles.fileInfo}>
            <Text style={styles.fileLabel}>✓ Archivo cargado en el cañón:</Text>
            <Text style={styles.fileName}>{selectedFile.name}</Text>
            <Text style={styles.fileSize}>
              Peso: {selectedFile.size ? (selectedFile.size / (1024 * 1024)).toFixed(2) : '0.00'} MB
            </Text>
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    marginBottom: 5,
  },
  fileSize: {
    color: '#888',
    fontSize: 12,
  },
})