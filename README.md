# Seal Learner

這是一個用於學習和測試 SEAL（Simple Encrypted Arithmetic Library）加密庫的工具。

## 系統需求

- Node.js 18.0.0 或更高版本
- npm 9.0.0 或更高版本

## 安裝步驟

1. 克隆專案：
```bash
git clone https://github.com/do0x0ob/seal-learner.git
cd seal-learner
```

2. 安裝依賴：
```bash
npm install
```

## 使用方法

### Seal CLI 工具安裝(非必須)

您可以使用 Rust 的 cargo 工具安裝 seal-cli：

```bash
cargo install --git https://github.com/MystenLabs/seal --bin seal-cli
```

安裝完成後，請確認 `$HOME/.cargo/bin` 已加入您的 PATH，這樣才能在任何地方呼叫 `seal-cli`：

```bash
export PATH="$HOME/.cargo/bin:$PATH"

請執行以下指令使設定立即生效：

```bash
source ~/.zshrc  # 如果使用 zsh
# 或
source ~/.bashrc  # 如果使用 bash
```

可用指令確認安裝：

```bash
seal-cli --help
```

---


### 網頁介面

1. 啟動開發伺服器：
```bash
cd frontend
npm install
npm run dev
```

2. 在瀏覽器中打開 `http://localhost:5173`

## 專案結構

```
seal-learner/
├── src/           # 核心程式碼
├── frontend/      # 網頁介面
├── demo/          # Move 合約、`seal_approve`
└── dist/          # 編譯後的檔案
```

## 開發

1. 安裝開發依賴：
```bash
npm install
```

2. 編譯 TypeScript：
```bash
npm run build
```
