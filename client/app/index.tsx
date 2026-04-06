import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import * as Contacts from 'expo-contacts';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { extractProfile } from '../src/services/api';
import ProfileCard, { Profile } from '../src/components/ProfileCard';
import { saveFileFromUrl } from '../src/utils/saveFile';

type State = 'idle' | 'loading' | 'success' | 'error';
export default function HomeScreen() {
  const [url, setUrl] = useState('');
  const baseUrl = process.env.EXPO_PUBLIC_API_URL;

  const [state, setState] = useState<State>('idle');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Extract a linkedin URL from any incoming string (share text or direct URL)
  const extractLinkedInUrl = (text: string): string | null => {
    const match = text.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[^\s]+/);
    return match ? match[0] : null;
  };

  const handleIncomingUrl = (rawUrl: string) => {
    const linkedInUrl = extractLinkedInUrl(rawUrl);
    if (linkedInUrl) setUrl(linkedInUrl);
  };

  useEffect(() => {
    // App opened from a cold start via share/deep link
    Linking.getInitialURL().then((initialUrl) => {
      if (initialUrl) handleIncomingUrl(initialUrl);
    });

    // App already open and receives a URL
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
      const msg =
        err?.response?.data?.error ?? err?.message ?? 'Something went wrong';
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
          // number: p.startsWith('+') ? p : `+${p}`,
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
        // iOS: opens native contact form pre-filled
        await Contacts.presentFormAsync(undefined, contact, { isNew: true });
      } else {
        // Android: request permission then open native contacts form via Intent
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
        <TouchableOpacity
          onPress={() => router.push('/profiles')}
          className="bg-white/20 rounded-xl px-4 py-2"
        >
          <Text className="text-white text-sm font-medium">📋 Saved</Text>
        </TouchableOpacity>
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
            className={`mt-4 rounded-2xl py-3.5 items-center justify-center ${state === 'loading' || !url.trim()
              ? 'bg-blue-300'
              : 'bg-[#0A66C2]'
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
              🤖 Logging in & scraping LinkedIn... this may take a few seconds
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
    </KeyboardAvoidingView>
  );
}
