import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import type { ExtractState } from '../../hooks/useHomeScreen';

interface Props {
  url: string;
  state: ExtractState;
  errorMsg: string;
  onChangeUrl: (v: string) => void;
  onClear: () => void;
  onExtract: () => void;
}

export default function SearchCard({ url, state, errorMsg, onChangeUrl, onClear, onExtract }: Props) {
  return (
    <>
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
            onChangeText={onChangeUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="search"
            onSubmitEditing={onExtract}
          />
          {url.length > 0 && (
            <TouchableOpacity onPress={onClear}>
              <Text className="text-gray-400 text-lg">✕</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          onPress={onExtract}
          disabled={state === 'loading' || !url.trim()}
          className={`mt-4 rounded-2xl py-3.5 items-center justify-center ${
            state === 'loading' || !url.trim() ? 'bg-blue-300' : 'bg-[#0A66C2]'
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

      {/* Error banner */}
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
    </>
  );
}
