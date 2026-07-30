import React, { createContext, useContext, useState, useMemo } from 'react';

const LocalizationContext = createContext({
  locale: 'fr-FR',
  setLocale: () => {},
});

export function LocalizationProvider({ children }) {
  const [locale, setLocale] = useState('fr-FR');
  const value = useMemo(() => ({ locale, setLocale }), [locale]);

  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
}

export function useLocale() {
  return useContext(LocalizationContext);
}
