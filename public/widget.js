/**
 * Arkan assistant — embed loader.
 *
 * One line on the host page:
 *
 *   <script src="https://arkan.co/widget.js" async></script>
 *
 * Everything the visitor interacts with lives inside an iframe served from
 * arkan.co, so a host page's CSS cannot break the panel and this file cannot
 * read anything on the host page. What is left here is a button, a frame, and
 * the small amount of state that has to live on the host origin.
 *
 * Plain ES5-ish JavaScript with no build step: it is served as a static file and
 * has to run on whatever the host site happens to support.
 *
 * Three things worth knowing before changing it:
 *
 *   1. The session id is kept in the HOST page's localStorage and passed to the
 *      iframe as a query parameter. Third-party storage is partitioned or
 *      blocked in every current browser, so storage inside the iframe is not
 *      shared with anything and may not exist at all.
 *   2. Nothing renders until /api/widget/config says this origin is allowed. A
 *      launcher on a site that cannot use the assistant is worse than none.
 *   3. The panel is a dialog: Escape closes it, focus moves into it on open and
 *      returns to the launcher on close. A keypress inside the iframe never
 *      reaches this document, which is why the frame handles Escape too.
 */
(function () {
  "use strict";

  if (window.__arkanWidgetLoaded) return;
  window.__arkanWidgetLoaded = true;

  var script = document.currentScript;
  var origin = script ? new URL(script.src, window.location.href).origin : "";
  var STORAGE_KEY = "arkan.widget.sid";

  function sessionId() {
    try {
      var existing = window.localStorage.getItem(STORAGE_KEY);
      if (existing) return existing;

      var fresh = uuid();
      window.localStorage.setItem(STORAGE_KEY, fresh);
      return fresh;
    } catch {
      // Storage blocked entirely. The visitor gets a conversation that lasts
      // as long as the page does, which is better than no assistant at all.
      return uuid();
    }
  }

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();

    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  fetch(origin + "/api/widget/config?origin=" + encodeURIComponent(window.location.origin), {
    method: "GET",
    credentials: "omit",
  })
    .then(function (response) {
      return response.ok ? response.json() : null;
    })
    .then(function (config) {
      if (config && config.enabled) render(config);
    })
    .catch(function () {
      // A widget that cannot reach its own server stays invisible.
    });

  function render(config) {
    var side = config.position === "left" ? "left" : "right";
    var open = false;

    var style = document.createElement("style");
    style.textContent = [
      ".arkan-widget-launcher{position:fixed;bottom:20px;" + side + ":20px;z-index:2147483000;",
      "display:inline-flex;align-items:center;gap:10px;min-height:48px;padding:0 20px;",
      "border:0;border-radius:8px;cursor:pointer;font:600 15px/1.2 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;",
      "color:#F7F3EC;background:" + safeColour(config.accent) + ";box-shadow:0 2px 8px rgba(21,32,28,.18);}",
      ".arkan-widget-launcher:hover{filter:brightness(.92)}",
      ".arkan-widget-launcher:focus-visible{outline:2px solid #F7F3EC;outline-offset:2px}",
      ".arkan-widget-panel{position:fixed;bottom:20px;" + side + ":20px;z-index:2147483001;",
      "width:min(400px,calc(100vw - 32px));height:min(620px,calc(100vh - 40px));",
      "border:0;border-radius:12px;overflow:hidden;background:#F7F3EC;",
      "box-shadow:0 12px 40px rgba(21,32,28,.22);display:none}",
      ".arkan-widget-panel[data-open='true']{display:block}",
      "@media (max-width:480px){.arkan-widget-panel{bottom:0;" + side + ":0;",
      "width:100vw;height:100dvh;border-radius:0}}",
      // The brand guide asks for very little motion, and a launcher that
      // animates on every page load is exactly the kind of clutter it warns off.
      "@media (prefers-reduced-motion:reduce){.arkan-widget-launcher{transition:none}}",
    ].join("");

    var launcher = document.createElement("button");
    launcher.type = "button";
    launcher.className = "arkan-widget-launcher";
    launcher.setAttribute("aria-haspopup", "dialog");
    launcher.setAttribute("aria-expanded", "false");
    launcher.setAttribute("aria-controls", "arkan-widget-panel");
    launcher.appendChild(mark());
    launcher.appendChild(document.createTextNode(config.launcherLabel));

    var frame = document.createElement("iframe");
    frame.id = "arkan-widget-panel";
    frame.className = "arkan-widget-panel";
    frame.title = config.title;
    frame.setAttribute("allow", "clipboard-write");
    frame.setAttribute("loading", "lazy");

    document.head.appendChild(style);
    document.body.appendChild(launcher);
    document.body.appendChild(frame);

    launcher.addEventListener("click", function () {
      if (open) closePanel();
      else openPanel();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && open) closePanel();
    });

    window.addEventListener("message", function (event) {
      if (event.origin !== origin) return;
      var data = event.data;
      if (data && data.source === "arkan-widget" && data.type === "close") closePanel();
    });

    function openPanel() {
      // The frame is not given a src until it is first opened, so a page that
      // embeds the widget and is never used pays nothing for it.
      if (!frame.src) {
        frame.src = config.frameUrl + "?sid=" + encodeURIComponent(sessionId());
      }

      open = true;
      frame.setAttribute("data-open", "true");
      launcher.setAttribute("aria-expanded", "true");
      launcher.style.display = "none";
      frame.focus();
    }

    function closePanel() {
      open = false;
      frame.removeAttribute("data-open");
      launcher.setAttribute("aria-expanded", "false");
      launcher.style.display = "";
      launcher.focus();
    }
  }

  /** The four pillars of the Arkan mark, at button scale. */
  function mark() {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 14 12");
    svg.setAttribute("width", "14");
    svg.setAttribute("height", "12");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.style.flex = "none";

    [8, 12, 10, 6].forEach(function (height, i) {
      var rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", String(i * 4));
      rect.setAttribute("y", String(12 - height));
      rect.setAttribute("width", "2");
      rect.setAttribute("height", String(height));
      rect.setAttribute("fill", "currentColor");
      svg.appendChild(rect);
    });

    return svg;
  }

  /**
   * The accent comes from the admin panel, and it is interpolated into a
   * stylesheet. Anything that is not a plain hex colour is refused rather than
   * escaped: there is no legitimate accent value that needs a bracket in it.
   */
  function safeColour(value) {
    return typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/.test(value)
      ? value
      : "#143A32";
  }
})();
