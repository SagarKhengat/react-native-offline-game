import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import NetInfo from '@react-native-community/netinfo';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Text } from 'react-native';
import { OfflineGame } from '../OfflineGame';

type MockState = {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
};

// What useNetInfo reports, and what NetInfo.refresh() answers when the
// screen double-checks. 'same' answers with mockNetInfo. Like the real
// NetInfo, listeners get the latest state when they subscribe and later
// updates through mockEmit().
let mockNetInfo: MockState;
let mockRefresh: MockState | 'same' | 'never';
const mockListeners = new Set<(state: MockState) => void>();
const mockLatest = () => (mockRefresh === 'same' || mockRefresh === 'never' ? mockNetInfo : mockRefresh);

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    refresh: jest.fn(() =>
      mockRefresh === 'never' ? new Promise(() => {}) : Promise.resolve(mockLatest())
    ),
    addEventListener: jest.fn((handler: (state: MockState) => void) => {
      mockListeners.add(handler);
      handler(mockLatest());
      return () => mockListeners.delete(handler);
    }),
  },
  useNetInfo: () => mockNetInfo,
}));

const mockEmit = (state: MockState) =>
  act(() => mockListeners.forEach((handler) => handler(state)));

const ONLINE = { isConnected: true, isInternetReachable: true };
const OFFLINE = { isConnected: false, isInternetReachable: false };
const NO_INTERNET = { isConnected: true, isInternetReachable: false };
// What NetInfo reports while it re-checks the internet.
const CHECKING = { isConnected: true, isInternetReachable: null };

const DELAYS = { showDelay: 100, hideDelay: 100 };

const wait = (ms: number) =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

const isShown = () => screen.queryByText('No internet') !== null;

describe('OfflineGame', () => {
  beforeEach(() => {
    mockNetInfo = ONLINE;
    mockRefresh = 'same';
    mockListeners.clear();
    jest.mocked(NetInfo.refresh).mockClear();
  });

  it('stays hidden while online', async () => {
    await render(<OfflineGame {...DELAYS} />);
    await wait(300);
    expect(isShown()).toBe(false);
  });

  it('opens once the connection has been down for showDelay and closes hideDelay after it is back', async () => {
    const onShow = jest.fn();
    const onReconnect = jest.fn();
    mockNetInfo = OFFLINE;
    const view = await render(
      <OfflineGame {...DELAYS} onShow={onShow} onReconnect={onReconnect} />
    );

    await wait(50);
    expect(isShown()).toBe(false);
    await waitFor(() => expect(isShown()).toBe(true));
    expect(NetInfo.refresh).toHaveBeenCalledTimes(1);
    expect(onShow).toHaveBeenCalledTimes(1);

    mockNetInfo = ONLINE;
    await view.rerender(
      <OfflineGame {...DELAYS} onShow={onShow} onReconnect={onReconnect} />
    );
    await wait(50);
    expect(isShown()).toBe(true);
    await waitFor(() => expect(isShown()).toBe(false));
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('ignores drops shorter than showDelay', async () => {
    const onShow = jest.fn();
    mockNetInfo = OFFLINE;
    const view = await render(<OfflineGame {...DELAYS} onShow={onShow} />);
    await wait(50);

    mockNetInfo = ONLINE;
    await view.rerender(<OfflineGame {...DELAYS} onShow={onShow} />);
    await wait(300);

    expect(isShown()).toBe(false);
    expect(onShow).not.toHaveBeenCalled();
  });

  it('stays open through a reconnect shorter than hideDelay', async () => {
    const onReconnect = jest.fn();
    mockNetInfo = OFFLINE;
    const view = await render(
      <OfflineGame {...DELAYS} onReconnect={onReconnect} />
    );
    await waitFor(() => expect(isShown()).toBe(true));

    mockNetInfo = ONLINE;
    await view.rerender(<OfflineGame {...DELAYS} onReconnect={onReconnect} />);
    await wait(50);
    mockNetInfo = OFFLINE;
    await view.rerender(<OfflineGame {...DELAYS} onReconnect={onReconnect} />);
    await wait(300);

    expect(isShown()).toBe(true);
    expect(onReconnect).not.toHaveBeenCalled();
  });

  it('stays hidden while the second check says online, and opens once it agrees', async () => {
    mockNetInfo = OFFLINE;
    mockRefresh = ONLINE;
    await render(<OfflineGame {...DELAYS} />);
    // Separate act() calls so React applies each retry as it happens.
    for (let i = 0; i < 4; i++) {
      await wait(120);
    }
    expect(isShown()).toBe(false);
    expect(jest.mocked(NetInfo.refresh).mock.calls.length).toBeGreaterThan(1);

    mockRefresh = 'same';
    await waitFor(() => expect(isShown()).toBe(true));
  });

  it('waits for the result of the re-check that refresh() starts', async () => {
    mockNetInfo = OFFLINE;
    mockRefresh = CHECKING;
    await render(<OfflineGame {...DELAYS} />);
    await wait(400);
    expect(isShown()).toBe(false);
    expect(mockListeners.size).toBe(1);

    await mockEmit(NO_INTERNET);
    await waitFor(() => expect(isShown()).toBe(true));
    expect(mockListeners.size).toBe(0);
  });

  it('stays hidden when the re-check comes back online', async () => {
    mockNetInfo = OFFLINE;
    mockRefresh = CHECKING;
    await render(<OfflineGame {...DELAYS} />);
    await wait(200);
    await mockEmit(ONLINE);
    await wait(50);
    expect(isShown()).toBe(false);
    expect(mockListeners.size).toBe(0);
  });

  it('opens if the second check does not answer in time', async () => {
    mockNetInfo = OFFLINE;
    mockRefresh = 'never';
    await render(<OfflineGame {...DELAYS} />);
    await wait(1000);
    expect(isShown()).toBe(false);
    await waitFor(() => expect(isShown()).toBe(true), { timeout: 4000 });
  }, 8000);

  it('keeps counting down through the unknown reading NetInfo gives while re-checking', async () => {
    const delays = { showDelay: 300, hideDelay: 100 };
    mockNetInfo = OFFLINE;
    const view = await render(<OfflineGame {...delays} />);
    await wait(150);
    mockNetInfo = CHECKING;
    await view.rerender(<OfflineGame {...delays} />);
    await wait(100);
    mockNetInfo = OFFLINE;
    await view.rerender(<OfflineGame {...delays} />);
    // 370 ms after the drop. Restarting the countdown would need 550 ms.
    await wait(120);
    expect(isShown()).toBe(true);
  });

  it('closes when connected but the internet check never answers, and stays closed', async () => {
    mockNetInfo = OFFLINE;
    const view = await render(<OfflineGame {...DELAYS} />);
    await waitFor(() => expect(isShown()).toBe(true));

    mockNetInfo = CHECKING;
    await view.rerender(<OfflineGame {...DELAYS} />);
    await waitFor(() => expect(isShown()).toBe(false));
    const checks = jest.mocked(NetInfo.refresh).mock.calls.length;
    for (let i = 0; i < 4; i++) {
      await wait(100);
    }
    expect(isShown()).toBe(false);
    expect(NetInfo.refresh).toHaveBeenCalledTimes(checks);
  });

  it('treats a network without internet access as offline', async () => {
    mockNetInfo = NO_INTERNET;
    await render(<OfflineGame {...DELAYS} />);
    await waitFor(() => expect(isShown()).toBe(true));
  });

  it('lets the app decide with isOffline, without asking NetInfo', async () => {
    const view = await render(
      <OfflineGame {...DELAYS} isOffline title="Server unreachable" />
    );
    await waitFor(() =>
      expect(screen.queryByText('Server unreachable')).not.toBeNull()
    );
    expect(NetInfo.refresh).not.toHaveBeenCalled();

    await view.rerender(
      <OfflineGame {...DELAYS} isOffline={false} title="Server unreachable" />
    );
    await waitFor(() =>
      expect(screen.queryByText('Server unreachable')).toBeNull()
    );
  });

  it('starts the game on tap and keeps score', async () => {
    // The game loop redraws from requestAnimationFrame, outside act().
    const consoleError = console.error;
    jest.spyOn(console, 'error').mockImplementation((...args) => {
      if (!String(args[0]).includes('not wrapped in act')) {
        consoleError(...args);
      }
    });
    const onSound = jest.fn();
    const view = await render(
      <OfflineGame {...DELAYS} isOffline onSound={onSound} />
    );
    await waitFor(() => expect(isShown()).toBe(true));
    const game = screen.getByLabelText('Dinosaur game');
    await act(() =>
      fireEvent(game, 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 120 } },
      })
    );
    expect(screen.getByText('Tap to play')).toBeTruthy();

    // A tap anywhere on the page plays, not just on the game strip.
    await act(() =>
      fireEvent(screen.getByTestId('offline-game-tap-area'), 'touchStart', {
        nativeEvent: { pageY: 300, touches: [{}] },
      })
    );
    expect(screen.queryByText('Tap to play')).toBeNull();
    expect(onSound).toHaveBeenCalledWith('jump');
    await wait(1000);
    // The matcher collapses the double space.
    expect(screen.getByText(/^HI \d{5} \d{5}$/)).toBeTruthy();
    expect(screen.queryByText(/ 00000$/)).toBeNull();
    await view.unmount();
    jest.mocked(console.error).mockRestore();
  });

  it('Try again closes the page at once when the connection is back', async () => {
    const onReconnect = jest.fn();
    mockNetInfo = OFFLINE;
    await render(<OfflineGame {...DELAYS} onReconnect={onReconnect} />);
    await waitFor(() => expect(isShown()).toBe(true));

    mockRefresh = ONLINE;
    await act(() => fireEvent.press(screen.getByText('Try again')));
    await waitFor(() => expect(isShown()).toBe(false));
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('Try again says so when still offline', async () => {
    mockNetInfo = OFFLINE;
    await render(<OfflineGame {...DELAYS} retryLabel="Retry" />);
    await waitFor(() => expect(isShown()).toBe(true));

    await act(() => fireEvent.press(screen.getByText('Retry')));
    await waitFor(() => expect(screen.getByText('Still offline')).toBeTruthy());
    expect(isShown()).toBe(true);
  });

  it('with isOffline, Try again just tells the app', async () => {
    const onRetry = jest.fn();
    await render(
      <OfflineGame {...DELAYS} isOffline onRetry={onRetry} />
    );
    await waitFor(() => expect(isShown()).toBe(true));
    await act(() => fireEvent.press(screen.getByText('Try again')));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(NetInfo.refresh).not.toHaveBeenCalled();
    expect(isShown()).toBe(true);
  });

  it('shows your own content and can hide the button', async () => {
    await render(
      <OfflineGame {...DELAYS} isOffline showRetry={false}>
        <Text>Your work is saved</Text>
      </OfflineGame>
    );
    await waitFor(() => expect(isShown()).toBe(true));
    expect(screen.getByText('Your work is saved')).toBeTruthy();
    expect(screen.queryByText('Try again')).toBeNull();
  });

  it('brings back the high score saved earlier', async () => {
    const storage = {
      getItem: jest.fn(async () => '1234'),
      setItem: jest.fn(async () => {}),
    };
    const view = await render(
      <OfflineGame {...DELAYS} isOffline storage={storage} />
    );
    await waitFor(() => expect(isShown()).toBe(true));
    await act(() =>
      fireEvent(screen.getByLabelText('Dinosaur game'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 120 } },
      })
    );
    await waitFor(() => expect(screen.getByText(/^HI 01234/)).toBeTruthy());
    expect(storage.getItem).toHaveBeenCalledWith(
      'react-native-offline-game:high-score'
    );
    await view.unmount();
  });
});
