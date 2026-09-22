# LocalSend-Enzo-Materazzi
npm install
npm install electron-store

#
npx expo install expo-document-picker expo-file-system
npx expo install expo-image-picker
npx expo install expo-network
npx expo install expo-secure-store
npx expo install @expo/vector-icons
npx expo install react-native-udp buffer
npx expo install expo-dev-client
npx expo run:android
npx expo install react-native-udp buffer expo-dev-client






Remove-Item -Recurse -Force dist, dist-electron -ErrorAction SilentlyContinue
>> npm run build
>> $env:CSC_IDENTITY_AUTO_DISCOVERY="false"; npx electron-builder --win portable