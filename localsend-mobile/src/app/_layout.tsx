import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ 
      tabBarStyle: { backgroundColor: '#1a1a1a', borderTopColor: '#333' },
      tabBarActiveTintColor: '#646cff',
      headerStyle: { backgroundColor: '#1a1a1a' },
      headerTintColor: '#fff'
    }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Transferir',
          tabBarIcon: ({ color }) => <Ionicons name="send" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Ajustes',
          tabBarIcon: ({ color }) => <Ionicons name="settings" size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}