/**
 * Single pre-React redirect off `/` after OTA/cold start.
 * Prevents reload loops between "Starting ISO Grid" and "Preparing the app…".
 */
(function () {
  var ATTEMPT_KEY = "iso-native-ota-nav-attempted:v1";

  function isNativeShell() {
    try {
      if (localStorage.getItem("__ISO_MOBILE_SHELL__") === "1") return true;
    } catch (e) {
      /* ignore */
    }
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      return true;
    }
    var host = (location.hostname || "").toLowerCase();
    return host === "localhost" || host === "127.0.0.1";
  }

  if (!isNativeShell()) return;

  function normalizePath(pathname) {
    var path = pathname || "/";
    if (path.endsWith("/index.html")) {
      path = path.slice(0, -"/index.html".length) || "/";
    }
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    return path || "/";
  }

  if (normalizePath(location.pathname) !== "/") return;

  try {
    if (sessionStorage.getItem(ATTEMPT_KEY) === "1") return;
    sessionStorage.setItem(ATTEMPT_KEY, "1");
  } catch (e) {
    /* continue */
  }

  function hasPersistedAuth() {
    try {
      if (localStorage.getItem("iso-last-auth-user:v1")) return true;
      for (var i = 0; i < localStorage.length; i += 1) {
        var key = localStorage.key(i);
        if (!key || key.indexOf("sb-") !== 0 || key.indexOf("-auth-token") === -1) continue;
        var raw = localStorage.getItem(key) || "";
        if (raw.indexOf("access_token") !== -1) return true;
      }
    } catch (e) {
      /* ignore */
    }
    return false;
  }

  function readLastTenantSlug() {
    try {
      var slug = (localStorage.getItem("lastTenantSlug") || "").trim();
      if (!slug || slug === "workspace" || slug === "_") return "";
      if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) return "";
      return slug;
    } catch (e) {
      return "";
    }
  }

  var dest;
  if (!hasPersistedAuth()) {
    dest = "/login/";
  } else {
    var tenant = readLastTenantSlug();
    dest = tenant
      ? "/workspace/?tenantSlug=" + encodeURIComponent(tenant)
      : "/workspace/";
  }

  try {
    var target = new URL(dest, location.origin).href;
    if (location.href.split("#")[0] !== target) {
      location.replace(target);
    }
  } catch (e) {
    location.replace(dest);
  }
})();
