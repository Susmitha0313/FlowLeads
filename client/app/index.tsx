import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StatusBar,
  Animated,
  Dimensions,
} from 'react-native';
import * as Contacts from 'expo-contacts';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useShareIntent } from 'expo-share-intent';
import { extractProfile, logoutApi } from '../src/services/api';
import ProfileCard, { Profile } from '../src/components/ProfileCard';
import { saveFileFromUrl } from '../src/utils/saveFile';
import SideDrawer from '../src/components/home/SideDrawer';

const DRAWER_WIDTH = Dimensions.get('window').width * 0.72;

type State = 'idle' | 'loading' | 'success' | 'error';

export default function HomeScreen() {
  const [url, setUrl] = useState('');
  const baseUrl = process.env.EXPO_PUBLIC_API_URL;

  const [state, setState] = useState<State>('idle');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Handle shared URLs from other apps (e.g. LinkedIn share sheet)
  const { shareIntent, resetShareIntent } = useShareIntent();
  useEffect(() => {
    if (!shareIntent) return;
    const possibleText =
      shareIntent.text ||
      shareIntent.webUrl;

    if (possibleText) {
      const linkedInUrl = extractLinkedInUrl(possibleText);
      if (!linkedInUrl) {
        Alert.alert("Invalid Share", "No LinkedIn profile found");
      }
      if (linkedInUrl) {
        setUrl(linkedInUrl);
        resetShareIntent();
      }
    }
  }, [shareIntent]);

  // Drawer state
  const [drawerVisible, setDrawerVisible] = useState(false);
  const drawerAnim = useRef(new Animated.Value(DRAWER_WIDTH)).current;

  const openDrawer = () => {
    setDrawerVisible(true);
    Animated.timing(drawerAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start();
  };

  const closeDrawer = (cb?: () => void) => {
    Animated.timing(drawerAnim, { toValue: DRAWER_WIDTH, duration: 200, useNativeDriver: true }).start(() => {
      setDrawerVisible(false);
      cb?.();
    });
  };

  const handleLogout = () => {
    closeDrawer(async () => {
      try { await logoutApi(); } catch { /* best-effort */ }
      router.replace('/login' as any);
    });
  };

  const extractLinkedInUrl = (text: string): string | null => {
    const match = text.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[^\s]+/);
    return match ? match[0] : null;
  };

  const handleIncomingUrl = (rawUrl: string) => {
    const linkedInUrl = extractLinkedInUrl(rawUrl);
    if (linkedInUrl) setUrl(linkedInUrl);
  };

  useEffect(() => {
    Linking.getInitialURL().then((initialUrl) => {
      if (initialUrl) handleIncomingUrl(initialUrl);
    });

    const sub = Linking.addEventListener('url', ({ url: incomingUrl }) => {
      handleIncomingUrl(incomingUrl);
    });

    return () => sub.remove();
  }, []);

  const handleExtract = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    if (!trimmed.includes('linkedin.com')) {
      setErrorMsg('Please enter a valid LinkedIn profile URL');
      setState('error');
      return;
    }

    setState('loading');
    setErrorMsg('');
    setProfile(null);

    try {
      const res = await extractProfile(trimmed);
      setProfile(res.data.profile);
      setState('success');
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Something went wrong';
      setErrorMsg(msg);
      setState('error');
    }
  };

  const handleSaveContact = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const nameParts = (profile.name ?? '').trim().split(/\s+/);
      const firstName = nameParts[0] ?? '';
      const lastName = nameParts.slice(1).join(' ');

      const contact: Contacts.Contact = {
        contactType: Contacts.ContactTypes.Person,
        name: profile.name ?? '',
        firstName,
        lastName,
        jobTitle: profile.designation ?? '',
        company: profile.company ?? '',
        phoneNumbers: (profile.phones ?? []).map((p) => ({
          number: p,
          label: 'mobile',
        })),
        emails: (profile.emails ?? []).map((e) => ({
          email: e,
          label: 'work',
        })),
        urlAddresses: [
          ...(profile.profileUrl
            ? [{ url: profile.profileUrl, label: 'linkedin' }]
            : []),
          ...(profile.websites ?? []).map((w) => ({ url: w, label: 'work' })),
        ],
        note: profile.headline ?? '',
      };

      if (Platform.OS === 'ios') {
        await Contacts.presentFormAsync(undefined, contact, { isNew: true });
      } else {
        const { status } = await Contacts.requestPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission denied', 'Contacts permission is required to save.');
          return;
        }
        await Contacts.presentFormAsync(undefined, contact);
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to save contact');
    } finally {
      setSaving(false);
    }
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      await saveFileFromUrl(
        `${baseUrl}/profiles/export`,
        'linkedin-contacts.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to export Excel');
    } finally {
      setExporting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-[#F0F4F8]"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor="#0A66C2" />

      {/* Top bar */}
      <View className="bg-[#0A66C2] pt-14 pb-6 px-5 flex-row items-end justify-between">
        <View>
          <Text className="text-white text-2xl font-bold tracking-tight">Bobi</Text>
          <Text className="text-blue-200 text-sm mt-0.5">LinkedIn Profile Scraper</Text>
        </View>
        <View className="flex-row items-center gap-x-2">
          <TouchableOpacity
            onPress={() => router.push('/profiles')}
            className="bg-white/20 rounded-xl px-4 py-2"
          >
            <Text className="text-white text-sm font-medium">📋 Saved</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={openDrawer}
            className="bg-white/20 rounded-xl w-9 h-9 items-center justify-center"
          >
            <Text className="text-white text-base font-bold">☰</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Search card */}
        <View className="bg-white mx-4 mt-5 rounded-3xl p-5 shadow-sm">
          <Text className="text-gray-700 font-semibold mb-3 text-sm">
            Paste a LinkedIn profile URL
          </Text>

          <View className="flex-row items-center bg-[#F0F4F8] rounded-2xl px-4 py-3 gap-x-2">
            <Text className="text-lg">🔗</Text>
            <TextInput
              className="flex-1 text-sm text-gray-800 py-2 px-2"
              placeholder="https://www.linkedin.com/in/username"
              placeholderTextColor="#9CA3AF"
              value={url}
              onChangeText={setUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="search"
              onSubmitEditing={handleExtract}
            />
            {url.length > 0 && (
              <TouchableOpacity onPress={() => { setUrl(''); setState('idle'); setProfile(null); }}>
                <Text className="text-gray-400 text-lg">✕</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            onPress={handleExtract}
            disabled={state === 'loading' || !url.trim()}
            className={`mt-4 rounded-2xl py-3.5 items-center justify-center ${state === 'loading' || !url.trim() ? 'bg-blue-300' : 'bg-[#0A66C2]'
              }`}
          >
            {state === 'loading' ? (
              <View className="flex-row items-center gap-x-2">
                <ActivityIndicator color="#fff" size="small" />
                <Text className="text-white font-semibold">Scraping profile...</Text>
              </View>
            ) : (
              <Text className="text-white font-semibold">Extract Profile</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Error state */}
        {state === 'error' && (
          <View className="mx-4 mt-4 bg-red-50 border border-red-200 rounded-2xl p-4 flex-row items-start gap-x-3">
            <Text className="text-lg">⚠️</Text>
            <View className="flex-1">
              <Text className="text-red-700 font-semibold text-sm">Failed to extract</Text>
              <Text className="text-red-500 text-xs mt-1">{errorMsg}</Text>
            </View>
          </View>
        )}

        {/* Loading hint */}
        {state === 'loading' && (
          <View className="mx-4 mt-4 bg-blue-50 border border-blue-100 rounded-2xl p-4">
            <Text className="text-blue-600 text-sm text-center">
              🤖 Scraping LinkedIn profile... this may take a few seconds
            </Text>
          </View>
        )}

        {/* Profile result */}
        {state === 'success' && profile && (
          <ProfileCard
            profile={profile}
            onSaveContact={handleSaveContact}
            onExportExcel={handleExportExcel}
            saving={saving}
            exporting={exporting}
          />
        )}

        {/* Empty state */}
        {state === 'idle' && (
          <View className="items-center mt-16 px-8">
            <Text className="text-5xl mb-4">🔍</Text>
            <Text className="text-gray-500 text-center text-sm leading-relaxed">
              Paste a LinkedIn profile URL above and tap{' '}
              <Text className="font-semibold text-[#0A66C2]">Extract Profile</Text>{' '}
              to scrape contact details and save them to your phone.
            </Text>
          </View>
        )}
      </ScrollView>

      <SideDrawer
        visible={drawerVisible}
        drawerAnim={drawerAnim}
        drawerWidth={DRAWER_WIDTH}
        onClose={() => closeDrawer()}
        onCloseWithCallback={(cb) => closeDrawer(cb)}
        onLogout={handleLogout}
      />
    </KeyboardAvoidingView>
  );
}
