/* ═══════════════════════════════════════════════════════════════════════════
   load-data.js — อ่านไฟล์ Excel ทั้ง 10 ไฟล์สด ๆ ในเบราว์เซอร์ แล้วประกอบเป็น
   window.DASHBOARD_DATA รูปแบบเดียวกับที่ build_data.py (Python) เคยสร้างไว้ใน
   data.js ทุกประการ — พอร์ตมาบรรทัดต่อบรรทัดจาก build_data.py เพื่อให้ผลลัพธ์
   คะแนน/โครงสร้างข้อมูลตรงกันเป๊ะ

   เริ่มโหลดทันทีที่ไฟล์นี้ถูกเรียก (ขนานไปกับตอนผู้ใช้กรอกฟอร์ม Login) แล้วเก็บ
   Promise ไว้ที่ window.__dataReadyPromise ให้ auth.js รอก่อนเรียก __bootDashboard()

   ข้อกำหนด: ต้องเปิดผ่าน http(s) เท่านั้น (เช่น GitHub Pages หรือ local server)
   เพราะ fetch() อ่านไฟล์แบบ file:// โดยตรงไม่ได้ (ติด CORS ของเบราว์เซอร์)
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

const SRC = 'source-excel/';   // โฟลเดอร์ไฟล์ Excel ต้นทาง (relative path จาก index.html)
const FILES = ['DATAPLANT.xlsx', 'SALE.xlsx', 'ADMIX.xlsx', 'CPK.xlsx', 'ReportNPS.xlsx',
               'L1L2.xlsx', 'Safety.xlsx', 'Driver.xlsx', 'ENV.xlsx', 'Pointsdeducted.xlsx'];

/* ─────────────────────────────── ตัวช่วยแปลงค่า (ตรงกับ s()/n()/code() ใน build_data.py) ── */
function s(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.replace(/\u00A0/g, ' ').trim();
  return String(v).trim();
}
function n(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  const t = String(v).replace(/,/g, '').replace(/%/g, '').trim();
  const f = parseFloat(t);
  return isNaN(f) ? 0 : f;
}
function code(v) { return s(v).toUpperCase(); }
/* ตัดคอลัมน์ z..y (0-indexed, ปลายเปิดแบบ Python slice) จากแถวเดียว */
function slice(row, a, b) { return row.slice(a, b); }

/* ─────────────────────────────── โหลดและแคชแต่ละไฟล์ ─────────────────────────────────── */
const workbooks = {};   // ชื่อไฟล์ -> XLSX workbook object

function reportProgress(doneCount, total, label) {
  const el = document.getElementById('dataLoadDetail');
  if (el) el.textContent = 'กำลังโหลด ' + label + ' (' + doneCount + '/' + total + ')';
}

async function fetchWorkbook(filename, doneCounterRef, total) {
  let res;
  try {
    res = await fetch(SRC + filename, { cache: 'no-store' });
  } catch (netErr) {
    if (location.protocol === 'file:') {
      throw new Error('เปิดไฟล์นี้ผ่านการดับเบิลคลิกโดยตรงไม่ได้อีกต่อไป ' +
        'เบราว์เซอร์บล็อกการอ่านไฟล์ Excel จากเครื่องด้วยเหตุผลความปลอดภัย ' +
        'กรุณาเปิดผ่านเว็บไซต์ที่อัปโหลดไว้ (เช่น GitHub Pages) แทน');
    }
    throw new Error('เชื่อมต่อเพื่อโหลดไฟล์ ' + filename + ' ไม่สำเร็จ (เช็คการเชื่อมต่ออินเทอร์เน็ต)');
  }
  if (!res.ok) throw new Error('โหลดไฟล์ ' + filename + ' ไม่สำเร็จ (HTTP ' + res.status + ') — เช็คว่าไฟล์นี้อยู่ในโฟลเดอร์ source-excel/ และชื่อสะกดถูกต้อง');
  const buf = await res.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
  workbooks[filename] = wb;
  doneCounterRef.n += 1;
  reportProgress(doneCounterRef.n, total, filename);
}

/* คืนแถวทั้งหมดของชีตหนึ่ง เป็น array of array (เทียบเท่า openpyxl iter_rows(values_only=True)) */
function rowsOf(filename, sheetName) {
  const wb = workbooks[filename];
  if (!wb) throw new Error('ยังไม่ได้โหลดไฟล์ ' + filename);
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error('ไม่พบชีต "' + sheetName + '" ในไฟล์ ' + filename);
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
}

/* ═════════════════════════════ แปลงข้อมูล (พอร์ตจาก build_data.py) ═══════════════════════ */
function buildDashboardData() {
  const plants = {};
  const order = [];

  function ensure(cRaw, name, region, company) {
    const c = code(cRaw);
    if (!c) return null;
    if (!plants[c]) {
      plants[c] = { code: c, name: name || c, region: region || '', company: company || '',
                    type: '', grade: '', team: '', teamFM: '' };
      order.push(c);
    }
    return plants[c];
  }

  // ---------------------------------------------------------------- master list
  for (const r of rowsOf('DATAPLANT.xlsx', 'Sheet1').slice(1)) {
    const c = code(r[0]);
    if (!c) continue;
    plants[c] = {
      code: c, name: s(r[1]), region: s(r[2]), company: s(r[3]),
      type: s(r[4]), grade: s(r[5]), team: s(r[6]), teamFM: s(r[7]),
    };
    order.push(c);
  }

  // ------------------------------------------------------------------- 1. SALES
  function saleScore(total) {
    if (total > 40000) return 15;
    if (total > 30000) return 13;
    if (total > 20000) return 11;
    if (total > 10000) return 9;
    return 7;
  }
  for (const [sheet, key] of [['2026', 'm26'], ['2025', 'm25']]) {
    for (const r of rowsOf('SALE.xlsx', sheet).slice(1)) {
      const p = ensure(r[2], s(r[3]), s(r[0]), s(r[1]));
      if (!p) continue;
      p.sale = p.sale || {};
      p.sale[key] = slice(r, 6, 18).map(n);
      if (sheet === '2026') {
        p.sale.total = n(r[18]);
        p.sale.score = saleScore(n(r[18]));
      }
    }
  }
  for (const r of rowsOf('SALE.xlsx', 'PLAN2026').slice(1)) {
    const p = ensure(r[2], s(r[3]), s(r[0]), s(r[1]));
    if (p) { p.sale = p.sale || {}; p.sale.plan = slice(r, 5, 17).map(n); }
  }

  // ------------------------------------------------------------------- 2. ADMIX
  for (const r of rowsOf('ADMIX.xlsx', 'Admix').slice(1)) {
    const p = ensure(r[1], s(r[2]), s(r[0]));
    if (p) {
      p.admix = { m: slice(r, 3, 15).map(n), total: n(r[15]), bench: n(r[16]), score: n(r[17]) };
    }
  }

  // ----------------------------------------------------------------- 3. QUALITY
  for (const r of rowsOf('CPK.xlsx', 'Q').slice(1)) {
    const p = ensure(r[3], s(r[4]), s(r[0]), s(r[2]));
    if (p) { p.cpk = p.cpk || {}; p.cpk.m = slice(r, 6, 17).map(n).concat([0]); }
  }
  for (const r of rowsOf('CPK.xlsx', 'Q-Score').slice(1)) {
    const p = ensure(r[1], s(r[2]), s(r[0]));
    if (p) {
      const q = (p.cpk = p.cpk || {});
      q.score = slice(r, 4, 15).map(n).concat([0]);
      q.total = n(r[15]); q.dz = n(r[16]); q.manual = n(r[17]); q.sum = n(r[18]);
    }
  }
  for (const [sheet, key] of [['Dangerous', 'dzM'], ['Manual', 'manM']]) {
    for (const r of rowsOf('CPK.xlsx', sheet).slice(1)) {
      const p = ensure(r[0], s(r[1]));
      if (p) { p.cpk = p.cpk || {}; p.cpk[key] = slice(r, 2, 13).map(n).concat([0]); }
    }
  }

  // --------------------------------------------------------------------- 4. NPS
  for (const r of rowsOf('ReportNPS.xlsx', 'NPS').slice(1)) {
    const p = ensure(r[3], s(r[4]), s(r[0]), s(r[2]));
    if (p) { p.nps = p.nps || {}; p.nps.m = slice(r, 6, 18).map(n); p.nps.avg = n(r[18]); }
  }
  for (const r of rowsOf('ReportNPS.xlsx', 'NPS-Score').slice(1)) {
    const p = ensure(r[3], s(r[4]), s(r[0]), s(r[2]));
    if (p) {
      const q = (p.nps = p.nps || {});
      q.score = slice(r, 6, 18).map(n);
      q.total = n(r[18]);
      q.pass = q.score.filter(x => x > 0).length;
    }
  }

  // ---------------------------------------------------------------- 5. EMPLOYEE
  for (const r of rowsOf('L1L2.xlsx', 'Score').slice(1)) {
    const p = ensure(r[1], s(r[2]), s(r[0]));
    if (p) {
      p.emp = Object.assign(p.emp || {}, {
        count: Math.trunc(n(r[3])), pass: Math.trunc(n(r[4])),
        scoreCount: n(r[5]), scoreL1L2: n(r[6]),
      });
    }
  }
  for (const r of rowsOf('L1L2.xlsx', 'L1L2').slice(4)) {
    const c = code(r[12]);
    if (!c || !plants[c]) continue;
    const e = (plants[c].emp = plants[c].emp || {});
    const lst = (e.list = e.list || []);
    lst.push({ n: s(r[2]), p: s(r[5]), y: s(r[6]),
               l1t: s(r[7]), l1p: s(r[8]), l2t: s(r[9]), l2p: s(r[10]), r: s(r[11]) });
  }

  // --------------------------------------------------------------- 6. SAFETY
  for (const r of rowsOf('Safety.xlsx', 'Safety-Plant').slice(1)) {
    const p = ensure(r[1], s(r[2]), s(r[0]));
    if (p) p.sfPlant = { sum: n(r[16]), month: Math.trunc(n(r[17])), score: n(r[18]) };
  }
  for (const r of rowsOf('Safety.xlsx', 'Safety-Truck').slice(1)) {
    const p = ensure(r[1], s(r[2]), s(r[0]));
    if (p) {
      const h1 = s(r[4]), h2 = s(r[5]);
      p.sfTruck = { h1: (h1 === '0' || h1 === '') ? '' : h1,
                    h2: (h2 === '0' || h2 === '') ? '' : h2,
                    score: n(r[6]), note: s(r[7]) };
    }
  }

  // --------------------------------------------------------- 7. DRIVER TRAINING
  for (const r of rowsOf('Driver.xlsx', 'จบส.-Score').slice(1)) {
    const p = ensure(r[1], s(r[2]), s(r[0]));
    if (p) {
      p.drv = { total: Math.trunc(n(r[3])), trained: Math.trunc(n(r[4])),
                untrained: Math.abs(Math.trunc(n(r[5]))), score: n(r[6]), month: Math.trunc(n(r[7])) };
    }
  }
  /* 2569-09: ไฟล์ Driver.xlsx ตัดคอลัมน์ข้อมูลส่วนตัว 8 คอลัมน์ออก (ชื่อ/นามสกุลอังกฤษ,
     รหัสบัตรประชาชน, เลขใบขับขี่, ข้อมูลผู้รับเหมา, รูปพนักงาน, สถานะ) ทำให้คอลัมน์ที่เหลือ
     เลื่อนมาทางซ้าย 8 ตำแหน่ง: โรงงาน/Status/TEAM/ชื่อ-นามสกุล/เดือนที่อบรม
     ย้ายจาก index 15-19 (เดิม) มาเป็น index 7-11 (ปัจจุบัน) — รหัสโรงงาน/ชื่อ/นามสกุลไทย
     (index 0, 5, 6) ตำแหน่งเดิมไม่เปลี่ยน */
  for (const r of rowsOf('Driver.xlsx', 'รายชื่อจบส.').slice(1)) {
    const c = code(r[0]);
    if (!c || !plants[c]) continue;
    const st = s(r[8]);
    if (st === 'ยังไม่อบรม' || st === 'ไม่ผ่าน') {
      const nm = (s(r[5]) + ' ' + s(r[6])).trim() || s(r[10]);
      const d = (plants[c].drv = plants[c].drv || {});
      (d.names = d.names || []).push({ n: nm, s: st });
    }
  }

  // --------------------------------------------------------------------- 8. ENV
  for (const r of rowsOf('ENV.xlsx', 'FC28').slice(1)) {
    const p = ensure(r[1], s(r[2]), s(r[0]));
    if (p) p.env = { sum: n(r[14]), score: n(r[15]), items: slice(r, 4, 14).map(n) };
  }

  // ---------------------------------------------------------------- 9. DEDUCTED
  for (const r of rowsOf('Pointsdeducted.xlsx', 'Sheet1').slice(1)) {
    const p = ensure(r[1], s(r[2]), s(r[0]));
    if (p) {
      const coop = n(r[3]), comp = n(r[4]);
      p.ded = { coop: coop, comp: comp, coopTxt: s(r[3]), compTxt: s(r[4]) };
    }
  }

  // ------------------------------------------------- normalise / fill meta gaps
  const REGION_MAP = {
    metro: '1-Metro', east: '2-East', west: '3-West', north: '4-North',
    northe: '5-NorthE', northeast: '5-NorthE', south: '6-South',
  };
  for (const c of order) {
    const p = plants[c];
    const reg = p.region || '';
    if (reg && !/^\d/.test(reg)) {
      p.region = REGION_MAP[reg.toLowerCase().replace(/\s+/g, '')] || reg;
    }
    if (!p.region) p.region = 'ไม่ระบุกิจการ';
    if (!p.company) p.company = 'ไม่ระบุบริษัท';
    if (!p.team) p.team = 'ไม่ระบุผู้จัดการผลิต';
    if (!p.teamFM) p.teamFM = 'ไม่ระบุทีม FM';
    if (!p.name) p.name = c;
  }

  // ------------------------------------- ตัดโรงงานที่ไม่มียอดขายปี 2569 ออก
  function hasSale2026(p) {
    const sale = p.sale || {};
    return !!sale.total || (sale.m26 || []).some(v => v);
  }
  const dropped = order.filter(c => !hasSale2026(plants[c]));
  for (const c of dropped) delete plants[c];
  const order2 = order.filter(c => plants[c]);

  // ------------------------- แก้คะแนนพนักงานสำหรับโรงงาน Type M (สิทธิพิเศษ 2 คน)
  // ไฟล์ L1L2 Score ต้นฉบับยังคำนวณด้วยเกณฑ์ 3 คนเหมือนโรงงานทั่วไปทุกแห่ง
  // จึงต้องคำนวณคะแนนพนักงานของโรงงาน Type M ใหม่ตามสิทธิพิเศษ: ใช้พนักงานแค่ 2 คนก็ได้คะแนนเต็ม
  for (const c of order2) {
    const p = plants[c];
    if (p.type === 'M') {
      const e = p.emp;
      if (!e) continue;
      const cnt = e.count || 0, psd = e.pass || 0;
      e.scoreCount = cnt >= 2 ? 9 : 0;
      e.scoreL1L2 = psd >= 2 ? 3 : Math.min(psd, 3);
    }
  }

  // -------------------------------------------------------------- total scoring
  for (const c of order2) {
    const p = plants[c];
    const sale = (p.sale || {}).score || 0;
    const admix = (p.admix || {}).score || 0;
    const qual = (p.cpk || {}).sum || 0;
    const sfp = (p.sfPlant || {}).score || 0;
    const sft = (p.sfTruck || {}).score || 0;
    const drv = (p.drv || {}).score || 0;
    const nps = (p.nps || {}).total || 0;
    const emp = ((p.emp || {}).scoreCount || 0) + ((p.emp || {}).scoreL1L2 || 0);
    const env = (p.env || {}).score || 0;
    let ded = ((p.ded || {}).coop || 0) + ((p.ded || {}).comp || 0);
    if (ded > 0) ded = -ded;
    const total = sale + admix + qual + sfp + sft + drv + nps + emp + env + ded;
    const star = total >= 80 ? 5 : total >= 70 ? 4 : total >= 60 ? 3 : 2;
    p.sc = { sale, admix, qual, safety: sfp + sft + drv, sfPlant: sfp, sfTruck: sft,
             drv, nps, emp, env, ded, total: Math.round(total * 100) / 100, star };
  }

  return {
    plants: order2.map(c => plants[c]),
    rules: {
      saleTiers: [[40000, 15], [30000, 13], [20000, 11], [10000, 9], [0, 7]],
      admixFull: 0.9, admixPartial: 0.8,
      cpkLow: 0.55, cpkHigh: 1.00, cpkBestLow: 0.70, cpkBestHigh: 0.80,
      cpkMonthMax: 2.5, npsPass: 75, npsMonthScore: 2,
      empMin: 3, envFull: 10, sfPlantDeadline: 8,
      max: { sale: 15, admix: 5, qual: 20, safety: 20, nps: 18, emp: 12, env: 10, total: 100 },
      star: [[80, 5, 2], [70, 4, 1.5], [60, 3, 1], [0, 2, 0]],
    },
  };
}

/* ═════════════════════════════ ลำดับการทำงาน ═══════════════════════════════ */
async function loadAll() {
  if (typeof XLSX === 'undefined') {
    throw new Error('โหลดไลบรารีอ่านไฟล์ Excel (SheetJS) ไม่สำเร็จ — เช็คว่าไฟล์ vendor/xlsx.full.min.js อยู่ครบ');
  }
  const counter = { n: 0 };
  reportProgress(0, FILES.length, 'ไฟล์ Excel');
  /* โหลดพร้อมกันทุกไฟล์เพื่อความเร็ว */
  await Promise.all(FILES.map(f => fetchWorkbook(f, counter, FILES.length)));
  const data = buildDashboardData();
  window.DASHBOARD_DATA = data;
  sanityCheckData(data);
  return data;
}

/* ตรวจสอบข้อมูลที่ได้แบบคร่าว ๆ หลังประมวลผลเสร็จ ถ้าเจอความผิดปกติ (เช่นบางส่วนว่างเปล่า
   ทั้งที่ไม่ควรว่าง) จะ console.warn ไว้ให้เห็นตอนเปิด F12 — ช่วยวินิจฉัยจากระยะไกลได้ง่ายขึ้น
   เวลาไฟล์ Excel บน GitHub เป็นเวอร์ชันเก่า/เสีย/ผิดโครงสร้างโดยไม่รู้ตัว */
function sanityCheckData(data) {
  const plants = data.plants || [];
  const warn = [];
  const totalDrv = plants.reduce((s, p) => s + ((p.drv && p.drv.names) || []).length, 0);
  const totalEmpFail = plants.reduce((s, p) =>
    s + ((p.emp && p.emp.list) || []).filter(e => e.r === 'ไม่ผ่าน').length, 0);
  const totalEmpList = plants.reduce((s, p) => s + ((p.emp && p.emp.list) || []).length, 0);

  /* ใช้จำนวนโรงงานที่โหลดสำเร็จ (มาจาก DATAPLANT.xlsx ซึ่งเชื่อถือได้เสมอ) เป็นตัวเทียบ
     ถ้าโหลดโรงงานได้เยอะตามปกติ แต่รายชื่อระดับคนกลับว่างเปล่าทั้งหมด แปลว่าไฟล์/ชีตนั้น
     น่าจะมีปัญหา (เก่า/ว่าง/โครงสร้างเปลี่ยน) โดยไม่ต้องอิงกับชีตอื่นที่อาจพังพร้อมกัน */
  if (plants.length > 100 && totalDrv === 0) {
    warn.push('โหลดโรงงานได้ ' + plants.length + ' แห่งตามปกติ แต่ไม่มีรายชื่อ จบส. ที่ยังไม่อบรมเลยแม้แต่คนเดียว ' +
      '(ชีต "รายชื่อจบส." ในไฟล์ Driver.xlsx อาจเป็นไฟล์เก่า/ว่าง/โครงสร้างเปลี่ยน — ลองอัปโหลด Driver.xlsx ใหม่)');
  }
  if (plants.length > 100 && totalEmpList === 0) {
    warn.push('โหลดโรงงานได้ ' + plants.length + ' แห่งตามปกติ แต่ไม่มีรายชื่อพนักงานเลยแม้แต่คนเดียว ' +
      '(ชีต "L1L2" ในไฟล์ L1L2.xlsx อาจเป็นไฟล์เก่า/ว่าง/โครงสร้างเปลี่ยน — ลองอัปโหลด L1L2.xlsx ใหม่)');
  } else if (plants.length > 100 && totalEmpList > 0 && totalEmpFail === 0) {
    warn.push('มีรายชื่อพนักงานอยู่ แต่ไม่มีใครมีสถานะ "ไม่ผ่าน" เลยสักคน ' +
      '(ปกติ หรือชีต L1L2 อาจมีปัญหา ลองเช็คถ้าคาดว่าควรมีคนไม่ผ่านอยู่บ้าง)');
  }
  if (warn.length) {
    console.warn('[ตรวจสอบข้อมูล] พบความผิดปกติที่ควรเช็ค:\n- ' + warn.join('\n- '));
    showDataWarningBanner(warn);
  }
}

/* แถบแจ้งเตือนเล็ก ๆ มุมล่างขวา ให้เห็นได้โดยไม่ต้องเปิด F12 — ไม่บล็อกการใช้งาน แค่เตือน */
function showDataWarningBanner(messages) {
  const box = document.createElement('div');
  box.id = 'dataWarnBanner';
  box.style.cssText = 'position:fixed;bottom:16px;right:16px;max-width:380px;z-index:9998;' +
    'background:#FFF8E8;border:1px solid #F3DFC2;border-radius:10px;padding:12px 14px;' +
    'box-shadow:0 8px 24px rgba(0,0,0,.15);font-family:"IBM Plex Sans Thai",sans-serif;' +
    'font-size:12px;line-height:1.6;color:#6B4E12;';
  box.innerHTML =
    '<div style="font-weight:700;margin-bottom:5px;display:flex;justify-content:space-between;gap:8px">' +
      '<span>⚠️ พบข้อมูลที่ควรตรวจสอบ</span>' +
      '<button type="button" style="border:0;background:none;cursor:pointer;font-size:14px;color:#6B4E12;line-height:1" aria-label="ปิด">×</button>' +
    '</div>' +
    messages.map(m => '<div style="margin-top:3px">• ' + m + '</div>').join('');
  box.querySelector('button').addEventListener('click', () => box.remove());
  document.body.appendChild(box);
}

/* เริ่มโหลดทันทีที่สคริปต์นี้ถูกอ่าน (ขนานกับตอนผู้ใช้กรอกฟอร์ม Login)
   เก็บ Promise ไว้ให้ auth.js await ก่อนเรียก __bootDashboard() */
window.__dataReadyPromise = loadAll();

})();
