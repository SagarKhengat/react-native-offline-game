import { describe, expect, it } from '@jest/globals';
import {
  AIR_TIME,
  BIRD_Y,
  MAX_SPEED,
  PLAYER_X,
  createGame,
  currentSpeed,
  duck,
  isDucking,
  isNight,
  nextObstacle,
  obstacleWidth,
  obstacleX,
  pause,
  playerPose,
  release,
  seedClouds,
  shownScore,
  step,
  tap,
  type GameOptions,
  type GameState,
  type Obstacle,
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

/**
 * Plays like a careful human holding the button for full jumps: jumps
 * hurdles and low birds just before they arrive, ducks under middle birds
 * and ignores high ones.
 */
function autoJump(game: GameState, options: GameOptions, width = WIDTH) {
  return () => {
    const speed = currentSpeed(game, width);
    const next = game.obstacles
      .map((o) => ({ o, x: obstacleX(game, o, width) }))
      .find(({ o, x }) => x + obstacleWidth(o) > PLAYER_X + 4);
    if (next === undefined) {
      return;
    }
    const arrivesIn = (next.x - (PLAYER_X + 34)) / speed;
    if (next.o.kind === 'bird' && next.o.y === BIRD_Y.high) {
      return;
    }
    if (next.o.kind === 'bird' && next.o.y === BIRD_Y.middle) {
      if (arrivesIn <= 0.2) duck(game, true);
      return;
    }
    if (game.ducking) duck(game, false);
    if (arrivesIn <= 0.15) tap(game, options);
  };
}

type ObstacleShape =
  | { kind: 'hurdle'; count: 1 | 2 | 3 }
  | { kind: 'bird'; y: number };

/** Puts one obstacle right in front of a running dinosaur. */
function facing(obstacle: ObstacleShape, ahead = 60) {
  const game = createGame();
  tap(game, OPTIONS);
  game.jumpHeight = 0;
  game.jumpVelocity = 0;
  game.distance = 1000;
  game.obstacles = [
    { ...obstacle, distance: 1000 - WIDTH + PLAYER_X + ahead } as Obstacle,
    { kind: 'hurdle', count: 1, distance: 1e9 },
  ];
  return game;
}

/** Runs until the obstacle has passed the dinosaur, or it crashes. */
function pass(game: GameState, beforeStep?: () => void) {
  for (let i = 0; i < 90 && game.status === 'running'; i++) {
    beforeStep?.();
    step(game, FRAME, WIDTH, OPTIONS, seeded(1));
  }
  return game.status;
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

  describe('hold to jump higher', () => {
    const peak = (holdFor: number) => {
      const game = createGame();
      tap(game, OPTIONS);
      let best = 0;
      for (let t = 0; t < 1; t += FRAME) {
        if (t >= holdFor) release(game);
        step(game, FRAME, WIDTH, OPTIONS);
        best = Math.max(best, game.jumpHeight);
      }
      return best;
    };

    it('jumps lower when let go straight away, full height when held', () => {
      expect(peak(0)).toBeGreaterThan(30);
      expect(peak(0)).toBeLessThan(40);
      expect(peak(1)).toBeGreaterThan(60);
    });

    it('still clears a single hurdle with a quick tap', () => {
      const game = facing({ kind: 'hurdle', count: 1 }, 80);
      tap(game, OPTIONS);
      release(game);
      expect(pass(game)).toBe('running');
    });
  });

  describe('ducking', () => {
    it('crouches on the ground and can not jump while crouched', () => {
      const game = facing({ kind: 'hurdle', count: 1 }, 400);
      duck(game, true);
      expect(isDucking(game)).toBe(true);
      expect(playerPose(game)).toMatch(/^duck/);
      expect(tap(game, OPTIONS)).toBeUndefined();
      duck(game, false);
      expect(isDucking(game)).toBe(false);
    });

    it('drops fast when pressed in mid-air', () => {
      const fall = (drop: boolean) => {
        const game = createGame();
        tap(game, OPTIONS);
        let t = 0;
        for (; t < 0.25; t += FRAME) step(game, FRAME, WIDTH, OPTIONS);
        if (drop) duck(game, true);
        for (; game.jumpHeight > 0; t += FRAME) step(game, FRAME, WIDTH, OPTIONS);
        return t;
      };
      expect(fall(true)).toBeLessThan(fall(false) - 0.1);
    });

    it('cancels a jump the same swipe started', () => {
      const game = createGame();
      tap(game, OPTIONS);
      step(game, 0.05, WIDTH, OPTIONS);
      expect(game.jumpHeight).toBeGreaterThan(0);
      duck(game, true, true);
      expect(game.jumpHeight).toBe(0);
      expect(isDucking(game)).toBe(true);
    });
  });

  describe('birds', () => {
    it('a middle bird hits a standing dinosaur but not a ducking one', () => {
      expect(pass(facing({ kind: 'bird', y: BIRD_Y.middle }))).toBe('over');
      const game = facing({ kind: 'bird', y: BIRD_Y.middle });
      duck(game, true);
      expect(pass(game)).toBe('running');
    });

    it('a low bird hits a ducking dinosaur and has to be jumped', () => {
      const ducking = facing({ kind: 'bird', y: BIRD_Y.low });
      duck(ducking, true);
      expect(pass(ducking)).toBe('over');
      const jumping = facing({ kind: 'bird', y: BIRD_Y.low }, 80);
      tap(jumping, OPTIONS);
      expect(pass(jumping)).toBe('running');
    });

    it('a high bird flies over a running dinosaur but catches a jumping one', () => {
      expect(pass(facing({ kind: 'bird', y: BIRD_Y.high }))).toBe('running');
      const game = facing({ kind: 'bird', y: BIRD_Y.high }, 40);
      tap(game, OPTIONS);
      expect(pass(game)).toBe('over');
    });

    it('only show up once the game is fast, at all three heights', () => {
      const previous: Obstacle = { kind: 'hurdle', count: 1, distance: 0 };
      const random = seeded(9);
      const slow = Array.from({ length: 200 }, () =>
        nextObstacle(previous, 300, 400, random)
      );
      expect(slow.some((o) => o.kind === 'bird')).toBe(false);
      const fast = Array.from({ length: 400 }, () =>
        nextObstacle(previous, 500, 600, random)
      );
      const heights = new Set(
        fast.flatMap((o) => (o.kind === 'bird' ? [o.y] : []))
      );
      expect([...heights].sort()).toEqual(
        [BIRD_Y.low, BIRD_Y.middle, BIRD_Y.high].sort()
      );
    });
  });

  it('sends hurdles in pairs and threes as the game speeds up', () => {
    const previous: Obstacle = { kind: 'hurdle', count: 1, distance: 0 };
    const sizes = (speed: number) => {
      const random = seeded(4);
      return new Set(
        Array.from({ length: 200 }, () =>
          nextObstacle(previous, speed, 360, random)
        ).map((o) => (o.kind === 'hurdle' ? o.count : 0))
      );
    };
    expect([...sizes(200)]).toEqual([1]);
    expect([...sizes(300)].sort()).toEqual([1, 2]);
    expect([...sizes(500)].sort()).toEqual([1, 2, 3]);
  });

  it('turns night for 12 seconds every 700 points', () => {
    const game = createGame();
    tap(game, OPTIONS);
    game.obstacles = [{ kind: 'hurdle', count: 1, distance: 1e9 }];
    game.score = 699.9;
    step(game, FRAME, WIDTH, OPTIONS);
    expect(isNight(game)).toBe(true);
    for (let t = 0; t < 11.9; t += 0.1) step(game, 0.1, WIDTH, OPTIONS);
    expect(isNight(game)).toBe(true);
    step(game, 0.2, WIDTH, OPTIONS);
    expect(isNight(game)).toBe(false);
  });
});
