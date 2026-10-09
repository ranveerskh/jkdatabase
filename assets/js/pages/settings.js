import { $, db, loadError, download, today, csvParse, submit, run, toast } from "../app.js";
import { DB_KEY, RECOVERY_KEY, LEGACY_KEYS } from "../core/config.js";
import { replaceDB, resetDB } from "../repositories/db.js";
import { normalize } from "../storage/local-storage.js";
import { saveSettings, importMasters } from "../services/business-service.js";

export function initPage({ signal } = {}) {
const form=$("form");
for(const [k,v] of Object.entries(db.settings)){const f=form.elements.namedItem(k);if(f)f.value=String(v??"");}
function previewLogo(){const v=$("logoDataUrl").value;$("logoPreview").hidden=!v;if(v)$("logoPreview").src=v;else $("logoPreview").removeAttribute("src");}
previewLogo();
$("logoFile").addEventListener("change",()=>{const f=$("logoFile").files[0];if(!f)return;if(f.size>80000){toast("Logo is too large. Use an image about 80 KB or less.");$("logoFile").value="";return;}const r=new FileReader();r.onload=()=>{$("logoDataUrl").value=String(r.result||"");previewLogo();};r.readAsDataURL(f);});
$("clearLogo").addEventListener("click",()=>{$("logoDataUrl").value="";$("logoFile").value="";previewLogo();});
submit(form,saveSettings);
function backupBefore(){download(`jk-database-v7-before-change-${today()}.json`,localStorage.getItem(DB_KEY)||JSON.stringify(db,null,2),"application/json");}
$("backup").addEventListener("click",()=>{if(loadError){const raw=localStorage.getItem(DB_KEY)||LEGACY_KEYS.map((k)=>localStorage.getItem(k)).find((x)=>x!==null)||"";download(`jk-database-raw-recovery-${today()}.json`,raw,"application/json");}else download(`jk-database-v7-backup-${today()}.json`,JSON.stringify(db,null,2),"application/json");});
$("restore").addEventListener("change",async(e)=>{const f=e.target.files[0];if(!f)return;try{const x=normalize(JSON.parse(await f.text()));if(confirm(`Restore ${x.people?.length||0} people, ${x.invoices.length} invoices and ${x.products.length} products? Current data will be replaced. A backup download will start first.`)){backupBefore();await run(()=>replaceDB(x));}}catch(err){toast("Restore rejected: "+err.message);}finally{$("restore").value="";}});
$("reset").addEventListener("click",()=>{if(prompt("Type DELETE to clear the active database. A backup downloads first.")==="DELETE"){backupBefore();run(resetDB);}});
for(const [id,type] of [["importCustomers","customers"],["importVendors","vendors"],["importProducts","products"]])$(id).addEventListener("change",async(e)=>{const f=e.target.files[0];if(!f)return;await run(async()=>{const rows=csvParse(await f.text());const result=await importMasters(type,rows);alert(`${result.added} imported; ${result.skipped} duplicates skipped.`);});e.target.value="";});
$("recovery").addEventListener("click",()=>{const raw=localStorage.getItem(RECOVERY_KEY);if(!raw)return toast("No prior V7 save is available yet.");download(`jk-database-v7-previous-save-${today()}.json`,raw,"application/json");});
document.querySelectorAll("[data-feedback]").forEach((b)=>b.addEventListener("click",()=>{const kind=b.dataset.feedback==="feature"?"Feature request":"Problem report",detail=prompt(`${kind}: describe it here. A text file will be created for you to keep/send.`);if(detail?.trim())download(`jk-database-${b.dataset.feedback}-${today()}.txt`,`JK Database V7.2 — ${kind}\nDate: ${new Date().toLocaleString()}\nBuild: 7.3.0-cloud\n\n${detail.trim()}\n`,"text/plain");}));

}
