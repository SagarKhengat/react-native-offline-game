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
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  type ImageSourcePropType,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  GROUND_TILE_HEIGHT,
  GROUND_TILE_WIDTH,
  GROUND_Y,
  OBSTACLE_HEIGHT,
  OBSTACLE_WIDTH,
  OBSTACLE_Y,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  PLAYER_X,
  PLAYER_Y,
  SCENE_HEIGHT,
  SKY_TILE_HEIGHT,
  SKY_TILE_WIDTH,
  SKY_Y,
  createGame,
  obstacleX,
  pause,
  playerPose,
  step,
  tap,
  type GameStatus,
  type PlayerPose,
} from './engine';

const skyImage = require('./assets/cloud.png');
const groundImage = require('./assets/ground.png');
const obstacleImage = require('./assets/obstacle.png');
const playerImages: Record<PlayerPose, ImageSourcePropType> = {
  stand: require('./assets/dino.png'),
  left: require('./assets/dino-left.png'),
  right: require('./assets/dino-right.png'),
  dead: require('./assets/dino-dead.png'),
};

// Longest step simulated in one frame, so a stalled JS thread slows the game
// down instead of teleporting the dinosaur through a hurdle.
const MAX_STEP = 1 / 20;
// Taps this soon after a crash are ignored so a late jump doesn't restart.
const RESTART_DELAY_MS = 400;

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
  /** Starting ground speed in points per second. Default 100. */
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
  /** Default 'auto', which follows the device setting. */
  colorScheme?: ColorSchemeName;
  style?: StyleProp<ViewStyle>;
};

export type DinoGameHandle = {
  /** Same as tapping the game: start, jump, resume or restart. */
  tap: () => void;
  pause: () => void;
};

const DEFAULT_OPTIONS = { fps: 60, skySpeed: 40, groundSpeed: 100 };

export const DinoGame = forwardRef<DinoGameHandle, DinoGameProps>(
  function DinoGame(
    {
      options,
      highScore = 0,
      onGameOver,
      onHighScoreChange,
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

    const latest = useRef({ options, onGameOver, onHighScoreChange });
    useEffect(() => {
      latest.current = { options, onGameOver, onHighScoreChange };
    });

    const gameOptions = useCallback((): Required<DinoGameOptions> => {
      const { fps, skySpeed, groundSpeed } = latest.current.options ?? {};
      return {
        fps: fps ?? DEFAULT_OPTIONS.fps,
        skySpeed: skySpeed ?? DEFAULT_OPTIONS.skySpeed,
        groundSpeed: groundSpeed ?? DEFAULT_OPTIONS.groundSpeed,
      };
    }, []);

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
      if (g.status === 'over' && Date.now() - overAtRef.current < RESTART_DELAY_MS) {
        return;
      }
      tap(g, gameOptions());
      setStatus(g.status);
      redraw();
    }, [gameOptions]);

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
          step(g, Math.min(elapsed / 1000, MAX_STEP), widthRef.current, opts);
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
    }, [status, gameOptions, reportHighScore]);

    const onLayout = useCallback((event: LayoutChangeEvent) => {
      widthRef.current = event.nativeEvent.layout.width;
      setWidth(event.nativeEvent.layout.width);
    }, []);

    const systemScheme = useColorScheme();
    const scheme =
      colorScheme === 'auto'
        ? systemScheme === 'dark'
          ? 'dark'
          : 'light'
        : colorScheme;
    const colors = COLORS[scheme];

    const score = Math.floor(game.score);
    const best = Math.floor(game.highScore);
    const scoreText =
      (best > 0 ? `HI ${pad(best)}  ` : '') +
      (status === 'idle' ? '' : pad(score));

    return (
      <Pressable
        onPressIn={handleTap}
        onLayout={onLayout}
        accessibilityRole="button"
        accessibilityLabel="Dinosaur game"
        accessibilityHint={status === 'running' ? 'Jumps' : 'Starts the game'}
        style={[
          styles.container,
          { backgroundColor: colors.background },
          style,
        ]}
      >
        {width > 0 && (
          <>
            {tileOffsets(width, SKY_TILE_WIDTH, game.skyOffset).map((x, i) => (
              <Image
                key={`sky${i}`}
                source={skyImage}
                fadeDuration={0}
                style={[
                  styles.sprite,
                  {
                    left: x,
                    top: SKY_Y,
                    width: SKY_TILE_WIDTH,
                    height: SKY_TILE_HEIGHT,
                    tintColor: colors.cloud,
                  },
                ]}
              />
            ))}
            {tileOffsets(width, GROUND_TILE_WIDTH, game.groundOffset).map(
              (x, i) => (
                <Image
                  key={`ground${i}`}
                  source={groundImage}
                  fadeDuration={0}
                  style={[
                    styles.sprite,
                    {
                      left: x,
                      top: GROUND_Y,
                      width: GROUND_TILE_WIDTH,
                      height: GROUND_TILE_HEIGHT,
                      tintColor: colors.sprite,
                    },
                  ]}
                />
              )
            )}
            {game.obstacles.map((obstacle) => {
              const x = obstacleX(game, obstacle, width);
              return x < width && x + OBSTACLE_WIDTH > 0 ? (
                <Image
                  key={obstacle}
                  source={obstacleImage}
                  fadeDuration={0}
                  style={[
                    styles.sprite,
                    {
                      left: x,
                      top: OBSTACLE_Y,
                      width: OBSTACLE_WIDTH,
                      height: OBSTACLE_HEIGHT,
                      tintColor: colors.sprite,
                    },
                  ]}
                />
              ) : null;
            })}
            <Image
              source={playerImages[playerPose(game)]}
              fadeDuration={0}
              style={[
                styles.sprite,
                {
                  left: PLAYER_X,
                  top: PLAYER_Y - game.jumpHeight,
                  width: PLAYER_WIDTH,
                  height: PLAYER_HEIGHT,
                  tintColor: colors.sprite,
                },
              ]}
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
      </Pressable>
    );
  }
);

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
