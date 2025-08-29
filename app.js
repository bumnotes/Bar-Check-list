let CHECKLISTS = {};
const STORAGE_PREFIX = "bar-checklists::";

function todayKey(){ return new Date().toISOString().slice(0,10); }
function k(form){ return STORAGE_PREFIX + todayKey() + "::" + form; }
function readJSON(key, def){ try{return JSON.parse(localStorage.getItem(key)) ?? def;}catch{return def;} }
function writeJSON(key, val){ localStorage.setItem(key, JSON.stringify(val)); }

fetch("checklists.json").then(r=>r.json()).then(data=>{
  CHECKLISTS = data;
  buildTabs();
  render(Object.keys(CHECKLISTS)[0]);
  registerSW();
  handleInstall();
});

function buildTabs(){
  const tabs = document.getElementById("tabs"); tabs.innerHTML = "";
  Object.keys(CHECKLISTS).forEach((name,i)=>{
    const b = document.createElement("button");
    b.className = "tab"+(i===0?" active":"");
    b.textContent = name.includes("Opening")?"Opening":"Closing";
    b.title = name;
    b.onclick = ()=>{
      [...document.querySelectorAll(".tab")].forEach(t=>t.classList.remove("active"));
      b.classList.add("active"); render(name);
    };
    tabs.appendChild(b);
  });
}

function render(name){
  const content = document.getElementById("content");
  content.innerHTML = "";
  const tpl = document.getElementById("checklistTpl").content.cloneNode(true);
  const form = tpl.querySelector(".sheet");
  const spec = CHECKLISTS[name];
  const saved = readJSON(k(name), {});

  const mkField = (field)=>{
    const wrap = document.createElement("div"); wrap.className="field"; const id = field.id;
    if(field.type==="checkbox"){
      wrap.classList.add("check");
      const input=document.createElement("input"); input.type="checkbox"; input.checked=!!saved[id];
      input.onchange=()=>{ const o=readJSON(k(name),{}); o[id]=input.checked; writeJSON(k(name),o); };
      const lab=document.createElement("label"); lab.textContent=field.label;
      wrap.appendChild(input); wrap.appendChild(lab);
    } else if(field.type==="text" || field.type==="date" || field.type==="datetime"){
      const lab=document.createElement("label"); lab.textContent=field.label;
      const input=document.createElement("input"); input.type=field.type==="datetime"?"datetime-local":field.type;
      input.value=saved[id]||""; input.onchange=()=>{ const o=readJSON(k(name),{}); o[id]=input.value; writeJSON(k(name),o); };
      wrap.appendChild(lab); wrap.appendChild(input);
    } else if(field.type==="textarea"){
      const lab=document.createElement("label"); lab.textContent=field.label;
      const ta=document.createElement("textarea"); ta.value=saved[id]||"";
      ta.onchange=()=>{ const o=readJSON(k(name),{}); o[id]=ta.value; writeJSON(k(name),o); };
      wrap.appendChild(lab); wrap.appendChild(ta);
    } else if(field.type==="signature"){
      const lab=document.createElement("label"); lab.textContent=field.label; wrap.appendChild(lab);
      const sig = document.getElementById("sigTpl").content.cloneNode(true);
      const canvas = sig.querySelector("canvas"); const ctx = canvas.getContext("2d");
      ctx.strokeStyle="#fff"; ctx.lineWidth=2; let drawing=false;
      const pos=(e)=>{ const r=canvas.getBoundingClientRect(); const x=(e.touches?e.touches[0].clientX:e.clientX)-r.left; const y=(e.touches?e.touches[0].clientY:e.clientY)-r.top; return {x,y}; };
      const start=(e)=>{ drawing=true; const p=pos(e); ctx.beginPath(); ctx.moveTo(p.x,p.y); };
      const move=(e)=>{ if(!drawing)return; const p=pos(e); ctx.lineTo(p.x,p.y); ctx.stroke(); };
      const end=()=>{ drawing=false; };
      canvas.addEventListener("mousedown",start); canvas.addEventListener("mousemove",move); canvas.addEventListener("mouseup",end); canvas.addEventListener("mouseleave",end);
      canvas.addEventListener("touchstart",(e)=>{e.preventDefault();start(e);},{passive:false});
      canvas.addEventListener("touchmove",(e)=>{e.preventDefault();move(e);},{passive:false});
      canvas.addEventListener("touchend",(e)=>{e.preventDefault();end(e);},{passive:false});
      sig.querySelector(".clear").onclick=()=>ctx.clearRect(0,0,canvas.width,canvas.height);
      sig.querySelector(".saveSig").onclick=()=>{ const data=canvas.toDataURL("image/png"); const o=readJSON(k(name),{}); o[id]=data; writeJSON(k(name),o); alert("Signature saved"); };
      if(saved[id]){ const img=new Image(); img.onload=()=>ctx.drawImage(img,0,0); img.src=saved[id]; }
      wrap.appendChild(sig);
    }
    return wrap;
  };

  if(spec.meta?.intro_fields?.length){
    const intro = document.createElement("div"); intro.className="section";
    const h=document.createElement("h3"); h.textContent="Details"; intro.appendChild(h);
    spec.meta.intro_fields.forEach(f=> intro.appendChild(mkField(f)));
    form.appendChild(intro);
  }

  (spec.sections||[]).forEach(sec=>{
    const s=document.createElement("div"); s.className="section";
    const h=document.createElement("h3"); h.textContent=sec.name; s.appendChild(h);
    (sec.items||[]).forEach(item=> s.appendChild(mkField(item)));
    form.appendChild(s);
  });

  if(spec.meta?.outro_fields?.length){
    const outro = document.createElement("div"); outro.className="section";
    const h=document.createElement("h3"); h.textContent="Completion"; outro.appendChild(h);
    spec.meta.outro_fields.forEach(f=> outro.appendChild(mkField(f)));
    form.appendChild(outro);
  }

  content.appendChild(tpl);

  document.getElementById("resetDay").onclick=()=>{
    if(confirm("Clear today's saved progress for this checklist?")){
      localStorage.removeItem(k(name)); render(name);
    }
  };
  document.getElementById("exportData").onclick=()=>{
    const dump={}; Object.keys(localStorage).forEach(K=>{ if(K.startsWith(STORAGE_PREFIX)) dump[K]=JSON.parse(localStorage.getItem(K)); });
    const blob=new Blob([JSON.stringify(dump,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="bar_checklists_export.json"; a.click(); URL.revokeObjectURL(url);
  };
  document.getElementById("importData").onchange=(e)=>{
    const file=e.target.files[0]; if(!file) return; const reader=new FileReader();
    reader.onload=()=>{ try{ const obj=JSON.parse(reader.result); Object.keys(obj).forEach(K=>{ if(K.startsWith(STORAGE_PREFIX)) localStorage.setItem(K, JSON.stringify(obj[K])); }); alert("Import complete"); location.reload(); }catch{ alert("Invalid JSON"); } };
    reader.readAsText(file);
  };
}

// PWA
function registerSW(){ if("serviceWorker" in navigator){ window.addEventListener("load", ()=> navigator.serviceWorker.register("./service-worker.js")); } }
let deferredPrompt; function handleInstall(){ const btn=document.getElementById("installBtn"); window.addEventListener('beforeinstallprompt',(e)=>{ e.preventDefault(); deferredPrompt=e; btn.hidden=false; }); btn.addEventListener("click", async ()=>{ if(deferredPrompt){ deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; btn.hidden=true; } }); }
