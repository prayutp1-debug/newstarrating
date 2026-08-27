#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Extract every source workbook into a single data.js payload for the dashboard."""
import json, os, re
import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'source-excel')   # โฟลเดอร์ไฟล์ Excel ต้นทาง
OUT = HERE                                 # ที่เก็บ data.js ที่สร้างขึ้น

def load(fn, sheet):
    wb = openpyxl.load_workbook(os.path.join(SRC, fn), data_only=True, read_only=True)
    ws = wb[sheet]
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    wb.close()
    return rows

def s(v):
    if v is None:
        return ''
    if isinstance(v, str):
        return v.replace('\xa0', ' ').strip()
    return str(v).strip()

def n(v):
    if v is None or v == '':
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    t = str(v).replace(',', '').replace('%', '').strip()
    try:
        return float(t)
    except ValueError:
        return 0.0

def code(v):
    return s(v).upper()

# ---------------------------------------------------------------- master list
plants = {}
order = []
rows = load('DATAPLANT.xlsx', 'Sheet1')
for r in rows[1:]:
    c = code(r[0])
    if not c:
        continue
    plants[c] = {
        'code': c, 'name': s(r[1]), 'region': s(r[2]), 'company': s(r[3]),
        'type': s(r[4]), 'grade': s(r[5]), 'team': s(r[6]), 'teamFM': s(r[7]),
    }
    order.append(c)

def ensure(c, name='', region='', company=''):
    """Some workbooks carry plants that are missing from DATAPLANT — keep them."""
    c = code(c)
    if not c:
        return None
    if c not in plants:
        plants[c] = {'code': c, 'name': name or c, 'region': region, 'company': company,
                     'type': '', 'grade': '', 'team': '', 'teamFM': ''}
        order.append(c)
    return plants[c]

# ------------------------------------------------------------------- 1. SALES
# rules: >40,000 -> 15 | >30,000-40,000 -> 13 | >20,000-30,000 -> 11
#        >10,000-20,000 -> 9 | <10,000 -> 7
def sale_score(total):
    if total > 40000: return 15
    if total > 30000: return 13
    if total > 20000: return 11
    if total > 10000: return 9
    return 7

for sheet, key in (('2026', 'm26'), ('2025', 'm25')):
    for r in load('SALE.xlsx', sheet)[1:]:
        p = ensure(r[2], s(r[3]), s(r[0]), s(r[1]))
        if not p:
            continue
        p.setdefault('sale', {})[key] = [n(x) for x in r[6:18]]
        if sheet == '2026':
            p['sale']['total'] = n(r[18])
            p['sale']['score'] = sale_score(n(r[18]))

for r in load('SALE.xlsx', 'PLAN2026')[1:]:
    p = ensure(r[2], s(r[3]), s(r[0]), s(r[1]))
    if p:
        p.setdefault('sale', {})['plan'] = [n(x) for x in r[5:17]]

# ------------------------------------------------------------------- 2. ADMIX
for r in load('ADMIX.xlsx', 'Admix')[1:]:
    p = ensure(r[1], s(r[2]), s(r[0]))
    if p:
        p['admix'] = {'m': [n(x) for x in r[3:15]], 'total': n(r[15]),
                      'bench': n(r[16]), 'score': n(r[17])}

# ----------------------------------------------------------------- 3. QUALITY
for r in load('CPK.xlsx', 'Q')[1:]:
    p = ensure(r[3], s(r[4]), s(r[0]), s(r[2]))
    if p:
        p.setdefault('cpk', {})['m'] = [n(x) for x in r[6:17]] + [0.0]

for r in load('CPK.xlsx', 'Q-Score')[1:]:
    p = ensure(r[1], s(r[2]), s(r[0]))
    if p:
        q = p.setdefault('cpk', {})
        q['score'] = [n(x) for x in r[4:15]] + [0.0]
        q['total'] = n(r[15]); q['dz'] = n(r[16])
        q['manual'] = n(r[17]); q['sum'] = n(r[18])

for sheet, key in (('Dangerous', 'dzM'), ('Manual', 'manM')):
    for r in load('CPK.xlsx', sheet)[1:]:
        p = ensure(r[0], s(r[1]))
        if p:
            p.setdefault('cpk', {})[key] = [n(x) for x in r[2:13]] + [0.0]

# --------------------------------------------------------------------- 4. NPS
for r in load('ReportNPS.xlsx', 'NPS')[1:]:
    p = ensure(r[3], s(r[4]), s(r[0]), s(r[2]))
    if p:
        p.setdefault('nps', {})['m'] = [n(x) for x in r[6:18]]
        p['nps']['avg'] = n(r[18])

for r in load('ReportNPS.xlsx', 'NPS-Score')[1:]:
    p = ensure(r[3], s(r[4]), s(r[0]), s(r[2]))
    if p:
        q = p.setdefault('nps', {})
        q['score'] = [n(x) for x in r[6:18]]
        q['total'] = n(r[18])
        q['pass'] = sum(1 for x in q['score'] if x > 0)

# ---------------------------------------------------------------- 5. EMPLOYEE
for r in load('L1L2.xlsx', 'Score')[1:]:
    p = ensure(r[1], s(r[2]), s(r[0]))
    if p:
        p.setdefault('emp', {}).update({
            'count': int(n(r[3])), 'pass': int(n(r[4])),
            'scoreCount': n(r[5]), 'scoreL1L2': n(r[6])})

rows = load('L1L2.xlsx', 'L1L2')
for r in rows[4:]:
    c = code(r[12])
    if not c or c not in plants:
        continue
    e = plants[c].setdefault('emp', {})
    lst = e.setdefault('list', [])
    lst.append({'n': s(r[2]), 'p': s(r[5]), 'y': s(r[6]),
                'l1t': s(r[7]), 'l1p': s(r[8]), 'l2t': s(r[9]), 'l2p': s(r[10]),
                'r': s(r[11])})

# --------------------------------------------------------------- 6. SAFETY
for r in load('Safety.xlsx', 'Safety-Plant')[1:]:
    p = ensure(r[1], s(r[2]), s(r[0]))
    if p:
        p['sfPlant'] = {'sum': n(r[16]), 'month': int(n(r[17])), 'score': n(r[18])}

for r in load('Safety.xlsx', 'Safety-Truck')[1:]:
    p = ensure(r[1], s(r[2]), s(r[0]))
    if p:
        h1, h2 = s(r[4]), s(r[5])
        p['sfTruck'] = {'h1': '' if h1 in ('0', '') else h1,
                        'h2': '' if h2 in ('0', '') else h2,
                        'score': n(r[6]), 'note': s(r[7])}

# --------------------------------------------------------- 7. DRIVER TRAINING
for r in load('Driver.xlsx', 'จบส.-Score')[1:]:
    p = ensure(r[1], s(r[2]), s(r[0]))
    if p:
        p['drv'] = {'total': int(n(r[3])), 'trained': int(n(r[4])),
                    'untrained': abs(int(n(r[5]))), 'score': n(r[6]),
                    'month': int(n(r[7]))}

for r in load('Driver.xlsx', 'รายชื่อจบส.')[1:]:
    c = code(r[0])
    if not c or c not in plants:
        continue
    st = s(r[16])
    if st in ('ยังไม่อบรม', 'ไม่ผ่าน'):
        nm = (s(r[5]) + ' ' + s(r[6])).strip() or s(r[18])
        plants[c].setdefault('drv', {}).setdefault('names', []).append({'n': nm, 's': st})

# --------------------------------------------------------------------- 8. ENV
for r in load('ENV.xlsx', 'FC28')[1:]:
    p = ensure(r[1], s(r[2]), s(r[0]))
    if p:
        p['env'] = {'sum': n(r[14]), 'score': n(r[15]),
                    'items': [n(x) for x in r[4:14]]}

# ---------------------------------------------------------------- 9. DEDUCTED
for r in load('Pointsdeducted.xlsx', 'Sheet1')[1:]:
    p = ensure(r[1], s(r[2]), s(r[0]))
    if p:
        coop, comp = n(r[3]), n(r[4])
        p['ded'] = {'coop': coop, 'comp': comp,
                    'coopTxt': s(r[3]), 'compTxt': s(r[4])}

# ------------------------------------------------- normalise / fill meta gaps
REGION_MAP = {
    'metro': '1-Metro', 'east': '2-East', 'west': '3-West', 'north': '4-North',
    'northe': '5-NorthE', 'northeast': '5-NorthE', 'south': '6-South',
}
for c in order:
    p = plants[c]
    reg = p.get('region', '')
    if reg and not re.match(r'^\d', reg):
        p['region'] = REGION_MAP.get(reg.lower().replace(' ', ''), reg)
    if not p.get('region'):
        p['region'] = 'ไม่ระบุกิจการ'
    if not p.get('company'):
        p['company'] = 'ไม่ระบุบริษัท'
    if not p.get('team'):
        p['team'] = 'ไม่ระบุผู้จัดการผลิต'
    if not p.get('teamFM'):
        p['teamFM'] = 'ไม่ระบุทีม FM'
    if not p.get('name'):
        p['name'] = c

# ------------------------------------- ตัดโรงงานที่ไม่มียอดขายปี 2569 ออก
def has_sale_2026(p):
    s = p.get('sale') or {}
    return bool(s.get('total')) or any(s.get('m26') or [])

dropped = [c for c in order if not has_sale_2026(plants[c])]
for c in dropped:
    del plants[c]
order = [c for c in order if c in plants]

# ------------------------- แก้คะแนนพนักงานสำหรับโรงงาน Type M (สิทธิพิเศษ 2 คน)
# ไฟล์ L1L2 Score ต้นฉบับยังคำนวณด้วยเกณฑ์ 3 คนเหมือนโรงงานทั่วไปทุกแห่ง
# (ตรวจพบว่าโรงงาน Type M ที่มีพนักงานครบ 2 คนพอดี ยังได้ scoreCount = 0 ไม่ใช่ 9)
# จึงต้องคำนวณคะแนนพนักงานของโรงงาน Type M ใหม่ตามสิทธิพิเศษ: ใช้พนักงานแค่ 2 คนก็ได้คะแนนเต็ม
for c in order:
    p = plants[c]
    if p.get('type') == 'M':
        e = p.get('emp')
        if not e:
            continue
        cnt = e.get('count', 0) or 0
        psd = e.get('pass', 0) or 0
        e['scoreCount'] = 9.0 if cnt >= 2 else 0.0
        e['scoreL1L2'] = 3.0 if psd >= 2 else min(psd, 3)

# -------------------------------------------------------------- total scoring
for c in order:
    p = plants[c]
    sale = p.get('sale', {}).get('score', 0)
    admix = p.get('admix', {}).get('score', 0)
    qual = p.get('cpk', {}).get('sum', 0)
    sfp = p.get('sfPlant', {}).get('score', 0)
    sft = p.get('sfTruck', {}).get('score', 0)
    drv = p.get('drv', {}).get('score', 0)
    nps = p.get('nps', {}).get('total', 0)
    emp = p.get('emp', {}).get('scoreCount', 0) + p.get('emp', {}).get('scoreL1L2', 0)
    env = p.get('env', {}).get('score', 0)
    ded = p.get('ded', {}).get('coop', 0) + p.get('ded', {}).get('comp', 0)
    if ded > 0:
        ded = -ded
    total = sale + admix + qual + sfp + sft + drv + nps + emp + env + ded
    star = 5 if total >= 80 else 4 if total >= 70 else 3 if total >= 60 else 2
    p['sc'] = {'sale': sale, 'admix': admix, 'qual': qual, 'safety': sfp + sft + drv,
               'sfPlant': sfp, 'sfTruck': sft, 'drv': drv, 'nps': nps, 'emp': emp,
               'env': env, 'ded': ded, 'total': round(total, 2), 'star': star}

data = {
    'plants': [plants[c] for c in order],
    'rules': {
        'saleTiers': [[40000, 15], [30000, 13], [20000, 11], [10000, 9], [0, 7]],
        'admixFull': 0.9, 'admixPartial': 0.8,
        'cpkLow': 0.55, 'cpkHigh': 1.00, 'cpkBestLow': 0.70, 'cpkBestHigh': 0.80,
        'cpkMonthMax': 2.5, 'npsPass': 75, 'npsMonthScore': 2,
        'empMin': 3, 'envFull': 10, 'sfPlantDeadline': 8,
        'max': {'sale': 15, 'admix': 5, 'qual': 20, 'safety': 20, 'nps': 18,
                'emp': 12, 'env': 10, 'total': 100},
        'star': [[80, 5, 2], [70, 4, 1.5], [60, 3, 1], [0, 2, 0]],
    },
}

with open(os.path.join(OUT, 'data.js'), 'w', encoding='utf-8') as f:
    f.write('window.DASHBOARD_DATA = ')
    json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    f.write(';\n')

print('plants:', len(order))
print('ตัดออก (ไม่มียอดขาย 2569):', len(dropped))
for c in dropped:
    print('   -', c)
print('size KB:', os.path.getsize(os.path.join(OUT, 'data.js')) // 1024)
sample = plants[order[0]]
print(json.dumps({k: v for k, v in sample.items() if k != 'emp'}, ensure_ascii=False)[:1200])
