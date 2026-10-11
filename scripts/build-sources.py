#!/usr/bin/env python3
"""מוסיף לקורפוס (generated/corpus.bundle.js) את רש״י, אונקלוס ותרגום יונתן. תנ״ך+משנה אינם משתנים.
שימוש: python3 scripts/build-sources.py <תיקיית go/data (Rashi, Targum Jonathan)> <תיקיית Onkelos>
יחידה: [קטגוריה, ספר, פרק/דף, מספר, טקסט, הערה(k), צד-דף(s)] — קטגוריה: 0 תנ״ך, 1 משנה, 2 רש״י, 3 אונקלוס, 4 תרגום יונתן."""
import json, re, sys, glob, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GO, ONK = sys.argv[1], sys.argv[2]
BUNDLE = os.path.join(ROOT, 'generated', 'corpus.bundle.js')
PFX = 'window.CORPUS_BUNDLE='
B = json.loads(open(BUNDLE, encoding='utf-8').read()[len(PFX):].strip().rstrip(';'))
B['books'] = [b for b in B['books'] if b['cat'] < 2] if 'cat' in B['books'][0] else B['books']
manifest = json.load(open(os.path.join(ROOT, 'generated', 'corpus-manifest.json'), encoding='utf-8'))
SEDER = {'Torah': 'תורה', 'Prophets': 'נביאים', 'Writings': 'כתובים', 'Seder Zeraim': 'סדר זרעים', 'Seder Moed': 'סדר מועד', 'Seder Nashim': 'סדר נשים', 'Seder Nezikin': 'סדר נזיקין', 'Seder Kodashim': 'סדר קדשים', 'Seder Tahorot': 'סדר טהרות'}
CATS = ['תנ״ך', 'משנה', 'רש״י', 'תרגום אונקלוס', 'תרגום יונתן']
for i, b in enumerate(B['books']):  # קבוצת עץ המקורות לספרים הקיימים
    m = manifest[i]; assert m['title'] == b['title'], (m['title'], b['title'])
    b['cat'] = 0 if b['category'] == 'תנ״ך' else 1; b['g'] = SEDER.get(m['seder'], m['seder']); b['kind'] = 'verse' if b['cat'] == 0 else 'mishnah'
B['units'] = [u for u in B['units'] if u[0] < 2]
HE = {b['title']: b['heTitle'] for b in B['books'] if b['cat'] == 0}
def clean(s):
    s = re.sub(r'<sup[^>]*>.*?</sup>|<i class="footnote">.*?</i>|<small>.*?</small>|<img[^>]*>', ' ', s)
    s = re.sub(r'<[^>]+>', '', s); s = re.sub(r'\{[^}]*\}|׆|[*A-Za-z]', ' ', s)
    return re.sub(r'[\u0591-\u05AF]', '', s).strip()  # טעמים מוסרים; ניקוד נשמר
def add_book(cat, title, he, group, kind, units, warn):
    bi = len(B['books']); n = 0; L = 0
    for u in units:
        t = clean(u[3]); 
        if not re.search('[א-ת]', t): continue
        B['units'].append([cat, bi, u[0], u[1], t, u[2], u[4]]); n += 1; L += len(re.findall('[א-ת]', t))
    B['books'].append({'heTitle': he, 'title': title, 'category': CATS[cat], 'cat': cat, 'g': group, 'kind': kind, 'chapters': len({u[0] for u in units}), 'segments': n, 'hebrewLetters': L, 'status': 'warning' if warn else 'ok'})
def flat(t, depth):  # (chIdx, n, k, text, side) מעמודי sefaria; כל אינדקס 1-בסיסי
    def rec(x, path):
        if isinstance(x, list):
            for i, e in enumerate(x): yield from rec(e, path + [i + 1])
        elif isinstance(x, str) and x.strip(): yield path, x
    return rec(t, [])
for f in sorted(glob.glob(os.path.join(GO, 'Rashi', '*.json'))):
    d = json.load(open(f, encoding='utf-8-sig')); sn = d['sectionNames']; c = d['categories']; he = d['heTitle'].replace('רש"י על ', '').replace('רש״י על ', '')
    seder = next((SEDER[x] for x in c if x in SEDER), None)
    if c[0] == 'Talmud':
        kind = 'talmud'; group = 'ש״ס ' + seder; us = []
        for p, s in flat(d['text'], 0):
            if len(p) == 2: us.append((2 + (p[0] - 1) // 2, p[1], 0, s, 1 + (p[0] - 1) % 2))
            else: us.append((2 + (p[0] - 1) // 2, p[1], p[2], s, 1 + (p[0] - 1) % 2))
    else:
        kind = 'comm'; group = {'Tanakh': seder, 'Mishnah': 'משנה', 'Midrash': 'מדרש'}[c[0]]; us = [(p[0], p[1], p[2], s, 0) for p, s in flat(d['text'], 0)]
    add_book(2, d['title'], he, group, kind, us, False)
for f in sorted(glob.glob(os.path.join(GO, 'Targum Jonathan', '*.json'))):
    d = json.load(open(f, encoding='utf-8-sig')); he = d['heTitle'].replace('תרגום יונתן על ', '')
    add_book(4, d['title'], he, SEDER[d['categories'][-1]], 'verse', [(p[0], p[1], 0, s, 0) for p, s in flat(d['text'], 0)], False)
for t, v in json.load(open(os.path.join(ONK, 'Onkelos.json'), encoding='utf-8-sig')).items():
    us = [(int(ch), i + 1, 0, s, 0) for ch, vs in v.items() for i, s in enumerate(vs)]
    add_book(3, t, HE[t], 'תורה', 'verse', us, False)
cnt = lambda c: sum(1 for u in B['units'] if u[0] == c)
B['stats'] = {'tanakh': cnt(0), 'mishnah': cnt(1), 'rashi': cnt(2), 'onkelos': cnt(3), 'yonatan': cnt(4)}
B['report']['checks'] = [c for c in B['report']['checks'] if not c['name'].startswith('מקורות נוספים')] + [
  {'name': 'מקורות נוספים: רש״י %d ספרים · אונקלוס %d · תרגום יונתן %d' % tuple(sum(1 for b in B['books'] if b['cat'] == k) for k in (2, 3, 4)), 'ok': True},
  {'name': 'מקורות נוספים: אין יחידה ללא אותיות עבריות; תגיות, הערות שוליים וטעמים הוסרו', 'ok': all(re.search('[א-ת]', u[4]) for u in B['units'])}]
open(BUNDLE, 'w', encoding='utf-8').write(PFX + json.dumps(B, ensure_ascii=False, separators=(',', ':')) + ';')
print(B['stats'], len(B['books']), 'books', os.path.getsize(BUNDLE) // 1e6, 'MB')
