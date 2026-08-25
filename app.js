/* ═══════════════════════════════════════════════════════════════════════════
   Franchise Scorecard — application logic
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

const DATA   = window.DASHBOARD_DATA;
const PLANTS = DATA.plants;
const RULES  = DATA.rules;

const MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const MONTHS_FULL = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                     'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const ALL = '__all__';

/* ─────────────────────────────── helpers ─────────────────────────────────── */
const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const esc = t => String(t == null ? '' : t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const num = (v, d) => {
  if (v == null || isNaN(v)) return '–';
  return Number(v).toLocaleString('th-TH', {
    minimumFractionDigits: d || 0, maximumFractionDigits: d == null ? 0 : d });
};
const pct  = (v, d) => (v ? num(v * 100, d == null ? 1 : d) + '%' : '–');
const sc   = v => (v == null ? '–' : (Math.round(v * 100) / 100).toLocaleString('th-TH'));
const has  = v => v != null && v !== '' && v !== 0;
const monthName = m => (m >= 1 && m <= 12 ? MONTHS_FULL[m - 1] : '');

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(t._h); t._h = setTimeout(() => { t.hidden = true; }, 2600);
}

function uniqSorted(arr) {
  return Array.from(new Set(arr)).filter(Boolean).sort((a, b) => a.localeCompare(b, 'th'));
}

function fillSelect(sel, values, allLabel, keep) {
  const prev = keep && values.includes(sel.value) ? sel.value : ALL;
  sel.innerHTML = '';
  const o = el('option'); o.value = ALL; o.textContent = allLabel; sel.appendChild(o);
  values.forEach(v => {
    const op = el('option'); op.value = v; op.textContent = v; sel.appendChild(op);
  });
  sel.value = prev;
}

/* star glyph */
function starsHTML(count) {
  let h = '<div class="stars" aria-label="' + count + ' ดาว">';
  for (let i = 1; i <= 5; i++) {
    h += '<svg viewBox="0 0 24 24" class="' + (i <= count ? 'star-on' : 'star-off') + '">' +
         '<path d="M12 1.8l3.09 6.26 6.91 1-5 4.87 1.18 6.87L12 17.56l-6.18 3.25L7 13.94l-5-4.87 6.91-1z"/></svg>';
  }
  return h + '</div>';
}

/* ─────────────────────────── scoring lookups ─────────────────────────────── */
function saleTierLabel(total) {
  if (total > 40000) return 'มากกว่า 40,000 ลบ.ม.';
  if (total > 30000) return '30,001 – 40,000 ลบ.ม.';
  if (total > 20000) return '20,001 – 30,000 ลบ.ม.';
  if (total > 10000) return '10,001 – 20,000 ลบ.ม.';
  return 'ต่ำกว่า 10,000 ลบ.ม.';
}
/* CPK: ต่ำกว่า 0.55 ไม่ได้คะแนน · 0.70–0.80 ได้คะแนนเต็ม 2.5 · ช่วงอื่นได้ 1.25 */
const cpkPass = v => v > 0 && v >= RULES.cpkLow;
const cpkBest = v => v >= RULES.cpkBestLow && v <= RULES.cpkBestHigh;
/* 3-state: true = เต็ม · null = ได้บางส่วน · false = ไม่ได้คะแนน */
const cpkJudge = v => (!v ? null : (v < RULES.cpkLow ? false : (cpkBest(v) ? true : null)));
const npsPass  = v => v >= RULES.npsPass;
const inspected  = p => (p.sfPlant && p.sfPlant.month > 0);
const truckDone  = p => !!(p.sfTruck && (p.sfTruck.h1 || p.sfTruck.h2));
const envDone    = p => !!(p.env && (p.env.score > 0 || p.env.sum > 0));
const drvComplete= p => !!(p.drv && p.drv.total > 0 && p.drv.untrained === 0);
const empPass    = p => !!(p.emp && p.emp.pass >= RULES.empMin);

/* ═══════════════════════════════ NAVIGATION ═══════════════════════════════ */
$$('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.nav-item').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
    btn.classList.add('active'); btn.setAttribute('aria-selected', 'true');
    $$('.panel').forEach(p => p.classList.remove('active'));
    $('#tab-' + btn.dataset.tab).classList.add('active');
    document.body.classList.remove('nav-open');
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
});
$('#menuBtn').addEventListener('click', () => document.body.classList.toggle('nav-open'));
$('#scrim').addEventListener('click', () => document.body.classList.remove('nav-open'));
$('#sideTotal').textContent = PLANTS.length;

/* ═════════════════════════════ TAB 1 : แยกบริษัท ══════════════════════════ */
const pRegion = $('#pRegion'), pMgr = $('#pMgr'), pFM = $('#pFM'),
      pCompany = $('#pCompany'), pPlant = $('#pPlant'),
      pSearch = $('#pSearch'), pSuggest = $('#pSuggest');
const P_CHAIN = [[pRegion, 'region', 'ทุกกิจการ'], [pMgr, 'team', 'ทุกผู้จัดการผลิต'],
                 [pFM, 'teamFM', 'ทุกทีม FM'], [pCompany, 'company', 'ทุกบริษัท']];
let current = null;
const charts = {};

function destroyCharts() {
  Object.keys(charts).forEach(k => { charts[k].destroy(); delete charts[k]; });
}

/* ไล่กรองทีละชั้น: ตัวเลือกของชั้นถัดไปมาจากผลของชั้นก่อนหน้าเสมอ */
function syncPlantFilters(keepPlant) {
  let base = PLANTS;
  P_CHAIN.forEach(row => {
    const sel = row[0], key = row[1];
    fillSelect(sel, uniqSorted(base.map(p => p[key])), row[2], true);
    if (sel.value !== ALL && !base.some(p => p[key] === sel.value)) sel.value = ALL;
    if (sel.value !== ALL) base = base.filter(p => p[key] === sel.value);
  });

  const prev = pPlant.value;
  pPlant.innerHTML = '';
  base.slice().sort((a, b) => a.name.localeCompare(b.name, 'th')).forEach(p => {
    const o = el('option');
    o.value = p.code; o.textContent = p.name + '  (' + p.code + ')';
    pPlant.appendChild(o);
  });
  if (keepPlant && base.some(p => p.code === keepPlant)) pPlant.value = keepPlant;
  else if (base.some(p => p.code === prev)) pPlant.value = prev;
  if (!pPlant.value && base.length) pPlant.value = base[0].code;
  renderPlant(pPlant.value);
}

function selectPlant(code) {
  const p = PLANTS.find(x => x.code === code);
  if (!p) return;
  P_CHAIN.forEach(row => { row[0].value = p[row[1]]; });
  syncPlantFilters(code);
}

P_CHAIN.forEach((row, i) => {
  row[0].addEventListener('change', () => {
    /* เปลี่ยนชั้นบน ให้ล้างชั้นล่างทั้งหมด */
    for (let j = i + 1; j < P_CHAIN.length; j++) P_CHAIN[j][0].value = ALL;
    syncPlantFilters();
  });
});
pPlant.addEventListener('change', () => renderPlant(pPlant.value));

/* type-ahead */
pSearch.addEventListener('input', () => {
  const q = pSearch.value.trim().toLowerCase();
  if (!q) { pSuggest.hidden = true; return; }
  const hits = PLANTS.filter(p =>
    p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) ||
    p.company.toLowerCase().includes(q)).slice(0, 30);
  if (!hits.length) {
    pSuggest.innerHTML = '<button type="button" disabled style="color:var(--muted)">ไม่พบโรงงานที่ตรงกับคำค้น</button>';
    pSuggest.hidden = false; return;
  }
  pSuggest.innerHTML = hits.map(p =>
    '<button type="button" data-code="' + p.code + '"><b>' + esc(p.name) + '</b>' +
    '<small>' + esc(p.code) + ' · ' + esc(p.company) + ' · ' + esc(p.region) + '</small></button>').join('');
  pSuggest.hidden = false;
});
pSuggest.addEventListener('click', e => {
  const b = e.target.closest('button[data-code]');
  if (!b) return;
  selectPlant(b.dataset.code);
  pSearch.value = ''; pSuggest.hidden = true;
});
document.addEventListener('click', e => {
  if (!e.target.closest('.fld-search')) pSuggest.hidden = true;
});

/* ───────────────────────────── render plant ──────────────────────────────── */
function renderPlant(code) {
  destroyCharts();
  const host = $('#plantReport');
  const p = PLANTS.find(x => x.code === code);
  if (!p) {
    host.innerHTML = '<div class="osec"><div class="empty"><b>ยังไม่ได้เลือกโรงงาน</b>' +
      'เลือกกิจการ บริษัท และโรงงานจากช่องด้านบน</div></div>';
    current = null; return;
  }
  current = p;
  host.innerHTML = ticketHTML(p) + metricsHTML(p) + chartsShellHTML(p);
  drawCharts(p);
}

function ticketHTML(p) {
  const s = p.sc;
  const R = 56, C = 2 * Math.PI * R;
  const off = C * (1 - Math.max(0, Math.min(1, s.total / 100)));
  const starTxt = ['', '', '2 ดาว', '3 ดาว', '4 ดาว', '5 ดาว'][s.star] || '';
  const bonus = (RULES.star.find(t => s.total >= t[0]) || [0, 2, 0])[2];
  return '' +
  '<div class="ticket">' +
    '<div>' +
      '<div class="tk-eyebrow">รายงานผลคะแนน · ' + esc(p.code) + ' · ' + esc(p.region) + '</div>' +
      '<div class="tk-plant">' + esc(p.name) + '</div>' +
      '<div class="tk-company">' + esc(p.company) + '</div>' +
      '<div class="tk-people">' +
        '<span>ผู้จัดการผลิต <b>' + esc(p.team) + '</b></span>' +
        '<span>ทีม FM <b>' + esc(p.teamFM) + '</b></span>' +
      '</div>' +
    '</div>' +
    '<div class="tk-score">' +
      '<div class="gauge">' +
        '<svg viewBox="0 0 132 132">' +
          '<circle class="g-bg" cx="66" cy="66" r="' + R + '"/>' +
          '<circle class="g-fg" cx="66" cy="66" r="' + R + '" ' +
            'stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"/>' +
        '</svg>' +
        '<div class="gauge-txt"><b>' + sc(s.total) + '</b><span>จาก 100 คะแนน</span></div>' +
      '</div>' +
      starsHTML(s.star) +
      '<div class="star-label">' + starTxt + ' · โบนัส ' + bonus + ' บาท/คิว</div>' +
    '</div>' +
  '</div>';
}

/* กล่องคะแนนแบบกะทัดรัด: คะแนนอยู่ด้านบนสุด รายละเอียดอยู่ล่าง */
function box(cls, title, points, scoreVal, max, body) {
  const c = scoreVal < 0 ? 'neg' : (scoreVal === 0 ? 'zero' : '');
  return '<div class="box ' + cls + '">' +
    '<div class="box-top"><h3>' + title + '</h3>' +
      (points ? '<span class="pt">' + points + '</span>' : '') + '</div>' +
    '<div class="box-score"><b class="' + c + '">' + sc(scoreVal) + '</b>' +
      (max ? '<span>/ ' + max + '</span>' : '<span>คะแนน</span>') + '</div>' +
    '<div class="box-body">' + body + '</div>' +
  '</div>';
}

function metricsHTML(p) {
  const sale = p.sale || {}, admix = p.admix || {}, cpk = p.cpk || {}, nps = p.nps || {},
        emp = p.emp || {}, sfp = p.sfPlant || {}, sft = p.sfTruck || {}, drv = p.drv || {},
        env = p.env || {}, ded = p.ded || {};

  /* 1 ยอดขาย */
  const bSale = box('b-sale', 'ยอดขาย', '15 คะแนน', p.sc.sale, 15,
    '<div class="kv"><span>ยอดสะสม</span><b>' + num(sale.total) + ' ลบ.ม.</b></div>' +
    '<div class="rule">เกณฑ์ที่เข้าเงื่อนไข: ' + saleTierLabel(sale.total || 0) + '</div>');

  /* 2 การสั่งวัตถุดิบ */
  const bAdmix = box('b-admix', 'การสั่งวัตถุดิบ', '5 คะแนน', p.sc.admix, 5,
    '<div class="kv"><span>สัดส่วนน้ำยา</span><b>' + pct(admix.total) + '</b></div>' +
    '<div class="rule">ตั้งแต่ 90% ของยอดผลิต = 5 คะแนน · 80–89.9% = 4 คะแนน</div>');

  /* 3 คุณภาพ — แสดงเฉพาะคะแนน CPK พร้อมข้อความกติกา */
  const dzMan = [];
  if (cpk.dz) dzMan.push('Dangerous Zone ' + sc(cpk.dz));
  if (cpk.manual) dzMan.push('Manual ' + sc(cpk.manual));
  const bQual = box('b-qual', 'คุณภาพ', '20 คะแนน', cpk.total || 0, 20,
    '<div class="kv"><span>เดือนที่ได้คะแนน</span><b>' +
      ((cpk.score || []).filter(v => v > 0).length) + ' เดือน</b></div>' +
    '<div class="rule">ผล CPK 0.70–0.80 ได้ 2.5 คะแนน · ช่วงอื่นได้ 1.25 คะแนน (เม.ย. – พ.ย.)</div>' +
    (dzMan.length ? '<div class="rule neg">หักเพิ่ม: ' + dzMan.join(' · ') + '</div>' : ''));

  /* 4 NPS */
  const bNps = box('b-nps', 'การบริการ (NPS)', '18 คะแนน', p.sc.nps, 18,
    '<div class="kv"><span>เดือนที่ผ่านเกณฑ์</span><b>' + (nps.pass || 0) + ' เดือน</b></div>' +
    '<div class="rule">คะแนน NPS มากกว่า 75% ได้เดือนละ 2 คะแนน (เม.ย. – ธ.ค.)</div>');

  /* 5 พนักงาน */
  const bEmp = box('b-emp', 'พนักงาน', '12 คะแนน', p.sc.emp, 12,
    '<div class="kv"><span>จำนวนพนักงาน</span><b>' + num(emp.count || 0) + ' คน</b></div>' +
    '<div class="kv"><span>สอบผ่าน L1 / L2</span><b class="ok">' + num(emp.pass || 0) + ' คน</b></div>' +
    '<div class="rule">จำนวนพนักงาน ' + sc(emp.scoreCount || 0) + '/9 · การสอบ ' + sc(emp.scoreL1L2 || 0) + '/3</div>');

  /* 6 สิ่งแวดล้อม */
  const envOk = (env.score || 0) >= RULES.envFull;
  const bEnv = box('b-env', 'สิ่งแวดล้อม', '10 คะแนน', p.sc.env, 10,
    '<div class="kv"><span>ผลการตรวจ</span><b>' +
      '<span class="pill ' + (envOk ? 'pill-ok' : ((env.score || 0) > 0 ? 'pill-no' : 'pill-wait')) + '">' +
      (envOk ? 'ผ่าน' : ((env.score || 0) > 0 ? 'ไม่ผ่าน' : 'ยังไม่ตรวจ')) + '</span></b></div>' +
    '<div class="rule">ผลตรวจ FC28 จำนวน 10 ข้อ ผ่านข้อละ 1 คะแนน</div>');

  /* 7 หักคะแนน */
  const dCoop = ded.coop || 0, dComp = ded.comp || 0;
  const bDed = box('b-ded', 'หักคะแนน', 'คะแนนลบ', p.sc.ded, null,
    '<div class="kv"><span>ไม่ให้ความร่วมมือ</span><b class="' + (dCoop ? 'neg' : '') + '">' +
      (dCoop ? '-' + sc(Math.abs(dCoop)) : '0') + '</b></div>' +
    '<div class="kv"><span>ข้อร้องเรียน</span><b class="' + (dComp ? 'neg' : '') + '">' +
      (dComp ? '-' + sc(Math.abs(dComp)) : '0') + '</b></div>');

  /* 8 Safety — แนวนอน 3 เรื่องเรียงข้างกัน */
  const h1 = sft.h1 ? '<span class="pill pill-ok">ผ่าน</span>' : '<span class="pill pill-wait">–</span>';
  const h2 = sft.h2 ? '<span class="pill pill-ok">ผ่าน</span>' : '<span class="pill pill-wait">–</span>';
  const bSafety =
  '<div class="box b-safety wide">' +
    '<div class="box-top"><h3>Safety</h3><span class="pt">20 คะแนน</span></div>' +
    '<div class="box-score"><b class="' + (p.sc.safety ? '' : 'zero') + '">' + sc(p.sc.safety) + '</b><span>/ 20</span></div>' +
    '<div class="safety-row">' +
      '<div class="sf-col">' +
        '<div class="sf-head"><h4>โรงงาน (FC27)</h4><span class="sf-pt">' + sc(sfp.score || 0) + ' / 15</span></div>' +
        '<div class="kv"><span>เดือนที่ตรวจ</span><b>' +
          (sfp.month ? esc(monthName(sfp.month)) : '<span class="pill pill-no">ยังไม่ตรวจ</span>') + '</b></div>' +
        '<div class="rule">ตรวจภายใน ส.ค. = 15 · หลัง ส.ค. = 10 คะแนน</div>' +
      '</div>' +
      '<div class="sf-col">' +
        '<div class="sf-head"><h4>รถโม่ (F18-464)</h4><span class="sf-pt">' + sc(sft.score || 0) + ' / 2</span></div>' +
        '<div class="kv"><span>ครั้งที่ 1 (H1)</span><b>' + h1 + '</b></div>' +
        '<div class="kv"><span>ครั้งที่ 2 (H2)</span><b>' + h2 + '</b></div>' +
        '<div class="rule">' + (sft.h1 ? 'H1 ' + esc(sft.h1) + ' · ' : '') + 'ผ่านครั้งละ 1 คะแนน</div>' +
      '</div>' +
      '<div class="sf-col">' +
        '<div class="sf-head"><h4>ผลอบรม จบส.</h4><span class="sf-pt">' + sc(drv.score || 0) + ' / 3</span></div>' +
        '<div class="kv"><span>จำนวน จบส.</span><b>' + num(drv.total || 0) + ' คน</b></div>' +
        '<div class="kv"><span>อบรมแล้ว</span><b class="ok">' + num(drv.trained || 0) + ' คน</b></div>' +
        '<div class="kv"><span>ยังไม่อบรม</span><b class="' + (drv.untrained ? 'neg' : '') + '">' + num(drv.untrained || 0) + ' คน</b></div>' +
        '<div class="rule">' + (drv.month ? 'อบรมเดือน' + esc(monthName(drv.month)) : 'ยังไม่มีการอบรม') + '</div>' +
      '</div>' +
    '</div>' +
  '</div>';

  return '<div class="sec-title"><span class="tag">ส่วนที่ 2</span><h2>สรุปคะแนนแยกหัวข้อ</h2></div>' +
    '<div class="metrics">' + bSale + bAdmix + bQual + bNps + bEmp + bEnv + bDed + '</div>' +
    '<div class="metrics-wide">' + bSafety + '</div>';
}

/* ───────────────────────── charts + detail section ───────────────────────── */
function chartsShellHTML(p) {
  const cpk = p.cpk || {}, nps = p.nps || {}, emp = p.emp || {}, drv = p.drv || {},
        sfp = p.sfPlant || {}, sft = p.sfTruck || {}, env = p.env || {};

  /* CPK monthly score row (Apr → Nov) */
  let qRow = '<table class="mini-table"><thead><tr><th class="lbl">เดือน</th>';
  for (let i = 3; i < 11; i++) qRow += '<th>' + MONTHS[i] + '</th>';
  qRow += '<th>รวม</th></tr></thead><tbody><tr><td class="lbl">ผล CPK</td>';
  for (let i = 3; i < 11; i++) {
    const v = (cpk.m || [])[i] || 0;
    const j = cpkJudge(v);
    qRow += '<td class="' + (!v ? 'dim' : (j === false ? 'bad' : (j === true ? 'good' : ''))) + '">' +
            (v ? v.toFixed(2) : '–') + '</td>';
  }
  qRow += '<td class="dim">–</td></tr><tr><td class="lbl">คะแนน</td>';
  for (let i = 3; i < 11; i++) {
    const v = (cpk.score || [])[i] || 0;
    const raw = (cpk.m || [])[i] || 0;
    const cls = v >= RULES.cpkMonthMax ? 'good' : (raw && !v ? 'bad' : (v ? '' : 'dim'));
    qRow += '<td class="' + cls + '">' + (raw ? sc(v) : '–') + '</td>';
  }
  qRow += '<td><b>' + sc(cpk.total || 0) + '</b></td></tr></tbody></table>';

  const dzMonths = (cpk.dzM || []).map((v, i) => v ? MONTHS_FULL[i] : null).filter(Boolean);
  const mnMonths = (cpk.manM || []).map((v, i) => v ? MONTHS_FULL[i] : null).filter(Boolean);
  const dzNote = '<div style="margin-top:10px;font-size:12px">' +
    '<b>Dangerous Zone:</b> ' + (dzMonths.length
      ? '<span style="color:var(--red)">พบเดือน ' + dzMonths.join(', ') + '</span>'
      : '<span style="color:var(--green-d)">ไม่พบ</span>') +
    ' &nbsp;·&nbsp; <b>Manual:</b> ' + (mnMonths.length
      ? '<span style="color:var(--red)">พบเดือน ' + mnMonths.join(', ') + '</span>'
      : '<span style="color:var(--green-d)">ไม่พบ</span>') + '</div>';

  /* NPS monthly score row (Apr → Dec) */
  let nRow = '<table class="mini-table"><thead><tr><th class="lbl">เดือน</th>';
  for (let i = 3; i < 12; i++) nRow += '<th>' + MONTHS[i] + '</th>';
  nRow += '<th>รวม</th></tr></thead><tbody><tr><td class="lbl">ผล NPS</td>';
  for (let i = 3; i < 12; i++) {
    const v = (nps.m || [])[i] || 0;
    nRow += '<td class="' + (v === 0 ? 'dim' : (npsPass(v) ? 'good' : 'bad')) + '">' + (v ? num(v, 1) : '–') + '</td>';
  }
  nRow += '<td class="dim">–</td></tr><tr><td class="lbl">คะแนน</td>';
  for (let i = 3; i < 12; i++) {
    const v = (nps.score || [])[i] || 0;
    const raw = (nps.m || [])[i] || 0;
    nRow += '<td class="' + (v ? 'good' : (raw ? 'bad' : 'dim')) + '">' + (raw ? sc(v) : '–') + '</td>';
  }
  nRow += '<td><b>' + sc(nps.total || 0) + '</b></td></tr></tbody></table>';

  /* employees */
  const fails = (emp.list || []).filter(e => e.r === 'ไม่ผ่าน');
  const empBody =
    '<div class="status-grid">' +
      '<div class="status-item"><h4>จำนวนพนักงาน</h4><div class="big" style="font-size:24px">' + num(emp.count || 0) + '</div></div>' +
      '<div class="status-item"><h4>สอบผ่าน</h4><div class="big" style="font-size:24px;color:var(--green-d)">' + num(emp.pass || 0) + '</div></div>' +
      '<div class="status-item"><h4>ยังไม่ผ่าน</h4><div class="big" style="font-size:24px;color:' + (fails.length ? 'var(--red)' : 'var(--muted)') + '">' + num(Math.max(0, (emp.count || 0) - (emp.pass || 0))) + '</div></div>' +
    '</div>' +
    (fails.length ? '<div style="margin-top:12px"><h4 style="font-size:12px;color:var(--muted);margin-bottom:6px">รายชื่อพนักงานที่ยังไม่ผ่าน</h4>' +
      '<div class="name-list">' + fails.map(e => '<span>' + esc(e.n) + ' · ' + esc(e.p) + '</span>').join('') + '</div></div>'
      : '<div style="margin-top:12px;font-size:12.5px;color:var(--green-d)">พนักงานผ่านการทดสอบครบทุกคน</div>');

  /* safety detail */
  const untrained = (drv.names || []);
  const safeBody =
    '<div class="status-grid">' +
      '<div class="status-item"><h4>โรงงาน (FC27)</h4>' +
        (inspected(p)
          ? '<span class="pill pill-ok">ผ่าน</span><div style="font-size:11.5px;color:var(--muted);margin-top:6px">ตรวจเดือน' + esc(monthName(sfp.month)) + ' · ' + sc(sfp.score || 0) + ' คะแนน</div>'
          : '<span class="pill pill-no">ยังไม่ตรวจ</span>') + '</div>' +
      '<div class="status-item"><h4>รถโม่ (F18-464)</h4>' +
        (truckDone(p)
          ? '<span class="pill pill-ok">ผ่าน</span><div style="font-size:11.5px;color:var(--muted);margin-top:6px">H1 ' + (sft.h1 ? 'ผ่าน' : '–') + ' · H2 ' + (sft.h2 ? 'ผ่าน' : '–') + ' · ' + sc(sft.score || 0) + ' คะแนน</div>'
          : '<span class="pill pill-no">ยังไม่ตรวจ</span>') + '</div>' +
      '<div class="status-item"><h4>ผลอบรม จบส.</h4>' +
        (drvComplete(p)
          ? '<span class="pill pill-ok">ผ่าน</span><div style="font-size:11.5px;color:var(--muted);margin-top:6px">อบรมครบ ' + num(drv.trained || 0) + ' คน</div>'
          : '<span class="pill pill-no">ยังอบรมไม่ครบ</span><div style="font-size:11.5px;color:var(--muted);margin-top:6px">ยังไม่อบรม ' + num(drv.untrained || 0) + ' คน</div>') + '</div>' +
      '<div class="status-item"><h4>สิ่งแวดล้อม (FC28)</h4>' +
        (envDone(p)
          ? ((env.score || 0) >= RULES.envFull
              ? '<span class="pill pill-ok">ผ่าน</span>'
              : '<span class="pill pill-no">ไม่ผ่าน</span>') +
            '<div style="font-size:11.5px;color:var(--muted);margin-top:6px">' + sc(env.score || 0) + ' / 10 คะแนน</div>'
          : '<span class="pill pill-no">ยังไม่ตรวจ</span>') + '</div>' +
    '</div>' +
    (untrained.length ? '<div style="margin-top:12px"><h4 style="font-size:12px;color:var(--muted);margin-bottom:6px">รายชื่อ จบส. ที่ยังไม่อบรม</h4>' +
      '<div class="name-list">' + untrained.map(x => '<span>' + esc(x.n) + '</span>').join('') + '</div></div>' : '');

  return '<div class="sec-title"><span class="tag">ส่วนที่ 3</span><h2>รายละเอียดรายเดือน</h2></div>' +
  '<div class="charts">' +
    '<div class="chart-card"><div class="chart-head"><h3>ยอดขายรายเดือน</h3>' +
      '<span class="note">ลบ.ม. · เทียบแผนและปีก่อน</span></div>' +
      '<div class="chart-wrap"><canvas id="cSale"></canvas></div></div>' +

    '<div class="chart-card"><div class="chart-head"><h3>การสั่งวัตถุดิบรายเดือน</h3>' +
      '<span class="note">% เทียบยอดผลิต · เส้นเกณฑ์ 90%</span></div>' +
      '<div class="chart-wrap"><canvas id="cAdmix"></canvas></div></div>' +

    '<div class="chart-card wide"><div class="chart-head"><h3>คุณภาพ (CPK) รายเดือน</h3>' +
      '<span class="note">แท่งเขียว = 2.5 คะแนน · เหลือง = 1.25 คะแนน · แดง = ไม่ได้คะแนน · เทา = นอกช่วงคิดคะแนน</span></div>' +
      '<div class="chart-wrap"><canvas id="cCpk"></canvas></div>' + qRow + dzNote + '</div>' +

    '<div class="chart-card wide"><div class="chart-head"><h3>การบริการ (NPS) รายเดือน</h3>' +
      '<span class="note">ผ่านเกณฑ์เมื่อ NPS มากกว่า 75% · เทา = นอกช่วงคิดคะแนน</span></div>' +
      '<div class="chart-wrap"><canvas id="cNps"></canvas></div>' + nRow + '</div>' +

    '<div class="chart-card"><div class="chart-head"><h3>พนักงาน</h3>' +
      '<span class="note">ผลการทดสอบ L1 / L2</span></div>' + empBody + '</div>' +

    '<div class="chart-card"><div class="chart-head"><h3>Safety และสิ่งแวดล้อม</h3>' +
      '<span class="note">สถานะการตรวจ</span></div>' + safeBody + '</div>' +
  '</div>';
}

/* คืนค่าการตั้งค่ากราฟทั้ง 4 ตัว ใช้ร่วมกันระหว่างหน้าจอกับไฟล์ PDF
   opt.small = true สำหรับ PDF (ตัวอักษรเล็กลง ปิดอนิเมชัน) */
function chartConfigs(p, opt) {
  opt = opt || {};
  const SM = !!opt.small;
  const FS = SM ? 8 : 9;
  const DL = (typeof ChartDataLabels !== 'undefined') ? [ChartDataLabels] : [];

  const gridOpt = { grid: { color: '#EDF1F0' }, border: { display: false } };

  /* ความสูงของแท่งเป็นพิกเซล คำนวณจากแกน y เพื่อให้ได้ค่าจริงตั้งแต่เฟรมแรก */
  const barPx = ctx => {
    const y = ctx.chart.scales.y;
    const v = ctx.dataset.data[ctx.dataIndex];
    if (!y || v == null) return 0;
    return Math.abs(y.getPixelForValue(0) - y.getPixelForValue(v));
  };
  /* เลือกสีตัวอักษรให้ตัดกับสีแท่ง */
  const barColor = ctx => {
    const bg = ctx.dataset.backgroundColor;
    return Array.isArray(bg) ? bg[ctx.dataIndex] : bg;
  };
  const isLight = hex => {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(String(hex || ''));
    if (!m) return false;
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 165;
  };
  const MIN_BAR = 34;   /* แท่งเตี้ยกว่านี้ ตัวเลขจะไม่พอดี จึงย้ายไปไว้เหนือแท่ง */

  /* ตัวเลขวางกลางแท่ง ขนานกราฟ หัวอักษรชี้ไปทางซ้าย */
  const vLabel = fmt => ({
    rotation: -90, clamp: true, font: { size: FS, weight: '600' },
    anchor: ctx => (barPx(ctx) < MIN_BAR ? 'end' : 'center'),
    align:  ctx => (barPx(ctx) < MIN_BAR ? 'top' : 'center'),
    offset: ctx => (barPx(ctx) < MIN_BAR ? 3 : 0),
    color:  ctx => (barPx(ctx) < MIN_BAR ? '#3C5058'
                                         : (isLight(barColor(ctx)) ? '#17272F' : '#FFFFFF')),
    display: ctx => { const v = ctx.dataset.data[ctx.dataIndex]; return v != null && v !== 0; },
    formatter: fmt,
  });
  const baseOpts = {
    responsive: true, maintainAspectRatio: false,
    animation: SM ? false : undefined,
    interaction: { mode: 'index', intersect: false },
    layout: { padding: { top: SM ? 14 : 20 } },
    plugins: {
      datalabels: { display: false },
      legend: { position: 'bottom', labels: {
        boxWidth: SM ? 8 : 10, boxHeight: SM ? 8 : 10,
        padding: SM ? 8 : 14, usePointStyle: true, font: { size: SM ? 8.5 : 11 } } },
    },
    scales: {},
  };

  const sale = p.sale || {};
  const cfg_sale = {
    plugins: DL,
    data: {
      labels: MONTHS,
      datasets: [
        { type: 'bar', label: 'ยอดขาย 2568', data: sale.m25 || [], backgroundColor: '#9FB4BC',
          borderRadius: 3, order: 3, datalabels: vLabel(v => num(v)) },
        { type: 'bar', label: 'ยอดขาย 2569', data: sale.m26 || [], backgroundColor: '#00834B',
          borderRadius: 3, order: 3, datalabels: vLabel(v => num(v)) },
        { type: 'line', label: 'แผน 2569', data: sale.plan || [], borderColor: '#E4A017', borderWidth: 2,
          borderDash: [5, 4], pointRadius: 0, tension: .3, order: 1, datalabels: { display: false } },
      ],
    },
    options: Object.assign({}, baseOpts, {
      scales: { x: gridOpt, y: Object.assign({ beginAtZero: true, ticks: { callback: v => num(v) } }, gridOpt) },
    }),
  };

  const admix = p.admix || {};
  const cfg_admix = {
    plugins: DL,
    data: {
      labels: MONTHS,
      datasets: [
        { type: 'bar', label: '% การสั่งน้ำยา', data: (admix.m || []).map(v => v * 100), borderRadius: 3,
          backgroundColor: (admix.m || []).map(v => (!v ? '#E4E9E8' : (v >= .9 ? '#0E6BA8' : (v >= .8 ? '#E2820B' : '#C8102E')))),
          datalabels: vLabel(v => num(v, 1) + '%') },
        { type: 'line', label: 'เกณฑ์ 90%', data: new Array(12).fill(90), borderColor: '#C8102E',
          borderWidth: 1.6, borderDash: [5, 4], pointRadius: 0, datalabels: { display: false } },
      ],
    },
    options: Object.assign({}, baseOpts, {
      scales: { x: gridOpt, y: Object.assign({ beginAtZero: true, ticks: { callback: v => v + '%' } }, gridOpt) },
    }),
  };

  /* สีแท่ง CPK อิงคะแนนที่ได้: 2.5 เขียว · 1.25 เหลือง · ต่ำกว่านั้นแดง */
  const cpk = p.cpk || {};
  const cpkColor = i => {
    const raw = (cpk.m || [])[i] || 0;
    if (!raw) return '#E4E9E8';
    if (i < 3) return '#C3CFCC';           /* ม.ค.–มี.ค. ยังไม่เริ่มคิดคะแนน */
    const s = (cpk.score || [])[i] || 0;
    if (s >= RULES.cpkMonthMax) return '#00834B';   /* 2.5 คะแนน */
    if (s > 0) return '#E8B21E';                    /* 1.25 คะแนน */
    return '#C8102E';                               /* ไม่ได้คะแนน */
  };
  const cfg_cpk = {
    plugins: DL,
    data: {
      labels: MONTHS,
      datasets: [
        { type: 'bar', label: 'ผล CPK', data: (cpk.m || []).map(v => v || null), borderRadius: 3,
          backgroundColor: MONTHS.map((_, i) => cpkColor(i)), datalabels: vLabel(v => num(v, 2)) },
        { type: 'line', label: 'เกณฑ์ผ่าน 0.55', data: new Array(12).fill(RULES.cpkLow), borderColor: '#C8102E',
          borderWidth: 1.4, borderDash: [4, 4], pointRadius: 0, datalabels: { display: false } },
        { type: 'line', label: 'ช่วงคะแนนเต็ม 0.70', data: new Array(12).fill(RULES.cpkBestLow),
          borderColor: '#E2820B', borderWidth: 1.2, borderDash: [3, 3], pointRadius: 0, datalabels: { display: false } },
        { type: 'line', label: 'ช่วงคะแนนเต็ม 0.80', data: new Array(12).fill(RULES.cpkBestHigh),
          borderColor: '#E2820B', borderWidth: 1.2, borderDash: [3, 3], pointRadius: 0, datalabels: { display: false } },
      ],
    },
    options: Object.assign({}, baseOpts, {
      scales: { x: gridOpt, y: Object.assign({ beginAtZero: true, suggestedMax: 1.2 }, gridOpt) },
    }),
  };

  const nps = p.nps || {};
  const npsColor = i => {
    const v = (nps.m || [])[i] || 0;
    if (!v) return '#E4E9E8';
    if (i < 3) return '#C3CFCC';           /* ม.ค.–มี.ค. ยังไม่เริ่มคิดคะแนน */
    return npsPass(v) ? '#0C8B8B' : '#C8102E';
  };
  const cfg_nps = {
    plugins: DL,
    data: {
      labels: MONTHS,
      datasets: [
        { type: 'bar', label: 'ผล NPS (%)', data: (nps.m || []).map(v => v || null), borderRadius: 3,
          backgroundColor: MONTHS.map((_, i) => npsColor(i)),
          datalabels: vLabel(v => num(v, 1)) },
        { type: 'line', label: 'เกณฑ์ 75%', data: new Array(12).fill(RULES.npsPass), borderColor: '#C8102E',
          borderWidth: 1.6, borderDash: [5, 4], pointRadius: 0, datalabels: { display: false } },
      ],
    },
    options: Object.assign({}, baseOpts, {
      scales: { x: gridOpt, y: Object.assign({ beginAtZero: true, max: 108, ticks: { callback: v => v + '%' } }, gridOpt) },
    }),
  };

  return { sale: cfg_sale, admix: cfg_admix, cpk: cfg_cpk, nps: cfg_nps };
}

function drawCharts(p) {
  if (typeof Chart === 'undefined') return;
  Chart.defaults.font.family = "'IBM Plex Sans Thai', sans-serif";
  Chart.defaults.font.size = 11;
  Chart.defaults.color = '#6C7F87';
  const cfg = chartConfigs(p);
  charts.sale  = new Chart($('#cSale'),  cfg.sale);
  charts.admix = new Chart($('#cAdmix'), cfg.admix);
  charts.cpk   = new Chart($('#cCpk'),   cfg.cpk);
  charts.nps   = new Chart($('#cNps'),   cfg.nps);
}


/* ═════════════════════════════ PDF EXPORT ═════════════════════════════════
   สร้างเอกสารเฉพาะสำหรับ PDF ให้พอดี 1 หน้า A4 แนวตั้ง
   กว้าง 1000px สูงไม่เกิน 1414px (สัดส่วนเท่า A4) แล้วย่อลงพอดีหน้า          */

function pdfDocHTML(p) {
  const sale = p.sale || {}, admix = p.admix || {}, cpk = p.cpk || {}, nps = p.nps || {},
        emp = p.emp || {}, sfp = p.sfPlant || {}, sft = p.sfTruck || {}, drv = p.drv || {},
        env = p.env || {}, ded = p.ded || {}, s = p.sc;
  const today = new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
  const starTxt = ['', '', '2 ดาว', '3 ดาว', '4 ดาว', '5 ดาว'][s.star] || '';
  const bonus = (RULES.star.find(t => s.total >= t[0]) || [0, 2, 0])[2];

  const cell = (title, pt, val, max, detail) =>
    '<div class="pc"><div class="pc-t">' + title + '<span>' + pt + '</span></div>' +
    '<div class="pc-s"><b>' + sc(val) + '</b>' + (max ? '<i>/ ' + max + '</i>' : '') + '</div>' +
    '<div class="pc-d">' + detail + '</div></div>';

  /* ตารางคะแนนรายเดือนแบบย่อ */
  const monthTable = (label, from, to, rawGet, scoreGet, rawFmt, total, totalMax) => {
    let h = '<table class="pt-tbl"><thead><tr><th class="l">' + label + '</th>';
    for (let i = from; i <= to; i++) h += '<th>' + MONTHS[i] + '</th>';
    h += '<th>รวม</th></tr></thead><tbody><tr><td class="l">ผล</td>';
    for (let i = from; i <= to; i++) {
      const v = rawGet(i);
      h += '<td>' + (v ? rawFmt(v) : '–') + '</td>';
    }
    h += '<td>–</td></tr><tr><td class="l">คะแนน</td>';
    for (let i = from; i <= to; i++) {
      const v = scoreGet(i), raw = rawGet(i);
      h += '<td class="' + (v ? 'g' : (raw ? 'r' : '')) + '">' + (raw ? sc(v) : '–') + '</td>';
    }
    return h + '<td class="tt">' + sc(total) + ' / ' + totalMax + '</td></tr></tbody></table>';
  };

  const st = (label, ok, note) =>
    '<div class="ps"><span class="ps-l">' + label + '</span>' +
    '<span class="pill ' + (ok ? 'pill-ok' : 'pill-no') + '">' + (ok ? 'ผ่าน' : 'ไม่ผ่าน') + '</span>' +
    '<span class="ps-n">' + note + '</span></div>';

  const untrained = (drv.names || []).map(x => x.n);
  const failEmp = ((emp.list) || []).filter(e => e.r === 'ไม่ผ่าน').map(e => e.n);

  return '' +
  '<div class="pdf-doc">' +
    '<div class="pd-head">' +
      '<div class="pd-to">เรียน ผู้บริหาร โรงงาน ' + esc(p.name) + '</div>' +
      '<div class="pd-sub">' + esc(p.company) + ' · ' + esc(p.region) + ' · รหัสโรงงาน ' + esc(p.code) +
        ' · ผู้จัดการผลิต ' + esc(p.team) + ' · ทีม FM ' + esc(p.teamFM) +
        ' · ออกรายงานวันที่ ' + today + '</div>' +
    '</div>' +

    '<div class="pd-band">' +
      '<div><div class="pd-eyebrow">สรุปผลคะแนนประจำปี</div>' +
        '<div class="pd-plant">' + esc(p.name) + '</div></div>' +
      '<div class="pd-score">' +
        '<div class="pd-num"><b>' + sc(s.total) + '</b><span>/ 100 คะแนน</span></div>' +
        starsHTML(s.star) +
        '<div class="pd-star">' + starTxt + ' · โบนัส ' + bonus + ' บาท/คิว</div>' +
      '</div>' +
    '</div>' +

    '<div class="pd-grid">' +
      cell('ยอดขาย', '15', s.sale, 15, num(sale.total) + ' ลบ.ม.') +
      cell('การสั่งวัตถุดิบ', '5', s.admix, 5, pct(admix.total) + ' ของยอดผลิต') +
      cell('คุณภาพ', '20', cpk.total || 0, 20, ((cpk.score || []).filter(v => v > 0).length) + ' เดือนที่ได้คะแนน') +
      cell('การบริการ (NPS)', '18', s.nps, 18, (nps.pass || 0) + ' เดือนผ่านเกณฑ์') +
      cell('พนักงาน', '12', s.emp, 12, num(emp.count || 0) + ' คน · ผ่าน ' + num(emp.pass || 0) + ' คน') +
      cell('สิ่งแวดล้อม', '10', s.env, 10, (env.score || 0) >= RULES.envFull ? 'ผ่านครบ 10 ข้อ'
        : ((env.score || 0) > 0 ? 'ไม่ผ่าน' : 'ยังไม่ตรวจ')) +
      cell('Safety', '20', s.safety, 20, 'โรงงาน ' + sc(sfp.score || 0) + ' · รถโม่ ' + sc(sft.score || 0) +
        ' · จบส. ' + sc(drv.score || 0)) +
      cell('หักคะแนน', 'ลบ', s.ded, null, (ded.coop || ded.comp) ? 'มีรายการหักคะแนน' : 'ไม่มีรายการหัก') +
    '</div>' +

    '<div class="pd-charts">' +
      '<div class="pd-ch"><h4>ยอดขายรายเดือน <i>ลบ.ม.</i></h4><div class="pd-cw"><canvas id="pcSale"></canvas></div></div>' +
      '<div class="pd-ch"><h4>การสั่งวัตถุดิบรายเดือน <i>% เทียบยอดผลิต</i></h4><div class="pd-cw"><canvas id="pcAdmix"></canvas></div></div>' +
      '<div class="pd-ch"><h4>คุณภาพ (CPK) รายเดือน <i>เขียว 2.5 · เหลือง 1.25 · เทา นอกช่วง</i></h4><div class="pd-cw"><canvas id="pcCpk"></canvas></div></div>' +
      '<div class="pd-ch"><h4>การบริการ (NPS) รายเดือน <i>เกณฑ์ 75%</i></h4><div class="pd-cw"><canvas id="pcNps"></canvas></div></div>' +
    '</div>' +

    '<div class="pd-tables">' +
      monthTable('CPK', 3, 10, i => (cpk.m || [])[i] || 0, i => (cpk.score || [])[i] || 0,
        v => v.toFixed(2), cpk.total || 0, 20) +
      monthTable('NPS', 3, 11, i => (nps.m || [])[i] || 0, i => (nps.score || [])[i] || 0,
        v => num(v, 0), nps.total || 0, 18) +
    '</div>' +

    '<div class="pd-status">' +
      st('Safety โรงงาน', inspected(p), inspected(p) ? 'ตรวจเดือน' + monthName(sfp.month) : 'ยังไม่ตรวจ') +
      st('Safety รถโม่', truckDone(p), 'H1 ' + (sft.h1 ? 'ผ่าน' : '–') + ' · H2 ' + (sft.h2 ? 'ผ่าน' : '–')) +
      st('อบรม จบส.', drvComplete(p), 'อบรม ' + num(drv.trained || 0) + ' / ' + num(drv.total || 0) + ' คน') +
      st('สิ่งแวดล้อม', (env.score || 0) >= RULES.envFull, sc(env.score || 0) + ' / 10 คะแนน') +
      st('พนักงาน', empPass(p), 'สอบผ่าน ' + num(emp.pass || 0) + ' / ' + num(emp.count || 0) + ' คน') +
    '</div>' +

    (untrained.length || failEmp.length ?
      '<div class="pd-names">' +
        (untrained.length ? '<div><b>จบส. ที่ยังไม่อบรม (' + untrained.length + ' คน):</b> ' +
          esc(untrained.slice(0, 28).join(', ')) + (untrained.length > 28 ? ' และอีก ' + (untrained.length - 28) + ' คน' : '') + '</div>' : '') +
        (failEmp.length ? '<div><b>พนักงานที่ยังสอบไม่ผ่าน (' + failEmp.length + ' คน):</b> ' +
          esc(failEmp.slice(0, 18).join(', ')) + (failEmp.length > 18 ? ' และอีก ' + (failEmp.length - 18) + ' คน' : '') + '</div>' : '') +
      '</div>' : '') +

    '<div class="pd-foot">คะแนนเต็ม 100 · เกณฑ์ดาว 80–100 = 5 ดาว · 70–79 = 4 ดาว · 60–69 = 3 ดาว · ต่ำกว่า 60 = 2 ดาว</div>' +
  '</div>';
}

$('#btnPdf').addEventListener('click', async () => {
  if (!current) { toast('เลือกโรงงานก่อนดาวน์โหลด'); return; }
  const btn = $('#btnPdf');
  const label = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = 'กำลังสร้าง PDF…';

  const stage = $('#pdfStage');
  stage.innerHTML = pdfDocHTML(current);
  const tmp = [];

  try {
    if (typeof Chart !== 'undefined') {
      const cfg = chartConfigs(current, { small: true });
      tmp.push(new Chart($('#pcSale'),  cfg.sale));
      tmp.push(new Chart($('#pcAdmix'), cfg.admix));
      tmp.push(new Chart($('#pcCpk'),   cfg.cpk));
      tmp.push(new Chart($('#pcNps'),   cfg.nps));
    }
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    const node = $('.pdf-doc', stage);
    const canvas = await html2canvas(node, {
      scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false,
      windowWidth: 1060, width: node.offsetWidth, height: node.offsetHeight,
    });

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const m = 6;
    /* ย่อให้พอดีหน้าเดียว ทั้งกว้างและสูง */
    let w = pw - m * 2;
    let h = w * (canvas.height / canvas.width);
    if (h > ph - m * 2) { h = ph - m * 2; w = h * (canvas.width / canvas.height); }
    pdf.addImage(canvas, 'JPEG', (pw - w) / 2, m, w, h, undefined, 'FAST');
    pdf.save('รายงานคะแนน_' + current.name.replace(/[\\/:*?"<>|]/g, '') + '_' + current.code + '.pdf');
    toast('ดาวน์โหลด PDF เรียบร้อย (1 หน้า)');
  } catch (err) {
    console.error(err);
    toast('สร้าง PDF ไม่สำเร็จ — ลองใหม่อีกครั้ง');
  } finally {
    tmp.forEach(c => c.destroy());
    stage.innerHTML = '';
    btn.disabled = false; btn.innerHTML = label;
  }
});

/* ═════════════════════════════ TAB 2 : ภาพรวม ═════════════════════════════ */
const oRegion = $('#oRegion'), oTeam = $('#oTeam'), oFM = $('#oFM'),
      oCompany = $('#oCompany'), oSearch = $('#oSearch');
const O_CHAIN = [[oRegion, 'region', 'ทุกกิจการ'], [oTeam, 'team', 'ทุกผู้จัดการผลิต'],
                 [oFM, 'teamFM', 'ทุกทีม FM'], [oCompany, 'company', 'ทุกบริษัท']];

function overviewPool() {
  let list = PLANTS.slice();
  O_CHAIN.forEach(row => {
    if (row[0].value !== ALL) list = list.filter(p => p[row[1]] === row[0].value);
  });
  const q = oSearch.value.trim().toLowerCase();
  if (q) list = list.filter(p => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q));
  return list;
}

function syncOverviewFilters() {
  let base = PLANTS;
  O_CHAIN.forEach(row => {
    const sel = row[0], key = row[1];
    fillSelect(sel, uniqSorted(base.map(p => p[key])), row[2], true);
    if (sel.value !== ALL && !base.some(p => p[key] === sel.value)) sel.value = ALL;
    if (sel.value !== ALL) base = base.filter(p => p[key] === sel.value);
  });
  renderOverview();
}
O_CHAIN.forEach((row, i) => {
  row[0].addEventListener('change', () => {
    for (let j = i + 1; j < O_CHAIN.length; j++) O_CHAIN[j][0].value = ALL;
    syncOverviewFilters();
  });
});
let oTimer;
oSearch.addEventListener('input', () => { clearTimeout(oTimer); oTimer = setTimeout(renderOverview, 200); });

/* ── generic paged table ─────────────────────────────────────────────────── */
function pagedTable(host, cols, rows, opts) {
  opts = opts || {};
  const size = opts.pageSize || 10;
  let page = 0;
  const wrap = el('div');
  host.appendChild(wrap);

  function draw() {
    const pages = Math.max(1, Math.ceil(rows.length / size));
    if (page >= pages) page = pages - 1;
    const slice = rows.slice(page * size, page * size + size);

    if (!rows.length) {
      wrap.innerHTML = '<div class="empty"><b>' + (opts.emptyTitle || 'ไม่มีข้อมูล') + '</b>' +
        (opts.emptyText || 'ลองปรับตัวกรองด้านบน') + '</div>';
      return;
    }

    let h = '<div class="tbl-wrap"><table class="dt"><thead><tr>';
    if (opts.rank !== false) h += '<th class="l" style="width:38px">#</th>';
    cols.forEach(c => { h += '<th class="' + (c.l ? 'l' : '') + '">' + c.h + '</th>'; });
    h += '</tr></thead><tbody>';
    slice.forEach((r, i) => {
      h += '<tr>';
      if (opts.rank !== false) h += '<td class="l rank">' + (page * size + i + 1) + '</td>';
      cols.forEach(c => {
        const out = c.f(r);
        const cell = (out && typeof out === 'object') ? out : { t: out };
        h += '<td class="' + (c.l ? 'l ' : '') + (cell.cls || '') + '">' + (cell.t == null ? '–' : cell.t) + '</td>';
      });
      h += '</tr>';
    });
    h += '</tbody></table></div>';

    h += '<div class="pager"><span class="info">แสดง <b>' + (page * size + 1) + '–' +
      Math.min(rows.length, page * size + size) + '</b> จาก <b>' + rows.length + '</b> โรงงาน</span>' +
      '<span class="spacer"></span>' +
      '<button class="pg-btn" data-go="prev"' + (page === 0 ? ' disabled' : '') + ' aria-label="ก่อนหน้า">' +
        '<svg viewBox="0 0 24 24"><path d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z"/></svg></button>' +
      '<span class="info">หน้า <b>' + (page + 1) + '</b> / <b>' + pages + '</b></span>' +
      '<button class="pg-btn" data-go="next"' + (page >= pages - 1 ? ' disabled' : '') + ' aria-label="ถัดไป">' +
        '<svg viewBox="0 0 24 24"><path d="M8.6 16.6 10 18l6-6-6-6-1.4 1.4 4.6 4.6z"/></svg></button></div>';

    wrap.innerHTML = h;
    wrap.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
      page += (b.dataset.go === 'next' ? 1 : -1);
      draw();
      wrap.closest('.osec').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }));
  }
  draw();
}

/* ── section shell with optional sub-tabs ────────────────────────────────── */
function section(title, points, hint, tabs) {
  const s = el('section', 'osec');
  s.innerHTML = '<div class="osec-head"><h2>' + title + '</h2>' +
    (points ? '<span class="pt">' + points + '</span>' : '') +
    (hint ? '<span class="hint">' + hint + '</span>' : '') + '</div>';
  const body = el('div');
  if (tabs && tabs.length > 1) {
    const bar = el('div', 'subtabs');
    tabs.forEach((t, i) => {
      const b = el('button', 'subtab' + (i === 0 ? ' active' : ''),
        t.label + (t.count != null ? '<span class="cnt">' + t.count + '</span>' : ''));
      b.addEventListener('click', () => {
        $$('.subtab', bar).forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        body.innerHTML = ''; t.render(body);
      });
      bar.appendChild(b);
    });
    s.appendChild(bar);
  }
  s.appendChild(body);
  if (tabs && tabs.length) tabs[0].render(body);
  return s;
}

const plantCol = { h: 'โรงงาน', l: true, f: p => '<span class="plant">' + esc(p.name) + '</span>' +
  '<span class="sub">' + esc(p.code) + ' · ' + esc(p.company) + '</span>' };

function monthCols(from, to, get, judge, fmt) {
  const cols = [];
  for (let i = from; i <= to; i++) {
    (function (m) {
      cols.push({ h: MONTHS[m], f: p => {
        const v = get(p, m);
        if (!v) return { t: '–', cls: 'dim' };
        const ok = judge(v);
        return { t: fmt(v), cls: ok === false ? 'bad' : (ok === true ? 'good' : '') };
      } });
    })(i);
  }
  return cols;
}

/* score columns: เต็ม = เขียว · วัดผลแล้วแต่ไม่ได้คะแนน = แดง · ยังไม่วัดผล = จาง */
function scoreMonthCols(from, to, getScore, getRaw, full) {
  const cols = [];
  for (let i = from; i <= to; i++) {
    (function (m) {
      cols.push({ h: MONTHS[m], f: p => {
        const v = getScore(p, m) || 0, raw = getRaw(p, m) || 0;
        if (!raw && !v) return { t: '–', cls: 'dim' };
        return { t: sc(v), cls: v >= full ? 'good' : (v ? '' : 'bad') };
      } });
    })(i);
  }
  return cols;
}

function renderOverview() {
  const pool = overviewPool();
  $('#oCount').innerHTML = 'พบ <b>' + pool.length + '</b> โรงงาน';
  const host = $('#overviewBody');
  host.innerHTML = '';

  /* ── 1. ยอดขาย ─────────────────────────────────────────────────────────── */
  {
    const rows = pool.slice().sort((a, b) => (b.sale ? b.sale.total : 0) - (a.sale ? a.sale.total : 0));
    const cols = [plantCol].concat(
      monthCols(0, 11, (p, m) => (p.sale && p.sale.m26 ? p.sale.m26[m] : 0), () => null, v => num(v)),
      [{ h: 'รวม', f: p => ({ t: num(p.sale ? p.sale.total : 0), cls: 'tot' }) },
       { h: 'คะแนน', f: p => ({ t: '<b>' + sc(p.sc.sale) + '</b> / 15', cls: 'tot' }) }]);
    host.appendChild(section('ยอดขาย', '15 คะแนน',
      'เกณฑ์: >40,000 = 15 · >30,000 = 13 · >20,000 = 11 · >10,000 = 9 · <10,000 = 7 คะแนน',
      [{ label: 'ยอดขายรายเดือน', render: b => pagedTable(b, cols, rows) }]));
  }

  /* ── 2. ยอดสั่งน้ำยา ────────────────────────────────────────────────────── */
  {
    const rows = pool.slice().sort((a, b) => (b.admix ? b.admix.total : 0) - (a.admix ? a.admix.total : 0));
    const cols = [plantCol].concat(
      monthCols(0, 11, (p, m) => (p.admix && p.admix.m ? p.admix.m[m] : 0),
        v => v >= RULES.admixFull, v => num(v * 100, 1) + '%'),
      [{ h: 'รวม', f: p => ({ t: pct(p.admix ? p.admix.total : 0), cls: 'tot' }) },
       { h: 'คะแนน', f: p => ({ t: '<b>' + sc(p.sc.admix) + '</b> / 5', cls: 'tot' }) }]);
    host.appendChild(section('ยอดสั่งน้ำยา (Admix)', '5 คะแนน',
      'ไฮไลท์แดงคือเดือนที่ต่ำกว่าเกณฑ์ 90% ของยอดผลิต',
      [{ label: '% การสั่งซื้อรายเดือน', render: b => pagedTable(b, cols, rows) }]));
  }

  /* ── 3. คุณภาพ ─────────────────────────────────────────────────────────── */
  {
    const rows = pool.slice().sort((a, b) => (b.cpk ? b.cpk.sum : 0) - (a.cpk ? a.cpk.sum : 0));
    const cpkCols = [plantCol].concat(
      monthCols(0, 10, (p, m) => (p.cpk && p.cpk.m ? p.cpk.m[m] : 0),
        cpkJudge, v => v.toFixed(2)),
      [{ h: 'คะแนนรวม', f: p => ({ t: '<b>' + sc(p.cpk ? p.cpk.sum : 0) + '</b> / 20', cls: 'tot' }) }]);
    const scoreCols = [plantCol].concat(
      scoreMonthCols(3, 10,
        (p, m) => (p.cpk && p.cpk.score ? p.cpk.score[m] : 0),
        (p, m) => (p.cpk && p.cpk.m ? p.cpk.m[m] : 0),
        RULES.cpkMonthMax),
      [{ h: 'Quality', f: p => sc(p.cpk ? p.cpk.total : 0) },
       { h: 'Danger', f: p => { const v = p.cpk ? p.cpk.dz : 0; return { t: sc(v), cls: v < 0 ? 'bad' : 'dim' }; } },
       { h: 'Manual', f: p => { const v = p.cpk ? p.cpk.manual : 0; return { t: sc(v), cls: v < 0 ? 'bad' : 'dim' }; } },
       { h: 'รวม', f: p => ({ t: '<b>' + sc(p.cpk ? p.cpk.sum : 0) + '</b> / 20', cls: 'tot' }) }]);
    host.appendChild(section('คุณภาพ', '20 คะแนน',
      'ผล CPK แสดงตั้งแต่มกราคม · คะแนนเริ่มนับเมษายน · แดง = ต่ำกว่า 0.55 ไม่ได้คะแนน · เขียว = 0.70–0.80 ได้ 2.5 คะแนน',
      [{ label: 'ผล CPK', render: b => pagedTable(b, cpkCols, rows) },
       { label: 'คะแนน', render: b => pagedTable(b, scoreCols, rows) }]));
  }

  /* ── 4. การบริการ (NPS) ─────────────────────────────────────────────────── */
  {
    const rows = pool.slice().sort((a, b) => (b.nps ? b.nps.total : 0) - (a.nps ? a.nps.total : 0));
    const npsCols = [plantCol].concat(
      monthCols(0, 11, (p, m) => (p.nps && p.nps.m ? p.nps.m[m] : 0),
        v => npsPass(v), v => num(v, 1) + '%'),
      [{ h: 'เฉลี่ย', f: p => ({ t: num(p.nps ? p.nps.avg : 0, 1) + '%', cls: 'tot' }) }]);
    const scoreCols = [plantCol].concat(
      scoreMonthCols(3, 11,
        (p, m) => (p.nps && p.nps.score ? p.nps.score[m] : 0),
        (p, m) => (p.nps && p.nps.m ? p.nps.m[m] : 0),
        RULES.npsMonthScore),
      [{ h: 'เดือนที่ผ่าน', f: p => (p.nps ? p.nps.pass : 0) + ' ด.' },
       { h: 'คะแนนรวม', f: p => ({ t: '<b>' + sc(p.nps ? p.nps.total : 0) + '</b> / 18', cls: 'tot' }) }]);
    host.appendChild(section('การบริการ (NPS)', '18 คะแนน',
      'ผล NPS แสดงตั้งแต่มกราคม · คะแนนเริ่มนับเมษายน · เกณฑ์ผ่าน NPS > 75%',
      [{ label: 'ผล NPS', render: b => pagedTable(b, npsCols, rows) },
       { label: 'คะแนน', render: b => pagedTable(b, scoreCols, rows) }]));
  }

  /* ── 5. พนักงาน ────────────────────────────────────────────────────────── */
  {
    const passed = pool.filter(empPass).sort((a, b) => b.emp.pass - a.emp.pass);
    const notPassed = pool.filter(p => !empPass(p))
      .sort((a, b) => ((b.emp ? b.emp.count : 0) - (b.emp ? b.emp.pass : 0)) -
                      ((a.emp ? a.emp.count : 0) - (a.emp ? a.emp.pass : 0)));
    const passCols = [plantCol,
      { h: 'จำนวนพนักงาน', f: p => num(p.emp.count) + ' คน' },
      { h: 'สอบผ่าน', f: p => ({ t: num(p.emp.pass) + ' คน', cls: 'good' }) },
      { h: 'คะแนนจำนวน', f: p => sc(p.emp.scoreCount) + ' / 9' },
      { h: 'คะแนน L1 L2', f: p => sc(p.emp.scoreL1L2) + ' / 3' },
      { h: 'สถานะ', f: () => ({ t: '<span class="pill pill-ok">ผ่าน</span>', cls: 'l' }) }];
    const failCols = [plantCol,
      { h: 'จำนวนพนักงาน', f: p => num(p.emp ? p.emp.count : 0) + ' คน' },
      { h: 'สอบผ่าน', f: p => ({ t: num(p.emp ? p.emp.pass : 0) + ' คน', cls: 'bad' }) },
      { h: 'รายชื่อที่ยังไม่ผ่าน', l: true, f: p => {
          const f = ((p.emp && p.emp.list) || []).filter(e => e.r === 'ไม่ผ่าน');
          if (!f.length) return '<span style="color:var(--muted)">พนักงานไม่ครบ 3 คน</span>';
          return '<div class="name-list" style="max-height:none">' +
            f.map(e => '<span>' + esc(e.n) + ' · ' + esc(e.p) + '</span>').join('') + '</div>';
        } }];
    host.appendChild(section('พนักงาน', '12 คะแนน',
      'ผ่านเมื่อมีพนักงานสอบผ่านตั้งแต่ 3 คนขึ้นไป',
      [{ label: 'สอบผ่าน', count: passed.length, render: b => pagedTable(b, passCols, passed,
          { emptyTitle: 'ยังไม่มีโรงงานที่ผ่านเกณฑ์' }) },
       { label: 'ยังไม่ผ่าน', count: notPassed.length, render: b => pagedTable(b, failCols, notPassed,
          { emptyTitle: 'ทุกโรงงานผ่านเกณฑ์แล้ว', emptyText: 'ไม่มีโรงงานที่พนักงานสอบผ่านน้อยกว่า 3 คน' }) }]));
  }

  /* ── 6. Safety : โรงงาน ────────────────────────────────────────────────── */
  {
    const done = pool.filter(inspected).sort((a, b) => b.sfPlant.score - a.sfPlant.score);
    const todo = pool.filter(p => !inspected(p));
    const doneCols = [plantCol,
      { h: 'เดือนที่ตรวจ', l: true, f: p => monthName(p.sfPlant.month) },
      { h: 'ผลตรวจ (ข้อ)', f: p => sc(p.sfPlant.sum) },
      { h: 'คะแนน', f: p => ({ t: '<b>' + sc(p.sfPlant.score) + '</b> / 15', cls: 'tot' }) }];
    const todoCols = [plantCol,
      { h: 'ทีมงาน', l: true, f: p => esc(p.team) },
      { h: 'สถานะ', l: true, f: () => '<span class="pill pill-no">ยังไม่ตรวจ</span>' }];
    host.appendChild(section('Safety — โรงงาน (FC27)', '15 คะแนน',
      'ตรวจภายในเดือนสิงหาคม = 15 คะแนน · หลังสิงหาคม = 10 คะแนน',
      [{ label: 'ตรวจครบ', count: done.length, render: b => pagedTable(b, doneCols, done) },
       { label: 'ยังไม่ตรวจ', count: todo.length, render: b => pagedTable(b, todoCols, todo,
          { emptyTitle: 'ตรวจครบทุกโรงงานแล้ว', emptyText: 'ไม่มีโรงงานค้างตรวจในกลุ่มที่เลือก' }) }]));
  }

  /* ── 7. Safety : รถโม่ ─────────────────────────────────────────────────── */
  {
    const done = pool.filter(truckDone);
    const todo = pool.filter(p => !truckDone(p));
    const doneCols = [plantCol,
      { h: 'H1 (ม.ค.–มิ.ย.)', l: true, f: p => p.sfTruck.h1
        ? '<span class="pill pill-ok">ผ่าน</span> <span class="sub" style="display:inline">' + esc(p.sfTruck.h1) + '</span>'
        : '<span class="pill pill-wait">–</span>' },
      { h: 'H2 (ก.ค.–ธ.ค.)', l: true, f: p => p.sfTruck.h2
        ? '<span class="pill pill-ok">ผ่าน</span> <span class="sub" style="display:inline">' + esc(p.sfTruck.h2) + '</span>'
        : '<span class="pill pill-wait">–</span>' },
      { h: 'คะแนน', f: p => ({ t: '<b>' + sc(p.sfTruck.score) + '</b> / 2', cls: 'tot' }) }];
    const todoCols = [plantCol,
      { h: 'ทีมงาน', l: true, f: p => esc(p.team) },
      { h: 'สถานะ', l: true, f: () => '<span class="pill pill-no">ยังไม่ตรวจ</span>' }];
    host.appendChild(section('Safety — รถโม่ (F18-464)', '2 คะแนน',
      'ผลตรวจครั้งที่ 1 และครั้งที่ 2 ครั้งละ 1 คะแนน',
      [{ label: 'ตรวจครบ', count: done.length, render: b => pagedTable(b, doneCols, done) },
       { label: 'ยังไม่ตรวจ', count: todo.length, render: b => pagedTable(b, todoCols, todo,
          { emptyTitle: 'ตรวจครบทุกโรงงานแล้ว', emptyText: 'ไม่มีโรงงานค้างตรวจในกลุ่มที่เลือก' }) }]));
  }

  /* ── 8. Safety : ผลอบรม จบส. ──────────────────────────────────────────── */
  {
    const done = pool.filter(drvComplete);
    const todo = pool.filter(p => p.drv && p.drv.untrained > 0)
      .sort((a, b) => b.drv.untrained - a.drv.untrained);
    const doneCols = [plantCol,
      { h: 'จำนวน จบส.', f: p => num(p.drv.total) + ' คน' },
      { h: 'อบรมแล้ว', f: p => ({ t: num(p.drv.trained) + ' คน', cls: 'good' }) },
      { h: 'เดือนที่อบรม', l: true, f: p => monthName(p.drv.month) || '–' },
      { h: 'คะแนน', f: p => ({ t: '<b>' + sc(p.drv.score) + '</b> / 3', cls: 'tot' }) }];
    const todoCols = [plantCol,
      { h: 'จำนวน จบส.', f: p => num(p.drv.total) + ' คน' },
      { h: 'ยังไม่อบรม', f: p => ({ t: num(p.drv.untrained) + ' คน', cls: 'bad' }) },
      { h: 'รายชื่อที่ยังไม่อบรม', l: true, f: p => {
          const n = p.drv.names || [];
          if (!n.length) return '<span style="color:var(--muted)">ไม่มีรายชื่อในระบบ</span>';
          return '<div class="name-list" style="max-height:none">' +
            n.map(x => '<span>' + esc(x.n) + '</span>').join('') + '</div>';
        } }];
    host.appendChild(section('Safety — ผลอบรม จบส.', '3 คะแนน',
      'อบรมและสอบผ่าน ม.ค.–ก.ค. = 3 · ส.ค.–พ.ย. = 2 · ธ.ค. = 1 คะแนน',
      [{ label: 'อบรมครบ', count: done.length, render: b => pagedTable(b, doneCols, done) },
       { label: 'ยังอบรมไม่ครบ', count: todo.length, render: b => pagedTable(b, todoCols, todo,
          { emptyTitle: 'อบรมครบทุกโรงงานแล้ว', emptyText: 'ไม่มี จบส. ค้างอบรมในกลุ่มที่เลือก' }) }]));
  }

  /* ── 9. สิ่งแวดล้อม ───────────────────────────────────────────────────── */
  {
    const done = pool.filter(envDone).sort((a, b) => b.env.score - a.env.score);
    const todo = pool.filter(p => !envDone(p));
    const doneCols = [plantCol,
      { h: 'ผลตรวจ (ข้อ)', f: p => sc(p.env.sum) + ' / 10' },
      { h: 'คะแนน', f: p => ({ t: '<b>' + sc(p.env.score) + '</b> / 10', cls: 'tot' }) },
      { h: 'สถานะ', l: true, f: p => p.env.score >= RULES.envFull
        ? '<span class="pill pill-ok">ผ่าน</span>' : '<span class="pill pill-no">ไม่ผ่าน</span>' }];
    const todoCols = [plantCol,
      { h: 'ทีมงาน', l: true, f: p => esc(p.team) },
      { h: 'สถานะ', l: true, f: () => '<span class="pill pill-no">ยังไม่ตรวจ</span>' }];
    host.appendChild(section('สิ่งแวดล้อม (FC28)', '10 คะแนน',
      'ผลตรวจ 10 ข้อ ผ่านข้อละ 1 คะแนน',
      [{ label: 'ตรวจครบ', count: done.length, render: b => pagedTable(b, doneCols, done) },
       { label: 'ยังไม่ตรวจ', count: todo.length, render: b => pagedTable(b, todoCols, todo,
          { emptyTitle: 'ตรวจครบทุกโรงงานแล้ว', emptyText: 'ไม่มีโรงงานค้างตรวจในกลุ่มที่เลือก' }) }]));
  }
}

/* ═════════════════════════ TAB 2.5 : รายงานรายโรงงาน ══════════════════════
   ตารางเดียวรวมทุกโรงงาน แสดงคะแนนแยกรายหัวข้อ คะแนนรวม และดาวที่ได้        */
const rRegion = $('#rRegion'), rTeam = $('#rTeam'), rFM = $('#rFM'),
      rCompany = $('#rCompany'), rSearch = $('#rSearch');
const R_CHAIN = [[rRegion, 'region', 'ทุกกิจการ'], [rTeam, 'team', 'ทุกผู้จัดการผลิต'],
                 [rFM, 'teamFM', 'ทุกทีม FM'], [rCompany, 'company', 'ทุกบริษัท']];
let rSort = { key: 'company', dir: 1 };

function reportPool() {
  let list = PLANTS.slice();
  R_CHAIN.forEach(row => {
    if (row[0].value !== ALL) list = list.filter(p => p[row[1]] === row[0].value);
  });
  const q = rSearch.value.trim().toLowerCase();
  if (q) list = list.filter(p => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) ||
                                  p.company.toLowerCase().includes(q));
  return list;
}

function syncReportFilters() {
  let base = PLANTS;
  R_CHAIN.forEach(row => {
    const sel = row[0], key = row[1];
    fillSelect(sel, uniqSorted(base.map(p => p[key])), row[2], true);
    if (sel.value !== ALL && !base.some(p => p[key] === sel.value)) sel.value = ALL;
    if (sel.value !== ALL) base = base.filter(p => p[key] === sel.value);
  });
  renderReport();
}
R_CHAIN.forEach((row, i) => {
  row[0].addEventListener('change', () => {
    for (let j = i + 1; j < R_CHAIN.length; j++) R_CHAIN[j][0].value = ALL;
    syncReportFilters();
  });
});
let rTimer;
rSearch.addEventListener('input', () => { clearTimeout(rTimer); rTimer = setTimeout(renderReport, 200); });

/* คอลัมน์คะแนนแยกรายหัวข้อ: [label, คะแนนเต็ม, key ใน p.sc, class สี] */
const REPORT_SCORE_COLS = [
  ['ยอดขาย', 15, 'sale', 'b-sale'],
  ['วัตถุดิบ', 5, 'admix', 'b-admix'],
  ['คุณภาพ', 20, 'qual', 'b-qual'],
  ['Safety', 20, 'safety', 'b-safety'],
  ['NPS', 18, 'nps', 'b-nps'],
  ['พนักงาน', 12, 'emp', 'b-emp'],
  ['สิ่งแวดล้อม', 10, 'env', 'b-env'],
  ['หักคะแนน', null, 'ded', 'b-ded'],
];

function reportSortValue(p, key) {
  if (key === 'name') return p.name;
  if (key === 'company') return p.company;
  if (key === 'total') return p.sc.total;
  if (key === 'star') return p.sc.star;
  return p.sc[key] || 0;
}

function renderReport() {
  const pool = reportPool();
  $('#rCount').innerHTML = 'พบ <b>' + pool.length + '</b> โรงงาน';
  const host = $('#reportBody');
  host.innerHTML = '';

  const rows = pool.slice().sort((a, b) => {
    const va = reportSortValue(a, rSort.key), vb = reportSortValue(b, rSort.key);
    let cmp;
    if (typeof va === 'string') cmp = va.localeCompare(vb, 'th') * rSort.dir * -1;
    else cmp = (va - vb) * rSort.dir;
    if (cmp !== 0) return cmp;
    return a.name.localeCompare(b.name, 'th'); /* เรียงชื่อโรงงานเป็นตัวรอง ถ้าค่าหลักเท่ากัน */
  });

  const cols = [
    { h: 'บริษัท', pts: null, l: true, key: 'company', cls: 'r-company',
      f: p => '<span class="rt-company" title="' + esc(p.company) + '">' + esc(p.company) + '</span>' },
    { h: 'โรงงาน', pts: null, l: true, key: 'name',
      f: p => '<span class="plant" title="' + esc(p.name) + '">' + esc(p.name) + '</span>' },
  ].concat(REPORT_SCORE_COLS.map(c => ({
    h: c[0], pts: c[1], key: c[2],
    f: p => {
      const v = p.sc[c[2]] || 0;
      const cls = c[2] === 'ded' ? (v < 0 ? 'bad' : 'dim') : (c[1] && v >= c[1] ? 'good' : (v ? '' : 'dim'));
      return { t: sc(v), cls };
    },
  }))).concat([
    { h: 'คะแนนรวม', pts: 100, key: 'total', f: p => ({ t: '<b>' + sc(p.sc.total) + '</b>', cls: 'tot' }) },
    { h: 'ดาว', pts: null, key: 'star', f: p => ({ t: starsHTML(p.sc.star).replace('<div class="stars"', '<div class="stars rt-stars"'), cls: '' } ) },
  ]);

  const shell = el('div', 'osec');
  const head = el('div', 'osec-head',
    '<h2>ตารางคะแนนรายโรงงาน</h2><span class="hint">คลิกหัวตารางเพื่อเรียงลำดับ</span>');
  shell.appendChild(head);
  const body = el('div');
  shell.appendChild(body);
  host.appendChild(shell);

  const size = 20;
  let page = 0;

  function draw() {
    const pages = Math.max(1, Math.ceil(rows.length / size));
    if (page >= pages) page = pages - 1;
    const slice = rows.slice(page * size, page * size + size);

    if (!rows.length) {
      body.innerHTML = '<div class="empty"><b>ไม่พบโรงงาน</b>ลองปรับตัวกรองด้านบน</div>';
      return;
    }

    let h = '<div class="tbl-wrap"><table class="dt rt-tbl"><thead><tr><th class="l" style="width:28px">#</th>';
    cols.forEach(c => {
      const active = rSort.key === c.key;
      const arrow = active ? (rSort.dir === -1 ? ' ▼' : ' ▲') : '';
      h += '<th class="' + (c.l ? 'l ' : '') + (c.cls || '') + ' sortable' + (active ? ' active' : '') + '" data-sort="' + c.key + '">' +
        '<span class="rt-h1">' + c.h + arrow + '</span>' +
        (c.pts ? '<span class="rt-h2">(' + c.pts + ' คะแนน)</span>' : '') +
      '</th>';
    });
    h += '</tr></thead><tbody>';
    slice.forEach((p, i) => {
      h += '<tr><td class="l rank">' + (page * size + i + 1) + '</td>';
      cols.forEach(c => {
        const out = c.f(p);
        const cell = (out && typeof out === 'object') ? out : { t: out };
        h += '<td class="' + (c.l ? 'l ' : '') + (c.cls || '') + ' ' + (cell.cls || '') + '">' + (cell.t == null ? '–' : cell.t) + '</td>';
      });
      h += '</tr>';
    });
    h += '</tbody></table></div>';

    h += '<div class="pager"><span class="info">แสดง <b>' + (page * size + 1) + '–' +
      Math.min(rows.length, page * size + size) + '</b> จาก <b>' + rows.length + '</b> โรงงาน</span>' +
      '<span class="spacer"></span>' +
      '<button class="pg-btn" data-go="prev"' + (page === 0 ? ' disabled' : '') + ' aria-label="ก่อนหน้า">' +
        '<svg viewBox="0 0 24 24"><path d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4L10.8 12z"/></svg></button>' +
      '<span class="info">หน้า <b>' + (page + 1) + '</b> / <b>' + pages + '</b></span>' +
      '<button class="pg-btn" data-go="next"' + (page >= pages - 1 ? ' disabled' : '') + ' aria-label="ถัดไป">' +
        '<svg viewBox="0 0 24 24"><path d="M8.6 16.6 10 18l6-6-6-6-1.4 1.4 4.6 4.6z"/></svg></button></div>';

    body.innerHTML = h;
    $$('[data-go]', body).forEach(b => b.addEventListener('click', () => {
      page += (b.dataset.go === 'next' ? 1 : -1);
      draw();
      shell.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }));
    $$('.sortable', body).forEach(th => th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (rSort.key === key) rSort.dir *= -1; else { rSort.key = key; rSort.dir = key === 'name' ? 1 : -1; }
      page = 0;
      renderReport();
    }));
  }
  draw();
}

/* ── ดาวน์โหลด Excel เฉพาะข้อมูลที่กรองอยู่ในตารางนี้ ─────────────────────── */
async function exportReportExcel() {
  if (typeof ExcelJS === 'undefined') { toast('โหลดไลบรารีสร้างไฟล์ Excel ไม่สำเร็จ'); return; }
  const btn = $('#btnReportXlsx');
  const label = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = 'กำลังสร้างไฟล์…';

  try {
    const rows = reportPool().slice().sort((a, b) =>
      a.company.localeCompare(b.company, 'th') || a.name.localeCompare(b.name, 'th'));

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Franchise Scorecard';
    wb.created = new Date();

    const thin = { style: 'thin', color: { argb: 'FFB9C4C2' } };
    const border = { top: thin, left: thin, bottom: thin, right: thin };
    const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E1F2A' } };
    const headerFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    const leftCols = new Set([1, 2, 3]); /* กิจการ / บริษัท / โรงงาน ชิดซ้าย ที่เหลือกึ่งกลาง */

    function makeSheet(name, headers, widths) {
      const ws = wb.addWorksheet(name);
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      const hr = ws.addRow(headers);
      hr.height = 26;
      hr.eachCell(c => {
        c.font = headerFont; c.fill = headerFill; c.border = border;
        c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      });
      widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
      return ws;
    }
    function addDataRow(ws, values, boldCol) {
      const r = ws.addRow(values);
      r.eachCell((c, i) => {
        c.border = border;
        c.alignment = { vertical: 'middle', horizontal: leftCols.has(i) ? 'left' : 'center' };
      });
      if (boldCol) r.getCell(boldCol).font = { bold: true };
      return r;
    }

    /* ── Sheet 1 : รวมคะแนน ─────────────────────────────────────────────── */
    const ws1 = makeSheet('รวมคะแนน', [
      'กิจการ', 'บริษัท', 'โรงงาน',
      'ยอดขาย (15)', 'วัตถุดิบ (5)', 'คุณภาพ (20)', 'Safety (20)', 'NPS (18)',
      'พนักงาน (12)', 'สิ่งแวดล้อม (10)', 'หักคะแนน', 'คะแนนรวม (100)', 'ดาว',
    ], [13, 26, 24, 11, 11, 11, 11, 10, 11, 12, 11, 13, 7]);
    rows.forEach(p => {
      addDataRow(ws1, [
        p.region, p.company, p.name,
        p.sc.sale, p.sc.admix, p.sc.qual, p.sc.safety, p.sc.nps, p.sc.emp, p.sc.env, p.sc.ded,
        p.sc.total, p.sc.star,
      ], 12);
    });

    /* ── Sheet 2 : รายละเอียด ───────────────────────────────────────────── */
    const ws2 = makeSheet('รายละเอียด', [
      'กิจการ', 'บริษัท', 'โรงงาน',
      'ยอดขายสะสม (ลบ.ม.)', 'คะแนนยอดขาย',
      '% สั่งวัตถุดิบเฉลี่ย', 'คะแนนวัตถุดิบ',
      'คะแนน Quality', 'คะแนน Dangerous Zone', 'คะแนน Manual', 'คะแนนคุณภาพรวม',
      'คะแนน Safety โรงงาน', 'คะแนน Safety รถโม่', 'คะแนน Safety อบรม จบส.', 'คะแนน Safety รวม',
      'เดือนผ่านเกณฑ์ NPS', 'คะแนน NPS',
      'จำนวนพนักงาน', 'พนักงานสอบผ่าน', 'คะแนนพนักงาน',
      'ผลตรวจสิ่งแวดล้อม (/10)', 'คะแนนสิ่งแวดล้อม',
      'หักคะแนน (ไม่ร่วมมือ)', 'หักคะแนน (ร้องเรียน)', 'รวมหักคะแนน',
      'คะแนนรวม', 'ดาว',
    ], [13, 26, 24, 15, 11, 13, 11, 11, 13, 9, 12, 13, 12, 15, 12, 13, 10, 11, 11, 11, 15, 12, 13, 13, 11, 11, 7]);
    rows.forEach(p => {
      const sale = p.sale || {}, admix = p.admix || {}, cpk = p.cpk || {}, nps = p.nps || {}, emp = p.emp || {},
            sfp = p.sfPlant || {}, sft = p.sfTruck || {}, drv = p.drv || {}, env = p.env || {}, ded = p.ded || {};
      addDataRow(ws2, [
        p.region, p.company, p.name,
        sale.total || 0, p.sc.sale,
        Math.round((admix.total || 0) * 1000) / 10, p.sc.admix,
        cpk.total || 0, cpk.dz || 0, cpk.manual || 0, p.sc.qual,
        sfp.score || 0, sft.score || 0, drv.score || 0, p.sc.safety,
        nps.pass || 0, p.sc.nps,
        emp.count || 0, emp.pass || 0, p.sc.emp,
        env.sum || 0, p.sc.env,
        Math.abs(ded.coop || 0), Math.abs(ded.comp || 0), p.sc.ded,
        p.sc.total, p.sc.star,
      ], 26);
    });

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'รายงานรายโรงงาน_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('ดาวน์โหลดไฟล์ Excel เรียบร้อย (' + rows.length + ' โรงงาน)');
  } catch (err) {
    console.error(err);
    toast('สร้างไฟล์ Excel ไม่สำเร็จ — ลองใหม่อีกครั้ง');
  } finally {
    btn.disabled = false; btn.innerHTML = label;
  }
}
$('#btnReportXlsx').addEventListener('click', exportReportExcel);

/* ═════════════════════════════ TAB 3 : หักคะแนน ═══════════════════════════ */
function renderDeduct() {
  const host = $('#deductBody');
  host.innerHTML = '';
  const rows = PLANTS.filter(p => p.ded && ((p.ded.coop || 0) !== 0 || (p.ded.comp || 0) !== 0))
    .sort((a, b) => (a.sc.ded) - (b.sc.ded));

  const cols = [plantCol,
    { h: 'กิจการ', l: true, f: p => esc(p.region) },
    { h: 'ไม่ให้ความร่วมมือ', f: p => {
        const v = p.ded.coop || 0;
        return v ? { t: '-' + sc(Math.abs(v)), cls: 'bad' } : { t: '–', cls: 'dim' }; } },
    { h: 'ข้อร้องเรียน', f: p => {
        const v = p.ded.comp || 0;
        return v ? { t: '-' + sc(Math.abs(v)), cls: 'bad' } : { t: '–', cls: 'dim' }; } },
    { h: 'เรื่องที่ถูกหักคะแนน', l: true, f: p => {
        const t = [];
        if (p.ded.coop) t.push('ไม่ให้ความร่วมมือตามนโยบายบริษัท');
        if (p.ded.comp) t.push('มีข้อร้องเรียน');
        if (p.ded.coopTxt && isNaN(Number(p.ded.coopTxt))) t.push(p.ded.coopTxt);
        if (p.ded.compTxt && isNaN(Number(p.ded.compTxt))) t.push(p.ded.compTxt);
        return esc(t.join(' · ')) || '–'; } },
    { h: 'รวมหักคะแนน', f: p => ({ t: '<b>' + sc(p.sc.ded) + '</b>', cls: 'tot bad' }) },
    { h: 'คะแนนสุทธิ', f: p => ({ t: sc(p.sc.total), cls: 'tot' }) }];

  host.appendChild(section('โรงงานที่ถูกหักคะแนน', 'คะแนนลบ',
    'อ้างอิงเกณฑ์: ไม่ให้ความร่วมมือ -5 ถึง -20 · ข้อร้องเรียน -5 ถึง -10',
    [{ label: 'รายการหักคะแนน', render: b => pagedTable(b, cols, rows, {
        emptyTitle: 'ยังไม่มีโรงงานที่ถูกหักคะแนน',
        emptyText: 'ไฟล์ Pointsdeducted.xlsx ยังไม่มีการบันทึกคะแนนติดลบ — เมื่อบันทึกแล้วตารางนี้จะแสดงผลอัตโนมัติ' }) }]));

  /* reference card */
  const ref = el('section', 'osec');
  ref.innerHTML = '<div class="osec-head"><h2>เกณฑ์การหักคะแนน</h2>' +
    '<span class="hint">อ้างอิงไฟล์ rules.xlsx</span></div>' +
    '<div class="tbl-wrap"><table class="dt"><thead><tr>' +
      '<th class="l">รายละเอียด</th><th>คะแนนลบ</th></tr></thead><tbody>' +
    [['แฟรนไชส์ส่งงานข้ามเขตพื้นที่จัดส่ง', '-5'],
     ['ไม่สามารถรักษาส่วนแบ่งตลาดในพื้นที่ตามนโยบายกิจการ', '-5'],
     ['นำตราสัญลักษณ์ CPAC ไปใช้นอกเหนือจากที่ได้รับอนุญาต', '-5'],
     ['ไม่ใช้น้ำยา / PFA ตามข้อกำหนดในสัญญาแฟรนไชส์', '-5'],
     ['นำรถโม่ที่ติดสติ๊กเกอร์ไปรับคอนกรีตจากโรงงานอื่น', '-20'],
     ['แย่งขายงานลูกค้าของผู้แทนจำหน่าย (มีข้อร้องเรียน)', '-10'],
     ['ข้อร้องเรียนด้านคุณภาพ มากกว่า 2 ครั้ง/ปี', '-10'],
     ['ข้อร้องเรียนด้านคุณภาพ 1 ครั้ง/ปี', '-5'],
     ['ข้อร้องเรียนที่ไม่ใช่เรื่องคุณภาพ มากกว่า 3 ครั้ง/ปี', '-10'],
     ['ข้อร้องเรียนที่ไม่ใช่เรื่องคุณภาพ 2 ครั้ง/ปี', '-5'],
     ['มีอุบัติเหตุถึงขั้นหยุดงานหรือเสียชีวิต (โรงงาน)', '-15'],
     ['มีอุบัติเหตุถึงขั้นหยุดงานหรือเสียชีวิต (รถโม่)', '-2']]
      .map(r => '<tr><td class="l">' + r[0] + '</td><td class="bad">' + r[1] + '</td></tr>').join('') +
    '</tbody></table></div>';
  host.appendChild(ref);
}

/* ═════════════════════════════ BOOT ═══════════════════════════════════════
   เริ่มทำงานหลังผ่านหน้า Login แล้วเท่านั้น (auth.js เป็นผู้เรียก)          */
let booted = false;
window.__bootDashboard = function () {
  if (booted) return;
  booted = true;
  syncPlantFilters();
  syncOverviewFilters();
  syncReportFilters();
  renderDeduct();

  /* ตรวจว่าทุกช่องค้นหามีตัวเลือกจริง ถ้าว่างแปลว่าไฟล์สคริปต์หรือข้อมูลไม่ตรงกัน */
  const need = [[pMgr, 'ผู้จัดการผลิต'], [pFM, 'ทีม FM'], [oTeam, 'ผู้จัดการผลิต'], [oFM, 'ทีม FM'],
                [rTeam, 'ผู้จัดการผลิต'], [rFM, 'ทีม FM']];
  const bad = need.filter(x => x[0].options.length < 2).map(x => x[1]);
  if (bad.length) {
    toast('ช่อง ' + Array.from(new Set(bad)).join(' และ ') +
          ' ยังไม่มีตัวเลือก — กด Ctrl+F5 เพื่อโหลดไฟล์ใหม่');
    console.warn('Filter not populated:', bad,
      '— ไฟล์ app.js หรือ data.js อาจเป็นเวอร์ชันเก่าที่ค้างใน cache');
  }
};

})();
