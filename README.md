# Excel 工具

這是一個將指定 HTML 連結轉換為可編輯 Excel 活頁簿的桌面工具。

## 支援的 HTML 連結

工具只接受已配置的來源網域。正式部署或本機預覽時，可透過 `ALLOWED_HOSTS` 指定允許的網域：

```bash
ALLOWED_HOSTS=example.com,staging.example.com npm start
```

頁面需要包含其中一種支援的表格結構：

- Lioner：`table.life-table`、`.life-title-bar`、`.life-notes`
- Mercer UL：`.excel-table table`、`.excel-title`、`.excel-note`

## 系統需求

- Node.js
- Python 3
- Python 套件：`openpyxl`
- Node 套件：`express`、`playwright`
- 桌面打包套件：`PyInstaller`

在目前的 Codex 工作區，內置的 Node 和 Python 執行環境已提供所需套件。

## 本機預覽

```bash
npm install
npm start
```

開啟：

```text
http://localhost:4173
```

如要讓本機介面調用遠程轉換服務，可設定：

```bash
CONVERT_API_BASE=https://convert.example.com \
CONVERT_API_KEY=your-api-key \
npm start
```

此時本機只提供介面和下載代理，提取及 Excel 轉換會由遠程服務處理。

## 桌面應用程式

專案可使用 Electron 打包為桌面應用程式。打包內容包括：

- 本機 Express 服務
- 靜態 HTML 介面
- 由 PyInstaller 產生的 Python 轉換器 sidecar
- Playwright 的 Chromium headless shell

建立 macOS DMG：

```bash
npm run dist:mac
```

輸出：

```text
release/Excel 工具-0.1.0-arm64.dmg
```

建立只調用遠程服務的 macOS DMG：

```bash
CONVERT_API_BASE=https://convert.example.com \
CONVERT_API_KEY=your-api-key \
npm run dist:mac:remote
```

在 Windows 打包機建立 Windows 安裝程式：

```bash
npm run dist:win
```

如沒有 Windows 電腦，可使用 GitHub Actions 的 Windows runner 打包：

1. 將專案推送到 GitHub repository。
2. 在 repository 的 `Settings` → `Secrets and variables` → `Actions` 新增 `CONVERT_API_KEY` secret。
3. 打開 GitHub 的 Actions 頁面。
4. 選擇 `Build Windows EXE` workflow。
5. 點擊 `Run workflow`。
6. 如要建立遠程 API 版本，填入 `convert_api_base`；如留空則建立內置本機轉換器版本。
7. 完成後在 workflow artifact 下載 `excel-tool-windows`。

輸出會包含 Windows 安裝程式：

```text
release/Excel 工具 Setup 0.1.0.exe
```

未簽署的開發版本可用於本機測試。正式派發時，macOS 建議進行 Apple notarization，Windows 建議使用程式碼簽署。

桌面應用程式會在本機運行，但轉換時仍需要連線讀取來源 HTML 連結。

若使用 `CONVERT_API_BASE`，桌面應用程式會依賴遠程轉換服務；修復提取規則時，只需更新和部署遠程服務，客戶端通常不需要重新安裝。
遠程模式下，桌面端只做 URL 格式和 HTTPS 基礎檢查，來源網域支援清單由遠程服務控制；新增來源網域時通常只需更新和部署遠程服務。

## 運作方式

1. 驗證提交的 HTML 連結是否屬於允許的來源網域。
2. 使用 Playwright 開啟頁面。
3. 偵測支援的表格結構並擷取標題、表格和備註。
4. 將 DOM 文字、`rowspan`、`colspan` 和計算後 CSS 轉換為可編輯的 `.xlsx`。
5. 回傳產生的活頁簿供下載。

## 目前限制

- 不支援任意網站。
- 不支援 PDF 輸入。
- 如 HTML 頁面需要登入 cookie，需另外加入認證策略。
- 新增模板時，應同步補充對應的視覺邊界測試。
