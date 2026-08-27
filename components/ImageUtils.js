import * as ImageManipulator from 'expo-image-manipulator';

// Resize and compress an image file (from ImagePicker or { uri, name, type })
// options: { maxWidth, maxHeight, quality (0..1), format: 'jpeg'|'png'|'webp' }
export async function resizeAndCompress(input, options = {}) {
  const { maxWidth = 1024, maxHeight, quality = 0.8, format = 'jpeg' } = options;
  const uri = input?.uri || input;
  if (!uri) throw new Error('Invalid image input');

  // IMPORTANT : ne contraindre qu'UNE dimension. Passer width ET height force
  // l'image à ce rectangle exact → déformation (ratio cassé) et upscale des
  // petites images, d'où l'aspect "peinture" sur les photos de profil (UI-07).
  // expo-image-manipulator conserve le ratio quand une seule dimension est
  // donnée. `maxHeight` reste accepté pour les rares cas portrait.
  const actions = [
    {
      resize: maxHeight && !maxWidth ? { height: maxHeight } : { width: maxWidth },
    },
  ];
  const saveOptions = {
    compress: Math.max(0, Math.min(1, quality)),
    format:
      format === 'png'
        ? ImageManipulator.SaveFormat.PNG
        : format === 'webp'
          ? ImageManipulator.SaveFormat.WEBP
          : ImageManipulator.SaveFormat.JPEG,
    base64: false,
  };
  const result = await ImageManipulator.manipulateAsync(uri, actions, saveOptions);
  const name = input?.name || input?.fileName || result.uri.split('/').pop() || `image_${Date.now()}.jpg`;
  const type = format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg';
  return { uri: result.uri, name, type };
}

export async function optimizeImageForUpload(
  input,
  { maxWidth = 1024, maxHeight = 1024, quality = 0.8, preferWebp = false } = {},
) {
  // Try WEBP when supported, fallback to JPEG
  try {
    const fmt = preferWebp ? 'webp' : 'jpeg';
    return await resizeAndCompress(input, { maxWidth, maxHeight, quality, format: fmt });
  } catch (_e) {
    return await resizeAndCompress(input, { maxWidth, maxHeight, quality, format: 'jpeg' });
  }
}
