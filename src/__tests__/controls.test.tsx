import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { View } from 'react-native';
import { useGameControls, type GameControls } from '../controls';

function Pad({ controls }: { controls: GameControls }) {
  const { ref, handlers } = useGameControls(controls, false);
  return <View testID="pad" ref={ref} {...handlers} />;
}

const touch = (pageY: number, fingers = 1) => ({
  nativeEvent: { pageY, touches: Array.from({ length: fingers }, () => ({})) },
});

function setup() {
  const controls = {
    press: jest.fn(),
    release: jest.fn(),
    duck: jest.fn(),
  };
  return controls;
}

describe('touch controls', () => {
  it('jumps on touch down and ends the jump on lift', async () => {
    const controls = setup();
    await render(<Pad controls={controls} />);
    const pad = screen.getByTestId('pad');
    await act(() => fireEvent(pad, 'touchStart', touch(100)));
    expect(controls.press).toHaveBeenCalledTimes(1);
    expect(controls.release).not.toHaveBeenCalled();
    await act(() => fireEvent(pad, 'touchEnd', touch(100, 0)));
    expect(controls.release).toHaveBeenCalledTimes(1);
    expect(controls.duck).not.toHaveBeenCalled();
  });

  it('ducks on a slide down, cancelling the jump it began with', async () => {
    const controls = setup();
    await render(<Pad controls={controls} />);
    const pad = screen.getByTestId('pad');
    await act(() => fireEvent(pad, 'touchStart', touch(100)));
    await act(() => fireEvent(pad, 'touchMove', touch(110)));
    expect(controls.duck).not.toHaveBeenCalled();
    await act(() => fireEvent(pad, 'touchMove', touch(130)));
    expect(controls.duck).toHaveBeenCalledWith(true, true);
    await act(() => fireEvent(pad, 'touchMove', touch(160)));
    expect(controls.duck).toHaveBeenCalledTimes(1);
    await act(() => fireEvent(pad, 'touchEnd', touch(160, 0)));
    expect(controls.duck).toHaveBeenLastCalledWith(false, false);
    expect(controls.release).toHaveBeenCalledTimes(1);
  });

  it('waits for the last finger before ending the jump', async () => {
    const controls = setup();
    await render(<Pad controls={controls} />);
    const pad = screen.getByTestId('pad');
    await act(() => fireEvent(pad, 'touchStart', touch(100)));
    await act(() => fireEvent(pad, 'touchStart', touch(100, 2)));
    expect(controls.press).toHaveBeenCalledTimes(2);
    await act(() => fireEvent(pad, 'touchEnd', touch(100, 1)));
    expect(controls.release).not.toHaveBeenCalled();
    await act(() => fireEvent(pad, 'touchEnd', touch(100, 0)));
    expect(controls.release).toHaveBeenCalledTimes(1);
  });
});
