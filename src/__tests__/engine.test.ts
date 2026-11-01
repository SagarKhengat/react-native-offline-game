import { describe, expect, it } from '@jest/globals';
import {
  AIR_TIME,
  MAX_SPEED,
  OBSTACLE_WIDTH,
  PLAYER_X,
  createGame,
  currentSpeed,
  obstacleX,
  pause,
  playerPose,
  seedClouds,
  shownScore,
  step,
  tap,
  type GameOptions,
  type GameState,
} from '../engine';

const OPTIONS: GameOptions = { skySpeed: 40, groundSpeed: 360 };
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
  beforeStep?: () => void,
  width = WIDTH
) {
  for (let t = 0; t < seconds && game.status === 'running'; t += dt) {
    beforeStep?.();
    step(game, dt, width, options, random);
  }
}

/** Jumps when the next hurdle is about to reach the dinosaur. */
function autoJump(game: GameState, options: GameOptions, width = WIDTH) {
  return () => {
    const speed = currentSpeed(game, width);
    const next = game.obstacles
      .map((o) => obstacleX(game, o, width))
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

  it('still jumps when the first frame after the tap has no elapsed time', () => {
    // The game loop's first frame always steps by 0.
    const game = createGame();
    tap(game, OPTIONS);
    step(game, 0, WIDTH, OPTIONS);
    run(game, 0.15);
    expect(game.jumpHeight).toBeGreaterThan(40);
  });

  it('jumps about 62 points high and lands after AIR_TIME', () => {
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
    expect(peak).toBeGreaterThan(60);
    expect(peak).toBeLessThanOrEqual(62);
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
    ['phone, 60 fps', 390, 360, FRAME],
    ['phone, slow device', 390, 360, 1 / 20],
    ['phone, top speed from the start', 390, MAX_SPEED, FRAME],
    ['tablet, 60 fps', 1024, 360, FRAME],
    ['tablet, top speed, slow device', 1024, MAX_SPEED, 1 / 20],
  ])(
    'always leaves room to clear every hurdle (%s)',
    (_, width, groundSpeed, dt) => {
      const options = { ...OPTIONS, groundSpeed };
      for (let seed = 1; seed <= 5; seed++) {
        const game = createGame();
        tap(game, options);
        run(
          game,
          180,
          options,
          dt,
          seeded(seed),
          autoJump(game, options, width),
          width
        );
        expect(game.status).toBe('running');
        expect(game.obstacles.length).toBeLessThan(10);
      }
    }
  );

  it('speeds up over time to MAX_SPEED', () => {
    const game = createGame();
    tap(game, OPTIONS);
    const start = currentSpeed(game, 1024);
    expect(start).toBe(360);
    run(game, 30, OPTIONS, FRAME, seeded(2), autoJump(game, OPTIONS));
    expect(currentSpeed(game, 1024)).toBeGreaterThan(start + 90);
    run(game, 150, OPTIONS, FRAME, seeded(2), autoJump(game, OPTIONS));
    expect(game.status).toBe('running');
    expect(currentSpeed(game, 1024)).toBe(MAX_SPEED);
  });

  it('runs slower on narrow screens, like Chrome on phones', () => {
    const game = createGame();
    tap(game, OPTIONS);
    expect(currentSpeed(game, 600)).toBe(360);
    expect(currentSpeed(game, 390)).toBeCloseTo(360 * (390 / 600) * 1.2);
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
    const game = createGame(10);
    tap(game, OPTIONS);
    run(game, 30);
    const best = game.highScore;
    expect(best).toBeGreaterThan(10);
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

  it('reports a jump only when the dinosaur takes off', () => {
    const game = createGame();
    expect(tap(game, OPTIONS)).toBe('jump');
    run(game, 0.2);
    expect(tap(game, OPTIONS)).toBeUndefined();
    run(game, AIR_TIME);
    expect(tap(game, OPTIONS)).toBe('jump');
  });

  it('reports a hit when the dinosaur crashes', () => {
    const game = createGame();
    tap(game, OPTIONS);
    const sounds: (string | undefined)[] = [];
    for (let i = 0; i < 60 * 30 && game.status === 'running'; i++) {
      sounds.push(step(game, FRAME, WIDTH, OPTIONS));
    }
    expect(game.status).toBe('over');
    expect(sounds[sounds.length - 1]).toBe('hit');
  });

  it('beeps and blinks the score at every 100 points, like Chrome', () => {
    const game = createGame();
    const options = { ...OPTIONS };
    tap(game, options);
    const jumper = autoJump(game, options);
    const milestones: number[] = [];
    for (let i = 0; i < 60 * 60 && milestones.length < 2; i++) {
      jumper();
      if (step(game, FRAME, WIDTH, options, seeded(3)) === 'score') {
        milestones.push(Math.floor(game.score));
      }
    }
    expect(milestones).toEqual([100, 200]);

    // Off, on, off... showing the milestone, then back to the live score.
    expect(shownScore(game)).toBeNull();
    step(game, 0.13, WIDTH, options);
    expect(shownScore(game)).toBe(200);
    step(game, 0.13, WIDTH, options);
    expect(shownScore(game)).toBeNull();
    for (let i = 0; i < 4; i++) step(game, 0.13, WIDTH, options);
    expect(shownScore(game)).toBe(Math.floor(game.score));
  });

  it('scatters clouds across the sky and keeps them coming', () => {
    const game = createGame();
    seedClouds(game, WIDTH, seeded(4));
    expect(game.clouds.length).toBeGreaterThan(0);
    expect(game.clouds.every((c) => c.x < WIDTH)).toBe(true);
    const count = game.clouds.length;
    seedClouds(game, WIDTH, seeded(5));
    expect(game.clouds.length).toBe(count);

    tap(game, OPTIONS);
    run(game, 60, OPTIONS, FRAME, seeded(6), autoJump(game, OPTIONS));
    expect(game.clouds.length).toBeGreaterThan(0);
    expect(game.clouds.length).toBeLessThan(10);
    expect(game.clouds.some((c) => c.x < WIDTH)).toBe(true);
  });
});
