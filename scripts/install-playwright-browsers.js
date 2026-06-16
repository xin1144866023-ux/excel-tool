const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const playwrightCli = path.join(__dirname, "..", "node_modules", "playwright", "cli.js");
console.log(`Node: ${process.version}`);
console.log(`Platform: ${process.platform} ${process.arch}`);
console.log(`Playwright CLI: ${playwrightCli}`);
console.log(`Playwright CLI exists: ${fs.existsSync(playwrightCli)}`);

const result = spawnSync(process.execPath, [playwrightCli, "install", "chromium"], {
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024,
  env: {
    ...process.env,
    DEBUG: process.env.DEBUG || "pw:install",
    PLAYWRIGHT_BROWSERS_PATH: "0",
    PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT: process.env.PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT || "120000",
  },
});

if (result.stdout) {
  console.log(result.stdout);
}

if (result.stderr) {
  console.error(result.stderr);
}

if (result.error) {
  console.error(result.error);
}

if (result.status !== 0) {
  console.error(`Playwright browser install failed with status ${result.status} and signal ${result.signal || "none"}.`);
}

process.exit(result.status ?? 1);
