const { parseAllowedHosts } = require("../server");

let generatedConfig = {};
try {
  generatedConfig = require("./generated-config");
} catch {
  generatedConfig = {};
}

const PACKAGED_ALLOWED_HOSTS = [
  "bXAubGlmZWJlZS50ZWNo",
  "ZGV2Lm1wLmxpZmViZWUudGVjaA==",
].map((value) => Buffer.from(value, "base64").toString("utf8"));

function desktopAllowedHosts(envValue = process.env.ALLOWED_HOSTS) {
  return parseAllowedHosts(envValue || PACKAGED_ALLOWED_HOSTS.join(","));
}

function desktopRemoteConvertApiBase(envValue = process.env.CONVERT_API_BASE) {
  if (envValue !== undefined) {
    return String(envValue || "").trim();
  }
  return String(generatedConfig.convertApiBase || "").trim();
}

module.exports = {
  desktopAllowedHosts,
  desktopRemoteConvertApiBase,
};
