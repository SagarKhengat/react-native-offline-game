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
/** Where the dinosaur's feet touch the ground. */
export const FEET_Y = PLAYER_Y + PLAYER_HEIGHT;
export const DUCK_WIDTH = 59;
export const DUCK_HEIGHT = 30;

export const OBSTACLE_Y = 84;
export const OBSTACLE_WIDTH = 25;
export const OBSTACLE_HEIGHT = 23;

export const BIRD_WIDTH = 46;
export const BIRD_HEIGHT = 40;
/**
 * Top of a bird's frame at each height: a low bird has to be jumped, a
 * middle one ducked under, and a high one flies over a running dinosaur but
 * catches a jumping one.
 */
export const BIRD_Y = { low: 62, middle: 46, high: 20 } as const;

type Box = { left: number; right: number; top: number; bottom: number };

// A quick, high hop like Chrome's: about 0.56 s in the air when the finger
// stays down. Letting go early, once it's at least MIN_JUMP_HEIGHT up, cuts
// the climb short for a lower hop.
const JUMP_HEIGHT = 62;
const JUMP_RISE_TIME = 0.28;
const GRAVITY = (2 * JUMP_HEIGHT) / JUMP_RISE_TIME ** 2;
const JUMP_VELOCITY = GRAVITY * JUMP_RISE_TIME;
export const AIR_TIME = 2 * JUMP_RISE_TIME;
const MIN_JUMP_HEIGHT = 30;
const SHORT_JUMP_VELOCITY = 150;
// Ducking in mid-air drops the dinosaur this many times faster.
const DROP_GRAVITY_FACTOR = 3;

// Like Chrome, the ground speeds up steadily from the starting speed to
// MAX_SPEED, and runs slower on screens narrower than its 600-point canvas.
export const MAX_SPEED = 780;
const ACCELERATION = 3.6;
const REFERENCE_WIDTH = 600;
const NARROW_SPEED_FACTOR = 1.2;

// Score per point of ground covered.
const SCORE_PER_POINT = 0.025;
const RUN_FRAME_TIME = 1 / 12;
const BIRD_FRAME_TIME = 1 / 6;

// Like Chrome, the score blinks for a moment at every 100 points.
const MILESTONE = 100;
const FLASH_TIME = 0.75;
const FLASH_BLINK = 0.125;

// And every 700 points it turns night for a while.
const NIGHT_EVERY = 700;
const NIGHT_TIME = 12;

// The first hurdle scrolls in after this long.
const FIRST_OBSTACLE_TIME = 2;
// Gaps between obstacles, in seconds of running: always long enough to land
// from one jump and react before the next obstacle arrives.
const MIN_GAP_TIME = AIR_TIME + 0.25;
const GAP_TIME_RANGE = 0.6;
// Ground speeds (on screen) from which hurdles come in pairs and threes, and
// the starting-speed equivalent from which birds appear.
const PAIR_SPEED = 250;
const TRIPLE_SPEED = 420;
const BIRD_SPEED = 510;
const BIRD_CHANCE = 0.25;

export type GameStatus = 'idle' | 'running' | 'paused' | 'over';

export type PlayerPose =
  | 'stand'
  | 'left'
  | 'right'
  | 'duckLeft'
  | 'duckRight'
  | 'dead';

/** Moments that play a sound: a jump, a crash, and every 100 points. */
export type GameSound = 'jump' | 'hit' | 'score';

export type Cloud = { x: number; y: number };

export type Obstacle =
  | {
      kind: 'hurdle';
      /**
       * The distance at which its left edge enters the scene at the
       * right-hand side.
       */
      distance: number;
      /** Hurdles side by side. */
      count: 1 | 2 | 3;
    }
  | {
      kind: 'bird';
      distance: number;
      /** Top of the bird's frame, one of BIRD_Y. */
      y: number;
    };

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
  /** The jump button is still down, so the jump goes to full height. */
  jumpHeld: boolean;
  /** The duck button is down. */
  ducking: boolean;
  /** Falling fast because duck was pressed in mid-air. */
  dropping: boolean;
  /** Sorted by distance; the last one is still off screen. */
  obstacles: Obstacle[];
  /** Running time, drives the leg and wing animations. */
  runTime: number;
  /** Time left of the milestone flash. */
  flashTime: number;
  /** Time left of the night. */
  nightTime: number;
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
    jumpHeld: false,
    ducking: false,
    dropping: false,
    obstacles: [],
    runTime: 0,
    flashTime: 0,
    nightTime: 0,
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

export function obstacleWidth(obstacle: Obstacle): number {
  return obstacle.kind === 'bird'
    ? BIRD_WIDTH
    : obstacle.count * OBSTACLE_WIDTH;
}

/** Left edge of an obstacle in scene coordinates. */
export function obstacleX(
  state: GameState,
  obstacle: Obstacle,
  width: number
): number {
  return width - (state.distance - obstacle.distance);
}

/** Picks the obstacle that follows `previous`. */
export function nextObstacle(
  previous: Obstacle,
  speed: number,
  baseSpeed: number,
  random: Random
): Obstacle {
  const distance =
    previous.distance +
    obstacleWidth(previous) +
    speed * (MIN_GAP_TIME + random() * GAP_TIME_RANGE);
  if (baseSpeed >= BIRD_SPEED && random() < BIRD_CHANCE) {
    const heights = [BIRD_Y.low, BIRD_Y.middle, BIRD_Y.high];
    const y = heights[Math.floor(random() * heights.length)] ?? BIRD_Y.low;
    return { kind: 'bird', distance, y };
  }
  const largest = speed >= TRIPLE_SPEED ? 3 : speed >= PAIR_SPEED ? 2 : 1;
  const count = (1 + Math.floor(random() * largest)) as 1 | 2 | 3;
  return { kind: 'hurdle', distance, count };
}

/**
 * Handles a press of the jump control (tap, click, Space): starts the first
 * run, jumps while running, resumes after a pause and starts a new run after
 * a game over. Returns 'jump' if the dinosaur took off.
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

/** The jump control was let go: a jump still climbing becomes a short hop. */
export function release(state: GameState): void {
  state.jumpHeld = false;
}

/**
 * The duck control went down or up. Down on the ground crouches; down in
 * mid-air drops fast and crouches on landing. `cancelTakeoff` undoes a jump
 * that the same touch started a moment ago, for a swipe down that began as a
 * tap.
 */
export function duck(
  state: GameState,
  down: boolean,
  cancelTakeoff = false
): void {
  state.ducking = down;
  if (!down || state.status !== 'running' || !isAirborne(state)) {
    return;
  }
  if (cancelTakeoff && state.jumpVelocity > 0) {
    state.jumpHeight = 0;
    state.jumpVelocity = 0;
  } else {
    state.dropping = true;
    state.jumpVelocity = Math.min(state.jumpVelocity, 0);
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
  state.dropping = false;
  state.runTime = 0;
  state.obstacles = [];
  state.flashTime = 0;
  state.nightTime = 0;
}

function isAirborne(state: GameState): boolean {
  return state.jumpHeight > 0 || state.jumpVelocity !== 0;
}

function jump(state: GameState): GameSound | undefined {
  if (isAirborne(state) || state.ducking) {
    return undefined;
  }
  state.jumpVelocity = JUMP_VELOCITY;
  state.jumpHeld = true;
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

  const before = state.score;
  state.score += speed * dt * SCORE_PER_POINT;
  let sound: GameSound | undefined;
  if (Math.floor(state.score / MILESTONE) > Math.floor(before / MILESTONE)) {
    state.flashTime = FLASH_TIME;
    sound = 'score';
  } else {
    state.flashTime = Math.max(0, state.flashTime - dt);
  }
  if (Math.floor(state.score / NIGHT_EVERY) > Math.floor(before / NIGHT_EVERY)) {
    state.nightTime = NIGHT_TIME;
  } else {
    state.nightTime = Math.max(0, state.nightTime - dt);
  }
  state.speed = Math.min(
    Math.max(MAX_SPEED, options.groundSpeed),
    state.speed + ACCELERATION * dt
  );
  if (state.score > state.highScore) {
    state.highScore = state.score;
  }

  if (isAirborne(state)) {
    if (
      !state.jumpHeld &&
      state.jumpHeight >= MIN_JUMP_HEIGHT &&
      state.jumpVelocity > SHORT_JUMP_VELOCITY
    ) {
      state.jumpVelocity = SHORT_JUMP_VELOCITY;
    }
    const gravity = state.dropping ? GRAVITY * DROP_GRAVITY_FACTOR : GRAVITY;
    state.jumpHeight += state.jumpVelocity * dt - (gravity * dt * dt) / 2;
    state.jumpVelocity -= gravity * dt;
    if (state.jumpHeight <= 0 && state.jumpVelocity < 0) {
      state.jumpHeight = 0;
      state.jumpVelocity = 0;
      state.dropping = false;
    }
  }

  const last = state.obstacles[state.obstacles.length - 1];
  if (last === undefined) {
    state.obstacles.push({
      kind: 'hurdle',
      distance: speed * FIRST_OBSTACLE_TIME,
      count: 1,
    });
  } else if (state.distance >= last.distance) {
    state.obstacles.push(nextObstacle(last, speed, state.speed, random));
  }
  const first = state.obstacles[0];
  if (
    first !== undefined &&
    state.distance - first.distance > width + obstacleWidth(first)
  ) {
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

export function isDucking(state: GameState): boolean {
  return state.ducking && !isAirborne(state) && state.status !== 'over';
}

// Boxes shrunk to each sprite's drawn pixels, so a hit only counts when the
// dinosaur visibly touches something.
function playerBox(state: GameState): Box {
  if (isDucking(state)) {
    return {
      left: PLAYER_X + 4,
      right: PLAYER_X + DUCK_WIDTH - 4,
      top: FEET_Y - DUCK_HEIGHT + 3,
      bottom: FEET_Y - 4,
    };
  }
  return {
    left: PLAYER_X + 10,
    right: PLAYER_X + PLAYER_WIDTH - 4,
    top: PLAYER_Y + 2 - state.jumpHeight,
    bottom: FEET_Y - 4 - state.jumpHeight,
  };
}

function obstacleBox(obstacle: Obstacle, x: number): Box {
  if (obstacle.kind === 'bird') {
    return {
      left: x + 4,
      right: x + BIRD_WIDTH - 4,
      top: obstacle.y + 12,
      bottom: obstacle.y + 28,
    };
  }
  return {
    left: x + 2,
    right: x + obstacleWidth(obstacle) - 2,
    top: OBSTACLE_Y + 2,
    bottom: OBSTACLE_Y + OBSTACLE_HEIGHT,
  };
}

function hitsObstacle(state: GameState, width: number): boolean {
  const player = playerBox(state);
  for (const obstacle of state.obstacles) {
    const x = obstacleX(state, obstacle, width);
    if (x >= width) {
      break;
    }
    const box = obstacleBox(obstacle, x);
    if (
      player.right > box.left &&
      player.left < box.right &&
      player.bottom > box.top &&
      player.top < box.bottom
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
  const legs = Math.floor(state.runTime / RUN_FRAME_TIME) % 2 === 0;
  if (isDucking(state)) {
    return legs ? 'duckLeft' : 'duckRight';
  }
  if (state.status !== 'running' || isAirborne(state)) {
    return 'stand';
  }
  return legs ? 'left' : 'right';
}

/** Which of the two wing frames birds show. */
export function birdFrame(state: GameState): 0 | 1 {
  return Math.floor(state.runTime / BIRD_FRAME_TIME) % 2 === 0 ? 0 : 1;
}

export function isNight(state: GameState): boolean {
  return state.nightTime > 0;
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
