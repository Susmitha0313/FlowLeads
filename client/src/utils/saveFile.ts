import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

export async function saveFileFromUrl(
  url: string,
  filename: string,
  mimeType: string
): Promise<void> {
  const fileUri = FileSystem.cacheDirectory + filename;
  await FileSystem.downloadAsync(url, fileUri);

  if (Platform.OS === 'android') {
    // Ask the user to pick a folder, then write the file there
    const permissions =
      await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

    if (permissions.granted) {
      const content = await FileSystem.readAsStringAsync(fileUri);
      const destUri = await FileSystem.StorageAccessFramework.createFileAsync(
        permissions.directoryUri,
        filename,
        mimeType
      );
      await FileSystem.writeAsStringAsync(destUri, content);
      return;
    }
    // User denied folder picker — fall back to share sheet
  }

  // iOS or Android fallback: share sheet
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error('Sharing is not available on this device');

  await Sharing.shareAsync(fileUri, {
    mimeType,
    dialogTitle: `Save ${filename}`,
    UTI: mimeType === 'text/vcard' ? 'public.vcard' : undefined,
  });
}
