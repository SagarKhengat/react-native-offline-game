import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import {
  AppState,
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useGameControls } from './controls';
import {
  DUCK_HEIGHT,
  FEET_Y,
  GROUND_TILE_WIDTH,
  GROUND_Y,
  OBSTACLE_WIDTH,
  OBSTACLE_Y,
  PLAYER_X,
  PLAYER_Y,
  SCENE_HEIGHT,
  birdFrame,
  createGame,
  duck,
  isNight,
  obstacleWidth,
  obstacleX,
  pause,
  playerPose,
  release,
  seedClouds,
  shownScore,
  step,
  tap,
  type GameSound,
  type GameStatus,
  type PlayerPose,
} from './engine';
import { playSound, retainSounds } from './sounds';
import { FRAMES, SHEET, type FrameName } from './sprites';
import {
  defaultStorage,
  loadHighScore,
  saveHighScore,
  type HighScoreStorage,
} from './storage';
import { vibrate } from './vibration';

const POSE_FRAMES: Record<PlayerPose, FrameName> = {
  stand: 'dino',
  left: 'dinoLeft',
  right: 'dinoRight',
  duckLeft: 'dinoDuck1',
  duckRight: 'dinoDuck2',
  dead: 'dinoDead',
};

// Longest step simulated in one frame, so a stalled JS thread slows the game
// down instead of teleporting the dinosaur through a hurdle.
const MAX_STEP = 1 / 20;
// Taps this soon after a crash are ignored so a late jump doesn't restart.
const RESTART_DELAY_MS = 400;
// Obstacles mount this far off screen so their image is ready when they
// scroll in.
const PRELOAD_DISTANCE = 60;

export const COLORS = {
  light: {
    background: '#ffffff',
    text: '#535353',
    sprite: undefined,
    cloud: undefined,
  },
  dark: {
    background: '#202124',
    text: '#acacac',
    sprite: '#acacac',
    cloud: '#5f6368',
  },
} as const;

export type ColorSchemeName = 'light' | 'dark' | 'auto';

/**
 * Set by OfflineGame, which handles input for the whole page itself, so the
 * game doesn't also listen.
 */
export const PageControlsContext = createContext(false);

export type DinoGameOptions = {
  /** Maximum frames per second. Default 60. */
  fps?: number;
  /** Cloud speed in points per second. Default 40. */
  skySpeed?: number;
  /**
   * Starting ground speed in points per second, default 360. It rises over
   * time to 780, and games narrower than 600 points run proportionally
   * slower, like Chrome's game on phones.
   */
  groundSpeed?: number;
};

export type DinoGameProps = {
  options?: DinoGameOptions;
  /** High score to show from the start, for example one you saved earlier. */
  highScore?: number;
  /** Called when the dinosaur hits something. */
  onGameOver?: (score: number) => void;
  /** Called with the new best score when a run beats it. */
  onHighScoreChange?: (highScore: number) => void;
  /**
   * Keep the best score between launches. Uses AsyncStorage when the app
   * has it, localStorage on the web, or `storage`. Default true.
   */
  rememberHighScore?: boolean;
  /** Where to keep the best score instead, e.g. an MMKV wrapper. */
  storage?: HighScoreStorage;
  /**
   * Beeps on jumps, crashes and every 100 points. They need
   * react-native-audio-api in the app; without it the game is silent.
   * Default true.
   */
  sounds?: boolean;
  /**
   * Called at each of those moments whether or not sounds are on, for
   * playing your own audio or haptics.
   */
  onSound?: (sound: GameSound) => void;
  /**
   * Buzz on jumps and crashes (on iOS only crashes, the only vibration iOS
   * offers without a native module). Default false.
   */
  vibration?: boolean;
  /** Default 'auto', which follows the device setting. */
  colorScheme?: ColorSchemeName;
  /** Called when the game turns night (every 700 points) and back. */
  onNightChange?: (night: boolean) => void;
  style?: StyleProp<ViewStyle>;
};

export type DinoGameHandle = {
  /** Same as tapping the game: start, jump, resume or restart. */
  tap: () => void;
  /** Same as lifting the finger: ends a jump early for a lower hop. */
  release: () => void;
  /** Duck while `down` is true. */
  duck: (down: boolean, cancelTakeoff?: boolean) => void;
  pause: () => void;
};

const DEFAULT_OPTIONS = { fps: 60, skySpeed: 40, groundSpeed: 360 };
const WEB = Platform.OS === 'web';

export const DinoGame = forwardRef<DinoGameHandle, DinoGameProps>(
  function DinoGame(
    {
      options,
      highScore = 0,
      onGameOver,
      onHighScoreChange,
      rememberHighScore = true,
      storage,
      sounds = true,
      onSound,
      vibration = false,
      colorScheme = 'auto',
      onNightChange,
      style,
    },
    ref
  ) {
    const gameRef = useRef(createGame(highScore));
    const game = gameRef.current;
    const [status, setStatus] = useState<GameStatus>(game.status);
    const [, redraw] = useReducer((n: number) => n + 1, 0);
    const [width, setWidth] = useState(0);
    const widthRef = useRef(0);
    const overAtRef = useRef(0);
    const reportedHighScoreRef = useRef(Math.floor(highScore));
    const pageControls = useContext(PageControlsContext);

    const latest = useRef({
      options,
      onGameOver,
      onHighScoreChange,
      sounds,
      onSound,
      vibration,
      onNightChange,
    });
    useEffect(() => {
      latest.current = {
        options,
        onGameOver,
        onHighScoreChange,
        sounds,
        onSound,
        vibration,
        onNightChange,
      };
    });

    const store = rememberHighScore ? storage ?? defaultStorage() : null;
    const storeRef = useRef(store);
    storeRef.current = store;

    const gameOptions = useCallback((): Required<DinoGameOptions> => {
      const { fps, skySpeed, groundSpeed } = latest.current.options ?? {};
      return {
        fps: fps ?? DEFAULT_OPTIONS.fps,
        skySpeed: skySpeed ?? DEFAULT_OPTIONS.skySpeed,
        groundSpeed: groundSpeed ?? DEFAULT_OPTIONS.groundSpeed,
      };
    }, []);

    const emit = useCallback((sound: GameSound | undefined) => {
      if (sound) {
        latest.current.onSound?.(sound);
        if (latest.current.sounds) playSound(sound);
        if (latest.current.vibration) vibrate(sound);
      }
    }, []);

    useEffect(() => (sounds ? retainSounds() : undefined), [sounds]);

    // Bring back the best score from an earlier launch. Once, on mount: the
    // game re-renders every frame, and `storage` may be a new object each
    // time.
    useEffect(() => {
      const saved = storeRef.current;
      if (!saved) {
        return undefined;
      }
      let cancelled = false;
      loadHighScore(saved).then((saved) => {
        const g = gameRef.current;
        if (!cancelled && saved > g.highScore) {
          g.highScore = saved;
          reportedHighScoreRef.current = Math.max(
            reportedHighScoreRef.current,
            saved
          );
          redraw();
        }
      });
      return () => {
        cancelled = true;
      };
    }, [rememberHighScore]);

    const reportHighScore = useCallback(() => {
      const best = Math.floor(gameRef.current.highScore);
      if (best > reportedHighScoreRef.current) {
        reportedHighScoreRef.current = best;
        if (storeRef.current) saveHighScore(storeRef.current, best);
        latest.current.onHighScoreChange?.(best);
      }
    }, []);

    useEffect(() => {
      const g = gameRef.current;
      if (highScore > g.highScore) {
        g.highScore = highScore;
        reportedHighScoreRef.current = Math.floor(highScore);
        redraw();
      }
    }, [highScore]);

    const handleTap = useCallback(() => {
      const g = gameRef.current;
      if (
        g.status === 'over' &&
        Date.now() - overAtRef.current < RESTART_DELAY_MS
      ) {
        return;
      }
      emit(tap(g, gameOptions()));
      setStatus(g.status);
      redraw();
    }, [emit, gameOptions]);

    const handleRelease = useCallback(() => {
      release(gameRef.current);
    }, []);

    const handleDuck = useCallback((down: boolean, cancelTakeoff = false) => {
      duck(gameRef.current, down, cancelTakeoff);
      redraw();
    }, []);

    const handlePause = useCallback(() => {
      pause(gameRef.current);
      setStatus(gameRef.current.status);
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        tap: handleTap,
        release: handleRelease,
        duck: handleDuck,
        pause: handlePause,
      }),
      [handleTap, handleRelease, handleDuck, handlePause]
    );

    const controls = useMemo(
      () => ({ press: handleTap, release: handleRelease, duck: handleDuck }),
      [handleTap, handleRelease, handleDuck]
    );
    // On its own on a web page, the keyboard only drives the game once it
    // has been started, so it doesn't take over Space before then.
    const input = useGameControls(
      controls,
      !pageControls && status !== 'idle'
    );

    useEffect(() => {
      const subscription = AppState.addEventListener('change', (state) => {
        if (state !== 'active') {
          handlePause();
        }
      });
      return () => subscription.remove();
    }, [handlePause]);

    useEffect(() => () => reportHighScore(), [reportHighScore]);

    useEffect(() => {
      if (status !== 'running') {
        return undefined;
      }
      let frame = 0;
      let last: number | undefined;
      const loop = (now: number) => {
        const opts = gameOptions();
        const elapsed = last === undefined ? 0 : now - last;
        if (last === undefined || elapsed >= 1000 / opts.fps - 1) {
          last = now;
          const g = gameRef.current;
          emit(
            step(g, Math.min(elapsed / 1000, MAX_STEP), widthRef.current, opts)
          );
          redraw();
          if (g.status !== 'running') {
            if (g.status === 'over') {
              overAtRef.current = Date.now();
              latest.current.onGameOver?.(Math.floor(g.score));
              reportHighScore();
            }
            setStatus(g.status);
            return;
          }
        }
        frame = requestAnimationFrame(loop);
      };
      frame = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(frame);
    }, [status, emit, gameOptions, reportHighScore]);

    const onLayout = useCallback((event: LayoutChangeEvent) => {
      const layoutWidth = event.nativeEvent.layout.width;
      widthRef.current = layoutWidth;
      seedClouds(gameRef.current, layoutWidth);
      setWidth(layoutWidth);
    }, []);

    const night = isNight(game);
    const nightRef = useRef(night);
    useEffect(() => {
      if (night !== nightRef.current) {
        nightRef.current = night;
        latest.current.onNightChange?.(night);
      }
    }, [night]);

    const systemScheme = useColorScheme();
    const base =
      colorScheme === 'auto'
        ? systemScheme === 'dark'
          ? 'dark'
          : 'light'
        : colorScheme;
    // Night swaps the colours, like Chrome's game.
    const scheme = night ? (base === 'dark' ? 'light' : 'dark') : base;
    const colors = COLORS[scheme];

    const shown = shownScore(game);
    const best = Math.floor(game.highScore);
    const scoreText =
      (best > 0 ? `HI ${pad(best)}  ` : '') +
      (status === 'idle' ? '' : shown === null ? '     ' : pad(shown));
    const pose = playerPose(game);
    const ducked = pose === 'duckLeft' || pose === 'duckRight';

    return (
      <View
        ref={pageControls ? undefined : input.ref}
        {...(pageControls ? {} : input.handlers)}
        onLayout={onLayout}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Dinosaur game"
        accessibilityHint={status === 'running' ? 'Jumps' : 'Starts the game'}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={handleTap}
        style={[
          styles.container,
          { backgroundColor: colors.background },
          // On the offline page the browser focuses the game so Space works
          // straight away; the focus ring around it would just be noise.
          pageControls && WEB && WEB_NO_OUTLINE,
          style,
        ]}
      >
        {width > 0 && (
          <>
            {game.clouds.map((cloud, i) => (
              <Sprite
                key={`cloud${i}`}
                frame="cloud"
                left={cloud.x}
                top={cloud.y}
                tint={colors.cloud}
              />
            ))}
            {tileOffsets(width, GROUND_TILE_WIDTH, game.groundOffset).map(
              (x, i) => (
                <Sprite
                  key={`ground${i}`}
                  frame="ground"
                  left={x}
                  top={GROUND_Y}
                  tint={colors.sprite}
                />
              )
            )}
            {game.obstacles.flatMap((obstacle) => {
              const x = obstacleX(game, obstacle, width);
              if (x >= width + PRELOAD_DISTANCE || x + obstacleWidth(obstacle) <= 0) {
                return [];
              }
              if (obstacle.kind === 'bird') {
                return [
                  <Sprite
                    key={obstacle.distance}
                    frame={birdFrame(game) === 0 ? 'bird1' : 'bird2'}
                    left={x}
                    top={obstacle.y}
                    tint={colors.sprite}
                  />,
                ];
              }
              return Array.from({ length: obstacle.count }, (_, i) => (
                <Sprite
                  key={`${obstacle.distance}-${i}`}
                  frame="obstacle"
                  left={x + i * OBSTACLE_WIDTH}
                  top={OBSTACLE_Y}
                  tint={colors.sprite}
                />
              ));
            })}
            <Sprite
              frame={POSE_FRAMES[pose]}
              left={PLAYER_X}
              top={ducked ? FEET_Y - DUCK_HEIGHT : PLAYER_Y - game.jumpHeight}
              tint={colors.sprite}
            />
            <Text style={[styles.score, { color: colors.text }]}>
              {scoreText}
            </Text>
            {status !== 'running' && (
              <Text style={[styles.message, { color: colors.text }]}>
                {MESSAGES[status]}
              </Text>
            )}
          </>
        )}
      </View>
    );
  }
);

/**
 * One sprite: a window the sprite's size onto the whole sheet, shifted so
 * the right part shows. Every sprite shares the one sheet image, so changing
 * a pose only moves it and never loads anything.
 */
function Sprite({
  frame,
  left,
  top,
  tint,
}: {
  frame: FrameName;
  left: number;
  top: number;
  tint: string | undefined;
}) {
  const { x, y, width, height } = FRAMES[frame];
  return (
    <View style={[styles.sprite, { left, top, width, height }]}>
      {/* stretch, not the default cover: cover centre-crops when the box's
          rounded pixel size doesn't match the image exactly (Android at
          2.75x), which shifts the sheet and shows a sliver of the next
          sprite. */}
      <Image
        // iOS doesn't re-tint an image that has already loaded, so a theme
        // change (light to dark while the game is open) remounts it.
        key={tint ?? 'original'}
        source={SHEET}
        resizeMode="stretch"
        fadeDuration={0}
        style={[styles.sheet, { left: -x, top: -y, tintColor: tint }]}
      />
    </View>
  );
}

const MESSAGES: Record<Exclude<GameStatus, 'running'>, string> = {
  idle: WEB ? 'Press Space or click to play' : 'Tap to play',
  paused: WEB ? 'Click to continue' : 'Tap to continue',
  over: 'GAME OVER',
};

function pad(value: number): string {
  return String(value).padStart(5, '0');
}

/** Left edges of the copies of a repeating tile needed to cover `width`. */
function tileOffsets(width: number, tileWidth: number, offset: number) {
  const offsets: number[] = [];
  for (let x = -offset; x < width; x += tileWidth) {
    offsets.push(x);
  }
  return offsets;
}

// Web only, where 'none' (missing from React Native's types) is passed
// through to CSS. Chrome draws an 'auto' focus ring even at width 0.
const WEB_NO_OUTLINE = { outlineStyle: 'none' } as unknown as ViewStyle;

const MONOSPACE = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: SCENE_HEIGHT,
    overflow: 'hidden',
  },
  sprite: {
    position: 'absolute',
    overflow: 'hidden',
  },
  sheet: {
    position: 'absolute',
    width: SHEET.width,
    height: SHEET.height,
  },
  score: {
    position: 'absolute',
    top: 6,
    right: 16,
    fontFamily: MONOSPACE,
    fontSize: 16,
    fontWeight: 'bold',
    fontVariant: ['tabular-nums'],
  },
  message: {
    position: 'absolute',
    top: 38,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: MONOSPACE,
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
});
