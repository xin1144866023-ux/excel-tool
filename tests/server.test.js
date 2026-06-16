const assert = require("node:assert/strict");
const test = require("node:test");
const { desktopAllowedHosts } = require("../desktop/runtime-config");
const {
  createApp,
  formatClientError,
  findLocalChromiumExecutable,
  parseAllowedHosts,
  safeFilenameFromUrl,
  startServer,
  validateSourceUrl,
} = require("../server");

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
