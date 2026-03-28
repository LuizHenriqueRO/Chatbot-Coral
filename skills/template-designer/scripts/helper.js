(function() {
  function reportEvent(type, data) {
    fetch('/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ type: type, timestamp: Math.floor(Date.now()/1000) }, data))
    }).catch(function() {});
  }

  document.addEventListener('click', function(e) {
    var el = e.target.closest('[data-choice]');
    if (!el) return;
    var choice = el.getAttribute('data-choice');
    var text = el.textContent.trim().substring(0, 200);

    var container = el.closest('.options, .cards');
    var isMulti = container && container.hasAttribute('data-multiselect');
    if (!isMulti && container) {
      container.querySelectorAll('[data-choice]').forEach(function(opt) {
        opt.classList.remove('selected');
      });
    }
    el.classList.toggle('selected');

    var selected = document.querySelectorAll('[data-choice].selected');
    var indicator = document.getElementById('selection-indicator');
    if (indicator) {
      if (selected.length > 0) {
        var labels = Array.from(selected).map(function(s) { return s.getAttribute('data-choice').toUpperCase(); });
        indicator.textContent = 'Selected: ' + labels.join(', ');
        indicator.style.display = 'block';
      } else {
        indicator.style.display = 'none';
      }
    }

    reportEvent('click', { choice: choice, text: text });
  });

  var lastMod;
  setInterval(function() {
    fetch(location.href, { method: 'HEAD' }).then(function(r) {
      var lm = r.headers.get('last-modified');
      if (lm && lastMod && lm !== lastMod) {
        location.reload();
      }
      lastMod = lm;
    }).catch(function() {});
  }, 2000);
})();
