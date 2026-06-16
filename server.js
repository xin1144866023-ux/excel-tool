const express = require("express");
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs/promises");
const fsSync = require("fs");
const os = require("os");
const path = require("path");

const DEFAULT_PORT = Number(process.env.PORT || 4173);
const CODEX_PYTHON_BIN = path.join(
  os.homedir(),
  ".cache",
  "codex-runtimes",
  "codex-primary-runtime",
  "dependencies",
  "python",
  "bin",
  process.platform === "win32" ? "python.exe" : "python3"
);

function findBundledPython() {
  return fsSync.existsSync(CODEX_PYTHON_BIN) ? CODEX_PYTHON_BIN : undefined;
}

const DEFAULT_PYTHON_BIN = process.env.PYTHON_BIN || findBundledPython() || "python3";
function parseAllowedHosts(rawValue) {
  return new Set(
    String(rawValue || "")
      .split(",")
      .map((value) =>
        value
          .trim()
          .replace(/^https?:\/\//i, "")
          .replace(/\/.*$/, "")
          .toLowerCase()
      )
      .filter(Boolean)
  );
}

const DEFAULT_ALLOWED_HOSTS = parseAllowedHosts(process.env.ALLOWED_HOSTS || "example.com");
const DEFAULT_GENERATED_DIR = process.env.GENERATED_DIR || path.join(__dirname, "generated");
const DEFAULT_STATIC_DIR = path.join(__dirname, "public");
const DEFAULT_CONVERTER_SCRIPT = path.join(__dirname, "converter.py");
const LOCAL_BROWSERS_DIR = path.join(__dirname, "node_modules", "playwright-core", ".local-browsers");

function findFirstChildSync(root, prefix) {
  try {
    return fsSync.readdirSync(root).find((item) => item.startsWith(prefix));
  } catch {
    return undefined;
  }
}

function findLocalChromiumExecutable(browserRoot = LOCAL_BROWSERS_DIR) {
  const shellDir = findFirstChildSync(browserRoot, "chromium_headless_shell-");
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

  try {
    fsSync.accessSync(candidate);
    return candidate;
  } catch {
    return undefined;
  }
}

function resolveChromiumExecutablePath(explicitPath) {
  return explicitPath || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || findLocalChromiumExecutable();
}

function formatClientError(error) {
  const message = String(error?.message || error || "");

  if (
    message.includes("Executable doesn't exist") ||
    message.includes("Looks like Playwright was just installed or updated") ||
    message.includes("browserType.launch") ||
    message.includes("ModuleNotFoundError") ||
    message.includes("No module named")
  ) {
    return "轉換環境未就緒，請重新啟動應用程式後再試。";
  }

  if (message.includes("net::ERR_NAME_NOT_RESOLVED") || message.includes("net::ERR_INTERNET_DISCONNECTED")) {
    return "網絡連線異常，請稍後再試。";
  }

  if (message.includes("Timeout") || message.includes("timeout")) {
    return "頁面讀取逾時，請稍後再試。";
  }

  if (["暫不支援此連結。", "暫不支援此頁面內容。", "請貼上有效連結。"].includes(message)) {
    return message;
  }

  return "轉換失敗，請稍後再試。";
}

function validateSourceUrl(rawUrl, allowedHosts = DEFAULT_ALLOWED_HOSTS) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("請貼上有效連結。");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("暫不支援此連結。");
  }
  if (parsed.username || parsed.password) {
    throw new Error("不支援含有內嵌帳戶資料的 URL。");
  }
  if (!allowedHosts.has(parsed.hostname.toLowerCase())) {
    throw new Error("暫不支援此連結。");
  }
  return parsed.toString();
}

function safeFilenameFromUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  const segments = parsed.pathname.split("/").filter(Boolean);
  const templateIndex = segments.indexOf("template");
  const templateName =
    templateIndex >= 0 && segments.length > templateIndex + 1
      ? segments.slice(templateIndex + 1).join("_")
      : segments.at(-1) || "proposal";
  const id = parsed.searchParams.get("id") || "preview";
  const language = parsed.searchParams.get("language") || "web";
  return `excel_${templateName}_${id}_${language}`.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

async function extractPagePayload(rawUrl, options = {}) {
  const allowedHosts = options.allowedHosts || DEFAULT_ALLOWED_HOSTS;
  const chromiumExecutablePath = resolveChromiumExecutablePath(options.chromiumExecutablePath);
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromiumExecutablePath,
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1200, height: 1600 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);

    await page.goto(rawUrl, { waitUntil: "networkidle", timeout: 30000 });

    const finalUrl = new URL(page.url());
    if (!allowedHosts.has(finalUrl.hostname.toLowerCase())) {
      throw new Error("暫不支援此連結。");
    }

    await page.waitForSelector("table.life-table, .excel-table table, table", { timeout: 15000 });

    return await page.evaluate(() => {
      const table = document.querySelector("table.life-table") || document.querySelector(".excel-table table") || document.querySelector("table");
      if (!table) {
        throw new Error("暫不支援此頁面內容。");
      }

      const styleOf = (el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          rect: { x: r.x, y: r.y, width: r.width, height: r.height },
          style: {
            backgroundColor: cs.backgroundColor,
            color: cs.color,
            fontWeight: cs.fontWeight,
            fontSize: cs.fontSize,
            fontFamily: cs.fontFamily,
            textAlign: cs.textAlign,
            verticalAlign: cs.verticalAlign,
          },
        };
      };

      const elementRecord = (el) => {
        const base = styleOf(el);
        return {
          tag: el.tagName,
          className: String(el.className || ""),
          text: el.innerText.trim(),
          ...base,
        };
      };

      const titleBar = document.querySelector(".life-title-bar") || document.querySelector(".excel-title");
      const notes = document.querySelector(".life-notes") || document.querySelector(".excel-note");

      return {
        sourceUrl: location.href,
        extractedAt: new Date().toISOString(),
        title: document.title,
        template: table.matches("table.life-table") ? "life-table" : table.closest(".excel-table") ? "mercer-excel-table" : "generic-table",
        meta: {
          titleItems: titleBar ? [...titleBar.children].map(elementRecord) : [],
          noteItems: notes ? [...notes.children].map(elementRecord) : [],
        },
        table: {
          className: String(table.className || ""),
          ...styleOf(table),
          rows: [...table.rows].map((row, rowIndex) => ({
            rowIndex,
            ...styleOf(row),
            cells: [...row.cells].map((cell, cellIndex) => ({
              cellIndex,
              text: cell.innerText.trim(),
              rowSpan: cell.rowSpan,
              colSpan: cell.colSpan,
              className: String(cell.className || ""),
              ...styleOf(cell),
            })),
          })),
        },
      };
    });
  } finally {
    await browser.close();
  }
}

function runPythonConverter(inputJsonPath, outputXlsxPath, options = {}) {
  const converterBin = options.converterBin || process.env.CONVERTER_BIN;
  const pythonBin = options.pythonBin || DEFAULT_PYTHON_BIN;
  const converterScript = options.converterScript || DEFAULT_CONVERTER_SCRIPT;
  const command = converterBin || pythonBin;
  const args = converterBin ? [inputJsonPath, outputXlsxPath] : [converterScript, inputJsonPath, outputXlsxPath];

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: __dirname,
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr.trim() || stdout.trim() || `converter exited with ${code}`));
      }
    });
  });
}

function createApp(options = {}) {
  const app = express();
  const allowedHosts = options.allowedHosts || DEFAULT_ALLOWED_HOSTS;
  const generatedDir = options.generatedDir || DEFAULT_GENERATED_DIR;
  const staticDir = options.staticDir || DEFAULT_STATIC_DIR;
  const pythonBin = options.pythonBin || DEFAULT_PYTHON_BIN;
  const converterBin = options.converterBin || process.env.CONVERTER_BIN;
  const chromiumExecutablePath = resolveChromiumExecutablePath(options.chromiumExecutablePath);

  app.locals.excelTool = {
    allowedHosts: [...allowedHosts],
    generatedDir,
    converterBin,
    chromiumExecutablePath,
  };

  app.use(express.json({ limit: "1mb" }));
  app.use(express.static(staticDir));

  app.post("/api/convert", async (req, res) => {
    const jobId = crypto.randomUUID();
    try {
      const url = validateSourceUrl(req.body?.url || "", allowedHosts);
      await fs.mkdir(generatedDir, { recursive: true });

      const baseName = safeFilenameFromUrl(url);
      const inputJsonPath = path.join(generatedDir, `${jobId}.json`);
      const outputXlsxPath = path.join(generatedDir, `${baseName}_${jobId.slice(0, 8)}.xlsx`);

      const payload = await extractPagePayload(url, { allowedHosts, chromiumExecutablePath });
      await fs.writeFile(inputJsonPath, JSON.stringify(payload, null, 2), "utf8");
      await runPythonConverter(inputJsonPath, outputXlsxPath, { pythonBin, converterBin });

      res.download(outputXlsxPath, `${baseName}.xlsx`, async (error) => {
        await fs.rm(inputJsonPath, { force: true }).catch(() => {});
        if (error) {
          console.error(error);
        }
      });
    } catch (error) {
      console.error(error);
      res.status(400).json({ error: formatClientError(error) });
    }
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}

function startServer(options = {}) {
  const port = Number(options.port ?? DEFAULT_PORT);
  const host = options.host || process.env.HOST;
  const app = options.app || createApp(options);

  return new Promise((resolve, reject) => {
    const listenArgs = host ? [port, host] : [port];
    const server = app.listen(...listenArgs, () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      resolve({
        app,
        server,
        port: actualPort,
        url: `http://127.0.0.1:${actualPort}`,
      });
    });
    server.once("error", reject);
  });
}

if (require.main === module) {
  startServer()
    .then(({ url }) => {
      console.log(`Excel 工具正在監聽 ${url}`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = {
  createApp,
  startServer,
  validateSourceUrl,
  formatClientError,
  findBundledPython,
  findLocalChromiumExecutable,
  parseAllowedHosts,
  resolveChromiumExecutablePath,
  safeFilenameFromUrl,
  extractPagePayload,
  runPythonConverter,
  DEFAULT_ALLOWED_HOSTS,
};
