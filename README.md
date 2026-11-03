<p align="center">
  <img src="docs/demo.gif" alt="The dinosaur jumping hurdles and ducking under pterodactyls" width="600" />
</p>

<h1 align="center">🦖 react-native-offline-game</h1>

<p align="center">
  <b>Chrome's "No internet" dinosaur game, for your React Native app.</b><br />
  When the connection drops, your users get a game instead of a dead end.<br />
  When it comes back, the game gets out of the way. No code from you.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/react-native-offline-game"><img src="https://img.shields.io/npm/v/react-native-offline-game?color=cb3837&logo=npm" alt="npm version" /></a>
  <img src="https://img.shields.io/badge/platforms-iOS%20%7C%20Android%20%7C%20Web-535353" alt="iOS, Android and web" />
  <img src="https://img.shields.io/badge/Expo-ready-000020?logo=expo" alt="Works with Expo" />
  <img src="https://img.shields.io/badge/size-9%20kB%20gzipped-2ea44f" alt="9 kB gzipped" />
  <img src="https://img.shields.io/badge/dependencies-0-2ea44f" alt="No dependencies" />
  <img src="https://img.shields.io/badge/types-TypeScript-3178c6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license" />
</p>

---

## ✨ Why you'll like it

- 🔌 **One line to add.** Drop `<OfflineGame />` into your app. It watches the connection for you.
- 🧘 **Never flickers.** It waits a moment and double-checks before it appears, and ignores quick blips while you're reconnecting.
- 🎮 **Plays like the real thing.** Tap to jump (hold to jump higher), swipe down to duck under pterodactyls, clear rows of hurdles, and keep going when night falls every 700 points.
- 🔁 **"Try again" button.** Checks the connection right away and closes the page if you're back.
- 🏆 **Remembers the high score** between launches, with no setup.
- 🧩 **Room for your own content** under the message, like a logo or "Your work is saved".
- 🔊 **Retro beeps** and 📳 **vibration**, both optional. The beeps are made in code, with no audio files.
- 🌐 **Works on the web too.** Click, Space or ↑ to jump, ↓ to duck.
- 📴 **Works truly offline.** Everything it draws is built in. Nothing to download, even in a dev build in airplane mode.
- 🌗 **Light and dark.** Follows the phone's theme automatically.
- 🪶 **Tiny, with zero dependencies.** About **9 kB** gzipped in your app, artwork included. Extras like AsyncStorage are used if your app already has them, never required.

<p align="center">
  <img src="docs/screens.png" alt="The No internet page in light and dark mode" width="640" />
</p>

## 🚀 Quick start

**1. Install it**, together with NetInfo, which tells it when you're offline:

```sh
npx expo install react-native-offline-game @react-native-community/netinfo
```

<details>
<summary>Not using Expo?</summary>

```sh
npm install react-native-offline-game @react-native-community/netinfo
npx pod-install
```

</details>

**2. Add it once**, next to your app's root:

```tsx
import OfflineGame from 'react-native-offline-game';

export default function App() {
  return (
    <>
      <YourApp />
      <OfflineGame />
    </>
  );
}
```

**3. Turn on airplane mode.** 🛫 That's it.

> 💡 **Want to see it without losing Wi-Fi?** Add `isOffline` for a moment:
> `<OfflineGame isOffline />`, then take it out again.

## 🎬 What your users see

```text
Connection drops
  ├─ wait 1.5 s ─► double-check ─► the dino page fades in
  └─ back before that? nothing appears

Connection comes back
  ├─ wait 1 s ─► the page fades out
  └─ drops again before that? keep playing
```

- A full-screen **"No internet"** page fades in over your app with the game ready to play.
- When the internet is back, the page **closes on its own**, even mid-game. Or they can tap **Try again**.

| | On a phone | On the web |
| --- | --- | --- |
| **Start / jump** | Tap anywhere | Click, Space or ↑ |
| **Jump higher** | Keep your finger down | Hold the key |
| **Duck** | Swipe down and hold | Hold ↓ |
| **Drop fast** | Swipe down in mid-air | ↓ in mid-air |

Pterodactyls show up once the game gets fast. Jump the low ones, duck under the middle ones, and don't jump into the high ones.

It counts as offline when there's no network at all, **or** when there's a network that can't reach the internet (like hotel Wi-Fi before you log in).

## 🧩 Recipes

### The high score is saved for you

The best score survives app restarts with nothing to set up:

- **Your app has [AsyncStorage](https://github.com/react-native-async-storage/async-storage)?** It's saved there.
- **On the web,** it's saved in the browser.
- **Neither?** It's kept while the app is open.

Using something else, like MMKV? Pass anything with `getItem` and `setItem`:

```tsx
<OfflineGame
  storage={{
    getItem: (key) => mmkv.getString(key) ?? null,
    setItem: (key, value) => mmkv.set(key, value),
  }}
/>
```

Or turn it off with `rememberHighScore={false}`.

### Add your own content

Anything you put inside shows up under the message:

```tsx
<OfflineGame>
  <Image source={logo} style={{ width: 96, height: 24 }} />
  <Text>Don't worry, your work is saved.</Text>
</OfflineGame>
```

### Vibrate on jumps and crashes 📳

```tsx
<OfflineGame vibration />
```

It uses React Native's built-in `Vibration`, so there's nothing to install. Android buzzes briefly on each jump and crash. iOS only allows one longer buzz without a native module, so on iOS it vibrates only on crashes. For subtler iOS haptics, use `onSound` with `expo-haptics`, as below.

### Turn on the sounds 🔊

Install [`react-native-audio-api`](https://github.com/software-mansion/react-native-audio-api) and the game starts beeping. There's nothing else to change:

```sh
npx expo install react-native-audio-api react-native-worklets
```

- It's a native library, so it needs a [development build](https://docs.expo.dev/develop/development-builds/introduction/). In Expo Go the game simply stays silent.
- The beeps respect the iPhone's silent switch and play over the user's music instead of stopping it.

Prefer your own sounds or a little vibration? Turn the beeps off and react to each moment:

```tsx
<OfflineGame
  sounds={false}
  onSound={(sound) => {
    // sound is 'jump', 'hit' or 'score'
    if (sound === 'hit') Haptics.notificationAsync();
  }}
/>
```

### Say it your way

```tsx
<OfflineGame
  title="You're offline"
  message="Your changes are saved. Have a quick game while we reconnect."
  retryLabel="Reconnect" // or showRetry={false} to hide the button
  colorScheme="dark" // or 'light', or 'auto' (the default)
/>
```

### Use your own offline check

Already know when your server is unreachable? Pass it in. NetInfo is then ignored, but the smooth timing still applies:

```tsx
<OfflineGame isOffline={!serverReachable} />
```

### Just the game

Want the game somewhere else, such as an empty state or a loading screen? Use `DinoGame`:

```tsx
import { DinoGame } from 'react-native-offline-game';

<DinoGame style={{ marginVertical: 24 }} />;
```

### Check the internet with your own server

NetInfo checks for internet access by loading a small Google URL. If your users are somewhere Google is blocked, point it at your own server **before** `OfflineGame` first appears, for example in your entry file:

```ts
import NetInfo from '@react-native-community/netinfo';

NetInfo.configure({ reachabilityUrl: 'https://your-api.example.com/health' });
```

> ⚠️ Calling `NetInfo.configure()` later, after things are already listening, quietly disconnects them from NetInfo. Do it once at startup.

## 📖 API

### `<OfflineGame />`

The full-screen page. Render it once, and it shows up by itself when needed.

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `isOffline` | `boolean` | *uses NetInfo* | Decide yourself when the page shows. |
| `showDelay` | `number` | `1500` | Milliseconds the connection must stay down before the page opens. |
| `hideDelay` | `number` | `1000` | Milliseconds the connection must stay back before the page closes. |
| `title` | `string` | `"No internet"` | The heading under the game. |
| `message` | `string` | `"Check your connection…"` | The text under the heading. |
| `showRetry` | `boolean` | `true` | Show the **Try again** button. |
| `retryLabel` | `string` | `"Try again"` | The button's text. |
| `onRetry` | `() => void` | | The button was pressed. With `isOffline`, re-check your own way here. |
| `children` | `ReactNode` | | Your own content under the message. |
| `dismissible` | `boolean` | `false` | Let Android's back button close the page until the next drop. |
| `onShow` | `() => void` | | The page opened. |
| `onReconnect` | `() => void` | | The page closed because the internet is back. |

It also takes all the `<DinoGame />` props below.

### `<DinoGame />`

The game on its own: 120 points tall, as wide as its container. It has the same controls, and pauses when the app goes to the background. On the web, the keyboard only drives it once it has been started, so it doesn't take over the Space key on your page.

| Prop | Type | Default | What it does |
| --- | --- | --- | --- |
| `highScore` | `number` | `0` | Best score to show at the start. |
| `onHighScoreChange` | `(score) => void` | | A run beat the best score. |
| `onGameOver` | `(score) => void` | | The dinosaur hit something. |
| `rememberHighScore` | `boolean` | `true` | Save the best score between launches. |
| `storage` | `{ getItem, setItem }` | *AsyncStorage or the browser* | Where to save it. |
| `sounds` | `boolean` | `true` | Beep on jumps, crashes and every 100 points (needs `react-native-audio-api`). |
| `onSound` | `('jump' \| 'hit' \| 'score') => void` | | Each of those moments, for your own sounds or haptics. |
| `vibration` | `boolean` | `false` | Buzz on jumps and crashes (crashes only on iOS). |
| `colorScheme` | `'auto' \| 'light' \| 'dark'` | `'auto'` | `'auto'` follows the phone's theme. |
| `onNightChange` | `(night) => void` | | Night started or ended. |
| `options` | `{ fps?, skySpeed?, groundSpeed? }` | `{ fps: 60, skySpeed: 40, groundSpeed: 360 }` | Frame rate cap, cloud speed and starting ground speed (points per second). |
| `style` | `ViewStyle` | | Style for the game's box. |

Give it a `ref` to control it from code: `tap()`, `release()`, `duck(down)` and `pause()`.

### `useIsOffline()`

The same check `OfflineGame` uses, without the waiting. It returns `true` when the device is offline.

```tsx
const offline = useIsOffline();
```

## ❓ FAQ

<details>
<summary><b>The page never appears in the iOS Simulator</b></summary>

The iOS Simulator uses your Mac's internet and has no airplane mode. Turn off your Mac's Wi-Fi, or add `isOffline` while you test. On the Android emulator, turning on airplane mode (or off Wi-Fi and mobile data) works.

</details>

<details>
<summary><b>Does it work in Expo Go?</b></summary>

Yes, everything except the sounds, which need a development build. See [Turn on the sounds](#turn-on-the-sounds-).

</details>

<details>
<summary><b>Does it work on the web?</b></summary>

Yes, with React Native Web (for example `npx expo start --web`). Click, Space or ↑ jumps, and ↓ ducks. The high score is saved in the browser.

</details>

<details>
<summary><b>Dark mode isn't kicking in (Expo)</b></summary>

New Expo apps lock themselves to light mode. Set `"userInterfaceStyle": "automatic"` in `app.json`, or pass `colorScheme="dark"`.

</details>

<details>
<summary><b>Can users close the page and keep using my app offline?</b></summary>

On Android, set `dismissible` and the back button closes it until the next time the connection drops. For anything else, control it yourself with `isOffline`.

</details>

<details>
<summary><b>How big is it, really?</b></summary>

About 9 kB gzipped (20 kB minified) in your app's JavaScript, including all the artwork, which is one built-in image of 1.2 kB. The npm download is 28 kB. It has no dependencies of its own: sounds are generated in code, and vibration and storage use what React Native and your app already have.

</details>

## 🙏 Credits

The game is based on [react-dinosaur-game](https://github.com/LzxHahaha/react-dinosaur-game) by LzxHahaha, and on the T-Rex game from the Chromium project. See [LICENSE](LICENSE) for their notices.

## 📄 License

MIT © Sagar Khengat
