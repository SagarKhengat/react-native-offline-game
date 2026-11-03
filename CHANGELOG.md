# Changelog

## 1.1.0

### New
- **Pterodactyls.** Once the game gets fast, birds fly in at three heights: jump the low ones, duck under the middle ones, stay on the ground for the high ones.
- **Ducking.** Swipe down and hold (↓ on the web). In mid-air it drops you fast.
- **Hold to jump higher.** A quick tap is a short hop; keep your finger down for a full jump.
- **Rows of hurdles.** Pairs and threes as the speed goes up.
- **Night.** Like Chrome, the colours invert for 12 seconds every 700 points, across the whole page.
- **Try again button** that checks the connection right away and closes the page if you're back. `showRetry`, `retryLabel`, `onRetry`.
- **Your own content** under the message: pass `children`.
- **High score saved automatically** between launches: AsyncStorage when the app has it, the browser on the web, or your own `storage`. `rememberHighScore`.
- **Vibration** on jumps and crashes with React Native's built-in API: `vibration`.
- `onNightChange`, and `release()` and `duck(down)` on the `DinoGame` ref.

### Fixed
- **The web:** the game couldn't be played with a mouse or keyboard. Click, Space or ↑ now jumps, and ↓ ducks.

### Size
About 9 kB gzipped in an app (was 6 kB), still with no dependencies.

## 1.0.0

First release as a React Native library: the "No internet" page with the dinosaur game, buffered offline detection with NetInfo, optional sounds, light and dark themes.
