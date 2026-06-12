# 響應式設計策略說明

## 技術棧（未變更）

- Next.js 15 App Router + React 19
- Tailwind CSS 3（語意 class + `@apply`）
- Recharts（圖表）
- 無新增重量級依賴

## 斷點體系（Mobile First）

| 斷點 | 最小寬度 | 目標設備 |
|------|----------|----------|
| 預設 | < 320px | 極小屏兜底 |
| `xs` | 320px | iPhone SE、小屏手機 |
| `sm` | 480px | 大屏手機、Android 常規 |
| `md` | 768px | 小平板（豎屏） |
| `lg` | 1024px | 平板橫屏、小筆電 |
| `xl` | 1440px | 筆記本、桌面 |
| `2xl` | 1920px | 超寬屏 |

定義於 `tailwind.config.ts`，全站統一引用。

## 佈局策略

### 頁面結構

```
Header（語言切換，md+ 頂部 sticky）
  ↓
.page-layout（CSS Grid）
  ├─ .page-layout-primary（標題、參數、圖表）
  └─ .page-layout-secondary（結果概覽 + 詳細結果）
  ↓
.mobile-action-bar（< md 底部固定「執行比較」）
  ↓
Footer（SEO FAQ）
```

| 視口 | 主佈局 | 表單 | 結果區 | 操作按鈕 |
|------|--------|------|--------|----------|
| ≤ 480px | 單列縱向 | 1 列 | 卡片流 1 列 | 底部固定欄 |
| 481–768px | 單列縱向 | 2 列 | 卡片 2 列 | 底部固定欄 |
| 769–1024px | 單列縱向 | 2 列 | 卡片 2 列 | 表單內聯 |
| ≥ 1024px | **左右分欄** | 最多 3 列 | 表格儀表盤 | 表單內聯 |
| ≥ 1440px | 內容 `max-width: 1440px` 居中 | 同左 | 同左 | 同左 |

### 核心 CSS 技術

- **CSS Grid**：`.page-layout`、`.form-grid`、`.compare-cards`、`.results-overview`
- **clamp()**：標題、統計數字、圖表高度、頁面內距
- **minmax() / auto-fit**：桌面統計卡片自適應列數
- **100dvh**：`body` 最小高度（替代 `100vh`）
- **env(safe-area-inset-*)**：底部操作欄適配劉海屏

## 表單響應式

- 輸入框 `font-size: 16px`（≤ md），防止 iOS 自動縮放
- 觸控目標最小 44×44px（移動端按鈕與輸入框）
- 桌面輸入高度約 44px（`2.75rem`）

## 結果區響應式

- **概覽**：`.results-overview` 統計卡片，`font-size: clamp(18px, 3vw, 36px)`
- **移動**：`.compare-cards` 單列卡片流
- **平板**：`.compare-cards` 雙列網格
- **桌面**：`.table-wrap` 全寬表格（`min-width: min(100%, 52rem)`）

## 效能優化

- 移除 header `backdrop-filter` 模糊（改為高透明度實色）
- 圖表線條 `isAnimationActive={false}` 減少重繪
- 圖表高度使用 `clamp()` + `min-height`，避免固定高度 CLS
- 網格線透明度降低，減少視覺開銷

## 修改檔案清單

| 檔案 | 變更 |
|------|------|
| `tailwind.config.ts` | 自訂斷點 xs–2xl |
| `src/app/globals.css` | 響應式佈局、表單、結果、圖表、頁腳 |
| `src/components/ComparePage.tsx` | 雙欄佈局、底部操作欄 |
| `src/components/CompareTable.tsx` | 統計概覽卡片 |
| `src/components/CompareChart.tsx` | 響應式 Y 軸、關閉動畫 |
| `src/components/SeoContent.tsx` | `<footer>` 語意標籤 |
| `src/app/layout.tsx` | `viewportFit: cover` |

## 截圖與測試產物

- 斷點截圖：`docs/responsive-screenshots/`
- Lighthouse 報告：`docs/lighthouse-after.json`
- 截圖腳本：`scripts/capture-breakpoints.mjs`

## 修改前後對比

| 項目 | 修改前 | 修改後 |
|------|--------|--------|
| 斷點 | 640px / 1024px（2 個） | 320–1920px（7 級） |
| 桌面佈局 | 單列長滾動 | ≥1024px 左右分欄 |
| 平板 | 與手機相同（卡片單列） | 雙列卡片 + 雙列表單 |
| 操作按鈕 | 表單內，小屏需滾動 | <768px 底部固定欄 |
| 結果概覽 | 僅文字 meta 行 | 統計卡片 + clamp 字級 |
| 頁腳 | `<section>` | 語意化 `<footer>` |
| 容器寬度 | `max-width: 1200px` | `clamp` + `max 1440px` 居中 |
| 觸控目標 | 640px 以上取消 44px | 移動端始終 44px |
| Header | `backdrop-filter: blur` | 實色背景，無模糊 |
