import { expect, it } from '@jest/globals';
import { playSound, retainSounds } from '../sounds';

it('stays silent without react-native-audio-api', () => {
  const release = retainSounds();
  expect(() => playSound('jump')).not.toThrow();
  release();
});
