import { describe, expect, it } from '@jest/globals';
import {
  AIR_TIME,
  OBSTACLE_WIDTH,
  PLAYER_X,
  createGame,
  currentSpeed,
  obstacleX,
  pause,
  playerPose,
  step,
  tap,
  type GameOptions,
  type GameState,
} from '../engine';

const OPTIONS: GameOptions = { skySpeed: 40, groundSpeed: 100 };
const WIDTH = 390;
const FRAME = 1 / 60;

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function run(
  game: GameState,
  seconds: number,
  options = OPTIONS,
  dt = FRAME,
  random = seeded(1),
  beforeStep?: () => void
) {
  for (let t = 0; t < seconds && game.status === 'running'; t += dt) {
    beforeStep?.();
    step(game, dt, WIDTH, options, random);
  }
}

/** Jumps when the next hurdle is about to reach the dinosaur. */
function autoJump(game: GameState, options: GameOptions) {
  return () => {
    const speed = currentSpeed(game, options);
    const next = game.obstacles
      .map((o) => obstacleX(game, o, WIDTH))
      .find((x) => x + OBSTACLE_WIDTH > PLAYER_X + 10);
    if (next !== undefined && next - (PLAYER_X + 34) <= speed * 0.15) {
      tap(game, options);
    }
  };
}

describe('engine', () => {
  it('starts running and jumps on the first tap', () => {
    const game = createGame();
    tap(game, OPTIONS);
    expect(game.status).toBe('running');
    run(game, 0.1);
    expect(game.jumpHeight).toBeGreaterThan(0);
  });

  it('jumps about 55 points high and lands after AIR_TIME', () => {
    const game = createGame();
    tap(game, OPTIONS);
    let peak = 0;
    let landedAt = 0;
    for (let t = 0; t < 2; t += FRAME) {
      step(game, FRAME, WIDTH, OPTIONS);
      peak = Math.max(peak, game.jumpHeight);
      if (game.jumpHeight === 0) {
        landedAt = t + FRAME;
        break;
      }
    }
    expect(peak).toBeGreaterThan(53);
    expect(peak).toBeLessThanOrEqual(55);
    expect(landedAt).toBeCloseTo(AIR_TIME, 1);
  });

  it('ignores taps in mid-air', () => {
    const game = createGame();
    tap(game, OPTIONS);
    run(game, 0.3);
    const height = game.jumpHeight;
    const velocity = game.jumpVelocity;
    tap(game, OPTIONS);
    expect(game.jumpHeight).toBe(height);
    expect(game.jumpVelocity).toBe(velocity);
  });

  it('ends the run when the dinosaur runs into a hurdle', () => {
    const game = createGame();
    tap(game, OPTIONS);
    run(game, 30);
    expect(game.status).toBe('over');
    expect(playerPose(game)).toBe('dead');
    expect(game.score).toBeGreaterThan(0);
    expect(game.highScore).toBe(game.score);
  });

  it.each([
    ['default speed, 60 fps', 100, FRAME],
    ['fast ground, 60 fps', 300, FRAME],
    ['default speed, slow device', 100, 1 / 20],
    ['fast ground, slow device', 300, 1 / 20],
  ])('always leaves room to clear every hurdle (%s)', (_, groundSpeed, dt) => {
    const options = { ...OPTIONS, groundSpeed };
    for (let seed = 1; seed <= 5; seed++) {
      const game = createGame();
      tap(game, options);
      run(game, 180, options, dt, seeded(seed), autoJump(game, options));
      expect(game.status).toBe('running');
      expect(game.obstacles.length).toBeLessThan(10);
    }
  });

  it('speeds up as the score grows', () => {
    const game = createGame();
    tap(game, OPTIONS);
    const start = currentSpeed(game, OPTIONS);
    run(game, 60, OPTIONS, FRAME, seeded(2), autoJump(game, OPTIONS));
    expect(currentSpeed(game, OPTIONS)).toBeGreaterThan(start);
  });

  it('freezes while paused and resumes on tap', () => {
    const game = createGame();
    tap(game, OPTIONS);
    run(game, 0.5);
    pause(game);
    const distance = game.distance;
    step(game, FRAME, WIDTH, OPTIONS);
    expect(game.distance).toBe(distance);
    tap(game, OPTIONS);
    expect(game.status).toBe('running');
    step(game, FRAME, WIDTH, OPTIONS);
    expect(game.distance).toBeGreaterThan(distance);
  });

  it('keeps the high score when restarting after a crash', () => {
    const game = createGame(50);
    tap(game, OPTIONS);
    run(game, 30);
    const best = game.highScore;
    expect(best).toBeGreaterThan(50);
    tap(game, OPTIONS);
    expect(game.status).toBe('running');
    expect(game.score).toBe(0);
    expect(game.highScore).toBe(best);
  });

  it('alternates leg frames while running on the ground', () => {
    const game = createGame();
    expect(playerPose(game)).toBe('stand');
    tap(game, OPTIONS);
    run(game, AIR_TIME + 0.05);
    const poses = new Set<string>();
    for (let i = 0; i < 20; i++) {
      step(game, FRAME, WIDTH, OPTIONS);
      poses.add(playerPose(game));
    }
    expect([...poses].sort()).toEqual(['left', 'right']);
  });
});
