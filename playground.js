/*
Corvo-Coder Website
Copyright (c) 2025 Austin (GitHub: TotoroEmotoro)
Licensed under the Corvo-Coder Website License, Version 1.0.
See the LICENSE file for full terms.
*/

// ===== playground.js =====

let pyodideReadyPromise;

async function initPyodideAndRuntime() {
  // 0) Small status helper (optional)
  const outputArea = document.getElementById("outputArea");
  const debugArea = document.getElementById("debugArea");
  if (outputArea) outputArea.textContent = "Loading Python runtime…";
  if (debugArea) debugArea.textContent = "";

  // 1) Load Pyodide (Python-in-browser)
  const pyodide = await loadPyodide({
    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/",
  });

  // 2) Install pure-Python deps (Lark) via micropip
  await pyodide.loadPackage("micropip");
  await pyodide.runPythonAsync(`
import micropip
await micropip.install("lark")
  `);

  // 3) Fetch Corvo browser runtime from your Corvo repo (raw file)
  //    TIP: If you tag releases, you can pin to a tag instead of 'main'.
  const RUNTIME_URL = "https://raw.githubusercontent.com/TotoroEmotoro/Corvo/main/interpreter/browser_runtime.py";
  let runtimeCode = "";
  try {
    const resp = await fetch(`${RUNTIME_URL}?ts=${Date.now()}`, { cache: "no-store" });
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} while fetching browser_runtime.py`);
    }
    runtimeCode = await resp.text();
  } catch (e) {
    // Surface the error in the UI so it's obvious
    if (outputArea) outputArea.textContent = "Runtime load error.";
    if (debugArea) debugArea.textContent = `Failed to fetch Corvo browser runtime:\n${String(e)}\nURL: ${RUNTIME_URL}`;
    throw e;
  }

  // 4) Write the runtime into Pyodide's in-memory FS and import it
  pyodide.FS.writeFile("corvo_runtime.py", runtimeCode);

  await pyodide.runPythonAsync(`
import importlib, sys
# Force a clean import in case of hot reloads
if "corvo_runtime" in sys.modules:
    del sys.modules["corvo_runtime"]
corvo_module = importlib.import_module("corvo_runtime")
# Expose a runtime identifier if present, else a fallback
RUNTIME_ID = getattr(corvo_module, "RUNTIME_ID", "CorvoBrowserRuntime (no RUNTIME_ID)")
RUNTIME_ID
  `).then((rid) => {
    if (debugArea) debugArea.textContent = `${rid}\nLoaded runtime successfully.`;
  });

  if (outputArea) outputArea.textContent = "Ready.";

  return pyodide;
}

// Start loading Pyodide + runtime immediately
pyodideReadyPromise = initPyodideAndRuntime();

window.addEventListener("DOMContentLoaded", () => {
  const runBtn = document.getElementById("runBtn");
  const inputEl = document.getElementById("corvoInput");
  const outputArea = document.getElementById("outputArea");
  const debugArea = document.getElementById("debugArea");

  // Optional: disable Run until runtime is ready
  if (runBtn) runBtn.disabled = true;
  (async () => {
    try {
      await pyodideReadyPromise;
    } finally {
      if (runBtn) runBtn.disabled = false;
    }
  })();

  async function handleRun() {
    if (!runBtn) return;
    runBtn.disabled = true;
    if (outputArea) outputArea.textContent = "Running…";
    if (debugArea) debugArea.textContent = "";

    try {
      const pyodide = await pyodideReadyPromise;

      // --- IMPORTANT: strip full-line '#' comments for resilience ---
      const userCode = inputEl ? inputEl.value : "";
      const sanitized = userCode.replace(/^[ \t]*#.*$/gm, "");
      pyodide.globals.set("___source", sanitized);

      // Call run_corvo() from the loaded corvo_runtime
      const [resultStr, debugStr] = await pyodide.runPythonAsync(`
out, dbg = corvo_module.run_corvo(___source)
(out, dbg)
      `);

      if (outputArea) outputArea.textContent = resultStr || "(no output)";
      if (debugArea) {
        // Keep any existing runtime ID banner we set earlier; append debug
        const existing = debugArea.textContent ? debugArea.textContent + "\n\n" : "";
        debugArea.textContent = existing + (debugStr || "(no debug)");
      }
    } catch (err) {
      if (outputArea) outputArea.textContent = "Runtime error.";
      if (debugArea) debugArea.textContent = String(err);
    } finally {
      runBtn.disabled = false;
    }
  }

  if (runBtn) runBtn.addEventListener("click", handleRun);
});
