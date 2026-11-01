import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import {
  COLORS,
  DinoGame,
  type DinoGameHandle,
  type DinoGameProps,
} from './DinoGame';
import { useOfflineScreen } from './useOfflineScreen';

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
  /** Called when the screen appears. */
  onShow?: () => void;
  /** Called when the screen closes because the connection is back. */
  onReconnect?: () => void;
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
  onShow,
  onReconnect,
  highScore: initialHighScore = 0,
  onHighScoreChange,
  colorScheme = 'auto',
  ...gameProps
}: OfflineGameProps) {
  const visible = useOfflineScreen({
    isOffline,
    showDelay,
    hideDelay,
    onShow,
    onReconnect,
  });
  const [dismissed, setDismissed] = useState(false);
  const [highScore, setHighScore] = useState(initialHighScore);
  const gameRef = useRef<DinoGameHandle>(null);

  useEffect(() => {
    setHighScore((current) => Math.max(current, initialHighScore));
  }, [initialHighScore]);

  useEffect(() => {
    if (!visible) {
      setDismissed(false);
    }
  }, [visible]);

  const handleHighScoreChange = useCallback(
    (best: number) => {
      setHighScore(best);
      onHighScoreChange?.(best);
    },
    [onHighScoreChange]
  );

  const systemScheme = useColorScheme();
  const scheme =
    colorScheme === 'auto'
      ? systemScheme === 'dark'
        ? 'dark'
        : 'light'
      : colorScheme;
  const colors = COLORS[scheme];

  return (
    <Modal
      visible={visible && !dismissed}
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
      <Pressable
        onPressIn={() => gameRef.current?.tap()}
        accessible={false}
        style={[styles.screen, { backgroundColor: colors.background }]}
      >
        <View style={styles.content}>
          <DinoGame
            ref={gameRef}
            highScore={highScore}
            onHighScoreChange={handleHighScoreChange}
            colorScheme={scheme}
            {...gameProps}
          />
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
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
  },
  content: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    paddingBottom: 80,
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
});
