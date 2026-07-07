import { createContext, useContext } from 'react';

// Lightweight bus so deeply-nested cards can open the shared modals and jump
// between sections without prop-drilling. The actual modal state lives in AppShell.
const UIContext = createContext(null);

export function UIProvider({ value, children }) {
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI debe usarse dentro de <UIProvider>');
  return ctx;
}
