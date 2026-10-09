"use strict";

const POOLS = window.POOLS || [];

const $ = (sel) => document.querySelector(sel);

const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function fmtMoney(v) {
  return "¥" + Number(v).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtProb(p) {
  if (p == null || p === 0) return "0%";
  if (p >= 1) {
    const r = Math.round(p * 10) / 10;
    return (r % 1 === 0 ? r.toFixed(0) : r.toFixed(1)) + "%";
  }
  return (Math.round(p * 1000) / 1000) + "%";
}

function fmtSigned(v) {
  const s = Number(v);
  return (s > 0 ? "+" : "") + s.toFixed(2);
}

function fmtPrice(v) {
  const n = Math.round(Number(v) * 100) / 100;
  return (Number.isInteger(n) ? n.toFixed(0) : n.toFixed(2).replace(/\.?0+$/, ""));
}

/* ---------- 统计条 ---------- */
function renderStats(list) {
  const withProb = list.filter((p) => p.hasProb);
  const avg =
    withProb.length > 0
      ? withProb.reduce((s, p) => s + p.payback, 0) / withProb.length
      : 0;
  const best = withProb.reduce((a, b) => (b.payback > a.payback ? b : a), withProb[0]);
  const pos = withProb.filter((p) => p.payback > 100).length;

  $("#stats").innerHTML = `
    <div class="stat"><div class="k">池子总数</div><div class="v">${POOLS.length}</div></div>
    <div class="stat"><div class="k">已公开概率</div><div class="v">${withProb.length}</div></div>
    <div class="stat"><div class="k">回本率 > 100%</div><div class="v" style="color:var(--green)">${pos}</div></div>
    <div class="stat"><div class="k">平均回本率</div><div class="v">${avg.toFixed(1)}%</div></div>
    ${best ? `<div class="stat"><div class="k">最高回本率</div><div class="v" style="color:var(--green)">${best.title.slice(0, 8)} ${best.payback.toFixed(1)}%</div></div>` : ""}
  `;
}

/* ---------- 卡片 ---------- */
function cardHTML(p) {
  const paybackCls = p.hasProb
    ? p.payback > 100
      ? "pos"
      : p.payback < 100
      ? "neg"
      : "zero"
    : "zero";
  const paybackTxt = p.hasProb ? p.payback.toFixed(1) + "%" : "—";

  return `
    <div class="card" data-id="${p.id}">
      <div class="title">${esc(p.title)}</div>
      <div class="price-line">
        <span class="amount">¥${fmtPrice(p.price)}</span>
        <span class="unit">元 / 抽</span>
      </div>
      ${
        p.hasProb
          ? `
            <div class="payback ${paybackCls}">${paybackTxt}<small> 回本率</small></div>
            <div class="metrics">
              <div class="m">期望价值<b>${fmtMoney(p.ev)}</b></div>
              <div class="m">期望收益<b>${fmtSigned(p.profit)}</b></div>
            </div>`
          : `<div class="noprob">概率未公开</div>`
      }
    </div>`;
}

function renderGrid(list) {
  $("#grid").innerHTML = list.map(cardHTML).join("");
  $("#empty").classList.toggle("hidden", list.length > 0);
}

/* ---------- 搜索 & 排序 ---------- */
let sortKey = "price";

function filterAndSort() {
  const q = $("#search").value.trim().toLowerCase();
  let list = POOLS.slice();
  if (q) {
    list = list.filter((p) => p.title.toLowerCase().includes(q));
  }
  list.sort((a, b) => {
    if (sortKey === "price") return a.price - b.price;
    // 未公开概率的排最后
    if (!a.hasProb && b.hasProb) return 1;
    if (a.hasProb && !b.hasProb) return -1;
    // payback / profit / ev 降序
    return b[sortKey] - a[sortKey];
  });
  renderGrid(list);
}

/* ---------- 详情弹窗 ---------- */
function tierHTML(t) {
  const rows = t.items
    .map((it) => {
      const orig =
        it.ov != null && it.ov !== it.v
          ? `<span class="orig">（原标价 ${fmtMoney(it.ov)}）</span>`
          : "";
      return `
      <tr>
        <td>${esc(it.t)}${orig}</td>
        <td class="num">${fmtMoney(it.v)}</td>
        <td class="num">${t.prob > 0 || it.p > 0 ? fmtProb(it.p) : "未公开"}</td>
      </tr>`;
    })
    .join("");
  return `
    <div class="tier">
      <div class="tier-head">
        <span class="swatch" style="background:${esc(t.color || "#666")}"></span>
        <span class="name">${esc(t.name)}</span>
        <span class="prob">${t.prob > 0 ? fmtProb(t.prob) : "概率未公开"}</span>
      </div>
      <table>
        <thead><tr><th>赏品</th><th class="num">标价</th><th class="num">概率</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/* ---------- 抽赏记录：档位已出/未出（实时请求） ---------- */
const SHANG_LOG_API = "https://aj.mwch.cn/api/infinite/shang_log";
const TOKEN_API = "ebe2a698902ad532f3020c4bf5e8ab304f119db8";

async function fetchLog(goodsId, shangId) {
  const body = { goods_id: String(goodsId) };
  if (shangId != null) body.shang_id = String(shangId);
  const res = await fetch(SHANG_LOG_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "tokentype": "1",
      "tokenapi": TOKEN_API,
    },
    body: JSON.stringify(body),
  });
  const d = await res.json();
  return (d && d.data && d.data.data) || [];
}

function fmtExpected(prob) {
  if (!prob || prob <= 0) return null;
  const r = Math.round((100 / prob) * 100) / 100;
  return String(r);
}

function gapChip(t) {
  const name = esc(t.name);
  const exp = fmtExpected(t.prob);
  const tail = exp != null ? `（正常概率 ${exp} 发一个）` : "";
  if (t.gap == null) return `<span class="ts none">${name} 未出</span>`;
  if (t.gap === 0) return `<span class="ts done">${name} 刚出</span>`;
  return `<span class="ts done">${name} 已 ${t.gap} 发未出${tail}</span>`;
}

async function loadTierGap(pool, box) {
  box.innerHTML = `<span class="ts pending">查询中…</span>`;
  try {
    // 该池最新一抽的 desc（desc 为池内连续递增的抽数序号）
    const all = await fetchLog(pool.id, null);
    const latestDesc = all.length > 0 ? parseInt(all[0].desc, 10) : null;
    // 每个稀有档位：最近一次出货的 desc，差值即为「已 N 发未出」（普通款不展示）
    const tiers = await Promise.all(
      pool.tiers
        .filter((t) => t.shang_id !== 103 && t.name.indexOf("普通") < 0)
        .map(async (t) => {
          const rec = await fetchLog(pool.id, t.shang_id);
          const lastDesc = rec.length > 0 ? parseInt(rec[0].desc, 10) : null;
          const gap = latestDesc != null && lastDesc != null ? latestDesc - lastDesc : null;
          return { ...t, gap };
        })
    );
    box.innerHTML = tiers.map(gapChip).join("");
  } catch (e) {
    box.innerHTML = `<span class="ts pending">获取失败</span>`;
  }
}

function openDetail(p) {
  const metrics = p.hasProb
    ? `
      <div class="metric-row">
        <div class="metric"><div class="k">期望价值</div><div class="v gold">${fmtMoney(p.ev)}</div><div class="hint">每抽平均拿到的标价</div></div>
        <div class="metric"><div class="k">回本率</div><div class="v ${p.payback > 100 ? "green" : p.payback < 100 ? "red" : ""}">${p.payback.toFixed(1)}%</div><div class="hint">期望价值 ÷ 单抽价格</div></div>
        <div class="metric"><div class="k">期望收益</div><div class="v ${p.profit >= 0 ? "green" : "red"}">${fmtSigned(p.profit)}</div><div class="hint">期望价值 − 单抽价格</div></div>
      </div>`
    : `<div class="noprob-banner">该池子暂未公开赏品概率，无法计算期望价值、回本率与期望收益。</div>`;

  const bar = p.hasProb
    ? `
      <div class="bar">${p.tiers
        .map((t) => `<div class="seg" style="width:${t.prob}%;background:${esc(t.color || "#666")}" title="${esc(t.name)} ${fmtProb(t.prob)}"></div>`)
        .join("")}</div>
      <div class="legend">${p.tiers
        .map((t) => `<span><span class="dot" style="background:${esc(t.color || "#666")}"></span>${esc(t.name)} ${fmtProb(t.prob)}</span>`)
        .join("")}</div>`
    : "";

  $("#panel").innerHTML = `
    <button class="close" id="closeBtn">✕</button>
    <div class="modal-head">
      <div>
        <div class="title">${esc(p.title)}</div>
        <div class="meta">
          <span>单抽 ${fmtMoney(p.price)}</span>
        </div>
        <div class="tier-status" id="tierStatus"></div>
      </div>
    </div>
    ${metrics}
    ${bar}
    ${p.tiers.map(tierHTML).join("")}
    <div class="note">期望价值 = Σ(赏品价值 × 单品概率)，其中「普通款」赏品统一按 0.5 元计价。回本率 = 期望价值 ÷ 单抽价格。结果仅供参考。</div>
  `;

  $("#modal").classList.remove("hidden");
  document.body.style.overflow = "hidden";
  $("#panel").scrollTop = 0;
  $("#closeBtn").addEventListener("click", closeDetail);
  loadTierGap(p, $("#tierStatus"));
}

function closeDetail() {
  $("#modal").classList.add("hidden");
  document.body.style.overflow = "";
}

/* ---------- 事件绑定 ---------- */
$("#search").addEventListener("input", filterAndSort);
$("#sort").addEventListener("change", (e) => {
  sortKey = e.target.value;
  filterAndSort();
});
$("#grid").addEventListener("click", (e) => {
  const card = e.target.closest(".card");
  if (!card) return;
  const pool = POOLS.find((p) => p.id === Number(card.dataset.id));
  if (pool) openDetail(pool);
});
$("#backdrop").addEventListener("click", closeDetail);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeDetail();
});

/* ---------- 初始化 ---------- */
renderStats(POOLS);
filterAndSort();
