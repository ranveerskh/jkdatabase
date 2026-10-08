const root = new URL("../../../", import.meta.url);
let renderer;
let queue = Promise.resolve();

function appUrl(url) {
  if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) return false;
  const path = url.pathname.slice(root.pathname.length);
  return path === "" || path === "index.html" || /^pages\/[a-z0-9-]+\.html$/.test(path);
}

export function navigateTo(destination, options = {}) {
  const url = new URL(destination, location.href);
  if (!renderer || !appUrl(url)) {
    location.assign(url.href);
    return Promise.resolve();
  }
  // Serialize route changes so an older response cannot replace a newer page.
  const next = queue.catch(() => {}).then(() => renderer(url, options));
  queue = next;
  return next;
}

export function refreshPage() {
  if (!renderer) {
    location.reload();
    return Promise.resolve();
  }
  return navigateTo(location.href, { history: false });
}

export function installNavigation(render, onError) {
  renderer = render;
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest("a[href]");
    if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
    const url = new URL(link.href);
    if (!appUrl(url) || (url.pathname === location.pathname && url.search === location.search && url.hash)) return;
    event.preventDefault();
    navigateTo(url).catch(onError);
  });
  window.addEventListener("popstate", () => navigateTo(location.href, { history: false }).catch(onError));
}
