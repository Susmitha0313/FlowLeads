import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  ActivityIndicator, Alert, Modal, ScrollView, StatusBar,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { getProfiles, deleteProfile, updateProfile } from '../src/services/api';
import { Profile } from '../src/components/ProfileCard';

const PAGE_SIZE = 20;

type EditState = Omit<Profile, '_id' | 'scrapedAt' | 'profileImageUrl'> & {
  emailsRaw: string;
  phonesRaw: string;
  websitesRaw: string;
};

function toEditState(p: Profile): EditState {
  return {
    name: p.name ?? '',
    headline: p.headline ?? '',
    designation: p.designation ?? '',
    company: p.company ?? '',
    location: p.location ?? '',
    profileUrl: p.profileUrl ?? '',
    emailsRaw: (p.emails ?? []).join(', '),
    phonesRaw: (p.phones ?? []).join(', '),
    websitesRaw: (p.websites ?? []).join(', '),
  };
}

function splitCSV(s: string): string[] {
  return s.split(',').map(x => x.trim()).filter(Boolean);
}

export default function ProfilesScreen() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(false);

  const [editTarget, setEditTarget] = useState<Profile | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchProfiles = useCallback(async (p: number, q: string) => {
    setLoading(true);
    try {
      const res = await getProfiles(p, PAGE_SIZE, q);
      setProfiles(res.data.profiles);
      setTotal(res.data.total);
      setPages(res.data.pages);
    } catch {
      Alert.alert('Error', 'Failed to load profiles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProfiles(page, search); }, [page, search]);

  const handleSearch = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  const handleDelete = (profile: Profile) => {
    Alert.alert('Delete', `Remove ${profile.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await deleteProfile(profile._id);
            fetchProfiles(page, search);
          } catch {
            Alert.alert('Error', 'Failed to delete');
          }
        },
      },
    ]);
  };

  const openEdit = (profile: Profile) => {
    setEditTarget(profile);
    setEditState(toEditState(profile));
  };

  const handleSave = async () => {
    if (!editTarget || !editState) return;
    setSaving(true);
    try {
      await updateProfile(editTarget._id, {
        name: editState.name,
        headline: editState.headline,
        designation: editState.designation,
        company: editState.company,
        location: editState.location,
        emails: splitCSV(editState.emailsRaw),
        phones: splitCSV(editState.phonesRaw),
        websites: splitCSV(editState.websitesRaw),
      });
      setEditTarget(null);
      fetchProfiles(page, search);
    } catch {
      Alert.alert('Error', 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof EditState) => (
    <View className="mb-3">
      <Text className="text-xs text-gray-500 mb-1">{label}</Text>
      <TextInput
        className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800"
        value={editState?.[key] as string ?? ''}
        onChangeText={(v: string) => setEditState(s => s ? { ...s, [key]: v } : s)}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );

  const renderItem = ({ item }: { item: Profile }) => (
    <View className="bg-white mx-4 mb-3 rounded-2xl p-4 shadow-sm">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 mr-3">
          <Text className="font-semibold text-gray-900 text-base" numberOfLines={1}>{item.name}</Text>
          {item.designation ? <Text className="text-xs text-[#0A66C2] mt-0.5" numberOfLines={1}>{item.designation}</Text> : null}
          {item.company ? <Text className="text-xs text-gray-500 mt-0.5" numberOfLines={1}>@ {item.company}</Text> : null}
          {(item.emails ?? []).length > 0 && (
            <Text className="text-xs text-gray-400 mt-1" numberOfLines={1}>✉️ {item.emails![0]}</Text>
          )}
          {(item.phones ?? []).length > 0 && (
            <Text className="text-xs text-gray-400 mt-0.5" numberOfLines={1}>📞 {item.phones![0]}</Text>
          )}
        </View>
        <View className="flex-row gap-x-2">
          <TouchableOpacity
            onPress={() => openEdit(item)}
            className="bg-blue-50 rounded-xl px-3 py-2"
          >
            <Text className="text-xs text-[#0A66C2] font-medium">Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleDelete(item)}
            className="bg-red-50 rounded-xl px-3 py-2"
          >
            <Text className="text-xs text-red-500 font-medium">Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <View className="flex-1 bg-[#F0F4F8]">
      <StatusBar barStyle="light-content" backgroundColor="#0A66C2" />

      {/* Header */}
      <View className="bg-[#0A66C2] pt-14 pb-4 px-5">
        <Text className="text-white text-xl font-bold">Saved Profiles</Text>
        <Text className="text-blue-200 text-xs mt-0.5">{total} contact{total !== 1 ? 's' : ''}</Text>

        {/* Search */}
        <View className="flex-row mt-3 gap-x-2">
          <TextInput
            className="flex-1 bg-white/20 rounded-xl px-4 py-2 text-white text-sm"
            placeholder="Search name, company..."
            placeholderTextColor="rgba(255,255,255,0.6)"
            value={searchInput}
            onChangeText={setSearchInput}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            autoCorrect={false}
          />
          <TouchableOpacity
            onPress={handleSearch}
            className="bg-white/20 rounded-xl px-4 items-center justify-center"
          >
            <Text className="text-white text-sm">🔍</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#0A66C2" size="large" />
        </View>
      ) : (
        <FlatList
          data={profiles}
          keyExtractor={item => item._id}
          renderItem={renderItem}
          style={{ paddingTop: 16 }}
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 32 }}
          ListEmptyComponent={
            <View className="items-center mt-20">
              <Text className="text-4xl mb-3">📭</Text>
              <Text className="text-gray-400 text-sm">No profiles found</Text>
            </View>
          }
          ListFooterComponent={
            pages > 1 ? (
              <View className="flex-row items-center justify-center gap-x-3 mt-2 mb-4">
                <TouchableOpacity
                  disabled={page <= 1}
                  onPress={() => setPage(p => p - 1)}
                  className={`px-4 py-2 rounded-xl ${page <= 1 ? 'bg-gray-100' : 'bg-[#0A66C2]'}`}
                >
                  <Text className={`text-sm font-medium ${page <= 1 ? 'text-gray-400' : 'text-white'}`}>← Prev</Text>
                </TouchableOpacity>
                <Text className="text-sm text-gray-500">{page} / {pages}</Text>
                <TouchableOpacity
                  disabled={page >= pages}
                  onPress={() => setPage(p => p + 1)}
                  className={`px-4 py-2 rounded-xl ${page >= pages ? 'bg-gray-100' : 'bg-[#0A66C2]'}`}
                >
                  <Text className={`text-sm font-medium ${page >= pages ? 'text-gray-400' : 'text-white'}`}>Next →</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
        />
      )}

      {/* Edit Modal */}
      <Modal visible={!!editTarget} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          className="flex-1 bg-[#F0F4F8]"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Modal header */}
          <View className="bg-[#0A66C2] pt-14 pb-4 px-5 flex-row items-center justify-between">
            <Text className="text-white text-lg font-bold" numberOfLines={1}>
              Edit — {editTarget?.name}
            </Text>
            <TouchableOpacity onPress={() => setEditTarget(null)}>
              <Text className="text-white text-lg">✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView className="flex-1 px-4 pt-5" keyboardShouldPersistTaps="handled">
            {field('Name', 'name')}
            {field('Designation / Title', 'designation')}
            {field('Company', 'company')}
            {field('Headline', 'headline')}
            {field('Location', 'location')}
            {field('Emails (comma separated)', 'emailsRaw')}
            {field('Phones (comma separated)', 'phonesRaw')}
            {field('Websites (comma separated)', 'websitesRaw')}
            <View className="h-8" />
          </ScrollView>

          <View className="px-4 pb-8 pt-3 bg-white border-t border-gray-100">
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              className="bg-[#0A66C2] rounded-2xl py-4 items-center"
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text className="text-white font-semibold">Save Changes</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
