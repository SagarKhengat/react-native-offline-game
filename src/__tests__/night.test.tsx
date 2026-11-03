import { describe, expect, it, jest } from '@jest/globals';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import * as engine from '../engine';
import { OfflineGame } from '../OfflineGame';

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { refresh: jest.fn(), addEventListener: jest.fn(() => () => {}) },
  useNetInfo: () => ({ isConnected: true, isInternetReachable: true }),
}));

describe('night', () => {
  it('inverts the whole page and says so', async () => {
    // Reaching 700 points takes a long run; start one, then make it night.
    let night = false;
    jest.spyOn(engine, 'isNight').mockImplementation(() => night);
    const consoleError = console.error;
    jest.spyOn(console, 'error').mockImplementation((...args) => {
      if (!String(args[0]).includes('not wrapped in act')) consoleError(...args);
    });
    const onNightChange = jest.fn();
    const view = await render(
      <OfflineGame
        isOffline
        showDelay={0}
        colorScheme="light"
        onNightChange={onNightChange}
      />
    );
    await waitFor(() => expect(screen.queryByText('No internet')).not.toBeNull());
    await act(() =>
      fireEvent(screen.getByTestId('offline-game-tap-area'), 'touchStart', {
        nativeEvent: { pageY: 300, touches: [{}] },
      })
    );
    night = true;
    await waitFor(() => expect(onNightChange).toHaveBeenCalledWith(true));
    const title = screen.getByText('No internet');
    await waitFor(() =>
      expect(StyleSheet.flatten(title.props.style).color).toBe('#acacac')
    );
    await view.unmount();
    jest.mocked(console.error).mockRestore();
  });
});
