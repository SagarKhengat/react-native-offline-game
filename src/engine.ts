/**
 * Game logic for the dinosaur runner, kept free of React Native so it can be
 * unit tested. Positions are in layout points inside a strip SCENE_HEIGHT tall,
 * with y growing downwards; the strip's width comes from the container.
 * Speeds are points per second and times are seconds.
 */

export const SCENE_HEIGHT = 120;

export const SKY_TILE_WIDTH = 680;
export const SKY_TILE_HEIGHT = 44;
export const SKY_Y = 0;

export const GROUND_TILE_WIDTH = 1360;
export const GROUND_TILE_HEIGHT = 44;
export const GROUND_Y = 76;

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

const JUMP_HEIGHT = 55;
const JUMP_RISE_TIME = 0.4;
const GRAVITY = (2 * JUMP_HEIGHT) / JUMP_RISE_TIME ** 2;
const JUMP_VELOCITY = GRAVITY * JUMP_RISE_TIME;
export const AIR_TIME = 2 * JUMP_RISE_TIME;

const SCORE_PER_SECOND = 30;
// Every 100 points adds 1 pt/s of ground speed, up to this much.
const MAX_SPEED_BONUS = 200;
const RUN_FRAME_TIME = 0.13;

// The first hurdle scrolls in after this long.
const FIRST_OBSTACLE_TIME = 1;
// Gaps between hurdles, in seconds of running: always long enough to land
// from one jump and react before the next hurdle arrives.
const MIN_GAP_TIME = AIR_TIME + 0.4;
const GAP_TIME_RANGE = 1.2;

export type GameStatus = 'idle' | 'running' | 'paused' | 'over';

export type PlayerPose = 'stand' | 'left' | 'right' | 'dead';

export type GameOptions = {
  /** Cloud speed in points per second. */
  skySpeed: number;
  /** Starting ground speed in points per second. */
  groundSpeed: number;
};

export type GameState = {
  status: GameStatus;
  score: number;
  highScore: number;
  /** Ground travelled since the run started. */
  distance: number;
  skyOffset: number;
  groundOffset: number;
  jumpHeight: number;
  jumpVelocity: number;
  /**
   * For each hurdle, the distance at which its left edge enters the scene at
   * the right-hand side. Sorted ascending; the last one is still off screen.
   */
  obstacles: number[];
  /** Running time, drives the leg animation. */
  runTime: number;
};

export type Random = () => number;

export function createGame(highScore = 0): GameState {
  return {
    status: 'idle',
    score: 0,
    highScore,
    distance: 0,
    skyOffset: 0,
    groundOffset: 0,
    jumpHeight: 0,
    jumpVelocity: 0,
    obstacles: [],
    runTime: 0,
  };
}

export function currentSpeed(state: GameState, options: GameOptions): number {
  const bonus = Math.min(MAX_SPEED_BONUS, Math.floor(state.score / 100));
  return options.groundSpeed + bonus;
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
 * pause and starts a new run after a game over.
 */
export function tap(state: GameState, options: GameOptions): void {
  switch (state.status) {
    case 'idle':
    case 'over':
      start(state, options);
      jump(state);
      break;
    case 'running':
      jump(state);
      break;
    case 'paused':
      state.status = 'running';
      break;
  }
}

export function pause(state: GameState): void {
  if (state.status === 'running') {
    state.status = 'paused';
  }
}

function start(state: GameState, options: GameOptions): void {
  state.status = 'running';
  state.score = 0;
  state.distance = 0;
  state.jumpHeight = 0;
  state.jumpVelocity = 0;
  state.runTime = 0;
  state.obstacles = [options.groundSpeed * FIRST_OBSTACLE_TIME];
}

function jump(state: GameState): void {
  if (state.jumpHeight === 0) {
    state.jumpVelocity = JUMP_VELOCITY;
  }
}

/** Advances a running game by `dt` seconds. */
export function step(
  state: GameState,
  dt: number,
  width: number,
  options: GameOptions,
  random: Random = Math.random
): void {
  if (state.status !== 'running') {
    return;
  }

  const speed = currentSpeed(state, options);
  state.distance += speed * dt;
  state.groundOffset = (state.groundOffset + speed * dt) % GROUND_TILE_WIDTH;
  state.skyOffset = (state.skyOffset + options.skySpeed * dt) % SKY_TILE_WIDTH;
  state.runTime += dt;
  state.score += SCORE_PER_SECOND * dt;
  if (state.score > state.highScore) {
    state.highScore = state.score;
  }

  if (state.jumpVelocity !== 0 || state.jumpHeight > 0) {
    state.jumpHeight += state.jumpVelocity * dt - (GRAVITY * dt * dt) / 2;
    state.jumpVelocity -= GRAVITY * dt;
    if (state.jumpHeight <= 0) {
      state.jumpHeight = 0;
      state.jumpVelocity = 0;
    }
  }

  const last = state.obstacles[state.obstacles.length - 1];
  if (last === undefined || state.distance >= last) {
    state.obstacles.push((last ?? state.distance) + nextGap(speed, random));
  }
  const first = state.obstacles[0];
  if (first !== undefined && state.distance - first > width + OBSTACLE_WIDTH) {
    state.obstacles.shift();
  }

  if (hitsObstacle(state, width)) {
    state.status = 'over';
    state.jumpVelocity = 0;
  }
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
