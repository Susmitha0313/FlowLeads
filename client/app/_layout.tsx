import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import '../global.css';

export default function RootLayout() {
  useEffect(() => {
    AsyncStorage.getItem('authToken').then((token) => {
      if (!token) router.replace('/login' as any);
    });
  }, []);

  // Always render the Stack so screens are mounted before redirect fires
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="index" />
      <Stack.Screen name="profiles" />
    </Stack>
  );
}
