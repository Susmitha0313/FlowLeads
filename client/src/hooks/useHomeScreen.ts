import { useState, useEffect, useRef } from 'react';
import { Alert, Animated, Dimensions, Platform } from 'react-native';
import * as Contacts from 'expo-contacts';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { extractProfile, logoutApi } from '../services/api';
import { saveFileFromUrl } from '../utils/saveFile';
import type { Profile } from '../components/ProfileCard';

export type ExtractState = 'idle' | 'loading' | 'success' | 'error';

export function useHomeScreen() {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL;

  const [url, setUrl] = useState('');
  const [state, setState] = useState<ExtractState>('idle');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Drawer
  const { width: SCREEN_WIDTH } = Dimensions.get('window');
  const DRAWER_WIDTH = SCREEN_WIDTH * 0.72;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerAnim = useRef(new Animated.Value(DRAWER_WIDTH)).current;

  const openDrawer = () => {
    setDrawerOpen(true);
    Animated.spring(drawerAnim, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
  };

  const closeDrawer = (onDone?: () => void) => {
    Animated.timing(drawerAnim, {
      toValue: DRAWER_WIDTH,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      setDrawerOpen(false);
      onDone?.();
    });
  };

  const handleLogout = () => {
    closeDrawer(async () => {
      try { await logoutApi(); } catch { /* best-effort */ }
      router.replace('/login' as any);
    });
  };

  // Deep-link / share-sheet URL handling
  const extractLinkedInUrl = (text: string): string | null => {
    const match = text.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[^\s]+/);
    return match ? match[0] : null;
  };

  const handleIncomingUrl = (rawUrl: string) => {
    const linkedInUrl = extractLinkedInUrl(rawUrl);
    if (linkedInUrl) setUrl(linkedInUrl);
  };

  useEffect(() => {
    Linking.getInitialURL().then((u) => { if (u) handleIncomingUrl(u); });
    const sub = Linking.addEventListener('url', ({ url: u }) => handleIncomingUrl(u));
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
    const t0 = Date.now();
    try {
      const res = await extractProfile(trimmed);
      console.log(`[HOME] ✓ Profile received in ${Date.now() - t0}ms`);
      setProfile(res.data.profile);
      setState('success');
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? 'Something went wrong';
      console.error(`[HOME] ✗ Failed after ${Date.now() - t0}ms — ${msg}`);
      setErrorMsg(msg);
      setState('error');
    }
  };

  const handleSaveContact = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const nameParts = (profile.name ?? '').trim().split(/\s+/);
      const contact: Contacts.Contact = {
        contactType: Contacts.ContactTypes.Person,
        name: profile.name ?? '',
        firstName: nameParts[0] ?? '',
        lastName: nameParts.slice(1).join(' '),
        jobTitle: profile.designation ?? '',
        company: profile.company ?? '',
        phoneNumbers: (profile.phones ?? []).map((p) => ({ number: p, label: 'mobile' })),
        emails: (profile.emails ?? []).map((e) => ({ email: e, label: 'work' })),
        urlAddresses: [
          ...(profile.profileUrl ? [{ url: profile.profileUrl, label: 'linkedin' }] : []),
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

  const clearUrl = () => { setUrl(''); setState('idle'); setProfile(null); };

  return {
    url, setUrl, state, profile, errorMsg, saving, exporting,
    drawerOpen, drawerAnim, DRAWER_WIDTH,
    openDrawer, closeDrawer, handleLogout,
    handleExtract, handleSaveContact, handleExportExcel, clearUrl,
  };
}
