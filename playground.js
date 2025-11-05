/*
Corvo-Coder Website
Copyright (c) 2025 Austin (GitHub: TotoroEmotoro)
Licensed under the Corvo-Coder Website License, Version 1.0.
See the LICENSE file for full terms.
*/

// ===== playground.js =====

let pyodideReadyPromise;

async function initPyodideAndRuntime() {
  const outputArea = document.getElementById("outputArea");
  const debugArea = document.getElementById("debugArea");
  if (outputArea) outputArea.textContent = "Loading Python runtime…";
  if (debugArea) debugArea.textContent = "Initializing…";

  // 1) Load Pyodide
  const pyodide = await loadPyodide({
    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/",
  });

  // 2) Install Lark via micropip
  await pyodide.loadPackage("micropip");
  await pyodide.runPythonAsync(`
import micropip
await micropip.install("lark")
  `);

  // 3) Fetch Corvo browser runtime from your Corvo repo (RAW URL + cache-bust)
  const RUNTIME_URL =
    "https://raw.githubusercontent.com/TotoroEmotoro/Corvo/main/interpreter/browser_runtime.py";
  let runtimeCode = "";
  try {
    const resp = await fetch(`${RUNTIME_URL}?ts=${Date.now()}`, { cache: "no-store" });
    if (!resp.ok) throw new Error(\`HTTP \${resp.status} while fetching browser_runtime.py\`);
    runtimeCode = await resp.text();
  } catch (e) {
    if (outputArea) outputArea.textContent = "Runtime load error.";
    if (debugArea) {
      debugArea.textContent =
        `Failed to fetch Corvo browser runtime.\n` +
        `URL: ${RUNTIME_URL}\n` +
        `Error: ${String(e)}`;
    }
    throw e;
  }

  // 3a) DIAGNOSTIC: sanity check the content we fetched
  const snippet = runtimeCode.slice(0, 240);
  const hasGrammar = runtimeCode.includes("CORVO_GRAMMAR");
  const hasRunCorvo = runtimeCode.includes("def run_corvo");
  const hasCorvoInterpreter = runtimeCode.includes("class CorvoInterpreter");

  if (debugArea) {
    debugArea.textContent =
      `Fetched browser_runtime.py (${runtimeCode.length} bytes)\n` +
      `Contains CORVO_GRAMMAR: ${hasGrammar}\n` +
      `Contains run_corvo(): ${hasRunCorvo}\n` +
      `Contains CorvoInterpreter: ${hasCorvoInterpreter}\n` +
      `--- First 240 chars ---\n` +
      snippet +
      `\n------------------------`;
  }

  // 4) Write file into Pyodide's FS and import it
  pyodide.FS.writeFile("corvo_runtime.py", runtimeCode);

  // Force a fresh import each reload
  const rid = await pyodide.runPythonAsync(`
import importlib, sys
if "corvo_runtime" in sys.modules:
    del sys.modules["corvo_runtime"]
corvo_module = importlib.import_module("corvo_runtime")
getattr(corvo_module, "RUNTIME_ID", "CorvoBrowserRuntime (no RUNTIME_ID in file)")
  `);

  if (debugArea) {
    debugArea.textContent =
      (debugArea.textContent ? debugArea.textContent + "\n\n" : "") +
      `Runtime ID: ${rid}\nLoaded runtime successfully.`;
  }
  if (outputArea) outputArea.textContent = "Ready.";

  return pyodide;
}

// start loading immediately
pyodideReadyPromise = initPyodideAndRuntime();

window.addEventListener("DOMContentLoaded", () => {
  const runBtn = document.getElementById("runBtn");
  const inputEl = document.getElementById("corvoInput");
  const outputArea = document.getElementById("outputArea");
  const debugArea = document.getElementById("debugArea");

  // Disable Run until runtime ready
  if (runBtn) runBtn.disabled = true;
  (async () => {
    try { await pyodideReadyPromise; } finally { if (runBtn) runBtn.disabled = false; }
  })();

  async function handleRun() {
    if (!runBtn) return;
    runBtn.disabled = true;
    if (outputArea) outputArea.textContent = "Running…";
    if (debugArea) debugArea.textContent = (debugArea.textContent || "");

    try {
      const pyodide = await pyodideReadyPromise;

      // Strip full-line '#' comments for resilience
      const userCode = inputEl ? inputEl.value : "";
      const sanitized = userCode.replace(/^[ \t]*#.*$/gm, "");
      pyodide.globals.set("___source", sanitized);

      // Call run_corvo from the fetched runtime
      const [resultStr, debugStr] = await pyodide.runPythonAsync(`
out, dbg = corvo_module.run_corvo(___source)
(out, dbg)
      `);

      if (outputArea) outputArea.textContent = resultStr || "(no output)";
      if (debugArea) {
        const existing = debugArea.textContent ? debugArea.textContent + "\n\n" : "";
        debugArea.textContent = existing + (debugStr || "(no debug)");
      }
    } catch (err) {
      if (outputArea) outputArea.textContent = "Runtime error.";
      if (debugArea) debugArea.textContent =
        (debugArea.textContent ? debugArea.textContent + "\n\n" : "") + String(err);
    } finally {
      runBtn.disabled = false;
    }
  }

  if (runBtn) runBtn.addEventListener("click", handleRun);
});
