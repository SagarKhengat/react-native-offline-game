import { useNetInfo, type NetInfoState } from '@react-native-community/netinfo';

export type ConnectionStatus = 'online' | 'offline' | 'unknown';

/**
 * Offline when there's no network or the network can't reach the internet;
 * unknown while NetInfo hasn't decided yet, for example during a re-check.
 */
export function connectionStatus({
  isConnected,
  isInternetReachable,
}: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>): ConnectionStatus {
  if (isConnected === false || isInternetReachable === false) {
    return 'offline';
  }
  if (isConnected === true && isInternetReachable === true) {
    return 'online';
  }
  return 'unknown';
}

export function useConnectionStatus(): ConnectionStatus {
  return connectionStatus(useNetInfo());
}

/**
 * True when the device has no network connection, or is on a network that
 * can't reach the internet. False while the state is still unknown.
 */
export function useIsOffline(): boolean {
  return useConnectionStatus() === 'offline';
}
