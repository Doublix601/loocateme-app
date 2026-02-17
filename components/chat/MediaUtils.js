import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Optimizes an image for upload by resizing and compressing it.
 * @param {string} uri - The local URI of the image.
 * @param {object} options - Optimization options.
 */
export async function optimizeImage(uri, options = { maxWidth: 1080, quality: 0.8 }) {
    try {
        const result = await ImageManipulator.manipulateAsync(
            uri,
            [{ resize: { width: options.maxWidth } }],
            { compress: options.quality, format: ImageManipulator.SaveFormat.JPEG }
        );
        return result;
    } catch (e) {
        console.error('[MediaUtils] Image optimization failed', e);
        return { uri }; // Return original on failure
    }
}

/**
 * Generates a thumbnail for a video file.
 * @param {string} videoUri - The local URI of the video.
 */
export async function generateVideoThumbnail(videoUri) {
    // Fallback sans dépendance expo-video-thumbnails
    // Pour éviter un crash de bundling, nous n'importons pas la lib.
    // Le backend peut générer une miniature côté serveur après upload; côté client, on revient à null.
    try {
        // Astuce: certains lecteurs/serveurs peuvent accepter le mediaUrl comme aperçu
        // Ici, on retourne simplement null pour que l'UI utilise mediaUrl en secours.
        return null;
    } catch (e) {
        console.error('[MediaUtils] Thumbnail generation failed', e);
        return null;
    }
}
