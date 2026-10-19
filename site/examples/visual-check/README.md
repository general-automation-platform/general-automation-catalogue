# Visual check

A GAP script that tests a web page visually: it walks through every screen of
a small shop, compares each one with an approved picture of it (its
**baseline**) and reports which screens changed. Copy this folder, run it, then
point it at your own app.

> **Status:** written and checked against GAP Companion's adapter, not yet run
> on a device. Screenshots and a tested log come with that run.

The shop, `web/shop.html`, has eight screens: Home, Search results, Product,
Cart, Checkout, Receipt, Order history and Settings. It comes in two builds:

- `shop.html?build=a`, the baseline.
- `shop.html?build=b`, a new build: Checkout picks Express delivery, so
  shipping and the total change and the button is a new colour; Cart and
  Settings change a few words; and Cart opens an "Allow notifications?" dialog
  the script has never seen.

Getting through the shop takes a tap, typing (the search box) and a drag (the
"slide to add" slider), like the [playground](../gap-playground/).

## What's in the folder

| File | What it is |
|:--|:--|
| `index.js` | The script: the walk and the comparison, then the GAP Companion layer |
| `index.html` | Its settings page: build, allowed change, screens, passes, page address |
| `web/shop.html` | The shop it walks. Also online at https://www.gapapp.app/examples/visual-check/web/shop.html |

## Run it

1. Copy the whole `visual-check` folder to
   `Download/GeneralAutomationPlatform/scripts/` on the device:

   ```
   adb shell mkdir -p /sdcard/Download/GeneralAutomationPlatform/scripts
   adb push visual-check /sdcard/Download/GeneralAutomationPlatform/scripts/
   ```

2. In GAP, open **Library → Local** and tap ▶ on `visual-check`.
3. *Optional:* turn on **Allow shell commands** for it (its card → Settings),
   so it opens the shop itself. Without it, open the shop in a browser first.
4. Pick **Build A** and press **▶ Play**. The first pass saves every screen as
   its baseline.
5. Pick **Build B** and play again. Checkout is flagged; the dialog on Cart
   is closed with Back (or, with GAP Companion, by you from your phone).

The pictures are in this device's own folder, `getDevicePath()` +
`/visual-check/<screen>/`: `baseline.png`, `current.png` and, for a changed
screen, `diff.png` (the screen in grey, what changed in colour with a pink
outline). Delete a screen's `baseline.png` to take a new one.

## How it works

| Step | Calls |
|:--|:--|
| Open the shop | `execute('am start -a android.intent.action.VIEW -d "<url>"')`, only because no named call opens a URL |
| Find a control | `getScreenshot()`, `inRange()` for its colour, `findContours()` for the patch. The shop gives each control a colour nothing else uses |
| Move on | `tap()`; `typing()` into the search box; `tapDown()`, `moveTo()`, `tapUp()` for the slider |
| Capture | Wait until two screenshots in a row are the same, then `cropImage()` below the magenta strip the shop draws at its top, so the browser's own bar is never compared |
| Compare | `absDiff()` with the baseline, `bgrToGray()`, `threshold()` (a channel moved by more than 32), `dilate()` so nearby changes join, `findContours()` for the regions. A screen matches while the regions cover less than the allowed change (0.1 % by default) |
| Save | `saveImage()`; the difference picture is three masked layers (`cloneWithMask()`) added together with `absDiff()` |
| Report | `console.log()`, `showBanner()`, and `emitEvent()`: `check.screen` per screen, `check.results` and `check.run` per pass |
| An unfamiliar screen | When the control it expects never shows, it presses Back, which closes the shop's dialog |

## Watch it from your phone

With the script signed and the device linked to
[GAP Companion](https://gapapp.app), the same run also:

- shows a **Checks** tab: every screen's verdict from the last pass; tap one
  to see its baseline, current picture and difference, with **Approve** (the
  current picture becomes the baseline) and **Reject**;
- puts "5 of 8 screens" on the device's card while it runs;
- lets you change the build, allowed change and screens from the phone, and
  save them as a preset for many devices;
- pushes "3 screens changed" when a pass ends, and an alert when a screen
  can't be reached;
- **asks you what to tap** on a screen it doesn't know (the dialog in build
  B): your phone shows the screen, you tap "Don't allow", press ▶‖, then
  Continue. Without an answer in 10 minutes it presses Back itself.

That layer is the `gap*` globals at the bottom of `index.js`. They do nothing
without GAP Companion, and they are a working example of its script contract.

## Make it yours

- Point **Page address** at your own page and give its controls colours of
  their own, or swap colour finding for picture finding (`findImage`) to walk
  an app you don't control.
- Change `SCREENS` in `index.js`: each entry says what proves the screen is
  there (`look`) and how to move on (`next`).
- Every call is in the [API reference](https://www.gapapp.app/api.html).
