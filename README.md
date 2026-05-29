# Forge Loop（工廠迴圈）

工廠優化 ＋ 做裝 ＋ 自動戰鬥的網頁增量遊戲雛型。
設計細節見 [`DESIGN.md`](./DESIGN.md)。

## 執行方式

```bash
npm install
npm run dev      # 開發伺服器（預設 http://localhost:5173）
npm run build    # 型別檢查 + production 建置到 dist/
npm run preview  # 預覽建置結果
```

> 本機 PowerShell 若擋 `npm.ps1`，改用 `npm.cmd`。

## 技術

Vite + TypeScript，零執行期依賴。DOM 介面 + Canvas 2D 戰鬥，固定步長迴圈，localStorage 存檔。

## 程式結構

```
src/
  main.ts            入口：載檔、接迴圈與所有 UI 回呼
  style.css          暗色像素風樣式
  game/
    types.ts         共用型別
    content.ts       靜態內容（素材/關卡/機台/配方數值）
    state.ts         初始狀態
    loop.ts          固定步長遊戲迴圈
    inventory.ts     素材庫存增減 / 成本檢查
    hero.ts          由裝備推導英雄屬性
    combat.ts        戰鬥 tick、掉落、波次推進、死亡重置
    production.ts     機台 tick、建造 / 拆除
    crafting.ts      製裝 + 詞條 roll
    equipment.ts     裝備 / 卸下 / 丟棄
    save.ts          localStorage 存讀檔
  render/battle.ts   Canvas 像素戰鬥繪製
  ui/ui.ts           DOM 介面與互動
```

## 雛型現況

最小閉環已打通：選關自動戰鬥 → 掉素材 → 建/餵機台產材料 → 製裝（基底固定＋詞條隨機）→ 穿裝變強 → 推進更難關卡。

尚未實作（見 `DESIGN.md` §6）：離線收益、盤面擴建、數值平衡、音效、美術資產。
