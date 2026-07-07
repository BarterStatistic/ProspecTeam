import { createContext, useContext } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  createClient,
  updateClient,
  deleteClient,
  moveClient,
  applyBoardReorder,
  cancelClient,
  exportAll,
  importAll,
} from '../lib/db.js';

const DataContext = createContext(null);

export function DataProvider({ children }) {
  // Single live query: every client in the DB. Small data volume, so grouping
  // and filtering happens in the views. Re-renders automatically on any write.
  const clients = useLiveQuery(() => db.clients.toArray(), [], undefined);

  const value = {
    clients: clients ?? [],
    loading: clients === undefined,
    createClient,
    updateClient,
    deleteClient,
    moveClient,
    applyBoardReorder,
    cancelClient,
    exportAll,
    importAll,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData debe usarse dentro de <DataProvider>');
  return ctx;
}
