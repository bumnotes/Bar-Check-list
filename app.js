// app.js — Bar Checklists (SafetyCulture-style) with Completed/Not completed + reason
let CHECKLISTS = {};
const STORAGE_PREFIX = "bar-checklists::";

// ---------- utils ----------
function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}
function keyFor(formName) {
  return STORAGE_PREFIX + todayKey() + "::" + formName;
}
function readJSON(k, def) {
  try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; }
}
function writeJSON(k, v) {
  localStorage.setItem(k, JSON.stringify(v));
}

// ---------- boot ----------
fetch("checklists.json")
  .then(r => r.json())
  .then(data => {
    CHECKLISTS = data;
    buildTabs();
    const first = Object.keys(CHECKLISTS)[0];
    renderChecklist(first);
    registerSW();
    handleInstall();
  });

// ---------- tabs ----------
function buildTabs() {
  const tabs = document.getElementById("tabs");
  tabs.innerHTML = "";
  Object.keys(CHECKLISTS).forEach((name, i) => {
    const btn = document.createElement("button");
    btn.className = "tab" + (i === 0 ? " active" : "");
    btn.textContent = name.includes("Opening") ? "Opening" : (name.includes("Closing") ? "Closing" : name);
    btn.title = name;
    btn.onclick = () => {
      [...document.querySelectorAll(".tab")].forEach(t => t.classList.remove("active"));
      btn.classList.add("active");
      renderChecklist(name);
    };
    tabs.appendChild(btn);
  });
}

// ---------- render a checklist ----------
function renderChecklist(name) {
  const content = document.getElementById("content");
  content.innerHTML = "";
  const spec = CHECKLISTS[name];
  const saved = readJSON(keyFor(name), {});

  // template shell
  const tpl = document.getElementById("checklistTpl").content.cloneNode(true);
  const form = tpl.querySelector(".sheet");

  // Intro fields
  if (spec.meta?.intro_fields?.length) {
    const intro = document.createElement("div");
    intro.className = "section";
    const h = document.createElement("h3"); h.textContent = "Details"; intro.appendChild(h);
    spec.meta.intro_fields.forEach(f => intro.appendChild(renderField(name, f, saved)));
    form.appendChild(intro);
  }

  // Sections/items
  (spec.sections || []).forEach(sec => {
    const s = document.createElement("div");
    s.className = "section";
    const h = document.createElement("h3"); h.textContent = sec.name; s.appendChild(h);
    (sec.items || []).forEach(item => s.appendChild(renderField(name, item, saved)));
    form.appendChild(s);
  });

  // Outro fields
  if (spec.meta?.outro_fields?.length) {
    const outro = document.createElement("div");
    outro.className = "section";
    const h = document.createElement("h3"); h.textContent = "Completion"; outro.appendChild(h);
    spec.meta.outro_fields.forEach(f => outro.appendChild(renderField(name, f, saved)));
    form.appendChild(outro);
  }

  content.appendChild(tpl);

  // Footer actions
  document.getElementById("resetDay").onclick = () => {
    if (confirm("Clear today's saved progress for this checklist?")) {
      localStorage.removeItem(keyFor(name));
      renderChecklist(name);
    }
  };

  document.getElementById("exportData").onclick = () => {
    const dump = {};
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith(STORAGE_PREFIX)) dump[k] = readJSON(k, null);
    });
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "bar_checklists_export.json"; a.click();
    URL.revokeObjectURL(url);
  };

  document.getElementById("importData").onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        Object.keys(obj).forEach(k => {
          if (k.startsWith(STORAGE_PREFIX)) localStorage.setItem(k, JSON.stringify(obj[k]));
        });
        alert("Import complete. Reloading…");
        location.reload();
      } catch {
        alert("Invalid JSON");
      }
    };
    reader.readAsText(file);
  };
}

// ---------- field renderer (UPDATED) ----------
function renderField(formName, field, saved) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  const id = field.id;

  // ✅ Replace simple checkbox with Completed / Not completed + reason
  if (field.type === "checkbox") {
    const statusKey = id + "_status";   // "completed" | "not_completed"
    const reasonKey = id + "_reason";   // free text when not completed
    const currentStatus = saved[statusKey] || "";
    const currentReason = saved[reasonKey] || "";

    // Title
    const title = document.createElement("label");
    title.textContent = field.label;
    wrap.appendChild(title);

    // Radio group
    const group = document.createElement("div");
    group.style.display = "flex";
    group.style.gap = "14px";
    group.style.flexWrap = "wrap";
    group.style.margin = "4px 0 6px";

    const makeRadio = (value, text) => {
      const row = document.createElement("label");
      row.style.display = "inline-flex";
      row.style.alignItems = "center";
      row.style.gap = "8px";
      row.style.padding = "6px 10px";
      row.style.border = "1px solid #2a2f45";
      row.style.borderRadius = "999px";
      row.style.background = "#1a1d2a";
      row.style.cursor = "pointer";

      const r = document.createElement("input");
      r.type = "radio";
      r.name = id + "_status";
      r.value = value;
      r.checked = currentStatus === value;

      r.addEventListener("change", () => {
        const s = readJSON(keyFor(formName), {});
        s[statusKey] = value;
        if (value === "completed") {
          // optional: clear reason when marked completed
          s[reasonKey] = "";
          reason.value = "";
          reasonWrap.style.display = "none";
        } else {
          reasonWrap.style.display = "";
        }
        writeJSON(keyFor(formName), s);
      });

      const span = document.createElement("span");
      span.textContent = text;
      row.appendChild(r);
      row.appendChild(span);
      return row;
    };

    group.appendChild(makeRadio("completed", "Completed"));
    group.appendChild(makeRadio("not_completed", "Not completed"));
    wrap.appendChild(group);

    // Reason textarea (only visible when Not completed)
    const reasonWrap = document.createElement("div");
    const reasonLabel = document.createElement("label");
    reasonLabel.textContent = "Not completed, why?";
    const reason = document.createElement("textarea");
    reason.placeholder = "Add brief details…";
    reason.value = currentReason || "";
    reason.addEventListener("change", () => {
      const s = readJSON(keyFor(formName), {});
      s[reasonKey] = reason.value;
      writeJSON(keyFor(formName), s);
    });
    reasonWrap.appendChild(reasonLabel);
    reasonWrap.appendChild(reason);
    reasonWrap.style.display = (currentStatus === "not_completed") ? "" : "none";
    wrap.appendChild(reasonWrap);
  }

  // Text input
  else if (field.type === "text") {
    const label = document.createElement("label");
    label.textContent = field.label;
    const input = document.createElement("input");
    input.type = "text";
    input.value = saved[id] || "";
    input.onchange = () => saveField(formName, id, input.value);
    wrap.appendChild(label); wrap.appendChild(input);
  }

  // Textarea
  else if (field.type === "textarea") {
    const label = document.createElement("label");
    label.textContent = field.label;
    const input = document.createElement("textarea");
    input.value = saved[id] || "";
    input.onchange = () => saveField(formName, id, input.value);
    wrap.appendChild(label); wrap.appendChild(input);
  }

  // Date
  else if (field.type === "date") {
    const label = document.createElement("label");
    label.textContent = field.label;
    const input = document.createElement("input");
    input.type = "date";
    input.value = saved[id] || "";
    input.onchange = () => saveField(formName, id, input.value);
    wrap.appendChild(label); wrap.appendChild(input);
  }

  // Datetime
  else if (field.type === "datetime") {
    const label = document.createElement("label");
    label.textContent = field.label;
    const input = document.createElement("input");
    input.type = "datetime-local";
    input.value = saved[id] || "";
    input.onchange = () => saveField(formName, id, input.value);
    wrap.appendChild(label); wrap.appendChild(input);
  }

  // Signature pad
  else if (field.type === "signature") {
    const label = document.createElement("label");
    label.textContent = field.label;
    wrap.appendChild(label);

    const sig = document.getElementById("sigTpl").content.cloneNode(true);
    const canvas = sig.querySelector("canvas");
    const clearBtn = sig.querySelector(".clear");
    const saveBtn = sig.querySelector(".saveSig");
    const ctx = canvas.getContext("2d");
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    let drawing = false;

    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
      const y = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
      return { x, y };
    };
    const start = (e) => { drawing = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
    const move = (e) => { if (!drawing) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
    const end  = () => { drawing = false; };

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    canvas.addEventListener("mouseup", end);
    canvas.addEventListener("mouseleave", end);
    canvas.addEventListener("touchstart", (e) => { e.preventDefault(); start(e); }, { passive: false });
    canvas.addEventListener("touchmove",  (e) => { e.preventDefault(); move(e);  }, { passive: false });
    canvas.addEventListener("touchend",   (e) => { e.preventDefault(); end();    }, { passive: false });

    clearBtn.onclick = () => ctx.clearRect(0, 0, canvas.width, canvas.height);
    saveBtn.onclick  = () => {
      const data = canvas.toDataURL("image/png");
      saveField(formName, id, data);
      alert("Signature saved");
    };

    // Load saved signature
    if (saved[id]) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = saved[id];
    }

    wrap.appendChild(sig);
  }

  return wrap;
}

// ---------- saving helper ----------
function saveField(formName, id, value) {
  const k = keyFor(formName);
  const obj = readJSON(k, {});
  obj[id] = value;
  writeJSON(k, obj);
}

// ---------- PWA install/offline ----------
function registerSW() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js");
    });
  }
}
let deferredPrompt;
function handleInstall() {
  const btn = document.getElementById("installBtn");
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    btn.hidden = false;
  });
  btn.addEventListener("click", async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      btn.hidden = true;
    }
  });
}
