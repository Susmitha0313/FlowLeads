import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from 'react-native';

export type Profile = {
  _id: string;
  name: string;
  headline?: string;
  designation?: string;
  company?: string;
  location?: string;
  emails?: string[];
  phones?: string[];
  websites?: string[];
  profileUrl?: string;
  profileImageUrl?: string;
  scrapedAt?: string;
};

type Props = {
  profile: Profile;
  onSaveContact: () => void;
  onExportExcel: () => void;
  saving: boolean;
  exporting: boolean;
};

export default function ProfileCard({
  profile,
  onSaveContact,
  onExportExcel,
  saving,
  exporting,
}: Props) {
  return (
    <View className="bg-white rounded-3xl mx-4 mt-4 shadow-lg overflow-hidden">
      {/* Header gradient strip */}
      <View className="bg-[#0A66C2] h-16" />

      {/* Avatar */}
      <View className="items-center -mt-10 mb-2">
        {profile.profileImageUrl ? (
          <Image
            source={{ uri: profile.profileImageUrl }}
            className="w-20 h-20 rounded-full border-4 border-white"
          />
        ) : (
          <View className="w-20 h-20 rounded-full border-4 border-white bg-[#0A66C2] items-center justify-center">
            <Text className="text-white text-3xl font-bold">
              {profile.name?.[0] ?? '?'}
            </Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View className="px-5 pb-2 items-center">
        <Text className="text-xl font-bold text-gray-900">{profile.name}</Text>
        {profile.designation ? (
          <Text className="text-sm text-[#0A66C2] font-medium mt-0.5">
            {profile.designation}
          </Text>
        ) : null}
        {profile.company ? (
          <Text className="text-sm text-gray-500 mt-0.5">@ {profile.company}</Text>
        ) : null}
        {/* {profile.location ? (
          <Text className="text-xs text-gray-400 mt-1">📍 {profile.location}</Text>
        ) : null} */}
      </View>

      {/* Divider */}
      <View className="h-px bg-gray-100 mx-5 my-3" />

      {/* Contact details */}
      <View className="px-5 gap-y-2 pb-2">
        {(profile.emails ?? []).map((e) => (
          <Row key={e} icon="✉️" label={e} onPress={() => Linking.openURL(`mailto:${e}`)} />
        ))}
        {(profile.phones ?? []).map((p) => (
          <Row key={p} icon="📞" label={p} onPress={() => Linking.openURL(`tel:${p}`)} />
        ))}
        {(profile.websites ?? []).map((w) => (
          <Row key={w} icon="🌐" label={w} onPress={() => Linking.openURL(w)} />
        ))}
        {profile.profileUrl ? (
          <Row
            icon="🔗"
            label="LinkedIn Profile"
            onPress={() => Linking.openURL(profile.profileUrl!)}
          />
        ) : null}
      </View>

      {/* Divider */}
      <View className="h-px bg-gray-100 mx-5 my-3" />

      {/* Action buttons */}
      <View className="flex-row gap-x-3 px-5 pb-5">
        <TouchableOpacity
          onPress={onSaveContact}
          disabled={saving}
          className="flex-1 bg-[#0A66C2] rounded-2xl py-3 items-center justify-center flex-row gap-x-2"
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text className="text-white font-semibold text-sm">💾 Save Contact</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onExportExcel}
          disabled={exporting}
          className="flex-1 bg-emerald-500 rounded-2xl py-3 items-center justify-center flex-row gap-x-2"
        >
          {exporting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text className="text-white font-semibold text-sm">📊 Export Excel</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Row({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="flex-row items-center gap-x-2"
      activeOpacity={onPress ? 0.6 : 1}
    >
      <Text className="text-base">{icon}</Text>
      <Text className="text-sm text-gray-600 flex-1" numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
