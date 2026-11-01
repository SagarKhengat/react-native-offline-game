import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
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
import {
  GROUND_TILE_WIDTH,
  GROUND_Y,
  OBSTACLE_WIDTH,
  OBSTACLE_Y,
  PLAYER_X,
  PLAYER_Y,
  SCENE_HEIGHT,
  createGame,
  obstacleX,
  pause,
  playerPose,
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

const POSE_FRAMES: Record<PlayerPose, FrameName> = {
  stand: 'dino',
  left: 'dinoLeft',
  right: 'dinoRight',
  dead: 'dinoDead',
};

// Longest step simulated in one frame, so a stalled JS thread slows the game
// down instead of teleporting the dinosaur through a hurdle.
const MAX_STEP = 1 / 20;
// Taps this soon after a crash are ignored so a late jump doesn't restart.
const RESTART_DELAY_MS = 400;
// Hurdles mount this far off screen so their image is ready when they
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
  /** Called when the dinosaur hits a hurdle. */
  onGameOver?: (score: number) => void;
  /** Called with the new best score when a run beats it. */
  onHighScoreChange?: (highScore: number) => void;
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
  /** Default 'auto', which follows the device setting. */
  colorScheme?: ColorSchemeName;
  style?: StyleProp<ViewStyle>;
};

export type DinoGameHandle = {
  /** Same as tapping the game: start, jump, resume or restart. */
  tap: () => void;
  pause: () => void;
};

const DEFAULT_OPTIONS = { fps: 60, skySpeed: 40, groundSpeed: 360 };

export const DinoGame = forwardRef<DinoGameHandle, DinoGameProps>(
  function DinoGame(
    {
      options,
      highScore = 0,
      onGameOver,
      onHighScoreChange,
      sounds = true,
      onSound,
      colorScheme = 'auto',
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

    const latest = useRef({
      options,
      onGameOver,
      onHighScoreChange,
      sounds,
      onSound,
    });
    useEffect(() => {
      latest.current = { options, onGameOver, onHighScoreChange, sounds, onSound };
    });

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
        if (latest.current.sounds) {
          playSound(sound);
        }
      }
    }, []);

    useEffect(() => (sounds ? retainSounds() : undefined), [sounds]);

    const reportHighScore = useCallback(() => {
      const best = Math.floor(gameRef.current.highScore);
      if (best > reportedHighScoreRef.current) {
        reportedHighScoreRef.current = best;
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

    const handlePause = useCallback(() => {
      pause(gameRef.current);
      setStatus(gameRef.current.status);
    }, []);

    useImperativeHandle(ref, () => ({ tap: handleTap, pause: handlePause }), [
      handleTap,
      handlePause,
    ]);

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

    const systemScheme = useColorScheme();
    const scheme =
      colorScheme === 'auto'
        ? systemScheme === 'dark'
          ? 'dark'
          : 'light'
        : colorScheme;
    const colors = COLORS[scheme];

    const shown = shownScore(game);
    const best = Math.floor(game.highScore);
    const scoreText =
      (best > 0 ? `HI ${pad(best)}  ` : '') +
      (status === 'idle' ? '' : shown === null ? '     ' : pad(shown));

    return (
      // onTouchStart rather than Pressable: it fires the moment a finger lands
      // and for every finger, so quick taps with two thumbs all count.
      <View
        onTouchStart={handleTap}
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
            {game.obstacles.map((obstacle) => {
              const x = obstacleX(game, obstacle, width);
              return x < width + PRELOAD_DISTANCE && x + OBSTACLE_WIDTH > 0 ? (
                <Sprite
                  key={obstacle}
                  frame="obstacle"
                  left={x}
                  top={OBSTACLE_Y}
                  tint={colors.sprite}
                />
              ) : null;
            })}
            <Sprite
              frame={POSE_FRAMES[playerPose(game)]}
              left={PLAYER_X}
              top={PLAYER_Y - game.jumpHeight}
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
      <Image
        source={SHEET}
        fadeDuration={0}
        style={[
          styles.sheet,
          { left: -x, top: -y, tintColor: tint },
        ]}
      />
    </View>
  );
}

const MESSAGES: Record<Exclude<GameStatus, 'running'>, string> = {
  idle: 'Tap to play',
  paused: 'Tap to continue',
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
