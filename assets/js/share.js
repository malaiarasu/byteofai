(function () {
  var buttons = document.querySelectorAll('.share-copy');
  if (!buttons.length) return;

  buttons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var url = btn.getAttribute('data-share-url');
      var msg = btn.parentElement.querySelector('.share-copied-msg');

      function showCopied() {
        if (!msg) return;
        msg.textContent = 'Link copied!';
        clearTimeout(msg._hideTimer);
        msg._hideTimer = setTimeout(function () {
          msg.textContent = '';
        }, 2000);
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(showCopied, function () {
          fallbackCopy(url, showCopied);
        });
      } else {
        fallbackCopy(url, showCopied);
      }
    });
  });

  function fallbackCopy(text, done) {
    var temp = document.createElement('textarea');
    temp.value = text;
    temp.style.position = 'fixed';
    temp.style.opacity = '0';
    document.body.appendChild(temp);
    temp.select();
    try {
      document.execCommand('copy');
    } catch (e) {}
    document.body.removeChild(temp);
    done();
  }
})();
