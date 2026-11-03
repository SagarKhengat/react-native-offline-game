// Renders docs/demo.gif from the real game engine and sprite sheet: an
// auto-played run that jumps hurdles, ducks under birds, then crashes. It
// starts at the speed where birds appear, so they show up in a short clip. Needs the built
// library (npm run prepare) and ffmpeg on the PATH.
// Run with: node scripts/render-demo.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import * as engine from '../lib/module/engine.js';
import { FRAMES, SHEET } from '../lib/module/sprites.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const WIDTH = 600;
const HEIGHT = engine.SCENE_HEIGHT;
const SCALE = 2;
const FPS = 15;
const RUN_SECONDS = 10;
const HOLD_SECONDS = 1.6;
const TEXT = [83, 83, 83];

const sheet = PNG.sync.read(
  Buffer.from(SHEET.uri.slice(SHEET.uri.indexOf(',') + 1), 'base64')
);

// 5x7 pixel font for the score and GAME OVER.
const FONT = {
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
};
const DOT = 2;
const ADVANCE = 6 * DOT;

function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function frame(game) {
  const out = new PNG({ width: WIDTH * SCALE, height: HEIGHT * SCALE });
  out.data.fill(255);
  const blend = (x, y, [r, g, b], alpha) => {
    for (let dy = 0; dy < SCALE; dy++) {
      for (let dx = 0; dx < SCALE; dx++) {
        const px = Math.round(x) * SCALE + dx;
        const py = Math.round(y) * SCALE + dy;
        if (px < 0 || py < 0 || px >= out.width || py >= out.height) continue;
        const i = (py * out.width + px) * 4;
        out.data[i] += (r - out.data[i]) * alpha;
        out.data[i + 1] += (g - out.data[i + 1]) * alpha;
        out.data[i + 2] += (b - out.data[i + 2]) * alpha;
      }
    }
  };
  const sprite = (name, left, top) => {
    const f = FRAMES[name];
    for (let y = 0; y < f.height; y++) {
      for (let x = 0; x < f.width; x++) {
        const i = ((f.y + y) * sheet.width + f.x + x) * 4;
        const a = sheet.data[i + 3] / 255;
        if (a > 0) blend(left + x, top + y, sheet.data.slice(i, i + 3), a);
      }
    }
  };
  const text = (string, right, top) => {
    let x = right - string.length * ADVANCE;
    for (const ch of string) {
      FONT[ch].forEach((row, y) =>
        [...row].forEach((dot, dx) => {
          if (dot === '#') {
            for (let a = 0; a < DOT; a++)
              for (let b = 0; b < DOT; b++)
                blend(x + dx * DOT + a, top + y * DOT + b, TEXT, 1);
          }
        })
      );
      x += ADVANCE;
    }
  };

  for (const cloud of game.clouds) sprite('cloud', cloud.x, cloud.y);
  for (let x = -game.groundOffset; x < WIDTH; x += engine.GROUND_TILE_WIDTH) {
    sprite('ground', x, engine.GROUND_Y);
  }
  for (const obstacle of game.obstacles) {
    const x = engine.obstacleX(game, obstacle, WIDTH);
    if (x >= WIDTH) continue;
    if (obstacle.kind === 'bird') {
      sprite(engine.birdFrame(game) === 0 ? 'bird1' : 'bird2', x, obstacle.y);
    } else {
      for (let i = 0; i < obstacle.count; i++) {
        sprite('obstacle', x + i * engine.OBSTACLE_WIDTH, engine.OBSTACLE_Y);
      }
    }
  }
  const poses = {
    stand: 'dino',
    left: 'dinoLeft',
    right: 'dinoRight',
    duckLeft: 'dinoDuck1',
    duckRight: 'dinoDuck2',
    dead: 'dinoDead',
  };
  const pose = engine.playerPose(game);
  const ducked = pose.startsWith('duck');
  sprite(
    poses[pose],
    engine.PLAYER_X,
    ducked ? engine.FEET_Y - engine.DUCK_HEIGHT : engine.PLAYER_Y - game.jumpHeight
  );

  const pad = (n) => String(n).padStart(5, '0');
  const shown = engine.shownScore(game);
  text(
    `HI ${pad(Math.floor(game.highScore))}  ${shown === null ? '     ' : pad(shown)}`,
    WIDTH - 16,
    8
  );
  if (game.status === 'over') text('GAME OVER', WIDTH / 2 + 4.5 * ADVANCE, 40);
  return PNG.sync.write(out);
}

const options = { skySpeed: 40, groundSpeed: 520 };
const random = seeded(Number(process.env.SEED ?? 8));
const game = engine.createGame(412);
engine.seedClouds(game, WIDTH, random);
engine.tap(game, options);

const dir = mkdtempSync(join(tmpdir(), 'dino-demo-'));
const seen = new Map();
let n = 0;
const dt = 1 / FPS;
const substeps = 4;
for (let t = 0; t < RUN_SECONDS && game.status === 'running'; t += dt) {
  for (let s = 0; s < substeps && game.status === 'running'; s++) {
    // Jump hurdles and low birds, duck under middle birds, ignore high
    // ones, until the last second or so.
    const speed = engine.currentSpeed(game, WIDTH);
    const next = game.obstacles
      .map((o) => ({ o, x: engine.obstacleX(game, o, WIDTH) }))
      .find(({ o, x }) => x + engine.obstacleWidth(o) > engine.PLAYER_X + 4);
    const reacting = t < RUN_SECONDS - 1.2;
    if (reacting && next !== undefined) {
      const arrivesIn = (next.x - (engine.PLAYER_X + 34)) / speed;
      if (next.o.kind === 'bird' && next.o.y === engine.BIRD_Y.middle) {
        if (arrivesIn <= 0.2) engine.duck(game, true);
      } else if (!(next.o.kind === 'bird' && next.o.y === engine.BIRD_Y.high)) {
        if (game.ducking) engine.duck(game, false);
        if (arrivesIn <= 0.12) engine.tap(game, options);
      }
    } else if (game.ducking) {
      engine.duck(game, false);
    }
    engine.step(game, dt / substeps, WIDTH, options, random);
  }
  for (const o of game.obstacles) seen.set(o.distance, o);
  writeFileSync(join(dir, `f${String(n++).padStart(4, '0')}.png`), frame(game));
}
for (let i = 0; i < HOLD_SECONDS * FPS; i++) {
  writeFileSync(join(dir, `f${String(n++).padStart(4, '0')}.png`), frame(game));
}

const gif = join(root, 'docs', 'demo.gif');
execFileSync('ffmpeg', [
  '-v', 'error', '-y', '-framerate', String(FPS),
  '-i', join(dir, 'f%04d.png'),
  '-vf', 'split[a][b];[a]palettegen=max_colors=8:stats_mode=full[p];[b][p]paletteuse=dither=none:diff_mode=rectangle',
  '-loop', '0', gif,
]);
rmSync(dir, { recursive: true });
const kinds = [...seen.values()].map((o) =>
  o.kind === 'bird' ? `bird@${o.y}` : `hurdle x${o.count}`
);
console.log(`${gif}: ${n} frames, run ended ${game.status}, score ${Math.floor(game.score)}`);
console.log(`obstacles: ${kinds.join(', ')}`);
