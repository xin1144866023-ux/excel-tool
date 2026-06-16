const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const rootDir = path.join(__dirname, "..");
const bundledCodexPython = path.join(
  os.homedir(),
  ".cache",
  "codex-runtimes",
  "codex-primary-runtime",
  "dependencies",
  "python",
  "bin",
  process.platform === "win32" ? "python.exe" : "python3"
);

const candidates = [
  process.env.PYTHON_BIN,
  process.env.PYTHON,
  fs.existsSync(bundledCodexPython) ? bundledCodexPython : undefined,
  "python3",
  "python",
].filter(Boolean);

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: options.stdio || "pipe",
  });
}

function supportsBuild(python) {
  const pyinstaller = run(python, ["-m", "PyInstaller", "--version"]);
  if (pyinstaller.status !== 0) {
    return false;
  }

  const openpyxl = run(python, ["-c", "import openpyxl"]);
  return openpyxl.status === 0;
}

function findPython() {
  for (const python of candidates) {
    if (supportsBuild(python)) {
      return python;
    }
  }
  return null;
}

const python = findPython();
if (!python) {
  console.error("Could not find a Python runtime with both PyInstaller and openpyxl.");
  console.error("Install them with: python3 -m pip install pyinstaller openpyxl");
  console.error("Or run with: PYTHON_BIN=/path/to/python npm run build:converter");
  process.exit(1);
}

const result = run(
  python,
  [
    "-m",
    "PyInstaller",
    "--clean",
    "--onefile",
    "--name",
    "html-excel-converter",
    "--distpath",
    "desktop/bin",
    "--workpath",
    "build/pyinstaller",
    "converter.py",
  ],
  { stdio: "inherit" }
);

process.exit(result.status ?? 1);
