import React from 'react';
import IconButton from './IconButton';

export default function CloseButton({ onPress, size = 36, style, iconColor, accessibilityLabel = 'Fermer' }) {
  return (
    <IconButton
      icon="close"
      size={size}
      iconSize={18}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      iconColor={iconColor}
      style={style}
    />
  );
}
