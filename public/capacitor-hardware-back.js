/**
 * Android hardware / gesture back — runs before React so back never exits the app blindly.
 * Loaded only in Capacitor builds (see root layout).
 */
(function () {
  var STACK_KEY = "iso-nav-stack:v1";
  var RESERVED = {
    workspace: 1,
    login: 1,
    signup: 1,
    admin: 1,
    dashboard: 1,
    offline: 1,
    _: 1,
    api: 1,
  };

  function isNativeShell() {
    try {
      if (localStorage.getItem("__ISO_MOBILE_SHELL__") === "1") return true;
    } catch (e) {
      /* ignore */
    }
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      return true;
    }
    var p = location.protocol;
    return p === "capacitor:" || location.hostname === "localhost";
  }

  if (!isNativeShell()) return;

  function currentPath() {
    var path = location.pathname || "/";
    if (path.endsWith("/index.html")) {
      path = path.slice(0, -"/index.html".length) || "/";
    }
    var search = location.search || "";
    return path + search;
  }

  function normalizePath(pathname) {
    var path = pathname || "/";
    if (path.endsWith("/index.html")) path = path.slice(0, -"/index.html".length) || "/";
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    return path || "/";
  }

  function readStack() {
    try {
      var raw = sessionStorage.getItem(STACK_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function writeStack(stack) {
    try {
      sessionStorage.setItem(STACK_KEY, JSON.stringify(stack));
    } catch (e) {
      /* ignore */
    }
  }

  function record(path) {
    var stack = readStack();
    if (!stack.length) {
      writeStack([path]);
      return;
    }
    if (stack[stack.length - 1] === path) return;
    if (stack.length >= 2 && stack[stack.length - 2] === path) {
      stack.pop();
      writeStack(stack);
      return;
    }
    stack.push(path);
    writeStack(stack);
  }

  function buildTenantHref(tenantSlug, subpath, extraQuery) {
    var params = new URLSearchParams(extraQuery || "");
    params.set("tenantSlug", tenantSlug);
    var clean = (subpath || "").replace(/^\//, "");
    var base = clean ? "/_/" + clean : "/_/";
    var qs = params.toString();
    return qs ? base + "?" + qs : base;
  }

  function rewriteTenantHref(href) {
    if (!href || href.charAt(0) !== "/") return href;
    var parts = href.split("?")[0].replace(/\/+$/, "").split("/").filter(Boolean);
    if (!parts.length) return href;
    if (parts[0] === "_" || RESERVED[parts[0]]) return href;
    var tenantSlug = parts[0];
    var rest = parts.slice(1).join("/");
    var params = new URLSearchParams(href.indexOf("?") >= 0 ? href.split("?")[1] : "");
    if (!params.get("tenantSlug")) params.set("tenantSlug", tenantSlug);
    var base = rest ? "/_/" + rest : "/_/";
    var qs = params.toString();
    return qs ? base + "?" + qs : base;
  }

  function resolveTenantSlug() {
    var parts = location.pathname.split("/").filter(Boolean);
    if (parts[0] && !RESERVED[parts[0]]) return parts[0];
    try {
      var fromQuery = new URLSearchParams(location.search).get("tenantSlug");
      if (fromQuery && fromQuery !== "_" && fromQuery !== "workspace") return fromQuery;
      var last = localStorage.getItem("lastTenantSlug");
      if (last && last !== "_" && last !== "workspace") return last;
    } catch (e) {
      /* ignore */
    }
    return "";
  }

  function resolveBackHref(pathname, tenantSlug) {
    if (!pathname || !tenantSlug) return null;
    var workspaceHref =
      "/workspace?tenantSlug=" + encodeURIComponent(tenantSlug) + "&view=forms";
    var adminHref = "/workspace?tenantSlug=" + encodeURIComponent(tenantSlug) + "&view=admin";
    var auditsHref = buildTenantHref(tenantSlug, "audits");
    var tenantPrefix = "/" + tenantSlug;
    var shellPrefix = "/_/";

    if (pathname === tenantPrefix + "/audits" || pathname === shellPrefix + "audits") return workspaceHref;
    if (pathname === tenantPrefix + "/audits/new" || pathname === shellPrefix + "audits/new") return auditsHref;
    if (/^\/[^/]+\/audits\/[^/]+$/.test(pathname) && !/\/local$/.test(pathname) && !/\/offline-last$/.test(pathname)) {
      return auditsHref;
    }
    if (pathname.indexOf(tenantPrefix + "/audits/") === 0 || pathname.indexOf(shellPrefix + "audits/") === 0) {
      return auditsHref;
    }
    if (
      pathname.indexOf(tenantPrefix + "/settings") === 0 ||
      pathname.indexOf(tenantPrefix + "/categories") === 0 ||
      pathname.indexOf(tenantPrefix + "/templates") === 0 ||
      pathname.indexOf(tenantPrefix + "/activity") === 0 ||
      pathname.indexOf(tenantPrefix + "/dashboard") === 0 ||
      pathname.indexOf(tenantPrefix + "/corrective-actions") === 0 ||
      pathname.indexOf(shellPrefix + "settings") === 0 ||
      pathname.indexOf(shellPrefix + "categories") === 0 ||
      pathname.indexOf(shellPrefix + "templates") === 0 ||
      pathname.indexOf(shellPrefix + "activity") === 0 ||
      pathname.indexOf(shellPrefix + "dashboard") === 0 ||
      pathname.indexOf(shellPrefix + "corrective-actions") === 0
    ) {
      return adminHref;
    }
    return workspaceHref;
  }

  function isAppRoot(pathname, search) {
    var path = normalizePath(pathname);
    if (path === "/login" || path === "/") return true;
    if (path === "/workspace") {
      return Boolean(new URLSearchParams(search || "").get("tenantSlug"));
    }
    return false;
  }

  function navigateInApp(target) {
    var normalized = rewriteTenantHref(target.charAt(0) === "/" ? target : "/" + target);
    if (currentPath() === normalized) return true;
    window.location.assign(normalized);
    return true;
  }

  function goBackViaStack() {
    var stack = readStack();
    if (stack.length <= 1) return false;
    stack.pop();
    var target = stack[stack.length - 1];
    writeStack(stack);
    return navigateInApp(target);
  }

  function handleHardwareBack() {
    if (goBackViaStack()) return true;

    if (window.history.length > 1) {
      window.history.back();
      return true;
    }

    var pathname = normalizePath(location.pathname);
    var tenantSlug = resolveTenantSlug();
    var backHref = resolveBackHref(pathname, tenantSlug);
    if (backHref && normalizePath(backHref.split("?")[0]) !== pathname) {
      return navigateInApp(backHref);
    }

    if (!isAppRoot(pathname, location.search)) {
      var fallback = tenantSlug
        ? "/workspace?tenantSlug=" + encodeURIComponent(tenantSlug) + "&view=forms"
        : "/workspace";
      return navigateInApp(fallback);
    }

    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
        window.Capacitor.Plugins.App.minimizeApp();
        return true;
      }
    } catch (e) {
      /* ignore */
    }
    return false;
  }

  window.__ISO_HANDLE_BACK__ = handleHardwareBack;
  window.__ISO_RECORD_NAV__ = record;

  function patchHistory() {
    var originalPush = history.pushState.bind(history);
    var originalReplace = history.replaceState.bind(history);

    history.pushState = function () {
      originalPush.apply(history, arguments);
      record(currentPath());
    };

    history.replaceState = function () {
      originalReplace.apply(history, arguments);
      record(currentPath());
    };
  }

  function boot() {
    record(currentPath());
    patchHistory();
    window.addEventListener("popstate", function () {
      record(currentPath());
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
