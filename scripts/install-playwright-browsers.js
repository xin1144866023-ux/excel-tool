const { spawnSync } = require("child_process");
const path = require("path");

const playwrightCli = path.join(__dirname, "..", "node_modules", "playwright", "cli.js");
const result = spawnSync(process.execPath, [playwrightCli, "install", "chromium"], {
  stdio: "inherit",
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: "0",
  },
});

if (result.error) {
  console.error(result.error);
}

process.exit(result.status ?? 1);
