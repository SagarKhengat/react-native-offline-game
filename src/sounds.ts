/**
 * Retro beeps synthesised with react-native-audio-api, so the package ships
 * no audio files. The library is optional: when the app doesn't have it (or
 * runs in Expo Go, which lacks its native code) the game is simply silent.
 */
import { TurboModuleRegistry } from 'react-native';
import type { GameSound } from './engine';

// [frequency in Hz, length in seconds] of each note, played back to back on
// a square wave like the original game's beeps.
const NOTES: Record<GameSound, readonly (readonly [number, number])[]> = {
  jump: [[740, 0.06]],
  score: [
    [1047, 0.07],
    [1397, 0.12],
  ],
  hit: [
    [196, 0.07],
    [147, 0.14],
  ],
};
// Square waves are loud; keep the beeps well under other app sounds.
const VOLUME = 0.05;

// The parts of react-native-audio-api used here, typed by hand so the
// package compiles without it.
type Param = {
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
};
type Node = { connect(destination: unknown): unknown };
type Context = {
  readonly currentTime: number;
  readonly state: string;
  readonly destination: unknown;
  createOscillator(): Node & {
    type: string;
    frequency: Param;
    start(when?: number): void;
    stop(when?: number): void;
  };
  createGain(): Node & { gain: Param };
  resume(): Promise<void>;
  close(): Promise<void>;
};

let context: Context | null | undefined;
let users = 0;

function audioContext(): Context | null {
  if (context !== undefined) {
    return context;
  }
  context = null;
  if (!hasNativeAudio()) {
    return null;
  }
  let audio;
  try {
    audio = require('react-native-audio-api');
  } catch {
    // Not installed: stay silent.
    return null;
  }
  try {
    // Ambient: respects the silent switch and mixes with the user's music.
    audio.AudioManager?.setAudioSessionOptions?.({
      iosCategory: 'ambient',
      iosOptions: ['mixWithOthers'],
    });
    context = new audio.AudioContext() as Context;
  } catch (error) {
    warn('could not start react-native-audio-api', error);
  }
  return context;
}

/**
 * Whether react-native-audio-api's native code is in this build. Importing
 * the library without it (an Expo Go app, say) throws during import, which
 * shows a full-screen error in development, so check first.
 */
function hasNativeAudio(): boolean {
  try {
    return (
      'createAudioContext' in globalThis ||
      TurboModuleRegistry.get('AudioAPIModule') != null
    );
  } catch {
    return false;
  }
}

function warn(message: string, error: unknown) {
  if (__DEV__) {
    console.warn(`react-native-offline-game: ${message}`, error);
  }
}

export function playSound(sound: GameSound): void {
  const ctx = audioContext();
  if (!ctx) {
    return;
  }
  try {
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    let time = ctx.currentTime;
    for (const [frequency, length] of NOTES[sound]) {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(frequency, time);
      gain.gain.setValueAtTime(VOLUME, time);
      gain.gain.linearRampToValueAtTime(0, time + length);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(time);
      oscillator.stop(time + length);
      time += length;
    }
  } catch (error) {
    // A failed beep must never break the game.
    warn('could not play a sound', error);
  }
}

/**
 * Keeps the audio context while a game with sound is mounted, and closes it
 * when the last one goes away so the app doesn't hold the audio session.
 */
export function retainSounds(): () => void {
  users += 1;
  return () => {
    users -= 1;
    if (users === 0 && context) {
      context.close().catch(() => {});
      context = undefined;
    }
  };
}
