import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { router } from 'expo-router';
import { hamburger } from '../helper/ImageImports';

interface Props {
  userName?: string;
  onMenuPress: () => void;
}

export default function TopBar({ userName, onMenuPress }: Props) {
  return (
    <View className="bg-[#0A66C2] pt-14 pb-6 px-5">
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="text-white text-2xl font-bold tracking-tight">
            Hey {userName ?? 'User'}
          </Text>
          <Text className="text-blue-200 text-sm mt-0.5">LinkedIn Profile Scraper</Text>
        </View>

        <View className="flex-row items-center gap-x-2">
          <TouchableOpacity
            onPress={() => router.push('/profiles')}
            className="bg-white/20 rounded-xl px-4 py-2"
          >
            <Text className="text-white text-sm font-medium">📋 Saved</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onMenuPress} className="bg-white/20 rounded-xl px-3 py-2">
            <Image source={hamburger} style={{ width: 20, height: 20 }} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
