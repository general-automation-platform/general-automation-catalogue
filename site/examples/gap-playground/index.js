// GAP Playground: drives web/playground.html in a browser on the device.
//
//   1. taps a target that jumps somewhere new after every tap
//   2. types a message into a text box and presses Send
//   3. drags a slider to the end
//
// It finds each control by its colour, which works at any screen size, and
// checks its own work by counting the green "done" badges the page shows.

var running = false;

// The page gives every control a colour nothing else on it uses: [r, g, b].
var COLOURS = {
  target: [255, 0, 255],   // magenta
  input:  [0, 255, 255],   // cyan border
  send:   [0, 64, 255],    // blue
  knob:   [255, 128, 0],   // orange
  done:   [0, 200, 83]     // green badge on a finished task
};
var TOLERANCE = 40;        // how far a pixel may be from the colour and still count

function log(message) {
  console.log('[playground] ' + message);
}

// Every patch of one colour on the screen, biggest first, as boxes with a centre.
function findColour(screen, name, minArea) {
  var c = COLOURS[name], t = TOLERANCE;
  var mask = inRange(screen, c[2] - t, c[1] - t, c[0] - t, 0,     // B, G, R, A low
                             c[2] + t, c[1] + t, c[0] + t, 255);  // B, G, R, A high
  var boxes;
  try { boxes = findContours(mask, minArea || 100, 0); }
  finally { releaseImage(mask); }
  return boxes
    .sort(function (a, b) { return b.area - a.area; })
    .map(function (b) {
      return { x: b.x, y: b.y, w: b.width, h: b.height,
               cx: Math.round(b.x + b.width / 2), cy: Math.round(b.y + b.height / 2) };
    });
}

// Take a screenshot, find one colour, and release the screenshot.
function look(name, minArea) {
  var screen = getScreenshot();
  if (screen === 0) return [];
  try { return findColour(screen, name, minArea); }
  finally { releaseImage(screen); }
}

// Look again and again until the colour shows up, or give up after timeoutMs.
function waitFor(name, timeoutMs) {
  var until = Date.now() + timeoutMs;
  while (running && Date.now() < until) {
    var found = look(name);
    if (found.length) return found[0];
    sleep(300);
  }
  return null;
}

// How many tasks the page shows as done.
function doneCount() {
  return look('done', 60).length;
}

function openPage(url) {
  // There is no named call for "open this URL", so this is execute()'s job.
  // It only works once "Allow shell commands" is on for this script.
  var out = execute('am start -a android.intent.action.VIEW -d "' + url + '"');
  if (out === '') {
    log('shell commands are off, so open the page yourself: ' + url);
    return false;
  }
  log('opened ' + url);
  return true;
}

// Keep tapping until the target is gone: the page hides it after the last hit.
// The page, not our own count, says when we are done: a tap can be held back
// (GAP delays a script's touches while a finger is on its bar) or miss.
function tapTarget(maxTaps) {
  for (var i = 1; i <= maxTaps && running; i++) {
    var found = look('target');
    if (!found.length) return true;
    tap(found[0].cx, found[0].cy, 400);
    log('tap ' + i + ' at ' + found[0].cx + ',' + found[0].cy);
  }
  return look('target').length === 0;
}

function sendMessage(text, retry) {
  var input = waitFor('input', 3000);
  if (!input) { log('text box not found'); return false; }
  tap(input.cx, input.cy, 800);           // focus it; the keyboard may slide up
  if (retry) {
    // The first try may have typed already: empty the box before typing again.
    keycode('MOVE_END', 50);
    for (var k = 0; k < text.length * 2; k++) keycode('DEL', 20);
  }
  typing(text, 300);
  log('typed "' + text + '"');

  var send = waitFor('send', 3000);       // look again: the layout may have moved
  if (!send) { log('Send button not found'); return false; }
  tap(send.cx, send.cy, 800);
  log('pressed Send');
  return true;
}

function slideToEnd() {
  var knob = waitFor('knob', 3000);
  if (!knob) { log('slider not found'); return false; }
  // The track ends as far from the right edge as it starts from the left, and
  // the page stops the knob there, so aiming a little past the end is fine.
  var endX = getScreenSize().width - knob.x;
  tapDown(knob.cx, knob.cy, 50);
  for (var step = 1; step <= 20; step++) {
    moveTo(Math.round(knob.cx + (endX - knob.cx) * step / 20), knob.cy, 15, true);
  }
  tapUp(endX, knob.cy, 600);
  log('slid the knob to x=' + endX);
  return true;
}

function start(settings = {}) {
  var url = settings.url || 'https://www.gapapp.app/examples/gap-playground/web/playground.html';
  var message = settings.message || 'Hello from GAP';

  running = true;
  showBanner('Playground: starting', 2000);
  if (settings.openPage !== false) openPage(url);

  log('waiting for the page');
  if (!waitFor('target', 20000)) {
    log('no target on screen - is the playground page open?');
    running = false;
    return;
  }
  sleep(1000);   // give the page a moment to settle before the first touch

  var steps = [
    ['Tapping the target', function () { return tapTarget(15); }],
    ['Typing a message',   function (retry) { return sendMessage(message, retry); }],
    ['Sliding to finish',  function () { return slideToEnd(); }]
  ];
  for (var i = 0; i < steps.length && running; i++) {
    showBanner(steps[i][0], 3000);
    // Do the task, then check the page agrees: one more try if it doesn't.
    var done = 0;
    for (var attempt = 1; attempt <= 2 && running; attempt++) {
      steps[i][1](attempt > 1);
      sleep(500);
      done = doneCount();
      if (done > i) break;
      if (attempt < 2) log(steps[i][0].toLowerCase() + ' did not register, trying again');
    }
    log('tasks done: ' + done + ' of 3');
    if (done <= i) break;
  }

  var done = doneCount();
  log(done === 3 ? 'all three tasks done' : 'finished with ' + done + ' of 3 done');
  showBanner(done === 3 ? 'Playground: all done' : 'Playground: ' + done + ' of 3', 4000);
  running = false;
}

function stop() {
  running = false;
}
