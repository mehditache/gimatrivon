#!/usr/bin/env python3
"""בונה את generated/perek-names.js: שמות פרקי הש״ס ("בפרק אלו הן הלוקין") → המסכת והעמוד שבו הפרק מתחיל בבבלי.
שם הפרק = מילות הפתיחה של המשנה הראשונה בפרק (כך נקראים הפרקים). מיקום = הקטע בבבלי שמתחיל ב-"מתני׳" ובאותן מילים.
רק שמות חד-משמעיים נכנסים לטבלה (מפתח שמופיע בשני פרקים שונים נשמט). הרצה: python3 scripts/build-perek.py"""
import json, re, glob, os, collections
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NIK = re.compile(r'[֑-ׇ]')
def norm(s):
    s = NIK.sub('', s).replace('\x01', '').replace('\x02', '')
    s = re.sub(r'[^א-ת ]', ' ', s.replace('־', ' '))
    return s.split()
def load(p):
    t = open(p, encoding='utf-8').read(); return json.loads(t[t.index('={') + 1:].rstrip(';\n'))
idx = json.loads(re.search(r'=(\[.*\]);?\s*$', open(f'{ROOT}/generated/talmud/index.js', encoding='utf-8').read(), re.S).group(1))
mish = {}
for f in glob.glob(f'{ROOT}/data/Mishnah/*/*.json'):
    d = json.load(open(f, encoding='utf-8-sig'))
    if 'heTitle' in d and 'text' in d: mish[d['heTitle'].replace('משנה ', '', 1)] = d['text']
def key_words(w):
    return ([w[0][1:]] if len(w[0]) >= 4 and w[0][0] == 'ו' else w[:1]) + w[1:4]
allc = collections.defaultdict(set)
for he, chs in mish.items():
    for c, ch in enumerate(chs, 1):
        w = norm(ch[0]) if ch else []
        if len(w) >= 2:
            kw = key_words(w)
            for n in range(1, len(kw) + 1): allc[' '.join(kw[:n])].add((he, c))
rows, miss = [], []
for t in idx:
    if t.get('z') or t['he'] not in mish: continue
    segs = []  # (j, s, words)
    for part in t['parts']:
        j0 = load(f'{ROOT}/generated/talmud/{part["f"]}')
        for dj, daf in enumerate(j0['a']):
            for si, sg in enumerate(daf[0] if daf and isinstance(daf[0], list) else []):
                if isinstance(sg, str) and sg.startswith('מתני'): segs.append((j0['from'] + dj, si, norm(sg)[1:]))
    pos = 0
    for c, ch in enumerate(mish[t['he']], 1):
        first = norm(ch[0]) if ch else []
        if len(first) < 2: miss.append((t['he'], c)); continue
        for k in range(pos, len(segs)):
            w = segs[k][2]
            if w[:2] == first[:2]:
                rows.append((t['he'], t['k'], c, segs[k][0], first[:4])); pos = k + 1; break
        else: miss.append((t['he'], c))
print('found', len(rows), 'missing', len(miss), miss[:20])
out = {}
for he, k, c, j, w in rows:
    kw = key_words(w)
    for n in range(1, len(kw) + 1):
        key = ' '.join(kw[:n])
        if len(allc[key]) == 1: out[key] = [k, j]
print('keys', len(out))
open(f'{ROOT}/generated/perek-names.js', 'w', encoding='utf-8').write('// נבנה ב-scripts/build-perek.py — לא לערוך\nwindow.GIM_PEREK=' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
