/**
 * Remembers the high score between launches without adding a dependency:
 * it uses AsyncStorage when the app already has it, localStorage on the web,
 * and otherwise keeps the score for as long as the app is open.
 */
import { NativeModules, Platform, TurboModuleRegistry } from 'react-native';

/** Anything with AsyncStorage's getItem and setItem, sync or async. */
export type HighScoreStorage = {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<unknown> | unknown;
};

const KEY = 'react-native-offline-game:high-score';

let found: HighScoreStorage | null | undefined;

export function defaultStorage(): HighScoreStorage | null {
  if (found === undefined) {
    found = findStorage();
  }
  return found;
}

function findStorage(): HighScoreStorage | null {
  if (Platform.OS === 'web') {
    try {
      const local = (globalThis as { localStorage?: HighScoreStorage })
        .localStorage;
      if (local) {
        return {
          getItem: (key) => local.getItem(key),
          setItem: (key, value) => local.setItem(key, value),
        };
      }
    } catch {
      // Storage blocked, e.g. in a private window.
    }
    return null;
  }
  if (!hasNativeAsyncStorage()) {
    return null;
  }
  try {
    const module = require('@react-native-async-storage/async-storage');
    const storage = module?.default ?? module;
    if (typeof storage?.getItem === 'function') {
      return storage;
    }
  } catch {
    // Not installed.
  }
  return null;
}

/**
 * Whether AsyncStorage's native code is in this build (the name changed in
 * version 3). Importing it without that throws during import.
 */
function hasNativeAsyncStorage(): boolean {
  try {
    return (
      TurboModuleRegistry.get('RNAsyncStorage') != null ||
      TurboModuleRegistry.get('RNCAsyncStorage') != null ||
      NativeModules.RNCAsyncStorage != null
    );
  } catch {
    return false;
  }
}

export async function loadHighScore(storage: HighScoreStorage): Promise<number> {
  try {
    return Math.max(0, Math.floor(Number(await storage.getItem(KEY)) || 0));
  } catch {
    return 0;
  }
}

export function saveHighScore(storage: HighScoreStorage, score: number): void {
  try {
    Promise.resolve(storage.setItem(KEY, String(Math.floor(score)))).catch(
      () => {}
    );
  } catch {
    // Saving is best effort.
  }
}
