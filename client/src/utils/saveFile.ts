import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Linking, Platform } from 'react-native';

export async function saveFileFromUrl(
  url: string,
  filename: string,
  mimeType: string
): Promise<void> {
  const fileUri = FileSystem.cacheDirectory + filename;

  await FileSystem.downloadAsync(url, fileUri);
  const fileInfo = await FileSystem.getInfoAsync(fileUri);
  console.log(fileInfo);
  // On Android with a .vcf, convert to content:// URI and open directly
  // so Android routes it straight to the Contacts app
  if (Platform.OS === 'android' && mimeType === 'text/vcard') {
    const contentUri = await FileSystem.getContentUriAsync(fileUri);
    const content = await FileSystem.readAsStringAsync(fileUri);
    console.log(content.slice(0, 200));
    await Linking.openURL(contentUri);
    return;
  }

  // iOS / other file types — use share sheet
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) throw new Error('Sharing is not available on this device');

  await Sharing.shareAsync(fileUri, { mimeType, dialogTitle: `Save ${filename}` });
}
