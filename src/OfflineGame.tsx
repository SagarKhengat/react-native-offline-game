import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { useGameControls } from './controls';
import {
  COLORS,
  DinoGame,
  PageControlsContext,
  type DinoGameHandle,
  type DinoGameProps,
} from './DinoGame';
import { useOfflineScreen } from './useOfflineScreen';

// How long "Still offline" shows after a failed retry.
const RETRY_FAILED_MS = 2000;

export type OfflineGameProps = DinoGameProps & {
  /**
   * Overrides the built-in connection check. Leave undefined to show the
   * screen whenever NetInfo reports that the internet can't be reached.
   */
  isOffline?: boolean;
  /**
   * How long the connection must stay down before the screen appears, so
   * brief drops while switching networks don't flash it. Default 1500 ms.
   */
  showDelay?: number;
  /**
   * How long the connection must stay back before the screen closes, so a
   * flaky reconnect doesn't close and reopen it. Default 1000 ms.
   */
  hideDelay?: number;
  /**
   * Lets the Android back button close the screen until the next time the
   * connection drops. Default false.
   */
  dismissible?: boolean;
  /** Default 'No internet'. */
  title?: string;
  /** Default 'Check your connection. This screen closes when you're back online.' */
  message?: string;
  /**
   * Show a button that checks the connection right away and closes the
   * screen if it's back. Default true.
   */
  showRetry?: boolean;
  /** Default 'Try again'. */
  retryLabel?: string;
  /**
   * Called when the retry button is pressed. With `isOffline`, this is how
   * you re-check yourself.
   */
  onRetry?: () => void;
  /** Called when the screen appears. */
  onShow?: () => void;
  /** Called when the screen closes because the connection is back. */
  onReconnect?: () => void;
  /** Your own content under the message, like a logo or a note. */
  children?: ReactNode;
};

/**
 * Shows a full-screen "No internet" page with the dinosaur game while the
 * device is offline, and closes it when the connection is back.
 * Render it once near the root of the app.
 */
export function OfflineGame({
  isOffline,
  showDelay = 1500,
  hideDelay = 1000,
  dismissible = false,
  title = 'No internet',
  message = "Check your connection. This screen closes when you're back online.",
  showRetry = true,
  retryLabel = 'Try again',
  onRetry,
  onShow,
  onReconnect,
  children,
  highScore: initialHighScore = 0,
  onHighScoreChange,
  onNightChange,
  colorScheme = 'auto',
  ...gameProps
}: OfflineGameProps) {
  const { visible, retry } = useOfflineScreen({
    isOffline,
    showDelay,
    hideDelay,
    onShow,
    onReconnect,
  });
  const [dismissed, setDismissed] = useState(false);
  const [highScore, setHighScore] = useState(initialHighScore);
  const [night, setNight] = useState(false);
  const [retrying, setRetrying] = useState<'idle' | 'checking' | 'failed'>(
    'idle'
  );
  const gameRef = useRef<DinoGameHandle>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const shown = visible && !dismissed;

  useEffect(() => {
    setHighScore((current) => Math.max(current, initialHighScore));
  }, [initialHighScore]);

  useEffect(() => {
    if (!visible) {
      setDismissed(false);
      setNight(false);
      setRetrying('idle');
    }
  }, [visible]);

  useEffect(() => () => clearTimeout(retryTimer.current), []);

  const handleHighScoreChange = useCallback(
    (best: number) => {
      setHighScore(best);
      onHighScoreChange?.(best);
    },
    [onHighScoreChange]
  );

  const handleNightChange = useCallback(
    (isNight: boolean) => {
      setNight(isNight);
      onNightChange?.(isNight);
    },
    [onNightChange]
  );

  const handleRetry = useCallback(async () => {
    onRetry?.();
    if (isOffline !== undefined) {
      return;
    }
    clearTimeout(retryTimer.current);
    setRetrying('checking');
    if (await retry()) {
      setRetrying('idle');
    } else {
      setRetrying('failed');
      retryTimer.current = setTimeout(
        () => setRetrying('idle'),
        RETRY_FAILED_MS
      );
    }
  }, [isOffline, onRetry, retry]);

  const controls = useMemo(
    () => ({
      press: () => gameRef.current?.tap(),
      release: () => gameRef.current?.release(),
      duck: (down: boolean, cancelTakeoff: boolean) =>
        gameRef.current?.duck(down, cancelTakeoff),
    }),
    []
  );
  const input = useGameControls(controls, shown);

  const systemScheme = useColorScheme();
  const base =
    colorScheme === 'auto'
      ? systemScheme === 'dark'
        ? 'dark'
        : 'light'
      : colorScheme;
  // At night the game swaps its colours; the page follows, like Chrome's.
  const scheme = night ? (base === 'dark' ? 'light' : 'dark') : base;
  const colors = COLORS[scheme];

  return (
    <Modal
      visible={shown}
      animationType="fade"
      statusBarTranslucent
      supportedOrientations={['portrait', 'landscape']}
      onRequestClose={() => {
        if (dismissible) {
          setDismissed(true);
        }
      }}
    >
      <StatusBar
        barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'}
      />
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        {/* Tap anywhere to play: this layer sits behind the content, which
            lets touches through except on the button and your own content. */}
        <View
          ref={input.ref}
          {...input.handlers}
          testID="offline-game-tap-area"
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.content}>
          <View style={styles.passTouches}>
            <PageControlsContext.Provider value>
              <DinoGame
                ref={gameRef}
                highScore={highScore}
                onHighScoreChange={handleHighScoreChange}
                onNightChange={handleNightChange}
                colorScheme={base}
                {...gameProps}
              />
            </PageControlsContext.Provider>
            <Text
              accessibilityRole="header"
              style={[styles.title, { color: colors.text }]}
            >
              {title}
            </Text>
            <Text style={[styles.message, { color: colors.text }]}>
              {message}
            </Text>
          </View>
          {children != null && <View style={styles.extra}>{children}</View>}
          {showRetry && (
            <Pressable
              onPress={handleRetry}
              disabled={retrying === 'checking'}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.retry,
                { borderColor: colors.text, opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Text style={[styles.retryText, { color: colors.text }]}>
                {retrying === 'checking'
                  ? 'Checking…'
                  : retrying === 'failed'
                    ? 'Still offline'
                    : retryLabel}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
  },
  passTouches: {
    pointerEvents: 'none',
  },
  content: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    paddingBottom: 80,
    pointerEvents: 'box-none',
  },
  title: {
    marginTop: 32,
    paddingHorizontal: 24,
    fontSize: 22,
    fontWeight: '600',
  },
  message: {
    marginTop: 12,
    paddingHorizontal: 24,
    fontSize: 15,
    lineHeight: 22,
  },
  extra: {
    marginTop: 20,
    paddingHorizontal: 24,
  },
  retry: {
    alignSelf: 'flex-start',
    marginTop: 24,
    marginHorizontal: 24,
    paddingVertical: 9,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 1,
  },
  retryText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
