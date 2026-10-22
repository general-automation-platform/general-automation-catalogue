// Shared by every page: the theme switch and the Copy buttons on code panels.
// The theme itself is set before first paint by a one-line script in <head>.
(function () {
  'use strict';
  var root = document.documentElement;

  function label(btn) {
    btn.textContent = root.dataset.theme === 'light' ? 'Dark theme' : 'Light theme';
  }
  document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
    label(btn);
    btn.addEventListener('click', function () {
      root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light';
      try { localStorage.setItem('gap-theme', root.dataset.theme); } catch (e) {}
      label(btn);
    });
  });

  document.addEventListener('click', function (e) {
    var c = e.target.closest('[data-copy]');
    if (!c) return;
    var pre = c.closest('.file').querySelector('pre');
    try {
      navigator.clipboard.writeText(pre.textContent).then(function () {
        c.textContent = 'Copied';
        setTimeout(function () { c.textContent = 'Copy'; }, 1400);
      }, function () {});
    } catch (err) {}
  });
})();
