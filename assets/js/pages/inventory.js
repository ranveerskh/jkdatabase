import { masterPage } from "./masters.js";
import { $, db, today, run, toast, csvParse } from "../app.js";
import { adjustStock, importMasters } from "../services/business-service.js";
masterPage("products");
$("list").addEventListener("click",(e)=>{const b=e.target.closest('[data-action="adjust"]');if(!b)return;const p=db.products.find((x)=>x.id===b.dataset.id);$("adjustForm").reset();$("adjustForm").elements.productId.value=p.id;$("adjustProduct").textContent=`${p.name} · currently ${p.qty} ${p.unit||""}`;$("adjustForm").elements.date.value=today();$("adjustDlg").showModal();});
$("adjustCancel").addEventListener("click",()=>$("adjustDlg").close());
$("adjustForm").addEventListener("submit",async(e)=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;try{await adjustStock(Object.fromEntries(new FormData($("adjustForm"))));toast("Stock adjustment saved.","ok");location.reload();}catch(err){toast(err.message);btn.disabled=false;}});
$("importProductsPage").addEventListener("change",async(e)=>{const f=e.target.files[0];if(!f)return;await run(async()=>{const rows=csvParse(await f.text());const r=await importMasters("products",rows);alert(`${r.added} imported; ${r.skipped} duplicates skipped.`);});e.target.value="";});
