/*
Corvo-Coder Website
Copyright (c) 2025 Austin (GitHub: TotoroEmotoro)
Licensed under the Corvo-Coder Website License, Version 1.0.
See the LICENSE file for full terms.
*/

let pyodideReadyPromise = null;
let initFailed = false;

function el(id){ return document.getElementById(id); }
function show(node){ node.classList.remove("hidden"); }
function hide(node){ node.classList.add("hidden"); }

// Show JS errors in Debug so nothing fails silently
window.addEventListener("error", (e) => {
  const dbg = el("debugArea");
  if (dbg){
    show(el("debugPanel"));
    el("toggleDebug").textContent = "Hide debug";
    dbg.textContent = (dbg.textContent ? dbg.textContent + "\n\n" : "") +
      "[JS Error] " + (e?.error?.stack || e.message || String(e));
  }
});

async function initPyodideAndRuntime(){
  const out = el("outputArea");
  const dbg = el("debugArea");
  const status = el("status");

  try{
    if (out) out.textContent = "Initialising Python runtime…";
    if (status) status.textContent = "Initialising…";

    // 1) Load Pyodide
    const pyodide = await loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/",
    });

    // 2) Install Lark
    await pyodide.loadPackage("micropip");
    await pyodide.runPythonAsync(`
import micropip
await micropip.install("lark")
    `);

    // 3) Fetch Corvo browser runtime
    const RUNTIME_URL = "https://raw.githubusercontent.com/TotoroEmotoro/Corvo/main/interpreter/browser_runtime.py";
    let runtimeCode = "";
    try{
      const resp = await fetch(RUNTIME_URL + "?ts=" + Date.now(), { cache: "no-store" });
      if (!resp.ok) throw new Error("HTTP " + resp.status + " fetching browser_runtime.py");
      runtimeCode = await resp.text();
    }catch(e){
      if (out) out.textContent = "Runtime load error.";
      if (status) status.textContent = "Runtime load error";
      if (dbg){
        show(el("debugPanel"));
        el("toggleDebug").textContent = "Hide debug";
        dbg.textContent =
          "Failed to fetch Corvo browser runtime.\n" +
          "URL: " + RUNTIME_URL + "\n" +
          "Error: " + String(e);
      }
      initFailed = true;
      return pyodide;
    }

    // 4) Load runtime into Pyodide and import
    pyodide.FS.writeFile("corvo_runtime.py", runtimeCode);
    const rid = await pyodide.runPythonAsync(`
import importlib, sys
if "corvo_runtime" in sys.modules:
    del sys.modules["corvo_runtime"]
corvo_module = importlib.import_module("corvo_runtime")
getattr(corvo_module, "RUNTIME_ID", "Corvo Browser Runtime")
    `);

    if (dbg){
      dbg.textContent =
        "Fetched browser_runtime.py (" + runtimeCode.length + " bytes)\n" +
        "Runtime ID: " + rid + "\n" +
        "Loaded runtime successfully.";
    }
    if (status) status.textContent = "Ready";
    if (out) out.textContent = "Ready.";

    return pyodide;
  }catch(err){
    initFailed = true;
    if (out) out.textContent = "Initialisation error.";
    if (status) status.textContent = "Initialisation error";
    if (el("debugArea")){
      show(el("debugPanel"));
      el("toggleDebug").textContent = "Hide debug";
      el("debugArea").textContent =
        (el("debugArea").textContent ? el("debugArea").textContent + "\n\n" : "") +
        "[Init Failure]\n" + String(err);
    }
    return null;
  }
}

async function runProgram(){
  const runBtn = el("runBtn");
  const inputEl = el("corvoInput");
  const out = el("outputArea");
  const dbg = el("debugArea");

  if (runBtn) runBtn.disabled = true;
  if (out) out.textContent = "Running…";

  try{
    const pyodide = await pyodideReadyPromise;
    if (!pyodide || initFailed){
      if (out) out.textContent = "Runtime not ready (see debug).";
      return;
    }

    // Strip full-line '#' comments as a convenience
    const userCode = inputEl ? inputEl.value : "";
    const sanitised = userCode.replace(/^[ \t]*#.*$/gm, "");
    pyodide.globals.set("___source", sanitised);

    const [resultStr, debugStr] = await pyodide.runPythonAsync(`
out, dbg = corvo_module.run_corvo(___source)
(out, dbg)
    `);

    if (out) out.textContent = resultStr || "(no output)";
    if (dbg){
      const existing = dbg.textContent ? dbg.textContent + "\n\n" : "";
      dbg.textContent = existing + (debugStr || "(no debug)");
    }
  }catch(err){
    if (out) out.textContent = "Runtime error.";
    if (dbg){
      show(el("debugPanel"));
      el("toggleDebug").textContent = "Hide debug";
      dbg.textContent = (dbg.textContent ? dbg.textContent + "\n\n" : "") + String(err);
    }
  }finally{
    if (runBtn) runBtn.disabled = false;
  }
}

// UI wiring
window.addEventListener("DOMContentLoaded", () => {
  el("runBtn")?.addEventListener("click", runProgram);
  el("clearBtn")?.addEventListener("click", () => { el("outputArea").textContent = ""; });
  el("shareBtn")?.addEventListener("click", () => {
    const code = el("corvoInput").value;
    const url = new URL(window.location.href);
    url.searchParams.set("code", btoa(unescape(encodeURIComponent(code))));
    navigator.clipboard.writeText(url.toString());
    el("status").textContent = "Link copied";
    setTimeout(() => (el("status").textContent = "Ready"), 1400);
  });
  el("loadExample")?.addEventListener("click", () => {
  el("corvoInput").value =
`# Summing numbers until total exceeds 15
the total is 0
the n is 1
while total is less than 15 do: [
  display "Adding " plus n
  the total is total plus n
  the n is n plus 1
]
display "Final total: " plus total`;
});

  el("toggleDebug")?.addEventListener("click", () => {
    const panel = el("debugPanel");
    if (panel.classList.contains("hidden")){
      show(panel); el("toggleDebug").textContent = "Hide debug";
    } else {
      hide(panel); el("toggleDebug").textContent = "Show debug";
    }
  });

  // Fill from shared link if present
  const qp = new URLSearchParams(window.location.search);
  const encoded = qp.get("code");
  if (encoded){
    try{
      el("corvoInput").value = decodeURIComponent(escape(atob(encoded)));
    }catch{}
  }

  // Start the runtime
  pyodideReadyPromise = initPyodideAndRuntime();
});
