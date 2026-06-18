const fs = require("fs");
const path = require("path");

function normalizeHttpUrl(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) {
    throw new Error("CONVERT_API_BASE is required for remote desktop builds.");
  }

  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("CONVERT_API_BASE must start with http:// or https://.");
  }
  parsed.hash = "";
  parsed.search = "";
  return parsed.toString().replace(/\/$/, "");
}

const convertApiBase = normalizeHttpUrl(process.env.CONVERT_API_BASE);
const targetPath = path.join(__dirname, "..", "desktop", "generated-config.js");
const contents = `module.exports = ${JSON.stringify({ convertApiBase }, null, 2)};\n`;

fs.writeFileSync(targetPath, contents, "utf8");
console.log(`Wrote ${targetPath}`);
