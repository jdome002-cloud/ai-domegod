/* Registers the service worker. External file so CSP can use script-src 'self' only. */
(function () {
  "use strict";
  if (!("serviceWorker" in navigator)) return;
  var host = location.hostname;
  var ok = location.protocol === "https:" || host === "localhost" || host === "127.0.0.1";
  if (!ok) return;
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(function () { /* PWA is optional */ });
  });
})();
