const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const pause = () => new Promise((r) => setTimeout(r, 30));
async function open(file, data) {
  const vc = new VirtualConsole(),
    errors = [];
  vc.on("jsdomError", (e) => {
    if (!e.message.includes("navigation")) errors.push(e.message);
  });
  const dom = new JSDOM(fs.readFileSync(path.join(root, file), "utf8"), {
    url: "http://localhost:8765/" + file,
    runScripts: "outside-only",
    virtualConsole: vc,
  });
  const w = dom.window;
  w.structuredClone = structuredClone;
  w.crypto.randomUUID = crypto.randomUUID;
  w.confirm = () => true;
  w.prompt = () => null;
  w.alert = () => {};
  w.navigator.locks = { request: async (name, fn) => fn() };
  w.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  w.URL.createObjectURL = () => "blob:test";
  w.URL.revokeObjectURL = () => {};
  if (data) w.localStorage.setItem("jkDatabaseV6", data);
  const context = dom.getInternalVMContext(),
    cache = new Map();
  async function get(url) {
    if (cache.has(url)) return cache.get(url);
    const local = path.join(root, new URL(url).pathname);
    const m = new vm.SourceTextModule(fs.readFileSync(local, "utf8"), {
      context,
      identifier: url,
      initializeImportMeta(meta) {
        meta.url = url;
      },
      importModuleDynamically: async (spec, ref) => {
        const m = await load(new URL(spec, ref.identifier).href);
        if (m.status !== "evaluated") await m.evaluate();
        return m;
      },
    });
    cache.set(url, m);
    return m;
  }
  async function load(url) {
    const m = await get(url);
    if (m.status === "unlinked")
      await m.link((spec, ref) => get(new URL(spec, ref.identifier).href));
    return m;
  }
  const src = w.document.querySelector("script[src]").src,
    m = await load(src);
  await m.evaluate();
  await pause();
  assert.deepEqual(errors, [], file + " errors");
  for (const link of w.document.querySelectorAll(".nav a"))
    assert.ok(
      fs.existsSync(path.join(root, new URL(link.href).pathname)),
      link.href,
    );
  const repo = cache.get(
    "http://localhost:8765/assets/js/repositories/db.js",
  ).namespace;
  assert.equal(repo.loadError, "", file + " load error");
  return {
    w,
    repo,
    errors,
    dom,
    cache,
    data: () => w.localStorage.getItem("jkDatabaseV6"),
  };
}
function fill(w, values) {
  for (const [name, value] of Object.entries(values)) {
    const el = w.document.querySelector(`[name="${name}"]`);
    assert.ok(el, name + " exists");
    el.value = String(value);
  }
}
async function submit(page, button) {
  const { w } = page,
    form = w.document.getElementById("form");
  form.dispatchEvent(
    new w.SubmitEvent("submit", {
      bubbles: true,
      cancelable: true,
      submitter: button || form.querySelector(".footer button:last-child"),
    }),
  );
  await pause();
  const toast = w.document.getElementById("toast");
  if (toast && toast.classList.contains("show")) throw Error(toast.textContent);
  assert.deepEqual(page.errors, []);
}
(async () => {
  const files = [
    "index.html",
    ...fs
      .readdirSync(root + "/pages")
      .filter((x) => x.endsWith(".html"))
      .map((x) => "pages/" + x),
  ];
  for (const f of files) {
    const p = await open(f);
    p.dom.window.close();
  }
  console.log("PASS empty page imports/navigation: " + files.length);
  let p = await open("pages/customers.html");
  p.w.document.querySelector('[data-click="add"]').click();
  fill(p.w, { name: "Test Customer", email: "customer@example.test" });
  await submit(p);
  let data = p.data(),
    c = p.repo.db.customers[0].id;
  p.dom.window.close();
  p = await open("pages/vendors.html", data);
  p.w.document.querySelector('[data-click="add"]').click();
  fill(p.w, { name: "Test Vendor" });
  await submit(p);
  data = p.data();
  const v = p.repo.db.vendors[0].id;
  p.dom.window.close();
  p = await open("pages/inventory.html", data);
  p.w.document.querySelector('[data-click="add"]').click();
  fill(p.w, { name: "Widget", sku: "W1", qty: 10, cost: 4, price: 10, low: 2 });
  await submit(p);
  data = p.data();
  const product = p.repo.db.products[0].id;
  p.dom.window.close();
  p = await open("pages/invoices.html", data);
  p.w.document.querySelector('[data-click="new-invoice"]').click();
  fill(p.w, { customerId: c, date: "2026-09-17", dueDate: "2026-09-17" });
  const prod = p.w.document.querySelector(".prod");
  prod.value = product;
  prod.dispatchEvent(new p.w.Event("change"));
  p.w.document.querySelector(".qty").value = "2";
  await submit(p, p.w.document.querySelector('[value="finalise"]'));
  assert.equal(p.repo.db.products[0].qty, 8);
  assert.equal(p.repo.db.invoices[0].total, 22.6);
  data = p.data();
  const invoice = p.repo.db.invoices[0].id;
  p.dom.window.close();
  p = await open("pages/payments.html", data);
  fill(p.w, { invoiceId: invoice, date: "2026-09-17", amount: 30 });
  await submit(p);
  data = p.data();
  p.dom.window.close();
  p = await open("pages/returns.html", data);
  const inv = p.w.document.getElementById("invoice");
  inv.value = invoice;
  inv.dispatchEvent(new p.w.Event("change"));
  fill(p.w, { qty: 1, date: "2026-09-17", reason: "Returned item" });
  await submit(p);
  assert.equal(p.repo.db.products[0].qty, 9);
  assert.equal(p.repo.db.returns[0].amount, 11.3);
  data = p.data();
  p.dom.window.close();
  p = await open("pages/purchases.html", data);
  fill(p.w, {
    vendorId: v,
    date: "2026-09-17",
    dueDate: "2026-09-17",
    vendorBillNo: "B001",
  });
  const productSelect = p.w.document.querySelector(".prod");
  productSelect.value = product;
  productSelect.dispatchEvent(new p.w.Event("change"));
  p.w.document.querySelector(".qty").value = 5;
  await submit(p);
  data = p.data();
  const purchase = p.repo.db.purchases[0].id;
  assert.equal(p.repo.db.products[0].qty, 14);
  p.dom.window.close();
  p = await open("pages/vendor-payments.html", data);
  fill(p.w, { purchaseId: purchase, date: "2026-09-17", amount: 25 });
  await submit(p);
  data = p.data();
  p.dom.window.close();
  p = await open("pages/expenses.html", data);
  fill(p.w, {
    payee: "Phone Company",
    date: "2026-09-17",
    amount: 11.3,
    tax: 1.3,
  });
  await submit(p);
  data = p.data();
  p.dom.window.close();
  p = await open("pages/quotes.html", data);
  fill(p.w, {
    customerId: c,
    date: "2026-09-17",
    validUntil: "2026-09-18",
    subtotal: 100,
    discount: 10,
    description: "Service scope",
  });
  await submit(p);
  data = p.data();
  p.dom.window.close();
  for (const f of files) {
    p = await open(f, data);
    if (f.includes("statements")) {
      const s = p.w.document.querySelector("select");
      s.selectedIndex = 1;
      s.dispatchEvent(new p.w.Event("change"));
      assert.ok(
        p.w.document
          .getElementById("summary")
          .textContent.includes("Opening balance"),
      );
    }
    assert.deepEqual(p.errors, [], f);
    p.dom.window.close();
  }
  console.log("PASS populated page imports/navigation: " + files.length);
  console.log(
    "PASS form workflows: customer, vendor, inventory, invoice, customer payment, return, purchase, vendor payment, expense, quote",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
