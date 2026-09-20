(function cloverMetrikaMock() {
  var queued = window.ym && window.ym.a ? Array.prototype.slice.call(window.ym.a) : [];
  window.__cloverMetrikaMock = window.__cloverMetrikaMock || {
    calls: [],
    network: [],
    loaded: true,
  };
  window.ym = function () {
    var args = Array.prototype.slice.call(arguments);
    window.__cloverMetrikaMock.calls.push(args);
    window.__cloverMetrikaMock.network.push({
      method: String(args[1] || ""),
      href: String(window.location.href || ""),
    });
  };
  queued.forEach(function (args) {
    window.ym.apply(null, args);
  });
})();
