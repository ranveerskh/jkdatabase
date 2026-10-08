import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { blankDB } from "../assets/js/storage/local-storage.js";
import { cloudRecords, recordDocumentId } from "../assets/js/services/cloud-sync.js";
import { firebaseFixture } from "./fixtures/firebase.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = process.env.JK_TEST_OUTPUT_DIR || resolve(root, ".test-output");
await mkdir(output, { recursive: true });
const initial = blankDB();
initial._rev = "test-initial";
Object.assign(initial.settings, { businessName: "Example Trading Ltd.", legalName: "Example Trading Ltd.", address: "100 Market Street\nToronto ON\nCanada", phone: "555-0100", email: "sales@example.test" });
initial.products = [
  { id: "widget", name: "Widget", sku: "W1", qty: 10, unit: "pcs", cost: 4, price: 10, low: 2 },
  { id: "tea", name: "Tea", sku: "T1", qty: 5.5, unit: "kg", cost: 4, price: 10, low: 1 },
];
const business = "businesses/jkdatabase-main";
const entries = [
  [`${business}/members/test-admin`, { role: "admin", active: true }],
  [`${business}/state/current`, { status: "ready", revision: initial._rev, settings: initial.settings, version: 7 }],
  ...cloudRecords(initial).map((record) => [`${business}/records/${recordDocumentId(record.collection, record.id)}`, record]),
];
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const path = resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
    if (!path.startsWith(root)) throw Error("Invalid path");
    const file = await readFile(path);
    response.writeHead(200, { "Content-Type": mime[extname(path)] || "application/octet-stream" });
    response.end(file);
  } catch { response.writeHead(404); response.end("Not found"); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.JK_TEST_CHROMIUM_PATH ? { executablePath: process.env.JK_TEST_CHROMIUM_PATH } : {}),
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
});
let passed = 0;
const errors = [];
const stylesheetRequests = [];
async function check(name, fn) { await fn(); passed++; console.log(`✓ ${name}`); }
async function createContext(user) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route("**/assets/js/firebase.js", (route) => route.fulfill({
    contentType: "text/javascript",
    body: `const sdk = (${firebaseFixture.toString()})(${JSON.stringify(entries)}${user === null ? ", null" : ""}); export const BUSINESS_ID="jkdatabase-main"; export const {auth,firestore,firebaseAuth,firebaseStore}=sdk;`,
  }));
  context.on("page", (page) => {
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("requestfailed", (request) => stylesheetRequests.push({ url: request.url(), error: request.failure()?.errorText }));
    page.on("response", (response) => { if (response.url().endsWith(".css")) stylesheetRequests.push({ url: response.url(), status: response.status() }); });
  });
  return context;
}
const context = await createContext();
const page = await context.newPage();
page.on("dialog", (dialog) => dialog.accept());
const db = () => page.evaluate(async () => structuredClone((await import("/assets/js/repositories/db.js")).db));
const go = async (path) => {
  await page.evaluate(async (path) => (await import("/assets/js/services/navigation.js")).navigateTo(path), path);
  await page.locator(".sidebar .nav").waitFor();
};
const closeSale = () => page.locator('#dlg [data-click="close"]').click();
const fillSale = async (payment = "full") => {
  await page.locator("#newSale").click();
  await page.locator("#customerName").fill("Test Customer");
  await page.locator("#rows .prod").selectOption("widget");
  await page.locator("#rows .qty").fill("2");
  await page.locator('#form [name="taxLabel"]').fill("GST");
  await page.locator('#form [name="taxRate"]').fill("5");
  await page.locator(`#form input[name="paymentPreset"][value="${payment}"]`).check();
};

try {
  await page.goto(origin + "/pages/sales.html");
  await page.locator(".sidebar .nav").waitFor();
  await check("administrator bootstrap opens the app", async () => {
    assert.equal(await page.locator(".auth-gate").count(), 0);
    assert.equal(await page.evaluate(() => window.__testCloud.metrics.membershipReads), 1);
    await page.evaluate(() => window.__navigationMarker = "same-session");
  });
  await check("sale/quote dates and payments toggle correctly; UI copy is English", async () => {
    await page.locator("#newSale").click();
    assert.equal(await page.locator("#validWrap").isVisible(), false);
    assert.equal(await page.locator("#paymentSection").isVisible(), true);
    await page.locator('input[name="dealType"][value="quote"]').check();
    assert.equal(await page.locator("#validWrap").isVisible(), true);
    assert.equal(await page.locator("#dueWrap").isVisible(), false);
    assert.equal(await page.locator("#paymentSection").isVisible(), false);
    assert.equal(await page.locator('#form [value="preview"]').isVisible(), false);
    assert.doesNotMatch(await page.locator("body").textContent(), /save karde|jayega/);
    await closeSale();
  });
  await fillSale();
  await check("quantity, unit and custom tax update totals and payment", async () => {
    assert.equal(await page.locator("#rows .unit").inputValue(), "pcs");
    assert.equal(await page.locator("#total").textContent(), "$21.00");
    await page.locator('#form [name="taxRate"]').fill("0");
    assert.equal(await page.locator("#total").textContent(), "$20.00");
    assert.equal(await page.locator("#paymentAmount").inputValue(), "20.00");
    await page.locator('#form [name="taxRate"]').fill("5");
  });
  await check("desktop, phone and tablet rows retain description, quantity and unit without overflow", async () => {
    for (const [name, width, height] of [["desktop", 1440, 1000], ["phone", 390, 844], ["ipad", 768, 1024]]) {
      await page.setViewportSize({ width, height });
      await page.locator("#rows").scrollIntoViewIfNeeded();
      for (const field of [".qty", ".unit", ".price", ".desc"]) assert.equal(await page.locator("#rows " + field).isVisible(), true);
      assert.equal(await page.evaluate(() => document.querySelector("#dlg").scrollWidth <= document.querySelector("#dlg").clientWidth + 1), true);
      await page.screenshot({ path: resolve(output, `${name}-sale.png`) });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  });
  let preview;
  await check("Save and Preview opens a complete invoice and posts exactly one sale", async () => {
    const popup = page.waitForEvent("popup");
    await page.locator('#form button[value="preview"]').click();
    preview = await popup;
    await preview.getByRole("heading", { name: "INVOICE", exact: true }).waitFor();
    await preview.waitForFunction(() => getComputedStyle(document.querySelector(".invoice-table")).tableLayout === "fixed");
    assert.match(await preview.locator("body").textContent(), /GST \(5%\)/);
    assert.match(await preview.locator(".invoice-table").textContent(), /2 pcs/);
    assert.equal(await preview.locator(".invoice-amount-due strong").textContent(), "$0.00");
    assert.equal(await preview.locator(".invoice-table th").count(), 4);
    await page.locator(".record-card").waitFor();
    const data = await db();
    assert.equal(data.invoices.length, 1);
    assert.equal(data.payments.length, 1);
    assert.equal(data.products.find((product) => product.id === "widget").qty, 8);
    assert.equal(await page.locator(".auth-gate").count(), 0);
  });
  await check("Print / Save PDF works and single-page Letter/A4 output is generated", async () => {
    await preview.evaluate(() => { window.print = () => window.__printCalled = true; });
    await preview.getByRole("button", { name: "Print / Save PDF" }).click();
    assert.equal(await preview.evaluate(() => window.__printCalled), true);
    await preview.pdf({ path: resolve(output, "invoice-letter.pdf"), format: "Letter", printBackground: true });
    await preview.pdf({ path: resolve(output, "invoice-a4.pdf"), format: "A4", printBackground: true });
    await preview.screenshot({ path: resolve(output, "invoice-preview.png"), fullPage: true });
    await preview.setViewportSize({ width: 390, height: 844 });
    assert.equal(await preview.evaluate(() => [...document.querySelectorAll(".invoice-table th")].every((cell) => {
      const range = document.createRange(); range.selectNodeContents(cell);
      const text = range.getBoundingClientRect(), bounds = cell.getBoundingClientRect();
      return text.left >= bounds.left && text.right <= bounds.right;
    })), true, "Phone invoice column headings must fit their cells");
    await preview.screenshot({ path: resolve(output, "phone-invoice-preview.png"), fullPage: true });
    await preview.close();
  });
  await check("normal navigation reuses Auth, cloud data and one page shell", async () => {
    await page.getByRole("link", { name: "Purchases", exact: true }).click();
    await page.locator("#newPurchase").waitFor();
    await page.getByRole("link", { name: "Sales", exact: true }).click();
    await page.locator("#newSale").waitFor();
    assert.equal(await page.evaluate(() => window.__navigationMarker), "same-session");
    assert.equal(await page.evaluate(() => window.__testCloud.metrics.membershipReads), 1);
    assert.equal(await page.locator(".mobile-menu-btn").count(), 1);
    assert.equal(await page.locator(".record-card").count(), 1);
  });
  await check("all 21 app pages initialize and browser back/forward preserve the session", async () => {
    for (const file of (await readdir(resolve(root, "pages"))).filter((file) => file.endsWith(".html"))) await go("/pages/" + file);
    await go("/index.html");
    await go("/pages/sales.html");
    await page.goBack();
    await page.getByRole("heading", { name: "Home", exact: true }).waitFor();
    await page.goForward();
    await page.locator("#newSale").waitFor();
    assert.equal(await page.evaluate(() => window.__navigationMarker), "same-session");
    assert.equal(await page.evaluate(() => window.__testCloud.metrics.membershipReads), 1);
  });
  await check("two new products can be created, selected and saved without a disabled button", async () => {
    await page.locator("#newSale").click();
    for (const [name, unit] of [["Test Box", "box"], ["Test Kg", "kg"]]) {
      await page.locator("#quickProduct").click();
      await page.locator('#productForm [name="name"]').fill(name);
      await page.locator('#productForm [name="unit"]').fill(unit);
      await page.locator('#productForm [name="cost"]').fill("4");
      await page.locator('#productForm [name="price"]').fill("10");
      await page.locator("#productForm button.btn.primary").click();
      await page.locator("#productDlg").waitFor({ state: "hidden" });
      assert.equal(await page.locator("#rows .unit").last().inputValue(), unit);
      assert.equal(await page.locator("#productForm button.btn.primary").isEnabled(), true);
    }
    assert.equal(await page.locator("#rows .invoice-row").count(), 2);
    await closeSale();
  });
  await check("purchase totals clear invalid input, reset cleanly and save quantity/payment links", async () => {
    await go("/pages/purchases.html");
    await page.locator("#newPurchase").click();
    await page.locator("#vendorName").fill("Test Vendor");
    await page.locator("#rows .prod").selectOption("widget");
    await page.locator("#rows .qty").fill("3");
    assert.equal(await page.locator("#total").textContent(), "$13.56");
    await page.locator("#rows .qty").fill("");
    assert.equal(await page.locator("#total").textContent(), "—");
    assert.equal(await page.locator("#sub").textContent(), "—");
    await page.locator("#rows .qty").fill("3");
    await page.locator('input[name="paymentPreset"][value="partial"]').check();
    await page.locator("#paymentAmount").fill("5");
    await page.locator("#form button.btn.primary").click();
    await page.locator("#dlg").waitFor({ state: "hidden" });
    const data = await db();
    assert.equal(data.products.find((product) => product.id === "widget").qty, 11);
    assert.equal(data.purchases[0].items[0].qty, 3);
    assert.equal(data.purchases[0].items[0].unit, "pcs");
    assert.equal(data.vendorPayments[0].amount, 5);
    await page.locator("#newPurchase").click();
    assert.equal(await page.locator("#sub").textContent(), "$0.00");
    await closeSale();
  });
  await check("paid invoices explain cancellation protection and offer a working credit note", async () => {
    await go("/pages/sales.html");
    await page.locator(".record-menu summary").first().click();
    assert.equal(await page.getByRole("button", { name: "Cancel invoice", exact: true }).isDisabled(), true);
    await page.getByRole("button", { name: "Return / credit note" }).click();
    await page.locator("#returnHint").waitFor();
    await page.locator('#form [name="qty"]').fill("1");
    await page.locator('#form [name="reason"]').fill("Returned product");
    await page.locator('#form [name="restock"]').selectOption("yes");
    await page.locator("#form button.btn.primary").click();
    await page.locator("#list tbody tr").waitFor();
    const data = await db();
    assert.equal(data.returns[0].invoiceId, data.invoices[0].id);
    assert.equal(data.returns[0].amount, 10.5);
    assert.equal(data.products.find((product) => product.id === "widget").qty, 12);
  });
  await check("eligible unpaid invoice cancellation restores stock and retains history", async () => {
    await go("/pages/sales.html");
    await fillSale("unpaid");
    await page.locator('#form button[value="save"]').click();
    await page.locator("#dlg").waitFor({ state: "hidden" });
    const saved = await db();
    assert.equal(saved.products.find((product) => product.id === "widget").qty, 10);
    await page.locator(".record-menu summary").first().click();
    await page.getByRole("button", { name: "Cancel invoice", exact: true }).first().click();
    await page.getByText("Cancelled", { exact: true }).waitFor();
    const cancelled = await db();
    assert.equal(cancelled.products.find((product) => product.id === "widget").qty, 12);
    assert.equal(cancelled.invoices.length, 2);
    assert.equal(cancelled.invoices[1].state, "void");
  });
  await check("customer edit works and linked customer deletion is blocked in the UI", async () => {
    await go("/pages/customers.html");
    await page.getByRole("button", { name: "Edit", exact: true }).first().click();
    await page.locator('#form [name="phone"]').fill("5550000000");
    await page.locator("#form button.btn.primary").click();
    await page.locator("#dlg").waitFor({ state: "hidden" });
    assert.equal((await db()).customers[0].phone, "5550000000");
    await page.getByRole("button", { name: "Delete", exact: true }).first().click();
    await page.locator("#toast.show").waitFor();
    assert.equal((await db()).customers.length, 1);
  });
  await check("product edit/delete works, while linked product deletion remains blocked", async () => {
    await go("/pages/inventory.html");
    const row = page.locator("#list tbody tr").filter({ hasText: "Test Box" });
    await row.getByRole("button", { name: "Edit", exact: true }).click();
    await page.locator('#form [name="name"]').fill("Test Box Updated");
    await page.locator("#form button.btn.primary").click();
    await page.locator("#dlg").waitFor({ state: "hidden" });
    await page.locator("#list tbody tr").filter({ hasText: "Test Box Updated" }).getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByText("Test Box Updated", { exact: true }).waitFor({ state: "detached" });
    await page.locator("#list tbody tr").filter({ hasText: "Widget" }).getByRole("button", { name: "Delete", exact: true }).click();
    await page.locator("#toast.show").waitFor();
    assert.equal((await db()).products.find((product) => product.id === "widget").qty, 12);
  });
  await check("failed cloud save keeps the form and all financial/stock data unchanged", async () => {
    await go("/pages/sales.html");
    const before = await db();
    await fillSale("unpaid");
    await page.evaluate(() => window.__testCloud.metrics.failNextSave = true);
    await page.locator('#form button[value="save"]').click();
    await page.getByText("Cloud data changed on another device. Reload before saving.", { exact: true }).waitFor();
    assert.deepEqual(await db(), before);
    assert.equal(await page.locator("#dlg").isVisible(), true);
    await closeSale();
  });
  await check("invoice list Preview / Print and long Letter/A4 invoices render without errors", async () => {
    const number = await page.evaluate(async () => {
      const { saveInvoice } = await import("/assets/js/services/business-service.js");
      const { today } = await import("/assets/js/core/utils.js");
      const id = await saveInvoice({ date: today(), dueDate: today(), manualCustomer: "Large Order", taxRate: 5, taxLabel: "TAX" },
        Array.from({ length: 80 }, (_, index) => ({ description: `Large invoice line ${index + 1}`, qty: 1, unit: "pcs", price: 10 })), true);
      return (await import("/assets/js/repositories/db.js")).db.invoices.find((invoice) => invoice.id === id).number;
    });
    await go("/pages/invoices.html");
    const row = page.locator(".record-card").filter({ hasText: number });
    await row.locator("summary").click();
    const popup = page.waitForEvent("popup");
    await row.getByRole("button", { name: "Preview / Print" }).click();
    const longInvoice = await popup;
    await longInvoice.getByRole("heading", { name: "INVOICE", exact: true }).waitFor();
    await longInvoice.waitForFunction(() => getComputedStyle(document.querySelector(".invoice-table")).tableLayout === "fixed");
    assert.equal(await longInvoice.locator(".invoice-table tbody tr").count(), 80);
    await longInvoice.pdf({ path: resolve(output, "long-invoice-letter.pdf"), format: "Letter", printBackground: true });
    await longInvoice.pdf({ path: resolve(output, "long-invoice-a4.pdf"), format: "A4", printBackground: true });
    await longInvoice.close();
  });
  await check("signed-out users return to login before cloud records are loaded", async () => {
    const loggedOut = await createContext(null);
    const login = await loggedOut.newPage();
    await login.goto(origin + "/pages/sales.html");
    await login.locator('input[type="password"]').waitFor();
    assert.match(login.url(), /login\.html/);
    assert.equal(await login.evaluate(() => window.__testCloud.metrics.membershipReads), 0);
    await loggedOut.close();
  });
  assert.deepEqual(errors, [], "Browser JavaScript errors");
  console.log(`${passed}/${passed} browser checks passed. Screenshots and PDFs: ${output}`);
} catch (error) {
  console.error(JSON.stringify({ errors, stylesheetRequests, pages: await Promise.all(context.pages().map((tab) => tab.evaluate(() => ({url:location.href, styles:[...document.querySelectorAll('link[rel="stylesheet"]')].map((link)=>({href:link.href,loaded:!!link.sheet}))})).catch(()=>null))) }));
  throw error;
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
