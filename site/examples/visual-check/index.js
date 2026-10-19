// Visual check: walks a shop's screens (web/shop.html) in a browser on the device,
// compares each screen with an approved picture of it (its baseline) and reports
// what changed.
//
// Two layers:
//   1. The core (walk, compare, report with console.log and showBanner) runs in
//      plain GAP, nothing linked.
//   2. The companion layer at the bottom (the gap* globals) comes alive only
//      when the script is signed and the device is linked to GAP Companion:
//      settings and results on the phone, Approve / Reject, pushes, and asking
//      the user what to tap on a screen it does not know.
//
// It finds every control by its colour, which works at any screen size, and
// keeps its pictures in this device's own folder, so each device has its own
// baselines and fonts or sizes that differ between devices don't matter.

var GAP_SCRIPT_ID = 'app.gap.VisualCheck';
var DEFAULT_URL = 'https://www.gapapp.app/examples/visual-check/web/shop.html';

// --- Settings ----------------------------------------------------------------

var DEFAULTS = {
  url: DEFAULT_URL,
  openPage: true,  // open the page with a shell command (needs Allow shell commands)
  build: 'a',      // which build of the shop to open: a (the baseline) or b
  threshold: 10,   // a screen matches while under threshold / 100 % of it changed
  screens: 8,      // how many screens to check, from the first
  passes: 1        // passes over the screens; 0 = until stopped
};
var settings = copy(DEFAULTS);

function copy(o) {
  return JSON.parse(JSON.stringify(o));
}

function folder() {
  return getDevicePath() + '/visual-check';
}

function loadSettings() {
  try {
    var saved = JSON.parse(readFile(folder() + '/settings.json') || '{}');
    for (var k in DEFAULTS) if (saved[k] !== undefined) settings[k] = saved[k];
  } catch (e) {}
}

function saveSettings() {
  writeFile(folder() + '/settings.json', JSON.stringify(settings));
}

// --- The shop's screens --------------------------------------------------------

// Every control the script looks for has a colour nothing else on the page uses: [r, g, b].
var COLOURS = {
  marker: [255, 0, 255],   // the strip at the top; only what is below it is compared
  input:  [0, 255, 255],   // the search box's border
  go:     [255, 128, 0],   // the disc on the control that moves to the next screen
  knob:   [0, 200, 83]     // the "slide to add" knob
};
var TOLERANCE = 40;

// The walk, in order. `look` is what proves the screen is there; `next` moves on.
var SCREENS = [
  { key: 'home',     name: 'Home',           look: 'input', next: searchFor },
  { key: 'results',  name: 'Search results', look: 'go',    next: tapGo },
  { key: 'product',  name: 'Product',        look: 'knob',  next: slideToAdd },
  { key: 'cart',     name: 'Cart',           look: 'go',    next: tapGo },
  { key: 'checkout', name: 'Checkout',       look: 'go',    next: tapGo },
  { key: 'receipt',  name: 'Receipt',        look: 'go',    next: tapGo },
  { key: 'history',  name: 'Order history',  look: 'go',    next: tapGo },
  { key: 'settings', name: 'Settings',       look: 'go',    next: tapGo }
];

// --- Run state -------------------------------------------------------------------

var running = false;
var stopAfterPass = false;  // finish this pass, then stop (the companion's "Stop after round")
var cropTop = 0;            // first row below the marker strip, found once per page
var progress = { pass: 0, index: 0, of: 0, checked: 0, matched: 0, review: 0, screen: null };
var lastResults = null;     // the last pass's verdicts, for Approve / Reject

function log(message) {
  console.log('[visual-check] ' + message);
}

// --- Finding things by colour ------------------------------------------------------

// Every patch of one colour, biggest first, as boxes with a centre.
function findColour(image, name, minArea) {
  var c = COLOURS[name], t = TOLERANCE;
  var mask = inRange(image, c[2] - t, c[1] - t, c[0] - t, 0, c[2] + t, c[1] + t, c[0] + t, 255);
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

function look(name) {
  var screen = getScreenshot();
  if (screen === 0) return null;
  try { return findColour(screen, name)[0] || null; }
  finally { releaseImage(screen); }
}

// Looks again and again until the colour shows, or gives up after timeoutMs.
function waitFor(name, timeoutMs) {
  var until = Date.now() + timeoutMs;
  while (running && Date.now() < until) {
    var found = look(name);
    if (found) return found;
    sleep(300);
  }
  return null;
}

// --- Moving through the shop -------------------------------------------------------

function searchFor() {
  var box = look('input');
  if (!box) return false;
  tap(box.cx, box.cy, 800);      // focus it; the keyboard may slide up
  typing('tote', 300);
  var go = waitFor('go', 3000);  // look again: the keyboard may have moved things
  if (!go) return false;
  tap(go.cx, go.cy, 600);
  return true;
}

function tapGo() {
  var go = look('go');
  if (!go) return false;
  tap(go.cx, go.cy, 600);
  return true;
}

function slideToAdd() {
  var knob = look('knob');
  if (!knob) return false;
  // The track ends as far from the right edge as it starts from the left.
  var endX = getScreenSize().width - knob.x;
  tapDown(knob.cx, knob.cy, 50);
  for (var step = 1; step <= 20; step++) {
    moveTo(Math.round(knob.cx + (endX - knob.cx) * step / 20), knob.cy, 15, true);
  }
  tapUp(endX, knob.cy, 600);
  return true;
}

function openPage() {
  var url = settings.url + (settings.url.indexOf('?') < 0 ? '?' : '&') + 'build=' + settings.build;
  // No named call opens a URL, so this is execute()'s job; "" while shell commands are off.
  var out = execute('am start -a android.intent.action.VIEW -d "' + url + '"');
  if (out === '') log('shell commands are off, so open the page yourself: ' + url);
  else log('opened ' + url);
  cropTop = 0;
}

// --- Capturing and comparing -----------------------------------------------------------

// The screen below the marker strip and above the navigation bar; 0 when it can't.
function capture() {
  var screen = getScreenshot();
  if (screen === 0) return 0;
  try {
    if (!cropTop) {
      var strip = findColour(screen, 'marker', 200)[0];
      if (!strip) return 0;
      cropTop = strip.y + strip.h;
    }
    var size = getImageSize(screen);
    return cropImage(screen, 0, cropTop, size.width, size.height - cropTop - getVirtualButtonHeight());
  } finally {
    releaseImage(screen);
  }
}

// Where two pictures differ: a mask of the changed pixels, grown so nearby
// changes join into one region. The caller releases it.
function changedMask(a, b) {
  var diff = absDiff(a, b);
  var gray = bgrToGray(diff);
  releaseImage(diff);
  threshold(gray, 32, 255, 0);  // a channel moved by more than 32: changed
  dilate(gray, 15, 15);
  return gray;
}

// {pct, regions} between a picture and the baseline at basePath; null without one.
function compare(current, basePath) {
  var base = openImage(basePath);
  if (base === 0) return null;
  try {
    var a = getImageSize(current), b = getImageSize(base);
    if (a.width !== b.width || a.height !== b.height) return { pct: 100, regions: 1, mask: 0 };
    var mask = changedMask(current, base);
    var boxes = findContours(mask, 64, 0);
    var area = 0;
    boxes.forEach(function (r) { area += r.width * r.height; });
    var pct = Math.round(area * 10000 / (a.width * a.height)) / 100;
    return { pct: pct, regions: boxes.length, mask: mask };
  } finally {
    releaseImage(base);
  }
}

// One pink pixel (RGBA ff2fd2ff), stretched to fill the change outlines.
var PINK = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4r3/pPwAHMQMAv1JuugAAAABJRU5ErkJggg==';
var GRAY2BGRA = 9;  // OpenCV's COLOR_GRAY2BGRA, for convertColor

// The difference picture: the current screen in grey, changed regions in
// colour with a pink outline. The three layers never overlap, so absDiff
// against a zero pixel simply adds them together.
function saveDiff(current, mask, path) {
  var size = getImageSize(current);
  var outer = clone(mask);
  dilate(outer, 13, 13);
  var ring = absDiff(outer, mask);           // the outline: grown minus the region
  var outside = clone(outer);
  threshold(outside, 127, 255, 1);           // everything the outline doesn't cover

  var gray = bgrToGray(current);
  convertColor(gray, GRAY2BGRA);
  var pink1 = getImageFromBase64(PINK);
  var pink = resizeImage(pink1, size.width, size.height);

  var layers = [cloneWithMask(gray, outside), cloneWithMask(current, mask), cloneWithMask(pink, ring)];
  var sum = absDiff(layers[0], layers[1]);
  var out = absDiff(sum, layers[2]);
  saveImage(out, path);
  [outer, ring, outside, gray, pink1, pink, sum, out].concat(layers).forEach(releaseImage);
}

// Waits until two captures in a row are the same, then answers the last one.
function settled(timeoutMs) {
  var until = Date.now() + timeoutMs;
  var last = capture();
  while (running && Date.now() < until) {
    sleep(400);
    var next = capture();
    if (last !== 0 && next !== 0) {
      var mask = changedMask(last, next);
      var still = findContours(mask, 64, 0).length === 0;
      releaseImage(mask);
      if (still) { releaseImage(last); return next; }
    }
    if (last !== 0) releaseImage(last);
    last = next;
  }
  return last;  // never still: compare what there is
}

// Captures one screen, compares it with its baseline and saves the pictures.
function check(s, index, of) {
  var dir = folder() + '/' + s.key;
  var shot = settled(4000);
  if (shot === 0) return { screen: s.name, set: s.key, index: index, status: 'Not captured', match: false, pct: 0, regions: 0 };
  var verdict;
  try {
    saveImage(shot, dir + '/current.png');
    var c = compare(shot, dir + '/baseline.png');
    if (c === null) {
      copyFile(dir + '/current.png', dir + '/baseline.png');
      verdict = { status: 'New baseline', match: true, pct: 0, regions: 0 };
    } else {
      var match = c.pct < settings.threshold / 100;
      removeFile(dir + '/diff.png');  // never show an older pass's difference
      if (!match && c.mask) saveDiff(shot, c.mask, dir + '/diff.png');
      if (c.mask) releaseImage(c.mask);
      verdict = { status: match ? 'Match' : 'Changed', match: match, pct: c.pct, regions: c.regions };
    }
  } finally {
    releaseImage(shot);
  }
  var result = { screen: s.name, set: s.key, index: index, status: verdict.status, match: verdict.match,
                 pct: verdict.pct, regions: verdict.regions };
  log(s.name + ': ' + verdict.status + (verdict.pct ? ' (' + verdict.pct + '%, ' + verdict.regions + ' regions)' : ''));
  // `change` only when it changed, so the phone's title can pick its wording.
  emitEvent('check.screen', { screen: s.name, index: index, of: of, match: verdict.match ? 1 : 0,
                              review: verdict.match ? 0 : 1, pct: verdict.pct, regions: verdict.regions,
                              change: verdict.match ? null : verdict.regions + ' regions, ' + verdict.pct + '%',
                              status: verdict.status });
  // The pictures a person will look at go to the phone: what changed, and a new baseline.
  if (!verdict.match) sendImages(s.key, { baseline: 'baseline.png', current: 'current.png', diff: 'diff.png' });
  else if (verdict.status === 'New baseline') sendImages(s.key, { baseline: 'baseline.png' });
  return result;
}

// --- A pass ------------------------------------------------------------------------------

// Arrives on screen s: waits for what proves it, asking for help when it never shows.
function arrive(s) {
  if (waitFor(s.look, 5000)) return true;
  if (!running) return false;
  log(s.name + ' did not show: an unfamiliar screen');
  return unfamiliar(s) && waitFor(s.look, 3000) !== null;
}

function pass(n) {
  var of = Math.min(settings.screens, SCREENS.length);
  var results = [];
  progress = { pass: n, index: 0, of: of, checked: 0, matched: 0, review: 0, screen: null };
  emitEvent('round.start', { round: n, build: settings.build });
  showBanner('Visual check: pass ' + n, 2000);

  for (var i = 0; i < SCREENS.length && running; i++) {
    var s = SCREENS[i];
    progress.screen = s.name;
    if (!arrive(s)) {
      log('could not reach ' + s.name + '; stopping the pass');
      notify({ title: 'Visual check stopped', body: 'Could not reach ' + s.name + '.', category: 'alert', tag: 'run' });
      return null;
    }
    if (i < of) {
      var r = check(s, i + 1, of);
      results.push(r);
      progress.index = i + 1;
      progress.checked++;
      if (r.match) progress.matched++; else progress.review++;
    }
    if (!s.next()) {
      log('could not move on from ' + s.name);
      return null;
    }
  }
  if (!running) return null;

  var changed = results.filter(function (r) { return !r.match; });
  lastResults = { build: settings.build, pass: n, screens: results };
  emitEvent('check.results', lastResults);
  emitEvent('check.run', { round: n, build: settings.build, checked: results.length,
                           matched: results.length - changed.length, review: changed.length });
  emitEvent('round.end', { round: n });
  var line = changed.length === 0 ? 'All ' + results.length + ' matched'
    : changed.length + (changed.length === 1 ? ' screen changed' : ' screens changed');
  log('pass ' + n + ': ' + line);
  showBanner('Visual check: ' + line, 4000);
  notify({ title: 'Visual check: ' + line, category: 'run', tag: 'run',
           lines: changed.slice(0, 5).map(function (r) { return r.screen + ': ' + r.regions + ' regions, ' + r.pct + '%'; }) });
  return results;
}

function start(given) {
  loadSettings();
  for (var k in DEFAULTS) if (given && given[k] !== undefined) settings[k] = given[k];
  saveSettings();
  running = true;
  stopAfterPass = false;
  makeDirs(folder());
  if (settings.openPage !== false) openPage();
  log('build ' + settings.build + ', threshold ' + settings.threshold / 100 + '%');

  try {
    for (var n = 1; running && (settings.passes === 0 || n <= settings.passes); n++) {
      var build = settings.build;
      if (!pass(n) || stopAfterPass) break;
      // A build picked during the pass applies from the next one.
      if (settings.build !== build && settings.openPage !== false) openPage();
    }
  } finally {
    if (stopAfterPass) notify({ title: 'Visual check stopped after the pass', category: 'run', tag: 'run' });
    running = false;
    stopAfterPass = false;
    progress.screen = null;
  }
}

function stop() {
  running = false;
}

// --- Approve and Reject --------------------------------------------------------------------

// Approve: this screen's current picture becomes its baseline.
function approve(key) {
  var dir = folder() + '/' + key;
  if (!copyFile(dir + '/current.png', dir + '/baseline.png')) return false;
  mark(key, 'Approved', true);
  sendImages(key, { baseline: 'baseline.png' });
  log(key + ': approved as the new baseline');
  return true;
}

// Reject: the baseline stays; the verdict says the change was refused.
function reject(key) {
  mark(key, 'Rejected', false);
  log(key + ': change rejected');
  return true;
}

function mark(key, status, match) {
  if (!lastResults) return;
  lastResults.screens.forEach(function (r) {
    if (r.set === key) { r.status = status; r.match = match; }
  });
  emitEvent('check.results', lastResults);
}

// --- An unfamiliar screen ------------------------------------------------------------------

// What to do on a screen the walk doesn't know (build B's "Allow notifications?"
// dialog). Linked to GAP Companion: ask the user (below). Otherwise, or when
// nobody answers: press Back, which closes the shop's dialog.
function unfamiliar(s) {
  var outcome = typeof __gapRemote === 'object' ? askForDirection(s) : 'unavailable';
  if (outcome === 'continue') return true;
  if (!running) return false;
  log('pressing Back (' + outcome + ')');
  keycode('BACK', 800);
  return true;
}

// =========================================================================================
// The companion layer. Everything below is for GAP Companion and does nothing
// without it: the globals are only called when the script is signed and the
// device linked. Contract: GAP Companion's cloud/adapters/README.md.
// =========================================================================================

// Sends a push to the linked phones (README § Notifications).
function notify(note) {
  emitEvent('gap.notify', note);
}

// Has GAP upload pictures from this device's folder for the phone (README § UI 4, Images).
function sendImages(key, files) {
  var paths = {};
  for (var name in files) paths[name] = 'visual-check/' + key + '/' + files[name];
  emitEvent('gap.images', { set: key, files: paths });
}

// --- Direction requests (README § Direction requests) ---------------------------------------

var direct = null;  // the open request: {id, step, state, queue: [], ended: null}

function directEmit(extra) {
  var e = { id: direct.id, state: direct.state, step: direct.step };
  for (var k in extra) e[k] = extra[k];
  emitEvent('gap.direct', e);
}

// Asks the phone what to tap and plays what comes back, until Continue, the
// 10-minute wait runs out, or the run stops. Answers 'continue', 'timeout' or 'stopped'.
function askForDirection(s) {
  var expires = Date.now() + 10 * 60000;
  direct = { id: 'vc_' + Date.now().toString(36), step: 1, state: 'waiting', queue: [], ended: null };
  var waiting = function () {
    directEmit({ expiresAt: new Date(expires).toISOString(), maxActions: 1,
                 title: 'Visual check needs your direction',
                 body: 'Paused on a screen it does not know, before ' + s.name + '.' });
  };
  waiting();
  showBanner('Waiting for direction on the phone', 3000);
  var lastSent = Date.now();
  var outcome = 'timeout';
  try {
    while (true) {
      if (!running) { outcome = 'stopped'; break; }
      if (direct.ended) { outcome = direct.ended; break; }
      if (Date.now() > expires) break;
      var play = direct.queue.shift();
      if (play) {
        // gapDirect already sent us to `working`; perform, then wait for the next look.
        directEmit({});
        play.actions.forEach(function (a) { perform(a, play.delayMs); });
        direct.step++;
        direct.state = 'waiting';
        waiting();
        lastSent = Date.now();
      } else if (Date.now() - lastSent > 60000) {
        waiting();  // restores the request after a reconnect; free otherwise
        lastSent = Date.now();
      }
      sleep(250);
    }
  } finally {
    directEmit({ state: 'closed', reason: outcome });
    direct = null;
  }
  return outcome;
}

// One action from the phone: fractions of the whole screen.
function perform(a, delayMs) {
  var size = getScreenSize();
  if (a.type === 'tap') {
    tap(a.x * size.width, a.y * size.height, delayMs);
  } else if (a.type === 'drag') {
    var p = a.path, each = Math.max(5, Math.round(a.ms / p.length));
    tapDown(p[0][0] * size.width, p[0][1] * size.height, each);
    for (var i = 1; i < p.length; i++) moveTo(p[i][0] * size.width, p[i][1] * size.height, each, true);
    tapUp(p[p.length - 1][0] * size.width, p[p.length - 1][1] * size.height, delayMs);
  }
}

// The phone's direct.play / direct.continue. Only checks and queues: the loop above plays.
function gapDirect(op, argsJson) {
  var a = JSON.parse(argsJson);
  if (!direct || a.id !== direct.id) return JSON.stringify({ ok: false, why: 'not-waiting' });
  if (op === 'continue') {
    direct.ended = 'continue';
    return JSON.stringify({ ok: true });
  }
  if (op !== 'play' || direct.state !== 'waiting') return JSON.stringify({ ok: false, why: 'not-waiting' });
  if (a.actions.length > 1) return JSON.stringify({ ok: false, why: 'too-many-actions' });
  direct.state = 'working';
  direct.queue.push(a);
  return JSON.stringify({ ok: true, accepted: a.actions.length });
}

// --- Settings and state on the phone (README § Settings from the script) --------------------

function gapSettingsSchema() {
  return JSON.stringify({
    ui: 2,
    controls: [
      { key: 'build', label: 'Build', type: 'enum', applies: 'nextRound',
        options: [{ value: 'a', label: 'Build A (baseline)' }, { value: 'b', label: 'Build B' }] },
      { key: 'threshold', label: 'Allowed change', type: 'int', applies: 'now', unit: '%',
        min: 1, max: 500, step: 1, bigStep: 5, scale: 100,
        help: 'A screen matches while less than this much of it changed.' },
      { key: 'screens', label: 'Screens to check', type: 'int', applies: 'nextRound', min: 1, max: SCREENS.length, step: 1 },
      { key: 'passes', label: 'Passes', type: 'int', applies: 'nextStart', min: 0, max: 99, step: 1,
        help: '0 keeps going until stopped.' },
      { key: 'url', label: 'Page address', type: 'string', applies: 'nextStart' },
      { key: 'openPage', label: 'Open the page for me', type: 'bool', applies: 'nextStart',
        help: 'Needs Allow shell commands.' }
    ],
    layout: [{ id: 'check', label: 'Check', groups: [
      { label: 'What to check', items: [{ control: 'build' }, { control: 'screens' }, { control: 'threshold' }] },
      { label: 'Run', items: [{ control: 'passes' }, { control: 'url' }, { control: 'openPage' }] }
    ] }],
    presetFields: ['build', 'threshold', 'screens']
  });
}

function gapCompanion() {
  return JSON.stringify({
    readouts: [{ key: 'checked', label: 'Checked', unit: 'count' },
               { key: 'review', label: 'Needs review', unit: 'count' }],
    stats: [
      { key: 'screens', label: 'Screens checked', unit: 'count', event: 'check.screen', op: 'count' },
      { key: 'matched', label: 'Matched', unit: 'count', event: 'check.screen', field: 'match', op: 'sum' },
      { key: 'review', label: 'Needs review', unit: 'count', event: 'check.screen', field: 'review', op: 'sum' },
      { key: 'passes', label: 'Passes', unit: 'count', event: 'check.run', op: 'count' }
    ],
    actions: [
      { name: 'stopAfterPass', label: 'Stop after this pass', role: 'stopAfter' },
      { name: 'keepGoing', label: 'Keep going', role: 'cancelStopAfter' },
      { name: 'approve', label: 'Approve as new baseline', args: { screen: { type: 'string', label: 'Screen' } } },
      { name: 'reject', label: 'Reject', args: { screen: { type: 'string', label: 'Screen' } } }
    ]
  });
}

function gapRemoteState() {
  return JSON.stringify({
    active: running,
    values: settings,
    readouts: { checked: running ? progress.checked : null, review: running ? progress.review : null },
    flags: { stopPending: running && stopAfterPass, directing: direct !== null },
    info: { screen: progress.screen, build: settings.build }
  });
}

function gapRemoteSet(key, value) {
  if (!(key in DEFAULTS)) return JSON.stringify({ ok: false, why: 'unknown-key' });
  if (key === 'build' && value !== 'a' && value !== 'b') return JSON.stringify({ ok: false, why: 'bad-value' });
  settings[key] = value;
  saveSettings();
  return JSON.stringify({ ok: true, value: value });
}

function gapRemoteAction(name, argsJson) {
  var args = JSON.parse(argsJson || 'null') || {};
  if (name === 'stopAfterPass' || name === 'keepGoing') {
    if (!running) return JSON.stringify({ ok: false, why: 'no run' });
    stopAfterPass = name === 'stopAfterPass';
    return JSON.stringify({ ok: true, armed: stopAfterPass });
  }
  if (name === 'approve' || name === 'reject') {
    var key = keyOf(args.screen);
    if (!key) return JSON.stringify({ ok: false, why: 'no such screen' });
    var done = name === 'approve' ? approve(key) : reject(key);
    return JSON.stringify(done ? { ok: true } : { ok: false, why: 'no current picture' });
  }
  return JSON.stringify({ ok: false, why: 'unknown action' });
}

// A screen's key from its name or key.
function keyOf(screen) {
  var s = SCREENS.filter(function (x) { return x.key === screen || x.name === screen; })[0];
  return s ? s.key : null;
}

// Remote start: the saved settings, so a device that never ran it starts too.
function gapRemoteStartPrepare(optsJson) {
  loadSettings();
  return JSON.stringify({ settings: settings });
}

function gapRemoteStartRun(preparedJson) {
  start(JSON.parse(preparedJson).settings);
}

// --- The device screen on the phone (README § Screens from the script, UI 4) -----------------

function gapScreens() {
  return JSON.stringify({
    ui: 4,
    summary: {
      headline: { label: 'Screen', bind: 'state.info.screen', whenEmpty: 'Starting' },
      progress: { event: 'check.screen', bind: 'data.index', max: 'data.of', label: 'screens' }
    },
    tabs: [
      { id: 'checks', label: 'Checks', items: [
        { slot: 'totals' },
        { card: 'Last pass', icon: 'play', items: [
          { table: {
            rows: { from: 'event', event: 'check.results', path: 'screens' },
            empty: 'No pass finished yet.',
            columns: [{ label: 'Screen', bind: 'row.screen', bold: true },
                      { label: 'Verdict', bind: 'row.status' },
                      { label: 'Changed', bind: 'row.pct', format: 'percent' }],
            open: { title: '{row.screen}: {row.status}', items: [
              { image: { bind: 'row.set', name: 'baseline', label: 'Baseline' } },
              { image: { bind: 'row.set', name: 'current', label: 'Current' }, when: '!row.match' },
              { image: { bind: 'row.set', name: 'diff', label: 'Difference',
                         caption: '{row.regions} regions changed, {row.pct|percent} of the screen' }, when: '!row.match' },
              { button: 'reject', args: { screen: 'row.set' }, when: 'row.status=Changed' },
              { button: 'approve', args: { screen: 'row.set' }, when: 'row.status=Changed' }
            ] }
          } }
        ] }
      ] },
      { id: 'settings', label: 'Settings', items: [{ slot: 'settings' }] },
      { id: 'events', label: 'Events', items: [{ slot: 'events' }] }
    ],
    events: {
      'check.screen': { title: ['{data.screen} changed: {data.change}', '{data.screen}: {data.status}'],
                        short: ['{data.index} of {data.of} screens'], kind: 'info' },
      'check.run': { title: ['Pass {data.round}: {data.review} to review of {data.checked}'],
                     short: ['{data.matched} of {data.checked} matched'], kind: 'result' },
      'check.results': { title: ['Verdicts for build {data.build}'], kind: 'info' },
      'round.start': { title: ['Pass {data.round} started (build {data.build})'], kind: 'start' }
    }
  });
}
