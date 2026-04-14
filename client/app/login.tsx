import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { linkedinAuth } from "../src/services/api";

WebBrowser.maybeCompleteAuthSession();

const LINKEDIN_CLIENT_ID = process.env.EXPO_PUBLIC_LINKEDIN_CLIENT_ID!;

// This is the HTTPS backend URL LinkedIn redirects to.
// The backend then redirects to bobi://login?code=... which the app intercepts.
const BACKEND_REDIRECT_URI = process.env.EXPO_PUBLIC_LINKEDIN_REDIRECT_URI!;

// The deep-link prefix openAuthSessionAsync watches for to intercept the redirect.
// Must match APP_DEEP_LINK_SCHEME on the backend.
const APP_REDIRECT_PREFIX = "bobi://login";

console.log('[LOGIN] LINKEDIN_CLIENT_ID    :', LINKEDIN_CLIENT_ID    ?? '⚠️  NOT SET');
console.log('[LOGIN] BACKEND_REDIRECT_URI  :', BACKEND_REDIRECT_URI  ?? '⚠️  NOT SET');
console.log('[LOGIN] APP_REDIRECT_PREFIX   :', APP_REDIRECT_PREFIX);

// LinkedIn auth URL — scope uses r_liteprofile + r_emailaddress (not openid)
// redirect_uri points to the backend HTTPS callback (LinkedIn requires HTTPS)
const buildAuthUrl = () =>
  `https://www.linkedin.com/oauth/v2/authorization` +
  `?response_type=code` +
  `&client_id=${LINKEDIN_CLIENT_ID}` +
  `&redirect_uri=${encodeURIComponent(BACKEND_REDIRECT_URI)}` +
  `&scope=${encodeURIComponent("r_liteprofile r_emailaddress")}`;

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Handle cold-launch deep link (app was not running when link fired)
    Linking.getInitialURL().then((url) => {
      if (url && url.includes("login")) {
        console.log('[LOGIN] Cold-launch deep-link:', url);
        handleDeepLink(url);
      }
    });

    // Handle warm deep link (app already running)
    const subscription = Linking.addEventListener("url", ({ url }) => {
      console.log('[LOGIN] Deep-link received:', url);
      if (url.includes("login")) handleDeepLink(url);
    });

    return () => subscription.remove();
  }, []);

  const handleDeepLink = (url: string) => {
    console.log('[LOGIN] Parsing deep-link:', url);
    const parsed = Linking.parse(url);
    console.log('[LOGIN] Parsed — scheme:', parsed.scheme, '| path:', parsed.path, '| params:', JSON.stringify(parsed.queryParams));

    const { code, error } = parsed.queryParams ?? {};

    if (error) {
      console.error('[LOGIN] ✗ LinkedIn error:', error);
      Alert.alert("Login failed", String(error));
      setLoading(false);
      return;
    }

    if (code) {
      console.log('[LOGIN] ✓ Code received, exchanging with backend...');
      exchangeCode(String(code));
    } else {
      console.warn('[LOGIN] Deep-link had no code and no error — ignoring');
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    const authUrl = buildAuthUrl();
    console.log('[LOGIN] Opening auth session');
    console.log('[LOGIN] Auth URL    :', authUrl);
    console.log('[LOGIN] Watching for:', APP_REDIRECT_PREFIX);

    try {
      // openAuthSessionAsync opens an in-app browser and watches for APP_REDIRECT_PREFIX.
      // When the backend redirects to bobi://login?code=..., the browser intercepts it
      // and returns result.type === 'success' with result.url containing the code.
      const result = await WebBrowser.openAuthSessionAsync(authUrl, APP_REDIRECT_PREFIX);
      console.log('[LOGIN] Auth session result type:', result.type);

      if (result.type === "success" && result.url) {
        console.log('[LOGIN] Intercepted redirect URL:', result.url);
        handleDeepLink(result.url);
      } else {
        console.log('[LOGIN] Auth session dismissed or cancelled');
        setLoading(false);
      }
    } catch (err: any) {
      console.error('[LOGIN] ✗ openAuthSessionAsync error:', err.message);
      Alert.alert("Error", err.message);
      setLoading(false);
    }
  };

  const exchangeCode = async (code: string) => {
    console.log('[LOGIN] POSTing code to backend for JWT...');
    try {
      const { data } = await linkedinAuth(code);
      console.log('[LOGIN] ✓ JWT received — user:', data.user?.name, '| email:', data.user?.email);

      await AsyncStorage.setItem("authToken", data.token);
      await AsyncStorage.setItem("authUser", JSON.stringify(data.user));
      console.log('[LOGIN] ✓ Stored token, navigating to home');

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
