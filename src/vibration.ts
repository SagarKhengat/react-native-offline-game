/**
 * Buzzes on jumps and crashes with React Native's own Vibration API, so no
 * package is needed.
 */
import {
  PermissionsAndroid,
  Platform,
  Vibration,
  type Permission,
} from 'react-native';
import type { GameSound } from './engine';

const JUMP_MS = 12;
const HIT_MS = 70;

let androidAllowed: Promise<boolean> | undefined;

export function vibrate(sound: GameSound): void {
  if (sound === 'score') {
    return;
  }
  try {
    if (Platform.OS === 'android') {
      // Vibrating without the VIBRATE permission in the manifest crashes, so
      // check first. Expo apps have it; bare apps may not.
      androidAllowed ??= PermissionsAndroid.check(
        'android.permission.VIBRATE' as Permission
      ).catch(() => false);
      androidAllowed.then((allowed) => {
        if (allowed) Vibration.vibrate(sound === 'hit' ? HIT_MS : JUMP_MS);
      });
    } else if (Platform.OS === 'ios') {
      // iOS only offers one fixed buzz, too strong for every jump.
      if (sound === 'hit') Vibration.vibrate();
    } else {
      Vibration.vibrate(sound === 'hit' ? HIT_MS : JUMP_MS);
    }
  } catch {
    // Vibration is a nicety; never let it break the game.
  }
}
