const { spawnSync } = require("child_process");

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(npx, ["playwright", "install", "chromium"], {
  stdio: "inherit",
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: "0",
  },
});

process.exit(result.status ?? 1);
