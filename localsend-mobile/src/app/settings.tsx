import { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { router } from 'expo-router'; // Nuevo para navegar
import { getAlias, saveAlias } from '../utils/storage';

export default function SettingsScreen() {
  const [alias, setAlias] = useState('');

  useEffect(() => {
    getAlias().then(val => setAlias(val || 'Usuario Móvil'));
  }, []);

  // Ahora guardamos solo cuando el usuario toca "Guardar"
  const handleSave = async () => {
    await saveAlias(alias);
    Alert.alert("Éxito", "Alias actualizado correctamente");
    router.back(); // Volvemos a la pantalla anterior
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.label}>Tu Alias en la red:</Text>
        <TextInput 
          style={styles.input}
          value={alias}
          onChangeText={setAlias} // Cambiado: ahora solo actualiza el estado local
          placeholder="Ej: JuanCarlos"
          placeholderTextColor="#666"
        />
        <Text style={styles.hint}>Este nombre será visible para otros dispositivos en la red.</Text>

        {/* Nuevos Botones de acción */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={() => router.back()}>
            <Text style={styles.buttonText}>Cancelar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.saveButton]} onPress={handleSave}>
            <Text style={styles.buttonText}>Guardar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a1a', padding: 20 },
  card: { backgroundColor: '#242424', padding: 20, borderRadius: 12, borderWidth: 1, borderColor: '#444' },
  label: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 10 },
  input: { backgroundColor: '#333', color: '#fff', padding: 12, borderRadius: 8, fontSize: 16, marginBottom: 20 },
  hint: { color: '#888', marginBottom: 20, fontSize: 12 },
  buttonContainer: { flexDirection: 'row', gap: 10 },
  button: { flex: 1, padding: 14, borderRadius: 8, alignItems: 'center' },
  cancelButton: { backgroundColor: '#444' }, // Gris oscuro para cancelar
  saveButton: { backgroundColor: '#646cff' }, // Violeta para guardar
  buttonText: { color: '#fff', fontWeight: 'bold' }
});