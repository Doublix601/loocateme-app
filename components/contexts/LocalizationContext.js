import React, { createContext, useContext, useState } from 'react';

const LocalizationContext = createContext({
    locale: 'fr-FR',
    setLocale: () => { },
});

export function LocalizationProvider({ children }) {
    const [locale, setLocale] = useState('fr-FR');

    return (
        <LocalizationContext.Provider value={{ locale, setLocale }}>
            {children}
        </LocalizationContext.Provider>
    );
}

export function useLocale() {
    return useContext(LocalizationContext);
}
