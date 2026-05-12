import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import SocialPulseAvatar from './SocialPulseAvatar';

/**
 * ProfileCard — carte de profil condensée pour la liste des utilisateurs présents.
 *
 *  - Photo (anneau statut/néon via SocialPulseAvatar)
 *  - Nom + bio courte
 *  - Mini-icônes des réseaux sociaux liés (max 4 visibles)
 */
const ProfileCard = ({
  user,
  index = 0,
  isMoon = false,
  palette,
  shadows,
  radius,
  spacing,
  socialMediaIcons = {},
  onPress,
}) => {
  const isBoosted = user?.boostUntil && new Date(user.boostUntil) > new Date();

  // Normalise la liste des réseaux sociaux du user.
  const socials = useMemo(() => {
    const raw =
      user?.socialMediaList ||
      user?.socials ||
      user?.socialMedia ||
      [];
    if (!Array.isArray(raw)) return [];
    return raw
      .map((s) => {
        const rawPlatform = s.platform ?? s.type ?? s.socialMedia;
        const v = String(rawPlatform || '').toLowerCase();
        let canon = v;
        if (v === 'twitter' || v === 'twitter.com' || v === 'x.com') canon = 'x';
        else if (v === 'yt' || v === 'youtube.com') canon = 'youtube';
        else if (v === 'fb' || v === 'facebook.com') canon = 'facebook';
        else if (v === 'ig' || v === 'insta' || v === 'instagram.com') canon = 'instagram';
        else if (v === 'tt' || v === 'tiktok.com') canon = 'tiktok';
        else if (v === 'snap' || v === 'snapchat.com') canon = 'snapchat';
        return socialMediaIcons[canon] ? canon : null;
      })
      .filter(Boolean);
  }, [user, socialMediaIcons]);

  const isGhost = !!user?.isGhost;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        styles.card,
        {
          backgroundColor: palette.surface,
          borderRadius: radius.lg,
          borderWidth: isMoon ? 1 : 0,
          borderColor: palette.border,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          opacity: isGhost ? 0.65 : 1,
        },
        shadows.card,
      ]}
    >
      <SocialPulseAvatar
        user={user}
        size={54}
        isMoon={isMoon}
        index={index}
        onPress={onPress}
      />

      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <View style={styles.row}>
          <Text
            style={[styles.name, { color: palette.text }]}
            numberOfLines={1}
          >
            {user?.customName || user?.username || 'Anonyme'}
          </Text>
          {isBoosted && (
            <Text style={[styles.boostBadge, { color: '#FFD700' }]}>⚡</Text>
          )}
          {isGhost && (
            <Text style={[styles.boostBadge, { color: palette.textFaint }]}>👻</Text>
          )}
        </View>

        {isGhost ? (
          <Text
            numberOfLines={1}
            style={[styles.bio, { color: palette.textFaint, fontStyle: 'italic' }]}
          >
            N'est plus sur place (Boost actif)
          </Text>
        ) : user?.bio ? (
          <Text
            numberOfLines={2}
            style={[styles.bio, { color: palette.textMuted }]}
          >
            {user.bio}
          </Text>
        ) : null}

        {socials.length > 0 && (
          <View style={styles.socialRow}>
            {socials.slice(0, 4).map((platform, i) => (
              <View
                key={`${platform}-${i}`}
                style={[
                  styles.socialChip,
                  {
                    backgroundColor: isMoon
                      ? 'rgba(255,255,255,0.08)'
                      : 'rgba(14,17,22,0.06)',
                  },
                ]}
              >
                <Image
                  source={socialMediaIcons[platform]}
                  style={styles.socialIcon}
                  resizeMode="contain"
                />
              </View>
            ))}
            {socials.length > 4 && (
              <Text style={[styles.moreText, { color: palette.textFaint }]}>
                +{socials.length - 4}
              </Text>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  name: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3, flexShrink: 1 },
  boostBadge: { marginLeft: 6, fontSize: 14 },
  bio: { fontSize: 13, fontWeight: '500', marginTop: 2, lineHeight: 18 },
  socialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  socialChip: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  socialIcon: { width: 16, height: 16 },
  moreText: { fontSize: 12, fontWeight: '700' },
});

export default ProfileCard;
