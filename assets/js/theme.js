(function () {
  var root = document.documentElement;
  var toggle = document.getElementById('theme-toggle');
  var metaTheme = document.querySelector('meta[name="theme-color"]');
  var colors = { light: '#fbf9ef', dark: '#171412' };
  if (!toggle) return;

  toggle.addEventListener('click', function () {
    var current = root.getAttribute('data-theme') || 'light';
    var next = current === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    if (metaTheme) metaTheme.setAttribute('content', colors[next]);
    try { localStorage.setItem('theme', next); } catch (e) {}
  });
})();
