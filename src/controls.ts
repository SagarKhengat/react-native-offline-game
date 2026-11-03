import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Platform, type GestureResponderEvent } from 'react-native';

export type GameControls = {
  /** Jump control down: start, jump, resume or restart. */
  press: () => void;
  /** Jump control up. */
  release: () => void;
  duck: (down: boolean, cancelTakeoff: boolean) => void;
};

// How far a finger has to slide down to duck, and how soon after touching
// down a slide cancels the jump the touch started.
const SWIPE_DISTANCE = 24;
const CANCEL_TAKEOFF_MS = 200;
// Browsers fire a mouse event after a touch; ignore those.
const TOUCH_MOUSE_GAP_MS = 800;

type DomEvent = {
  key?: string;
  button?: number;
  repeat?: boolean;
  target?: unknown;
  preventDefault(): void;
};
type DomTarget = {
  addEventListener(type: string, listener: (event: DomEvent) => void): void;
  removeEventListener(type: string, listener: (event: DomEvent) => void): void;
};

function isTyping(target: unknown): boolean {
  const element = target as { tagName?: string; isContentEditable?: boolean };
  return (
    element?.isContentEditable === true ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(element?.tagName ?? '')
  );
}

/**
 * Turns input into game controls: on phones, tap to jump (hold for a higher
 * jump) and slide down to duck; on the web also click, Space or Up to jump
 * and Down to duck. Spread `handlers` on the view to touch and give it `ref`
 * (a callback ref, so a view that mounts later, like a modal's, still gets
 * mouse input). Keyboard input is only listened to while `keyboard` is true.
 */
export function useGameControls(controls: GameControls, keyboard: boolean) {
  const latest = useRef(controls);
  useEffect(() => {
    latest.current = controls;
  });
  const touch = useRef<{ y: number; at: number; ducking: boolean } | null>(
    null
  );
  const lastTouchAt = useRef(0);

  const handlers = useMemo(() => {
    const end = (event: GestureResponderEvent) => {
      if (event.nativeEvent.touches.length > 0) {
        return;
      }
      if (touch.current?.ducking) {
        latest.current.duck(false, false);
      }
      touch.current = null;
      latest.current.release();
    };
    return {
      onTouchStart: (event: GestureResponderEvent) => {
        lastTouchAt.current = Date.now();
        if (touch.current === null) {
          touch.current = {
            y: event.nativeEvent.pageY,
            at: Date.now(),
            ducking: false,
          };
        }
        latest.current.press();
      },
      onTouchMove: (event: GestureResponderEvent) => {
        const start = touch.current;
        if (start && !start.ducking) {
          if (event.nativeEvent.pageY - start.y > SWIPE_DISTANCE) {
            start.ducking = true;
            latest.current.duck(true, Date.now() - start.at < CANCEL_TAKEOFF_MS);
          }
        }
      },
      onTouchEnd: end,
      onTouchCancel: end,
    };
  }, []);

  // Mouse, on the web: down on the view, up anywhere.
  const mouseDown = useCallback((event: DomEvent) => {
    if (
      event.button === 0 &&
      Date.now() - lastTouchAt.current > TOUCH_MOUSE_GAP_MS
    ) {
      latest.current.press();
    }
  }, []);
  const node = useRef<DomTarget | null>(null);
  const ref = useCallback(
    (view: unknown) => {
      if (Platform.OS !== 'web') {
        return;
      }
      node.current?.removeEventListener('mousedown', mouseDown);
      node.current = (view as DomTarget | null)?.addEventListener
        ? (view as DomTarget)
        : null;
      node.current?.addEventListener('mousedown', mouseDown);
    },
    [mouseDown]
  );
  useEffect(() => {
    const page = globalThis as unknown as DomTarget;
    if (Platform.OS !== 'web' || !page.addEventListener) {
      return undefined;
    }
    const up = () => latest.current.release();
    page.addEventListener('mouseup', up);
    return () => page.removeEventListener('mouseup', up);
  }, []);

  // Keyboard, on the web.
  useEffect(() => {
    const page = globalThis as unknown as DomTarget;
    if (Platform.OS !== 'web' || !keyboard || !page.addEventListener) {
      return undefined;
    }
    const down = (event: DomEvent) => {
      if (isTyping(event.target)) {
        return;
      }
      if (event.key === ' ' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (!event.repeat) latest.current.press();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (!event.repeat) latest.current.duck(true, false);
      }
    };
    const up = (event: DomEvent) => {
      if (event.key === ' ' || event.key === 'ArrowUp') {
        latest.current.release();
      } else if (event.key === 'ArrowDown') {
        latest.current.duck(false, false);
      }
    };
    page.addEventListener('keydown', down);
    page.addEventListener('keyup', up);
    return () => {
      page.removeEventListener('keydown', down);
      page.removeEventListener('keyup', up);
    };
  }, [keyboard]);

  return { ref, handlers };
}
