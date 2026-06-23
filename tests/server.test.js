const assert = require("node:assert/strict");
const test = require("node:test");
const { spawnSync } = require("node:child_process");
const express = require("express");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  desktopAllowedHosts,
  desktopRemoteConvertApiBase,
  desktopRemoteConvertApiKey,
} = require("../desktop/runtime-config");
const {
  createApp,
  extractPagePayload,
  formatClientError,
  findBundledPython,
  findLocalChromiumExecutable,
  normalizeRemoteApiBase,
  parseAllowedHosts,
  remoteConvertUrl,
  safeFilenameFromUrl,
  startServer,
  validateSourceUrl,
} = require("../server");

function findConverterTestPython() {
  return [process.env.PYTHON_BIN, findBundledPython(), "python3"]
    .filter(Boolean)
    .find((pythonBin) => spawnSync(pythonBin, ["-c", "import openpyxl"]).status === 0);
}

const converterTestPython = findConverterTestPython();

test("validateSourceUrl accepts supported HTTPS source URLs", () => {
  const url = "https://example.com/proposal/custom/template/lioner?id=42&language=zh-Hant";

  assert.equal(validateSourceUrl(url), url);
});

test("validateSourceUrl rejects unsupported hosts", () => {
  assert.throws(
    () => validateSourceUrl("https://unsupported.example/proposal/custom/template/lioner"),
    /暫不支援此連結/
  );
});

test("formatClientError hides Playwright browser installation details", () => {
  const error = new Error(
    "browserType.launch: Executable doesn't exist at /Users/xin/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell\nLooks like Playwright was just installed or updated.\nPlease run the following command to download new browsers:\n    npx playwright install"
  );

  assert.equal(formatClientError(error), "轉換環境未就緒，請重新啟動應用程式後再試。");
});

test("formatClientError hides Python package installation details", () => {
  const error = new Error("ModuleNotFoundError: No module named 'openpyxl'");

  assert.equal(formatClientError(error), "轉換環境未就緒，請重新啟動應用程式後再試。");
});

test("findLocalChromiumExecutable discovers a project-local headless shell", () => {
  const executable = findLocalChromiumExecutable();

  assert.ok(
    executable === undefined || executable.endsWith("chrome-headless-shell"),
    `unexpected executable path: ${executable}`
  );
});

test("safeFilenameFromUrl creates a stable Excel filename stem", () => {
  const name = safeFilenameFromUrl(
    "https://example.com/proposal/custom/template/mercer/ul?id=abc-123&language=zh-Hant"
  );

  assert.equal(name, "excel_mercer_ul_abc-123_zh-Hant");
});

test("parseAllowedHosts accepts comma-separated host configuration", () => {
  assert.deepEqual([...parseAllowedHosts("https://example.com/a, staging.example.com")], [
    "example.com",
    "staging.example.com",
  ]);
});

test("remoteConvertUrl normalizes the configured API base", () => {
  assert.equal(normalizeRemoteApiBase(" https://api.example.com/base/ "), "https://api.example.com/base");
  assert.equal(remoteConvertUrl("https://api.example.com/base/"), "https://api.example.com/base/api/convert");
  assert.equal(remoteConvertUrl(""), "");
});

test("desktopAllowedHosts includes packaged source hosts", () => {
  const expectedHosts = [
    "bXAubGlmZWJlZS50ZWNo",
    "ZGV2Lm1wLmxpZmViZWUudGVjaA==",
  ].map((value) => Buffer.from(value, "base64").toString("utf8"));

  assert.deepEqual([...desktopAllowedHosts("")], expectedHosts);
});

test("desktopAllowedHosts lets environment configuration override packaged hosts", () => {
  assert.deepEqual([...desktopAllowedHosts("custom.example, preview.example")], [
    "custom.example",
    "preview.example",
  ]);
});

test("desktopRemoteConvertApiBase reads environment configuration", () => {
  assert.equal(desktopRemoteConvertApiBase("https://convert.example.com"), "https://convert.example.com");
  assert.equal(desktopRemoteConvertApiBase(""), "");
});

test("desktopRemoteConvertApiKey reads environment configuration", () => {
  assert.equal(desktopRemoteConvertApiKey(" secret-token "), "secret-token");
  assert.equal(desktopRemoteConvertApiKey(""), "");
});

test("createApp records injected desktop runtime paths", () => {
  const app = createApp({
    generatedDir: "/tmp/excel-tool-generated",
    converterBin: "/tmp/html-excel-converter",
    chromiumExecutablePath: "/tmp/chrome-headless-shell",
  });

  assert.deepEqual(app.locals.excelTool.allowedHosts, ["example.com"]);
  assert.equal(app.locals.excelTool.generatedDir, "/tmp/excel-tool-generated");
  assert.equal(app.locals.excelTool.converterBin, "/tmp/html-excel-converter");
  assert.equal(app.locals.excelTool.chromiumExecutablePath, "/tmp/chrome-headless-shell");
});

test("startServer exposes the health endpoint on an ephemeral port", async (t) => {
  const handle = await startServer({ port: 0 });
  t.after(() => handle.server.close());

  const response = await fetch(`${handle.url}/api/health`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload, {
    ok: true,
    mode: "local",
  });
});

test("createApp can mount API routes under a configured base path", async (t) => {
  const handle = await startServer({ port: 0, basePath: "/excel-convert" });
  t.after(() => handle.server.close());

  const response = await fetch(`${handle.url}/excel-convert/api/health`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload, {
    ok: true,
    mode: "local",
  });
});

test("convert endpoint requires an API key when configured", async (t) => {
  const handle = await startServer({
    port: 0,
    apiAuthToken: "secret-token",
  });
  t.after(() => handle.server.close());

  const response = await fetch(`${handle.url}/api/convert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://unsupported.example/template" }),
  });
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.deepEqual(payload, {
    error: "未授權的轉換請求。",
  });
});

test("convert endpoint accepts a valid API key when configured", async (t) => {
  const originalConsoleError = console.error;
  console.error = () => {};
  t.after(() => {
    console.error = originalConsoleError;
  });

  const handle = await startServer({
    port: 0,
    apiAuthToken: "secret-token",
    allowedHosts: new Set(["example.com"]),
    chromiumExecutablePath: "/tmp/missing-chrome-headless-shell",
  });
  t.after(() => handle.server.close());

  const response = await fetch(`${handle.url}/api/convert`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": "secret-token" },
    body: JSON.stringify({ url: "https://example.com/template" }),
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.deepEqual(payload, {
    error: "轉換環境未就緒，請重新啟動應用程式後再試。",
  });
});

test("convert endpoint returns a concise browser environment error", async (t) => {
  const originalConsoleError = console.error;
  console.error = () => {};
  t.after(() => {
    console.error = originalConsoleError;
  });

  const handle = await startServer({
    port: 0,
    allowedHosts: new Set(["example.com"]),
    chromiumExecutablePath: "/tmp/missing-chrome-headless-shell",
  });
  t.after(() => handle.server.close());

  const response = await fetch(`${handle.url}/api/convert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/template" }),
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.deepEqual(payload, {
    error: "轉換環境未就緒，請重新啟動應用程式後再試。",
  });
});

test("convert endpoint proxies conversion to a remote API when configured", async (t) => {
  const remoteApp = express();
  remoteApp.use(express.json());

  remoteApp.post("/api/convert", (req, res) => {
    assert.equal(req.get("X-API-Key"), "remote-secret-token");
    assert.deepEqual(req.body, { url: "https://example.com/template" });
    res
      .status(200)
      .setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .setHeader("Content-Disposition", 'attachment; filename="remote.xlsx"')
      .send(Buffer.from("xlsx-bytes"));
  });

  const remoteHandle = await startServer({ port: 0, app: remoteApp });
  t.after(() => remoteHandle.server.close());

  const handle = await startServer({
    port: 0,
    remoteConvertApiBase: remoteHandle.url,
    remoteConvertApiKey: "remote-secret-token",
  });
  t.after(() => handle.server.close());

  const response = await fetch(`${handle.url}/api/convert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://example.com/template" }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Disposition"), 'attachment; filename="remote.xlsx"');
  assert.equal(await response.text(), "xlsx-bytes");
});

test("remote conversion delegates source host validation to the remote API", async (t) => {
  const remoteApp = express();
  remoteApp.use(express.json());

  remoteApp.post("/api/convert", (req, res) => {
    assert.deepEqual(req.body, { url: "https://new-source.example/template" });
    res
      .status(200)
      .setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .send(Buffer.from("remote-host-ok"));
  });

  const remoteHandle = await startServer({ port: 0, app: remoteApp });
  t.after(() => remoteHandle.server.close());

  const handle = await startServer({
    port: 0,
    allowedHosts: new Set(["example.com"]),
    remoteConvertApiBase: remoteHandle.url,
  });
  t.after(() => handle.server.close());

  const response = await fetch(`${handle.url}/api/convert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://new-source.example/template" }),
  });

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "remote-host-ok");
});

test(
  "extractPagePayload recognizes Lioner WOL table metadata",
  { skip: !findLocalChromiumExecutable() },
  async (t) => {
    const sourceApp = express();
    sourceApp.get("/wol", (_req, res) => {
      res.type("html").send(`<!doctype html>
        <html>
          <body>
            <div class="lioner-wol-page lioner-wol-page--single lioner-wol-page--lang-sc">
              <section class="wol-sheet">
                <div class="wol-title-bar">
                  <h1>终身人寿保险</h1>
                  <div class="wol-profile">
                    <span>男性, 30岁, 非吸烟者</span>
                    <span>香港居民</span>
                  </div>
                </div>
                <table class="wol-table">
                  <tbody>
                    <tr><th>保险公司</th><td colspan="2">永明金融</td></tr>
                    <tr><th>首日退保价值</th><td>85.00%</td><td>656,300</td></tr>
                  </tbody>
                </table>
                <div class="wol-notes">
                  <div class="wol-notes-title">重要事项:</div>
                  <div class="wol-note-line">1. 此初步报价并不涵盖市场所有寿险产品˳</div>
                </div>
              </section>
            </div>
          </body>
        </html>`);
    });

    const sourceHandle = await startServer({ port: 0, app: sourceApp });
    t.after(() => sourceHandle.server.close());

    const payload = await extractPagePayload(`${sourceHandle.url}/wol`, {
      allowedHosts: new Set(["127.0.0.1"]),
      chromiumExecutablePath: findLocalChromiumExecutable(),
    });

    assert.equal(payload.template, "lioner-wol-table");
    assert.deepEqual(
      payload.meta.titleItems.map((item) => item.text),
      ["终身人寿保险", "男性, 30岁, 非吸烟者\n香港居民"]
    );
    assert.deepEqual(
      payload.meta.noteItems.map((item) => item.text),
      ["重要事项:", "1. 此初步报价并不涵盖市场所有寿险产品˳"]
    );
  }
);

test("converter accepts label-only life tables with notes", { skip: !converterTestPython }, () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "excel-tool-empty-life-"));
  const inputPath = path.join(tmpDir, "payload.json");
  const outputPath = path.join(tmpDir, "output.xlsx");
  const rows = [
    "保险公司",
    "保险类别",
    "保单货币",
    "身故赔偿",
    "总保险费",
    "推广优惠",
    "折扣后总保险费",
    "首日退保价值",
    "1 年后",
    "2 年后",
    "保证期",
  ].map((text, rowIndex) => ({
    rowIndex,
    rect: { height: 22 },
    cells: [
      {
        cellIndex: 0,
        text,
        rowSpan: 1,
        colSpan: 1,
        rect: { width: 204, height: 22 },
        style: {
          backgroundColor: "rgb(242, 242, 242)",
          color: "rgb(0, 0, 0)",
          fontWeight: "600",
          fontSize: "14px",
          textAlign: "center",
        },
      },
    ],
  }));

  fs.writeFileSync(
    inputPath,
    JSON.stringify({
      sourceUrl: "https://example.com/template?id=1",
      title: "建議書模版",
      template: "life-table",
      meta: {
        titleItems: [
          { text: "人寿保险", style: {}, rect: {} },
          { text: "N/A, N/A,\nN/A", style: {}, rect: {} },
        ],
        noteItems: [
          { text: "重要提示:", style: { backgroundColor: "rgb(184, 94, 23)" }, rect: {} },
          { text: "1. 此初步报价并不涵盖市场所有寿险产品˳", style: {}, rect: {} },
        ],
      },
      table: {
        className: "life-table",
        rect: { width: 204, height: 242 },
        style: {},
        rows,
      },
    }),
    "utf8"
  );

  const result = spawnSync(converterTestPython, ["converter.py", inputPath, outputPath], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.ok(fs.existsSync(outputPath));

  const inspect = spawnSync(
    converterTestPython,
    [
      "-c",
      [
        "import json, sys",
        "from openpyxl import load_workbook",
        "wb = load_workbook(sys.argv[1], read_only=True, data_only=True)",
        "ws = wb['HTML 鏈接']",
        "values = [str(cell.value) for row in ws.iter_rows() for cell in row if cell.value is not None]",
        "print(json.dumps({'rows': ws.max_row, 'cols': ws.max_column, 'title': ws['A1'].value, 'values': values}))",
      ].join("\n"),
      outputPath,
    ],
    { encoding: "utf8" }
  );
  assert.equal(inspect.status, 0, `${inspect.stdout}\n${inspect.stderr}`);
  const workbook = JSON.parse(inspect.stdout);
  const text = workbook.values.join("\n");
  assert.equal(workbook.rows, 16);
  assert.equal(workbook.cols, 1);
  assert.equal(workbook.title, "人寿保险");
  assert.match(text, /保险公司/);
  assert.match(text, /总保险费/);
  assert.match(text, /重要提示:/);
});
