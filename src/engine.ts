/**
 * Game logic for the dinosaur runner, kept free of React Native so it can be
 * unit tested. Positions are in layout points inside a strip SCENE_HEIGHT tall,
 * with y growing downwards; the strip's width comes from the container.
 * Speeds are points per second and times are seconds.
 */

export const SCENE_HEIGHT = 120;

export const GROUND_TILE_WIDTH = 1360;
export const GROUND_TILE_HEIGHT = 9;
export const GROUND_Y = 96;

export const CLOUD_WIDTH = 46;
export const CLOUD_HEIGHT = 13;
const CLOUD_MIN_Y = 4;
const CLOUD_MAX_Y = 44;
const CLOUD_MIN_GAP = 100;
const CLOUD_MAX_GAP = 400;

export const PLAYER_X = 80;
export const PLAYER_Y = 64;
export const PLAYER_WIDTH = 40;
export const PLAYER_HEIGHT = 44;

export const OBSTACLE_Y = 84;
export const OBSTACLE_WIDTH = 25;
export const OBSTACLE_HEIGHT = 23;

// Insets that shrink each sprite's box to the drawn pixels, so a hit only
// counts when the dinosaur visibly touches the hurdle.
const PLAYER_HITBOX = { left: 10, right: 4, bottom: 4 };
const OBSTACLE_HITBOX = { left: 2, right: 2, top: 2 };

// A quick, high hop like Chrome's: about 0.56 s in the air.
const JUMP_HEIGHT = 62;
const JUMP_RISE_TIME = 0.28;
const GRAVITY = (2 * JUMP_HEIGHT) / JUMP_RISE_TIME ** 2;
const JUMP_VELOCITY = GRAVITY * JUMP_RISE_TIME;
export const AIR_TIME = 2 * JUMP_RISE_TIME;

// Like Chrome, the ground speeds up steadily from the starting speed to
// MAX_SPEED, and runs slower on screens narrower than its 600-point canvas.
export const MAX_SPEED = 780;
const ACCELERATION = 3.6;
const REFERENCE_WIDTH = 600;
const NARROW_SPEED_FACTOR = 1.2;

// Score per point of ground covered.
const SCORE_PER_POINT = 0.025;
const RUN_FRAME_TIME = 1 / 12;

// Like Chrome, the score blinks for a moment at every 100 points.
const MILESTONE = 100;
const FLASH_TIME = 0.75;
const FLASH_BLINK = 0.125;

// The first hurdle scrolls in after this long.
const FIRST_OBSTACLE_TIME = 2;
// Gaps between hurdles, in seconds of running: always long enough to land
// from one jump and react before the next hurdle arrives.
const MIN_GAP_TIME = AIR_TIME + 0.25;
const GAP_TIME_RANGE = 0.6;

export type GameStatus = 'idle' | 'running' | 'paused' | 'over';

export type PlayerPose = 'stand' | 'left' | 'right' | 'dead';

/** Moments that play a sound: a jump, a crash, and every 100 points. */
export type GameSound = 'jump' | 'hit' | 'score';

export type Cloud = { x: number; y: number };

export type GameOptions = {
  /** Cloud speed in points per second. */
  skySpeed: number;
  /**
   * Starting ground speed in points per second on a game 600 points wide or
   * more. Narrower games run proportionally slower.
   */
  groundSpeed: number;
};

export type GameState = {
  status: GameStatus;
  /** Ground speed before adjusting for the game's width. */
  speed: number;
  score: number;
  highScore: number;
  /** Ground travelled since the run started. */
  distance: number;
  groundOffset: number;
  /** Left to right; the last one is the most recent to scroll in. */
  clouds: Cloud[];
  /** How far the last cloud must move in before the next one appears. */
  cloudGap: number;
  jumpHeight: number;
  jumpVelocity: number;
  /**
   * For each hurdle, the distance at which its left edge enters the scene at
   * the right-hand side. Sorted ascending; the last one is still off screen.
   */
  obstacles: number[];
  /** Running time, drives the leg animation. */
  runTime: number;
  /** Time left of the milestone flash. */
  flashTime: number;
};

export type Random = () => number;

export function createGame(highScore = 0): GameState {
  return {
    status: 'idle',
    speed: 0,
    score: 0,
    highScore,
    distance: 0,
    groundOffset: 0,
    clouds: [],
    cloudGap: 0,
    jumpHeight: 0,
    jumpVelocity: 0,
    obstacles: [],
    runTime: 0,
    flashTime: 0,
  };
}

/** Scatters the first clouds across the sky once the width is known. */
export function seedClouds(
  state: GameState,
  width: number,
  random: Random = Math.random
): void {
  if (state.clouds.length > 0) {
    return;
  }
  for (let x = random() * CLOUD_MIN_GAP; x < width; x += cloudGap(random)) {
    state.clouds.push({ x, y: cloudY(random) });
  }
  state.cloudGap = cloudGap(random);
}

function cloudGap(random: Random): number {
  return CLOUD_MIN_GAP + random() * (CLOUD_MAX_GAP - CLOUD_MIN_GAP);
}

function cloudY(random: Random): number {
  return Math.round(CLOUD_MIN_Y + random() * (CLOUD_MAX_Y - CLOUD_MIN_Y));
}

/** Ground speed in points per second for a game `width` points wide. */
export function currentSpeed(state: GameState, width: number): number {
  return (
    state.speed * Math.min(1, (width / REFERENCE_WIDTH) * NARROW_SPEED_FACTOR)
  );
}

export function nextGap(speed: number, random: Random): number {
  return speed * (MIN_GAP_TIME + random() * GAP_TIME_RANGE);
}

/** Left edge of a hurdle in scene coordinates. */
export function obstacleX(
  state: GameState,
  obstacle: number,
  width: number
): number {
  return width - (state.distance - obstacle);
}

/**
 * Handles a tap: starts the first run, jumps while running, resumes after a
 * pause and starts a new run after a game over. Returns 'jump' if the
 * dinosaur took off.
 */
export function tap(
  state: GameState,
  options: GameOptions
): GameSound | undefined {
  switch (state.status) {
    case 'idle':
    case 'over':
      start(state, options);
      return jump(state);
    case 'running':
      return jump(state);
    case 'paused':
      state.status = 'running';
      return undefined;
  }
}

export function pause(state: GameState): void {
  if (state.status === 'running') {
    state.status = 'paused';
  }
}

function start(state: GameState, options: GameOptions): void {
  state.status = 'running';
  state.speed = options.groundSpeed;
  state.score = 0;
  state.distance = 0;
  state.jumpHeight = 0;
  state.jumpVelocity = 0;
  state.runTime = 0;
  state.obstacles = [];
  state.flashTime = 0;
}

function jump(state: GameState): GameSound | undefined {
  if (state.jumpHeight !== 0 || state.jumpVelocity > 0) {
    return undefined;
  }
  state.jumpVelocity = JUMP_VELOCITY;
  return 'jump';
}

/**
 * Advances a running game by `dt` seconds. Returns 'hit' when the dinosaur
 * crashes and 'score' when it passes a multiple of 100 points.
 */
export function step(
  state: GameState,
  dt: number,
  width: number,
  options: GameOptions,
  random: Random = Math.random
): GameSound | undefined {
  if (state.status !== 'running' || dt <= 0) {
    return undefined;
  }

  const speed = currentSpeed(state, width);
  state.distance += speed * dt;
  state.groundOffset = (state.groundOffset + speed * dt) % GROUND_TILE_WIDTH;
  moveClouds(state, options.skySpeed * dt, width, random);
  state.runTime += dt;
  const milestone = Math.floor(state.score / MILESTONE);
  state.score += speed * dt * SCORE_PER_POINT;
  let sound: GameSound | undefined;
  if (Math.floor(state.score / MILESTONE) > milestone) {
    state.flashTime = FLASH_TIME;
    sound = 'score';
  } else {
    state.flashTime = Math.max(0, state.flashTime - dt);
  }
  state.speed = Math.min(
    Math.max(MAX_SPEED, options.groundSpeed),
    state.speed + ACCELERATION * dt
  );
  if (state.score > state.highScore) {
    state.highScore = state.score;
  }

  if (state.jumpVelocity !== 0 || state.jumpHeight > 0) {
    state.jumpHeight += state.jumpVelocity * dt - (GRAVITY * dt * dt) / 2;
    state.jumpVelocity -= GRAVITY * dt;
    if (state.jumpHeight <= 0 && state.jumpVelocity < 0) {
      state.jumpHeight = 0;
      state.jumpVelocity = 0;
    }
  }

  const last = state.obstacles[state.obstacles.length - 1];
  if (last === undefined) {
    state.obstacles.push(speed * FIRST_OBSTACLE_TIME);
  } else if (state.distance >= last) {
    state.obstacles.push(last + nextGap(speed, random));
  }
  const first = state.obstacles[0];
  if (first !== undefined && state.distance - first > width + OBSTACLE_WIDTH) {
    state.obstacles.shift();
  }

  if (hitsObstacle(state, width)) {
    state.status = 'over';
    state.jumpVelocity = 0;
    state.flashTime = 0;
    return 'hit';
  }
  return sound;
}

function moveClouds(
  state: GameState,
  distance: number,
  width: number,
  random: Random
): void {
  for (const cloud of state.clouds) {
    cloud.x -= distance;
  }
  const first = state.clouds[0];
  if (first !== undefined && first.x + CLOUD_WIDTH < 0) {
    state.clouds.shift();
  }
  const last = state.clouds[state.clouds.length - 1];
  if (last === undefined || last.x < width - state.cloudGap) {
    state.clouds.push({ x: width, y: cloudY(random) });
    state.cloudGap = cloudGap(random);
  }
}

/**
 * The score to show: the run's score, or during a milestone flash the
 * milestone itself, with null while it blinks off.
 */
export function shownScore(state: GameState): number | null {
  if (state.flashTime > 0) {
    const blink = Math.floor((FLASH_TIME - state.flashTime) / FLASH_BLINK);
    return blink % 2 === 0
      ? null
      : Math.floor(state.score / MILESTONE) * MILESTONE;
  }
  return Math.floor(state.score);
}

function hitsObstacle(state: GameState, width: number): boolean {
  const playerLeft = PLAYER_X + PLAYER_HITBOX.left;
  const playerRight = PLAYER_X + PLAYER_WIDTH - PLAYER_HITBOX.right;
  const playerBottom =
    PLAYER_Y - state.jumpHeight + PLAYER_HEIGHT - PLAYER_HITBOX.bottom;
  const obstacleTop = OBSTACLE_Y + OBSTACLE_HITBOX.top;

  for (const obstacle of state.obstacles) {
    const x = obstacleX(state, obstacle, width);
    if (x >= width) {
      break;
    }
    if (
      playerRight > x + OBSTACLE_HITBOX.left &&
      playerLeft < x + OBSTACLE_WIDTH - OBSTACLE_HITBOX.right &&
      playerBottom > obstacleTop
    ) {
      return true;
    }
  }
  return false;
}

export function playerPose(state: GameState): PlayerPose {
  if (state.status === 'over') {
    return 'dead';
  }
  if (state.status !== 'running' || state.jumpHeight > 0) {
    return 'stand';
  }
  return Math.floor(state.runTime / RUN_FRAME_TIME) % 2 === 0
    ? 'left'
    : 'right';
}
