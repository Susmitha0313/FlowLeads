import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { checkAuthStatus } from '../src/services/api';
import '../global.css';

export default function RootLayout() {
  useEffect(() => {
    checkAuthStatus()
      .then(({ data }) => {
        if (!data.active) router.replace('/login' as any);
      })
      .catch(() => {
        router.replace('/login' as any);
      });
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="index" />
      <Stack.Screen name="profiles" />
    </Stack>
  );
}
