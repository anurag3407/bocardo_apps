import Storage from 'expo-sqlite/kv-store';

/** Persistent key-value storage (SQLite-backed; survives restarts). */
export const kv = Storage;

/** JSON helpers for Zustand persistence. */
export const jsonStorage = {
  getItem: (name: string) => Storage.getItem(name),
  setItem: (name: string, value: string) => Storage.setItem(name, value),
  removeItem: (name: string) => Storage.removeItem(name),
};
