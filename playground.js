/*
Corvo-Coder Website
Copyright (c) 2025 Austin (GitHub: TotoroEmotoro)
Licensed under the Corvo-Coder Website License, Version 1.0.
See the LICENSE file for full terms.
*/

let pyodideReadyPromise = null;
let initFailed = false;

// Pipe any unhandled JS errors to the Debug panel so you can see them
window.addEventListener("error", (e) => {
  const dbg = document.getElementById("debugArea");
  if (dbg) {
    dbg.textContent =
      (dbg.textContent ? dbg.textContent + "\n\n" : "") +
      "[JS Error] " + (e?.error?.stack || e.message || String(e));
  }
});

async function initPyodideAndRuntime() {
  const out = document.getElementById("outputArea");
  const dbg = document.getElementById("debugArea");

  try {
    if (out) out.textContent = "Loading Python runtime…";
    if (dbg) dbg.textContent = "Initializing…";

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

    // 3) Fetch Corvo browser runtime from your Corvo repo
const RUNTIME_URL =
  "https://raw.githubusercontent.com/TotoroEmotoro/Corvo/main/interpreter/browser_runtime.py";
let runtimeCode = "";

try {
  console.log("Fetching Corvo runtime from", RUNTIME_URL);
  const resp = await fetch(`${RUNTIME_URL}?ts=${Date.now()}`, { cache: "no-store" });
  console.log("Response status:", resp.status);
  if (!resp.ok) {
    throw new Error("HTTP " + resp.status + " fetching browser_runtime.py");
  }
  runtimeCode = await resp.text();
  console.log("Fetched", runtimeCode.length, "bytes of runtime code.");
} catch (e) {
  if (outputArea) outputArea.textContent = "Runtime load error.";
  if (debugArea) {
    debugArea.textContent =
      "Failed to fetch Corvo browser runtime.\n" +
      "URL: " + RUNTIME_URL + "\n" +
      "Error: " + String(e) + "\n(Check console for details)";
  }
  console.error("Runtime load failed:", e);
  initFailed = true;
  return pyodide;
}


    // 3a) Diagnostics about fetched file
    const hasGrammar = runtimeCode.includes("CORVO_GRAMMAR");
    const hasRunCorvo = runtimeCode.includes("def run_corvo");
    const hasClass = runtimeCode.includes("class CorvoInterpreter");
    if (dbg) {
      const snippet = runtimeCode.slice(0, 240);
      dbg.textContent =
        `Fetched browser_runtime.py (${runtimeCode.length} bytes)\n` +
        `Contains CORVO_GRAMMAR: ${hasGrammar}\n` +
        `Contains run_corvo(): ${hasRunCorvo}\n` +
        `Contains CorvoInterpreter: ${hasClass}\n` +
        `--- First 240 chars ---\n${snippet}\n------------------------`;
    }

    // 4) Write & import runtime in Pyodide
    pyodide.FS.writeFile("corvo_runtime.py", runtimeCode);

    const rid = await pyodide.runPythonAsync(`
import importlib, sys
if "corvo_runtime" in sys.modules:
    del sys.modules["corvo_runtime"]
corvo_module = importlib.import_module("corvo_runtime")
getattr(corvo_module, "RUNTIME_ID", "CorvoBrowserRuntime (no RUNTIME_ID in file)")
    `);

    if (dbg) {
      dbg.textContent =
        (dbg.textContent ? dbg.textContent + "\n\n" : "") +
        `Runtime ID: ${rid}\nLoaded runtime successfully.`;
    }
    if (out) out.textContent = "Ready.";

    return pyodide;
  } catch (err) {
    initFailed = true;
    if (out) out.textContent = "Init error.";
    if (dbg) {
      dbg.textContent =
        (dbg.textContent ? dbg.textContent + "\n\n" : "") +
        "[Init Failure]\n" + String(err);
    }
    return null;
  }
}

async function runProgram() {
  const runBtn = document.getElementById("runBtn");
  const inputEl = document.getElementById("corvoInput");
  const out = document.getElementById("outputArea");
  const dbg = document.getElementById("debugArea");

  if (runBtn) runBtn.disabled = true;
  if (out) out.textContent = "Running…";

  try {
    const pyodide = await pyodideReadyPromise;
    if (!pyodide || initFailed) {
      if (out) out.textContent = "Runtime not ready (see Debug).";
      return;
    }

    // Strip full-line '#' comments (resilience, even though grammar should ignore them)
    const userCode = inputEl ? inputEl.value : "";
    const sanitized = userCode.replace(/^[ \t]*#.*$/gm, "");
    pyodide.globals.set("___source", sanitized);

    // Execute via run_corvo() from corvo_runtime
    const [resultStr, debugStr] = await pyodide.runPythonAsync(`
out, dbg = corvo_module.run_corvo(___source)
(out, dbg)
    `);

    if (out) out.textContent = resultStr || "(no output)";
    if (dbg) {
      const existing = dbg.textContent ? dbg.textContent + "\n\n" : "";
      dbg.textContent = existing + (debugStr || "(no debug)");
    }
  } catch (err) {
    if (out) out.textContent = "Runtime error.";
    const dbg = document.getElementById("debugArea");
    if (dbg) {
      dbg.textContent =
        (dbg.textContent ? dbg.textContent + "\n\n" : "") + String(err);
    }
  } finally {
    if (runBtn) runBtn.disabled = false;
  }
}

// Wire up once DOM is ready
window.addEventListener("DOMContentLoaded", () => {
  // Always attach the handler (even if init fails; it will report why)
  const runBtn = document.getElementById("runBtn");
  if (runBtn) runBtn.addEventListener("click", runProgram);

  // Start init after DOM is ready
  pyodideReadyPromise = initPyodideAndRuntime();
});
