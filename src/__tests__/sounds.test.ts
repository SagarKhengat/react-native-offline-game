import { beforeEach, describe, expect, it, jest } from '@jest/globals';

type Call = [string, ...unknown[]];
let mockCalls: Call[];

jest.mock(
  'react-native-audio-api',
  () => {
    const param = (name: string) => ({
      setValueAtTime: (...args: unknown[]) => mockCalls.push([`${name}.set`, ...args]),
      linearRampToValueAtTime: (...args: unknown[]) =>
        mockCalls.push([`${name}.ramp`, ...args]),
    });
    class AudioContext {
      currentTime = 1;
      state = 'running';
      destination = 'speakers';
      constructor() {
        mockCalls.push(['context']);
      }
      createOscillator() {
        const node = {
          type: 'sine',
          frequency: param('frequency'),
          connect: () => {},
          start: (t: number) => mockCalls.push(['start', node.type, t]),
          stop: (t: number) => mockCalls.push(['stop', t]),
        };
        return node;
      }
      createGain() {
        return { gain: param('gain'), connect: () => {} };
      }
      resume() {
        return Promise.resolve();
      }
      close() {
        mockCalls.push(['close']);
        return Promise.resolve();
      }
    }
    return {
      AudioContext,
      AudioManager: {
        setAudioSessionOptions: (options: unknown) =>
          mockCalls.push(['session', options]),
      },
    };
  },
  { virtual: true }
);

describe('sounds', () => {
  beforeEach(() => {
    mockCalls = [];
    jest.resetModules();
  });

  it('synthesises square-wave beeps on an ambient audio session', () => {
    const { playSound, retainSounds } = require('../sounds');
    const release = retainSounds();
    playSound('score');

    expect(mockCalls[0]).toEqual([
      'session',
      { iosCategory: 'ambient', iosOptions: ['mixWithOthers'] },
    ]);
    const starts = mockCalls.filter((c) => c[0] === 'start');
    expect(starts).toEqual([
      ['start', 'square', 1],
      ['start', 'square', 1.07],
    ]);
    expect(mockCalls).toContainEqual(['frequency.set', 1047, 1]);
    expect(mockCalls).toContainEqual(['gain.ramp', 0, 1.07]);

    release();
    expect(mockCalls[mockCalls.length - 1]).toEqual(['close']);
  });

  it('reuses one audio context while games are mounted', () => {
    const { playSound, retainSounds } = require('../sounds');
    const releaseA = retainSounds();
    const releaseB = retainSounds();
    playSound('jump');
    playSound('hit');
    releaseA();
    expect(mockCalls.filter((c) => c[0] === 'context')).toHaveLength(1);
    expect(mockCalls).not.toContainEqual(['close']);
    releaseB();
    expect(mockCalls).toContainEqual(['close']);
  });
});
