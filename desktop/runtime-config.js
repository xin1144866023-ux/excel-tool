const { parseAllowedHosts } = require("../server");

const PACKAGED_ALLOWED_HOSTS = [
  "bXAubGlmZWJlZS50ZWNo",
  "ZGV2Lm1wLmxpZmViZWUudGVjaA==",
].map((value) => Buffer.from(value, "base64").toString("utf8"));

function desktopAllowedHosts(envValue = process.env.ALLOWED_HOSTS) {
  return parseAllowedHosts(envValue || PACKAGED_ALLOWED_HOSTS.join(","));
}

module.exports = {
  desktopAllowedHosts,
};
