import { refreshPage } from "../services/navigation.js";
import { $, db, esc, money, toast, posted, invoiceBalance, purchaseBalance, confirmTypedDelete } from "../app.js";
import { savePerson, deletePerson } from "../services/business-service.js";

export function initPage({ signal } = {}) {
const form=$("form"), dlg=$("dlg");
function customerFor(person){return db.customers.find((x)=>x.personId===person.id)}
function vendorFor(person){return db.vendors.find((x)=>x.personId===person.id)}
function stats(person){
  const c=customerFor(person),v=vendorFor(person);
  const invoices=c?db.invoices.filter((x)=>posted(x)&&x.customerId===c.id):[];
  const purchases=v?db.purchases.filter((x)=>posted(x)&&x.vendorId===v.id):[];
  return {sales:invoices.reduce((s,x)=>s+Number(x.total||0),0),purchases:purchases.reduce((s,x)=>s+Number(x.total||0),0),receive:invoices.reduce((s,x)=>s+invoiceBalance(x),0),pay:purchases.reduce((s,x)=>s+purchaseBalance(x),0)};
}
function open(person,role="customer"){form.reset();form.elements.id.value=person?.id||"";if(person){for(const k of ["name","contact","phone","email","address","notes"])form.elements[k].value=person[k]||"";form.elements.customer.checked=person.roles?.includes("customer");form.elements.vendor.checked=person.roles?.includes("vendor");} else {form.elements.customer.checked=role==="customer";form.elements.vendor.checked=role==="vendor";}$("modalTitle").textContent=person?"Edit Contact":"Add "+(role==="customer"?"Customer":"Vendor");$("savePerson").textContent=person?"Save Contact":"Save "+(role==="customer"?"Customer":"Vendor");dlg.showModal();}
$("addCustomer").addEventListener("click",()=>open(null,"customer"));
$("addVendor").addEventListener("click",()=>open(null,"vendor"));
function render(){const q=$("search").value.trim().toLowerCase();const people=(db.people||[]).filter((p)=>`${p.name} ${p.phone} ${p.email} ${p.contact}`.toLowerCase().includes(q));$("count").textContent=`${people.length} contacts`;
$("list").innerHTML=people.length?people.map((p)=>{const s=stats(p),roles=(p.roles||[]).map((r)=>`<span class="role-chip">${r==="customer"?"Customer":"Vendor"}</span>`).join("");return `<article class="record-card people-card"><div class="record-main"><b>${esc(p.name)}</b><small>${esc(p.phone||"")}${p.phone&&p.email?" · ":""}${esc(p.email||"")}</small></div><div><small class="muted">Type</small><div>${roles||"—"}</div></div><div class="record-stat"><small>Total sales</small><b>${money(s.sales)}</b></div><div class="record-stat optional-stat"><small>Total purchases</small><b>${money(s.purchases)}</b></div><div class="record-stat optional-stat"><small>To receive</small><b>${money(s.receive)}</b></div><div class="record-stat optional-stat"><small>To pay</small><b>${money(s.pay)}</b></div><div class="record-actions"><button class="btn small" data-edit="${esc(p.id)}">Edit</button><button class="btn small danger" data-delete="${esc(p.id)}">Delete</button></div></article>`}).join(""):'<div class="empty card">No customers or vendors yet. Add one here, or add them while creating a sale or purchase.</div>';}
$("search").addEventListener("input",render);$("list").addEventListener("click",async(e)=>{const edit=e.target.closest("[data-edit]");if(edit){open(db.people.find((p)=>p.id===edit.dataset.edit));return;}const del=e.target.closest("[data-delete]");if(!del)return;const person=db.people.find((p)=>p.id===del.dataset.delete);if(!person||!await confirmTypedDelete("contact "+person.name,"Contacts linked to sales or purchases are protected."))return;del.disabled=true;try{await deletePerson(person.id);toast("Contact deleted.","ok");await refreshPage();}catch(err){toast(err.message);del.disabled=false;}});
form.addEventListener("submit",async(e)=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;try{await savePerson(Object.fromEntries(new FormData(form)));toast("Person saved successfully.","ok");await refreshPage();}catch(err){toast(err.message);btn.disabled=false;}});
render();

}
