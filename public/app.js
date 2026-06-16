const form = document.querySelector("#convert-form");
const input = document.querySelector("#url");
const button = document.querySelector("#submit");
const result = document.querySelector("#result");
const health = document.querySelector("#health");
const overlay = document.querySelector("#loading-overlay");
const loadingTitle = document.querySelector("#loading-title");
const progressFill = document.querySelector("#progress-fill");
const loadingSteps = [...document.querySelectorAll("#loading-steps li")];

const stageTitles = [
  "正在產生 Excel",
  "正在讀取頁面",
  "正在寫入檔案",
];

let loadingTimer = null;
let supportedHosts = new Set();

function validateSubmittedUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("請貼上有效連結。");
  }

  if (parsed.protocol !== "https:" || (supportedHosts.size > 0 && !supportedHosts.has(parsed.hostname))) {
    throw new Error("暫不支援此連結。");
  }
}

function setResult(message, kind = "neutral") {
  result.textContent = message;
  result.dataset.kind = kind;
  result.hidden = !message;
}

function setStage(stage) {
  loadingTitle.textContent = stageTitles[Math.min(stage, stageTitles.length - 1)];
  const progress = Math.min(92, 24 + stage * 30);
  progressFill.style.width = `${progress}%`;
  loadingSteps.forEach((item) => {
    const itemStage = Number(item.dataset.stage);
    item.dataset.state = itemStage < stage ? "done" : itemStage === stage ? "active" : "pending";
  });
}

function showLoading() {
  overlay.hidden = false;
  setStage(0);
  let stage = 0;
  clearInterval(loadingTimer);
  loadingTimer = setInterval(() => {
    stage = Math.min(stage + 1, stageTitles.length - 1);
    setStage(stage);
  }, 950);
}

function hideLoading(success = false) {
  clearInterval(loadingTimer);
  loadingTimer = null;
  if (success) {
    progressFill.style.width = "100%";
    loadingTitle.textContent = "Excel 已產生";
    loadingSteps.forEach((item) => {
      item.dataset.state = "done";
    });
  }
  setTimeout(() => {
    overlay.hidden = true;
  }, success ? 420 : 0);
}

function filenameFromDisposition(header) {
  if (!header) return "excel_export.xlsx";
  const match = header.match(/filename="?([^"]+)"?/i);
  return match ? decodeURIComponent(match[1]) : "excel_export.xlsx";
}

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    if (!response.ok) throw new Error("health check failed");
    const data = await response.json();
    supportedHosts = new Set(data.allowedHosts || []);
    health.hidden = false;
    health.textContent = "就緒";
    health.dataset.kind = "ok";
  } catch {
    health.hidden = false;
    health.textContent = "離線";
    health.dataset.kind = "bad";
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    validateSubmittedUrl(input.value.trim());
  } catch (error) {
    setResult(error.message || "暫不支援此連結。", "error");
    input.focus();
    return;
  }

  button.disabled = true;
  input.disabled = true;
  showLoading();
  setResult("正在產生 Excel，請稍候...", "working");

  try {
    const response = await fetch("/api/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: input.value.trim() }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "轉換失敗。");
    }

    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = filenameFromDisposition(response.headers.get("Content-Disposition"));
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
    hideLoading(true);
    setResult("Excel 已產生並開始下載。", "success");
  } catch (error) {
    hideLoading(false);
    setResult(error.message || "轉換失敗。", "error");
  } finally {
    button.disabled = false;
    input.disabled = false;
    input.focus();
  }
});

checkHealth();
