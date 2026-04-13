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
// The HTTPS backend URL LinkedIn will redirect to
const LINKEDIN_REDIRECT_URI = process.env.EXPO_PUBLIC_LINKEDIN_REDIRECT_URI!;

const LINKEDIN_AUTH_URL =
  `https://www.linkedin.com/oauth/v2/authorization` +
  `?response_type=code` +
  `&client_id=${LINKEDIN_CLIENT_ID}` +
  `&redirect_uri=${encodeURIComponent(LINKEDIN_REDIRECT_URI)}` +
  `&scope=${encodeURIComponent("openid profile email")}`;

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);

  // Listen for the deep-link that our backend sends back after LinkedIn redirects to it
  useEffect(() => {
    const subscription = Linking.addEventListener("url", ({ url }) => {
      handleDeepLink(url);
    });

    // Handle the case where the app was cold-launched via the deep link
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });

    return () => subscription.remove();
  }, []);

  const handleDeepLink = (url: string) => {
    // Expected: bobi://login?code=xxx  or  bobi://login?error=xxx
    const parsed = Linking.parse(url);
    if (parsed.path !== "login") return;

    const { code, error } = parsed.queryParams ?? {};

    if (error) {
      Alert.alert("Login failed", String(error));
      setLoading(false);
      return;
    }

    if (code) {
      exchangeCode(String(code));
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    try {
      // Opens LinkedIn in the system browser; LinkedIn redirects to our backend HTTPS URL,
      // which then deep-links the code back to bobi://login?code=xxx
      await WebBrowser.openBrowserAsync(LINKEDIN_AUTH_URL);
    } catch (err: any) {
      Alert.alert("Error", err.message);
      setLoading(false);
    }
    // loading stays true until the deep-link comes back
  };

  const exchangeCode = async (code: string) => {
    try {
      const { data } = await linkedinAuth(code);
      await AsyncStorage.setItem("authToken", data.token);
      await AsyncStorage.setItem("authUser", JSON.stringify(data.user));
      router.replace("/");
    } catch (err: any) {
      Alert.alert("Login failed", err?.response?.data?.error ?? err.message);
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
