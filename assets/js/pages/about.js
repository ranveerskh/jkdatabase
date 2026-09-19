import "../app.js";
const status=document.getElementById("updateStatus");
document.getElementById("checkUpdate").addEventListener("click",async()=>{try{const r=await fetch("../version.json",{cache:"no-store"});if(!r.ok)throw Error("Version file unavailable");const v=await r.json();status.textContent=v.version==="7.0.0"?"You are running the current V7 package included with this build.":`Package version ${v.version} is available in this installation.`;}catch(e){status.textContent="Could not check the local version manifest. Your data is unaffected.";}});
