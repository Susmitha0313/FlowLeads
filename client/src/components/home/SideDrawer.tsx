import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Pressable,
  Animated,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';

interface Props {
  visible: boolean;
  drawerAnim: Animated.Value;
  drawerWidth: number;
  onClose: () => void;
  onCloseWithCallback: (cb: () => void) => void;
  onLogout: () => void;
}

export default function SideDrawer({ visible, drawerAnim, drawerWidth, onClose, onCloseWithCallback, onLogout }: Props) {
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}
        onPress={onClose}
      >
        <Pressable onPress={(e) => e.stopPropagation()}>
          <Animated.View
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              width: drawerWidth,
              height: Dimensions.get('window').height,
              backgroundColor: '#fff',
              transform: [{ translateX: drawerAnim }],
              shadowColor: '#000',
              shadowOffset: { width: -3, height: 0 },
              shadowOpacity: 0.15,
              shadowRadius: 10,
              elevation: 20,
            }}
          >
            {/* Header */}
            <View className="bg-[#0A66C2] pt-14 pb-6 px-5">
              <Text className="text-white text-xl font-bold">Bobi</Text>
              <Text className="text-blue-200 text-xs mt-1">LinkedIn Profile Scraper</Text>
            </View>

            {/* Menu items */}
            <View className="flex-1 py-4">
              <DrawerItem icon="🏠" label="Home" onPress={onClose} />
              <DrawerItem
                icon="📋"
                label="Saved Profiles"
                onPress={() => onCloseWithCallback(() => router.push('/profiles'))}
              />
              <View className="mx-6 my-2 border-t border-gray-100" />
              <DrawerItem
                icon="🚪"
                label="Logout"
                labelClass="text-red-500"
                onPress={onLogout}
              />
            </View>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

interface DrawerItemProps {
  icon: string;
  label: string;
  labelClass?: string;
  onPress: () => void;
}

function DrawerItem({ icon, label, labelClass = 'text-gray-800', onPress }: DrawerItemProps) {
  return (
    <TouchableOpacity onPress={onPress} className="flex-row items-center px-6 py-4 gap-x-4">
      <Text className="text-xl">{icon}</Text>
      <Text className={`text-base font-medium ${labelClass}`}>{label}</Text>
    </TouchableOpacity>
  );
}
