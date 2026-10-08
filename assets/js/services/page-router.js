import { boot, toast } from "../app.js";
import { installNavigation } from "./navigation.js";

const allowedEntry = /^(app\.js|pages\/[a-z0-9-]+\.js)$/;

export async function startPages({ entryName, user, loginUrl, showCacheWarning, localCacheReady }) {
  let pageScope;
  let currentUrl = location.href;
  function accountControl() {
    const topbar = document.querySelector(".topbar");
    if (!topbar) return;
    const account = document.createElement("div");
    account.className = "auth-user";
    const email = document.createElement("span");
    email.textContent = user.email || "Administrator";
    email.title = email.textContent;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn";
    button.textContent = "Sign out";
    button.addEventListener("click", async () => {
      const { auth, firebaseAuth } = await import("../firebase.js");
      await firebaseAuth.signOut(auth);
      location.replace(loginUrl.href + `?next=${encodeURIComponent(location.pathname + location.search)}`);
    });
    account.append(email, button);
    topbar.append(account);
  }
  async function pageModule(entry) {
    if (!allowedEntry.test(entry || "")) throw Error("This page is not available.");
    return import(new URL(`../${entry}`, import.meta.url));
  }
  function mount(module) {
    pageScope?.abort();
    pageScope = new AbortController();
    boot();
    module.initPage?.({ signal: pageScope.signal });
    accountControl();
    if (!localCacheReady) showCacheWarning();
    document.body.classList.remove("menu-open");
    window.dispatchEvent(new Event("jk-page-ready"));
  }
  mount(await pageModule(entryName));
  installNavigation(async (url, { history: changeHistory = true } = {}) => {
    document.body.classList.add("page-loading");
    try {
      const response = await fetch(url.href);
      if (!response.ok) throw Error("Could not open this page. Check your connection and try again.");
      const html = new DOMParser().parseFromString(await response.text(), "text/html");
      const source = html.querySelector('script[src*="bootstrap.js"]')?.getAttribute("src");
      const entry = source && new URL(source, url).searchParams.get("entry");
      const content = html.querySelector("main.content");
      if (!content || !entry) throw Error("This page could not be loaded. Reload the app to get the latest version.");
      const module = await pageModule(entry);
      pageScope?.abort();
      document.querySelectorAll("dialog[open]").forEach((dialog) => dialog.close());
      document.querySelector("main.content").replaceWith(document.importNode(content, true));
      document.title = html.title;
      if (changeHistory && url.href !== location.href) window.history.pushState({}, "", url);
      currentUrl = url.href;
      mount(module);
      window.scrollTo(0, 0);
      if (!document.querySelector("dialog[open]")) {
        const heading = document.querySelector("main.content h1");
        heading?.setAttribute("tabindex", "-1");
        heading?.focus({ preventScroll: true });
      }
    } catch (error) {
      if (!changeHistory && location.href !== currentUrl) window.history.replaceState({}, "", currentUrl);
      throw error;
    } finally {
      document.body.classList.remove("page-loading");
    }
  }, (error) => toast(error.message));
}
