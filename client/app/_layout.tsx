import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import '../global.css';

export default function RootLayout() {
  useEffect(() => {
    AsyncStorage.getItem('authToken').then((token) => {
      console.log('[LAYOUT] Auth token present:', !!token);
      if (!token) {
        console.log('[LAYOUT] No token — redirecting to /login');
        router.replace('/login' as any);
      } else {
        console.log('[LAYOUT] Token found — staying on current route');
      }
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
