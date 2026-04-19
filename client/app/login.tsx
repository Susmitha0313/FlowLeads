import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { checkAuthStatus, startLogin } from '../src/services/api';

type Status = 'checking' | 'idle' | 'waiting';

export default function LoginScreen() {
  const [status, setStatus] = useState<Status>('checking');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  // On mount
  useEffect(() => {
    checkAuthStatus()
      .then(({ data }) => {
        if (data.active || data.completed) {
          router.replace('/');
        } else {
          setStatus('idle');
        }
      })
      .catch(() => setStatus('idle'));

    return () => stopPolling();
  }, []);

  const startPolling = () => {
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await checkAuthStatus();

        // ✅ FIX: check BOTH
        if (data.active || data.completed) {
          stopPolling();
          router.replace('/');
        }

        // optional UX improvement
        if (data.inProgress) {
          setStatus('waiting');
        }

      } catch {
        // ignore temporary errors
      }
    }, 3000);

    // ✅ safety timeout (prevents infinite spinner)
    setTimeout(() => {
      stopPolling();
      setStatus('idle');
    }, 2 * 60 * 1000); // 2 minutes
  };

  const handleLogin = async () => {
    setStatus('waiting');

    try {
      await startLogin();
      startPolling();
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ??
        err?.message ??
        'Failed to open browser';

      Alert.alert('Error', msg);
      setStatus('idle');
    }
  };

  if (status === 'checking') {
    return (
      <View className="flex-1 bg-[#F0F4F8] items-center justify-center">
        <ActivityIndicator color="#0A66C2" size="large" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#F0F4F8] items-center justify-center px-8">
      {/* Logo */}
      <View className="items-center mb-12">
        <Text className="text-5xl mb-4">👔</Text>
        <Text className="text-3xl font-bold text-[#0A66C2]">Bobi</Text>
        <Text className="text-gray-500 text-sm mt-2 text-center">
          LinkedIn Profile Scraper
        </Text>
      </View>

      <View className="bg-white rounded-3xl p-6 w-full shadow-sm">
        {status === 'waiting' ? (
          <View className="items-center py-4 gap-y-4">
            <ActivityIndicator color="#0A66C2" size="large" />

            <Text className="text-gray-700 font-semibold text-base text-center">
              Waiting for LinkedIn login...
            </Text>

            <Text className="text-gray-400 text-sm text-center leading-relaxed">
              Complete login in the browser window.{'\n'}
              This screen will update automatically.
            </Text>
          </View>
        ) : (
          <View className="items-center gap-y-4">
            <Text className="text-gray-700 font-semibold text-base">
              Connect LinkedIn
            </Text>

            <Text className="text-gray-400 text-sm text-center leading-relaxed">
              Tap below to open a LinkedIn login window on the server.
              Log in once — your session will be reused.
            </Text>

            <TouchableOpacity
              onPress={handleLogin}
              className="w-full bg-[#0A66C2] rounded-2xl py-4 items-center"
            >
              <Text className="text-white font-semibold text-base">
                Login with LinkedIn
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}