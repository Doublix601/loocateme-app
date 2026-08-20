import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import socialMediaIcons from '../../constants/socialMediaIcons';
import DraggableSocialTile from './DraggableSocialTile';

const { width } = Dimensions.get('window');

// Grille fixe à 4 colonnes : la taille des tuiles est dérivée de la largeur
// d'écran disponible (padding horizontal de l'écran = width * 0.05 de
// chaque côté, voir MyAccountScreen) pour que 4 icônes tiennent exactement
// sur une rangée, quel que soit le nombre total de réseaux.
const COLUMNS = 4;
const GAP = 12;
const SIDE_PADDING = width * 0.05;
const AVAILABLE_WIDTH = width - SIDE_PADDING * 2;
const TILE_SIZE = (AVAILABLE_WIDTH - GAP * (COLUMNS - 1)) / COLUMNS;
const STEP = TILE_SIZE + GAP;

// Position (x, y) d'une tuile dans la grille en fonction de son index et du
// nombre total de tuiles, en centrant la dernière rangée si elle est
// incomplète (comme le faisait justifyContent: 'center' avec flex-wrap).
const getTilePosition = (index, total) => {
  const row = Math.floor(index / COLUMNS);
  const lastRow = Math.floor((total - 1) / COLUMNS);
  const itemsInRow = row === lastRow ? total - row * COLUMNS : COLUMNS;
  const rowOffsetX = row === lastRow ? ((COLUMNS - itemsInRow) * STEP) / 2 : 0;
  const col = index % COLUMNS;
  return { x: col * STEP + rowOffsetX, y: row * STEP };
};

const SocialGrid = ({
  socialRef,
  socialLinks,
  colors,
  isDark,
  onAddPress,
  onOpenSocial,
  onLongPressSocial,
  onReorderSocial,
  onDragStart,
  onDragEnd,
}) => {
  const { t } = useTranslation();
  const [order, setOrder] = useState(() =>
    (socialLinks || []).filter((s) => s?.platform && socialMediaIcons[s.platform]),
  );
  const draggingPlatformRef = useRef(null);
  const [draggingPlatform, setDraggingPlatform] = useState(null);

  // Resynchronise depuis les props (ajout/suppression/refresh serveur) tant
  // qu'aucun drag n'est en cours, pour ne pas interrompre un réarrangement
  // en train de se faire.
  useEffect(() => {
    if (draggingPlatformRef.current) return;
    const next = (socialLinks || []).filter((s) => s?.platform && socialMediaIcons[s.platform]);
    setOrder((prev) => {
      const samePlatforms =
        prev.length === next.length && prev.every((s, i) => s.platform === next[i]?.platform);
      return samePlatforms ? prev : next;
    });
  }, [socialLinks]);

  const handleDragStart = (item) => {
    draggingPlatformRef.current = item.platform;
    setDraggingPlatform(item.platform);
    if (onDragStart) onDragStart(item);
  };

  // Appelé en continu pendant le drag (worklet -> JS) : détermine si la
  // tuile déplacée survole une autre case de la grille et, si oui, échange
  // sa place dans `order` — comme le réarrangement des icônes iOS.
  const handleDragMove = (item, x, y) => {
    setOrder((prev) => {
      const fromIndex = prev.findIndex((s) => s.platform === item.platform);
      if (fromIndex < 0) return prev;
      const centerX = x + TILE_SIZE / 2;
      const centerY = y + TILE_SIZE / 2;
      const col = Math.min(COLUMNS - 1, Math.max(0, Math.round(centerX / STEP - 0.5)));
      const row = Math.max(0, Math.round(centerY / STEP - 0.5));
      let toIndex = Math.min(prev.length - 1, Math.max(0, row * COLUMNS + col));
      if (toIndex === fromIndex) return prev;
      const next = prev.slice();
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const handleDragEnd = (item) => {
    draggingPlatformRef.current = null;
    setDraggingPlatform(null);
    // `order` (closure du dernier render) est déjà à jour : handleDragMove
    // l'a maintenu en temps réel pendant le drag. Ne pas passer par
    // l'updater de setOrder ici : appeler onReorderSocial (qui déclenche un
    // setState du parent MyAccountScreen) depuis une fonction d'updater
    // s'exécute pendant la phase de rendu de React et déclenche l'erreur
    // "Cannot update a component while rendering a different component".
    if (onReorderSocial) onReorderSocial(order);
    if (onDragEnd) onDragEnd(item);
  };

  return (
    <View>
      <View style={styles.headingRow}>
        <Text style={[styles.heading, { color: isDark ? '#fff' : colors.textPrimary }]}>{t('myAccount.social.heading')}</Text>
        <TouchableOpacity
          onPress={onAddPress}
          style={[styles.addButton, { backgroundColor: colors.accent }]}
          accessibilityLabel={t('myAccount.social.addLabel')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
      <View
        ref={socialRef}
        style={[
          styles.container,
          { height: order.length === 0 ? 0 : (Math.floor((order.length - 1) / COLUMNS) + 1) * STEP - GAP },
        ]}
      >
        {order.map((social, index) => {
          const { x, y } = getTilePosition(index, order.length);
          return (
            <DraggableSocialTile
              key={social.platform}
              item={{ ...social, icon: socialMediaIcons[social.platform] }}
              x={x}
              y={y}
              size={TILE_SIZE}
              isDragging={draggingPlatform === social.platform}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
              onPress={(item) => onOpenSocial(item.platform, item.username || item.handle)}
              onLongPressNoMove={(item) => onLongPressSocial(item)}
            />
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  heading: {
    fontSize: 16,
    fontWeight: '800',
  },
  addButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    width: '100%',
    position: 'relative',
  },
});

export default SocialGrid;
