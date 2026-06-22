const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, dialog, shell } = require("electron");
const { startServer } = require("../server");
const { desktopAllowedHosts, desktopRemoteConvertApiBase, desktopRemoteConvertApiKey } = require("./runtime-config");

let mainWindow = null;
let serverHandle = null;

function converterBinaryName() {
  return process.platform === "win32" ? "html-excel-converter.exe" : "html-excel-converter";
}

function findBundledConverter() {
  const candidate = path.join(__dirname, "bin", converterBinaryName());
  return fs.existsSync(candidate) ? candidate : undefined;
}

function windowIconPath() {
  const iconName = process.platform === "win32" ? "icon.ico" : "icon.png";
  const candidate = path.join(__dirname, "..", "build", iconName);
  return fs.existsSync(candidate) ? candidate : undefined;
}

function findFirstChild(root, prefix) {
  if (!fs.existsSync(root)) {
    return undefined;
  }

  return fs
    .readdirSync(root)
    .find((name) => name.startsWith(prefix));
}

function findHeadlessShellExecutable(browserRoot) {
  const shellDir = findFirstChild(browserRoot, "chromium_headless_shell-");
  if (!shellDir) {
    return undefined;
  }

  const platformDir =
    process.platform === "win32"
      ? "chrome-headless-shell-win64"
      : process.platform === "darwin"
        ? process.arch === "arm64"
          ? "chrome-headless-shell-mac-arm64"
          : "chrome-headless-shell-mac-x64"
        : "chrome-headless-shell-linux";
  const executableName = process.platform === "win32" ? "chrome-headless-shell.exe" : "chrome-headless-shell";
  const candidate = path.join(browserRoot, shellDir, platformDir, executableName);

  return fs.existsSync(candidate) ? candidate : undefined;
}

function configurePlaywrightBrowsers() {
  const packagedBrowsers = path.join(process.resourcesPath, "playwright-browsers");
  const localBrowsers = path.join(__dirname, "..", "node_modules", "playwright-core", ".local-browsers");
  const browserPath = app.isPackaged && fs.existsSync(packagedBrowsers) ? packagedBrowsers : localBrowsers;

  if (fs.existsSync(browserPath)) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = browserPath;
  }

  const headlessShell = findHeadlessShellExecutable(browserPath);
  if (headlessShell) {
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = headlessShell;
  }
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 820,
    minHeight: 600,
    title: "Excel 工具",
    icon: windowIconPath(),
    backgroundColor: "#f5f6f2",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    shell.openExternal(targetUrl);
    return { action: "deny" };
  });

  mainWindow.loadURL(url);
}

async function boot() {
  const remoteConvertApiBase = desktopRemoteConvertApiBase();
  const remoteConvertApiKey = desktopRemoteConvertApiKey();

  if (!remoteConvertApiBase) {
    configurePlaywrightBrowsers();
  }

  const generatedDir = path.join(app.getPath("userData"), "generated");
  const converterBin = remoteConvertApiBase ? undefined : findBundledConverter();

  serverHandle = await startServer({
    port: 0,
    allowedHosts: desktopAllowedHosts(),
    remoteConvertApiBase,
    remoteConvertApiKey,
    generatedDir,
    converterBin,
    pythonBin: process.env.PYTHON_BIN || "python3",
    chromiumExecutablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  });

  createWindow(serverHandle.url);
}

app.whenReady().then(() => {
  boot().catch((error) => {
    dialog.showErrorBox("Excel 工具啟動失敗", error.message || String(error));
    app.quit();
  });
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && serverHandle) {
    createWindow(serverHandle.url);
  }
});

app.on("before-quit", () => {
  if (serverHandle?.server) {
    serverHandle.server.close();
    serverHandle = null;
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
