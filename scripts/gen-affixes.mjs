// 詞綴表生成器（規則文件）
// ──────────────────────────────────────────────────────────────────────────
// 詞綴採「分階」：每條詞綴有 N 個品質階（tier），每階自己的 min/max 與抽中權重，
// 越高階越強、越難中。製作時先依權重抽 tier、再在該階範圍內 roll 數值。
//
// 平常請直接手調 src/game/affixTable.csv；要整批重設才改下方規則區後執行：
//     npm run gen:affixes
// 零執行期依賴，純 node 腳本。
// ──────────────────────────────────────────────────────────────────────────

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const N_TIERS = 8;
// 各階抽中權重（越高階越難中；每階約減半，高階非常稀有）。長度須 = N_TIERS。
const TIER_WEIGHTS = [128, 64, 32, 16, 8, 4, 2, 1];

// ── 規則區（要重生時改這裡）─────────────────────────────────────────────
// 每條詞綴：stat / label / pct（顯示用）/ t1=[min,max]（第 1 階範圍）/ span（每階整段上移量）
// 第 k 階：min = t1min + (k-1)*span、max = t1max + (k-1)*span。
// span > 帶寬(t1max-t1min) → 各階**不重疊**（後一階 min 高於前一階 max）。
const RULES = {
  weapon: [
    { stat: "atk", label: "點傷", t1: [2, 4], span: 4 },
    { stat: "localPhysPct", label: "本地物理", pct: true, t1: [0.05, 0.1], span: 0.1 },
    { stat: "critChance", label: "暴擊", pct: true, t1: [0.01, 0.02], span: 0.02 },
    { stat: "critMult", label: "暴傷", pct: true, t1: [0.05, 0.1], span: 0.1 },
    { stat: "haste", label: "攻速", pct: true, t1: [0.03, 0.05], span: 0.04 },
  ],
  armor: [
    { stat: "hp", label: "固定生命", t1: [10, 20], span: 20 },
    { stat: "def", label: "固定防禦", t1: [1, 3], span: 4 },
    { stat: "hpRegen", label: "每秒回血", t1: [1, 2], span: 2 },
    { stat: "dmgReductionPct", label: "減傷", pct: true, t1: [0.01, 0.02], span: 0.02 },
    { stat: "critDmgTakenReductionPct", label: "減暴傷承受", pct: true, t1: [0.03, 0.05], span: 0.05 },
  ],
  accessory: [
    { stat: "atk", label: "點傷", t1: [2, 4], span: 4 },
    { stat: "critChance", label: "暴擊", pct: true, t1: [0.02, 0.03], span: 0.02 },
    { stat: "critMult", label: "暴傷", pct: true, t1: [0.1, 0.15], span: 0.1 },
    { stat: "hp", label: "生命", t1: [8, 15], span: 12 },
    { stat: "haste", label: "攻速", pct: true, t1: [0.03, 0.05], span: 0.05 },
  ],
};
// ────────────────────────────────────────────────────────────────────────

const roundVal = (v, pct) => (pct ? Math.round(v * 1000) / 1000 : Math.round(v));

function rows() {
  const out = [];
  for (const slot of ["weapon", "armor", "accessory"]) {
    for (const r of RULES[slot]) {
      for (let k = 1; k <= N_TIERS; k++) {
        const min = roundVal(r.t1[0] + (k - 1) * r.span, r.pct);
        const max = roundVal(r.t1[1] + (k - 1) * r.span, r.pct);
        out.push([slot, r.stat, r.label, r.pct ? 1 : "", k, TIER_WEIGHTS[k - 1], min, max]);
      }
    }
  }
  return out;
}

const HEADER = "slot,stat,label,pct,tier,weight,min,max";
const PREAMBLE = [
  "# 詞綴表（由 scripts/gen-affixes.mjs 生成；之後可直接手調本檔）",
  "# 分階詞綴：每條詞綴有多階（tier），每階自己的 min/max 與權重；越高階越難中。",
  "# 欄位：slot,stat,label,pct(1=百分比顯示),tier,weight,min,max。# 開頭與空行會略過。",
].join("\n");

const lines = rows().map((r) => r.join(","));
const content = `${PREAMBLE}\n${HEADER}\n${lines.join("\n")}\n`;

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, "..", "src", "game", "affixTable.csv");
writeFileSync(target, content, "utf8");
console.log(`已生成 ${target}（${rows().length} 列）`);
