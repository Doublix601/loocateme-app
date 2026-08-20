import React from 'react';
import { useTranslation } from 'react-i18next';
import IconButton from './IconButton';

export default function CloseButton({ onPress, size = 36, style, iconColor, accessibilityLabel }) {
  const { t } = useTranslation();
  return (
    <IconButton
      icon="close"
      size={size}
      iconSize={18}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel || t('common.close')}
      iconColor={iconColor}
      style={style}
    />
  );
}
