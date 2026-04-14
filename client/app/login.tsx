import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { linkedinAuth } from "../src/services/api";

WebBrowser.maybeCompleteAuthSession();

const LINKEDIN_CLIENT_ID    = process.env.EXPO_PUBLIC_LINKEDIN_CLIENT_ID!;
const LINKEDIN_REDIRECT_URI = process.env.EXPO_PUBLIC_LINKEDIN_REDIRECT_URI!;

console.log('[LOGIN] EXPO_PUBLIC_LINKEDIN_CLIENT_ID   :', LINKEDIN_CLIENT_ID   ?? '⚠️  NOT SET');
console.log('[LOGIN] EXPO_PUBLIC_LINKEDIN_REDIRECT_URI:', LINKEDIN_REDIRECT_URI ?? '⚠️  NOT SET');

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    console.log('[LOGIN] Screen mounted, registering deep-link listener');

    const subscription = Linking.addEventListener("url", ({ url }) => {
      console.log('[LOGIN] Deep-link received (listener):', url);
      handleDeepLink(url);
    });

    // Handle cold-launch via deep link
    Linking.getInitialURL().then((url) => {
      if (url) {
        console.log('[LOGIN] Cold-launch deep-link:', url);
        handleDeepLink(url);
      } else {
        console.log('[LOGIN] No cold-launch deep-link');
      }
    });

    return () => {
      console.log('[LOGIN] Removing deep-link listener');
      subscription.remove();
    };
  }, []);

  const handleDeepLink = (url: string) => {
    console.log('[LOGIN] Parsing deep-link:', url);
    const parsed = Linking.parse(url);
    console.log('[LOGIN] Parsed — scheme:', parsed.scheme, '| path:', parsed.path, '| params:', JSON.stringify(parsed.queryParams));

    // Accept both bobi://login (native) and http(s)://host/login (web)
    if (parsed.path !== "login") {
      console.log('[LOGIN] Deep-link path is not "login", ignoring');
      return;
    }

    const { code, error } = parsed.queryParams ?? {};

    if (error) {
      console.error('[LOGIN] ✗ LinkedIn returned error via deep-link:', error);
      Alert.alert("Login failed", String(error));
      setLoading(false);
      return;
    }

    if (code) {
      console.log('[LOGIN] ✓ Code extracted from deep-link, proceeding to exchange');
      exchangeCode(String(code));
    } else {
      console.warn('[LOGIN] Deep-link had no code and no error — ignoring');
    }
  };

  const handleLogin = async () => {
    console.log('[LOGIN] Login button pressed');
    setLoading(true);
    try {
      const isWeb = Platform.OS === 'web';
      // On web, backend must redirect back to the web URL, not bobi://
      // We pass platform in state so the backend knows which scheme to use
      const state = isWeb ? 'platform=web' : 'platform=native';
      const authUrl =
        `https://www.linkedin.com/oauth/v2/authorization` +
        `?response_type=code` +
        `&client_id=${LINKEDIN_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(LINKEDIN_REDIRECT_URI)}` +
        `&scope=${encodeURIComponent("openid profile email")}` +
        `&state=${encodeURIComponent(state)}`;

      // On web: watch for http://localhost:8081/login (what the browser can actually navigate to)
      // On native: watch for bobi://login (custom scheme the OS handles)
      const redirectUri = isWeb ? Linking.createURL('login') : 'bobi://login';
      console.log('[LOGIN] Opening auth session — platform:', Platform.OS, '| redirectUri:', redirectUri);

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
      console.log('[LOGIN] Auth session closed — result type:', result.type);

      if (result.type === 'success' && result.url) {
        console.log('[LOGIN] Auth session returned URL:', result.url);
        handleDeepLink(result.url);
      } else {
        console.log('[LOGIN] User dismissed or cancelled auth session');
        setLoading(false);
      }
    } catch (err: any) {
      console.error('[LOGIN] ✗ Failed to open auth session:', err.message);
      Alert.alert("Error", err.message);
      setLoading(false);
    }
  };

  const exchangeCode = async (code: string) => {
    console.log('[LOGIN] Exchanging code with backend...');
    try {
      const { data } = await linkedinAuth(code);
      console.log('[LOGIN] ✓ JWT received — user:', data.user?.name, '| email:', data.user?.email);

      await AsyncStorage.setItem("authToken", data.token);
      await AsyncStorage.setItem("authUser", JSON.stringify(data.user));
      console.log('[LOGIN] ✓ Token stored, navigating to home');

      router.replace("/");
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err.message;
      console.error('[LOGIN] ✗ Code exchange failed:', msg);
      if (err?.response?.data?.detail) {
        console.error('[LOGIN]   Detail:', JSON.stringify(err.response.data.detail));
      }
      Alert.alert("Login failed", msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-[#F0F4F8] items-center justify-center px-8">
      <View className="items-center mb-12">
        <Text className="text-5xl mb-4">👔</Text>
        <Text className="text-3xl font-bold text-[#0A66C2]">Bobi</Text>
        <Text className="text-gray-500 text-sm mt-2 text-center">
          LinkedIn Profile Scraper
        </Text>
      </View>

      <View className="bg-white rounded-3xl p-6 w-full shadow-sm items-center">
        <Text className="text-gray-700 font-semibold text-base mb-2">
          Get started
        </Text>
        <Text className="text-gray-400 text-sm text-center mb-6">
          Sign in with your LinkedIn account to start scraping profiles.
        </Text>

        <TouchableOpacity
          onPress={handleLogin}
          disabled={loading}
          className={`w-full rounded-2xl py-4 items-center justify-center flex-row gap-x-2 ${
            loading ? "bg-blue-300" : "bg-[#0A66C2]"
          }`}
        >
          {loading ? (
            <>
              <ActivityIndicator color="#fff" size="small" />
              <Text className="text-white font-semibold ml-2">
                Signing in...
              </Text>
            </>
          ) : (
            <Text className="text-white font-semibold text-base">
              Login with LinkedIn
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
