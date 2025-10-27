// playground.js

let pyodideReadyPromise;

async function initPyodideAndRuntime() {
  // 1. load Pyodide
  const pyodide = await loadPyodide({
    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/",
  });

  // 2. install pure-Python deps, e.g. lark
  await pyodide.loadPackage("micropip");
  await pyodide.runPythonAsync(`
import micropip
await micropip.install("lark")
  `);

  // 3. load Corvo runtime code into the Pyodide FS
  // TODO: you will replace this stub string with an actual fetch of corvo_runtime.py
  const corvoRuntimePy = `
from lark import Lark

grammar = r"""
start: statement*
statement: "print" STRING
%import common.ESCAPED_STRING -> STRING
%import common.WS
%ignore WS
"""

parser = Lark(grammar, start="start")

def run_corvo(src: str):
    tree = parser.parse(src)

    lines = []
    for child in tree.children:
        token = child.children[0]  # STRING token
        text = token.value
        if text.startswith('"') and text.endswith('"'):
            text = text[1:-1]
        lines.append(text)

    output = "\\n".join(lines)
    debug = "Parsed " + str(len(tree.children)) + " statement(s)\\n" + tree.pretty()
    return output, debug
`;

  pyodide.FS.writeFile("corvo_runtime.py", corvoRuntimePy);

  // 4. import runtime
  await pyodide.runPythonAsync(`
import importlib
corvo_module = importlib.import_module("corvo_runtime")
  `);

  return pyodide;
}

// start loading pyodide immediately
pyodideReadyPromise = initPyodideAndRuntime();

window.addEventListener("DOMContentLoaded", () => {
  const runBtn = document.getElementById("runBtn");
  const inputEl = document.getElementById("corvoInput");
  const outputArea = document.getElementById("outputArea");
  const debugArea = document.getElementById("debugArea");

  async function handleRun() {
    runBtn.disabled = true;
    outputArea.textContent = "Running…";
    debugArea.textContent = "";

    try {
      const pyodide = await pyodideReadyPromise;

      const userCode = inputEl.value;
      pyodide.globals.set("___source", userCode);

      const [resultStr, debugStr] = await pyodide.runPythonAsync(`
out, dbg = corvo_module.run_corvo(___source)
(out, dbg)
      `);

      outputArea.textContent = resultStr || "(no output)";
      debugArea.textContent = debugStr || "(no debug)";
    } catch (err) {
      outputArea.textContent = "Runtime error.";
      debugArea.textContent = String(err);
    } finally {
      runBtn.disabled = false;
    }
  }

  runBtn.addEventListener("click", handleRun);
});
