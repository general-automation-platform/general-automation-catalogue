// Find and tap: looks for images/target.png on the screen and taps it.
// The floating bar's Play button calls start(settings); Stop calls stop().

var running = false;
var run = 0;               // which start() is current, if Play is pressed again

function start(settings = {}) {
  const threshold = settings.threshold ?? 0.85;
  const maxTaps = settings.maxTaps ?? 5;

  // The picture to look for, from this script's own folder.
  const target = openImage(getScriptPath() + '/images/target.png');
  if (target === 0) {
    console.log('images/target.png is missing');
    return;
  }
  const { width, height } = getImageSize(target);

  running = true;
  const me = ++run;
  let taps = 0;
  console.log(`looking for a ${width}x${height} target, threshold ${threshold}`);

  try {
    while (running && me === run && taps < maxTaps) {
      const screen = getScreenshot();
      if (screen === 0) {                          // the engine is not ready
        sleep(1000);
        continue;
      }

      const hit = findImage(screen, target);       // best match: {x, y, score}
      releaseImage(screen);                        // screenshots are native memory

      if (hit.score >= threshold) {
        // x, y is the match's top-left corner, so aim for its middle.
        const x = Math.round(hit.x + width / 2);
        const y = Math.round(hit.y + height / 2);
        tap(x, y, 300);
        taps++;
        console.log(`found (score ${hit.score.toFixed(2)}), ` +
                    `tapped ${x},${y} [${taps}/${maxTaps}]`);
        sleep(1500);                               // let the app react
      } else {
        console.log(`not on screen (best ${hit.score.toFixed(2)})`);
        sleep(1000);
      }
    }
  } finally {
    // Runs however the loop ends, even when Stop cuts it short.
    releaseImage(target);
    if (me === run) running = false;
  }
  console.log('done');
}

// Runs while start() is still looping, so it only has to clear the flag.
function stop() {
  running = false;
}
