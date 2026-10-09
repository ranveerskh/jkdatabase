import { refreshPage } from "../services/navigation.js";
import { masterPage } from "./masters.js";
import { $, run, csvParse } from "../app.js";
import { importMasters } from "../services/business-service.js";

export function initPage({ signal } = {}) {
masterPage("products");
if (new URLSearchParams(location.search).get("new") === "1")
  document.querySelector('[data-click="add"]')?.click();
$("importProductsPage").addEventListener("change",async(e)=>{const f=e.target.files[0];if(!f)return;await run(async()=>{const rows=csvParse(await f.text());const r=await importMasters("products",rows);alert(`${r.added} imported; ${r.skipped} duplicates skipped.`);});e.target.value="";});

}
