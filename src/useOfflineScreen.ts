import NetInfo, {
  type NetInfoState,
  type NetInfoSubscription,
} from '@react-native-community/netinfo';
import { useEffect, useRef, useState } from 'react';
import { connectionStatus, useConnectionStatus } from './useIsOffline';

// How long to wait for NetInfo's second opinion before trusting the first.
const CONFIRM_TIMEOUT = 3000;

export type OfflineScreenOptions = {
  /** Overrides NetInfo, see OfflineGameProps.isOffline. */
  isOffline?: boolean;
  showDelay: number;
  hideDelay: number;
  onShow?: () => void;
  onReconnect?: () => void;
};

/**
 * Whether the offline screen should be up. Follows the connection with a
 * buffer in both directions so it doesn't flicker: it turns on once the
 * connection has been down for `showDelay` and a fresh NetInfo check agrees,
 * and turns off once the connection has been back for `hideDelay`.
 */
export function useOfflineScreen({
  isOffline,
  showDelay,
  hideDelay,
  onShow,
  onReconnect,
}: OfflineScreenOptions): boolean {
  const detected = useConnectionStatus();
  const manual = isOffline !== undefined;
  const status = manual ? (isOffline ? 'offline' : 'online') : detected;
  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(false);

  // NetInfo reports "unknown" for a moment whenever it re-checks, including
  // during our own confirmation below. While the screen is closed, an
  // unknown reading keeps the last known one, so it can't cancel a pending
  // show. While it's open, unknown counts as online (after hideDelay), so the
  // screen still closes on devices where the internet check is turned off.
  const [lastKnown, setLastKnown] = useState(false);
  if (status !== 'unknown' && (status === 'offline') !== lastKnown) {
    setLastKnown(status === 'offline');
  }
  const offline =
    status === 'unknown' ? !visible && lastKnown : status === 'offline';
  const [retries, setRetries] = useState(0);

  const latest = useRef({ onShow, onReconnect });
  useEffect(() => {
    latest.current = { onShow, onReconnect };
  });

  useEffect(() => {
    if (offline === visibleRef.current) {
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(
      async () => {
        if (offline && !manual && !(await confirmOffline())) {
          // NetInfo now says online or isn't sure yet. If the hook still
          // says offline, wait out another showDelay and ask again.
          if (!cancelled) {
            setRetries((n) => n + 1);
          }
          return;
        }
        if (cancelled) {
          return;
        }
        visibleRef.current = offline;
        setVisible(offline);
        if (offline) {
          latest.current.onShow?.();
        } else {
          // Closing on an unknown reading means it's no longer offline.
          setLastKnown(false);
          latest.current.onReconnect?.();
        }
      },
      offline ? showDelay : hideDelay
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [offline, manual, showDelay, hideDelay, retries]);

  return visible;
}

/**
 * Asks NetInfo to check the connection again. True if it still looks offline
 * or the check doesn't finish in time.
 */
function confirmOffline(): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    let unsubscribe: NetInfoSubscription | undefined;
    const finish = (offline: boolean) => {
      if (done) {
        return;
      }
      done = true;
      clearTimeout(timer);
      unsubscribe?.();
      resolve(offline);
    };
    const timer = setTimeout(() => finish(true), CONFIRM_TIMEOUT);
    const onState = (state: NetInfoState) => {
      const status = connectionStatus(state);
      if (status !== 'unknown') {
        finish(status === 'offline');
      }
    };

    NetInfo.refresh().then(
      (state) => {
        onState(state);
        if (done) {
          return;
        }
        // refresh() resolves as soon as it has started a new internet check,
        // with the internet state unknown. The result comes as an update.
        const subscription = NetInfo.addEventListener(onState);
        if (done) {
          subscription();
        } else {
          unsubscribe = subscription;
        }
      },
      () => finish(true)
    );
  });
}
