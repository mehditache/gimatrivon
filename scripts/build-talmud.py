#!/usr/bin/env python3
"""בונה את נתוני הש״ס למסך הקריאה: generated/talmud/index.js + קבצי חלקים לכל מסכת (נטענים רק כשפותחים מסכת).
שימוש: python3 scripts/build-talmud.py <תיקייה עם קובצי JSON מיצוא ספריא>
בתיקייה (מ-books.json של Sefaria-Export, שפה עברית): לכל מסכת <Title>.json בגרסת "Wikisource Talmud Bavli",
"Rashi on <Title>.json" ו-"Tosafot on <Title>.json" בגרסת "Vilna Edition", ו-"Rashbam on Bava Batra__Vilna Edition.json".
מבנה חלק: window.GIM_TP['<מסכת>.<n>'] = {from, a: [[גמרא, רש״י, תוספות, רשב״ם?], …]} — amud j = דף (j>>1)+2, עמוד א/ב לפי j&1.
גמרא = [קטעים]; מפרש = [[קטע, דיבור המתחיל, פירוש], …]. סימונים בטקסט: \\u0001…\\u0002 מילה גדולה, \\u0003…\\u0004 מודגש."""
import json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1]
OUT = os.path.join(ROOT, 'generated', 'talmud')
PART = 2_400_000  # GitHub Pages קוטע קבצים גדולים (ראו scripts/split-corpus.js) — חלקים קטנים
ORDER = [('סדר זרעים', ['Berakhot']),
         ('סדר מועד', ['Shabbat', 'Eruvin', 'Pesachim', 'Rosh Hashanah', 'Yoma', 'Sukkah', 'Beitzah', 'Taanit', 'Megillah', 'Moed Katan', 'Chagigah']),
         ('סדר נשים', ['Yevamot', 'Ketubot', 'Nedarim', 'Nazir', 'Sotah', 'Gittin', 'Kiddushin']),
         ('סדר נזיקין', ['Bava Kamma', 'Bava Metzia', 'Bava Batra', 'Sanhedrin', 'Makkot', 'Shevuot', 'Avodah Zarah', 'Horayot']),
         ('סדר קדשים', ['Zevachim', 'Menachot', 'Chullin', 'Bekhorot', 'Arakhin', 'Temurah', 'Keritot', 'Meilah', 'Tamid']),
         ('סדר טהרות', ['Niddah'])]
manifest = json.load(open(os.path.join(ROOT, 'generated', 'corpus-manifest.json'), encoding='utf-8'))
HE = {m['title'].replace('Mishnah ', '').replace("'", ''): m['heTitle'].replace('משנה ', '') for m in manifest if m['title'].startswith('Mishnah ')}

def load(name):
    p = os.path.join(SRC, name + '.json')
    if not os.path.exists(p): return None, None
    d = json.load(open(p, encoding='utf-8-sig'))
    return d['text'], d

def clean(s):
    s = re.sub(r'<img[^>]*>', ' [ציור] ', s)
    s = re.sub(r'<big>\s*<(?:strong|b)>(.*?)</(?:strong|b)>\s*</big>', '\u0001\\1\u0002', s)
    s = re.sub(r'<(?:strong|b)>(.*?)</(?:strong|b)>', '\u0003\\1\u0004', s)
    s = re.sub(r'<br\s*/?>', ' ', s)
    s = re.sub(r'<[^>]+>', '', s)
    s = s.replace('&nbsp;', ' ').replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"')
    s = re.sub(r'\u0003\s*\u0004|\u0001\s*\u0002', '', s)
    return re.sub(r'\s+', ' ', s).strip()

def comm(amud):
    out = []
    for seg, line in enumerate(amud or []):
        for c in (line if isinstance(line, list) else [line]):
            if not isinstance(c, str) or not c.strip(): continue
            c = clean(c)
            if not c: continue
            m = re.match(r'(.{1,120}?)\s+[-–]\s+(.*)', c)
            dh, body = (m.group(1), m.group(2)) if m else ('', c)
            out.append([seg, dh.replace('\u0003', '').replace('\u0004', ''), body])
    return out

os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    os.remove(os.path.join(OUT, f))
index, total = [], 0
for seder, names in ORDER:
    for k in names:
        g, meta = load(k)
        if g is None: sys.exit('missing gemara: ' + k)
        r, _ = load('Rashi on ' + k); t, _ = load('Tosafot on ' + k)
        rb = load('Rashbam on Bava Batra__Vilna Edition')[0] if k == 'Bava Batra' else None
        amudim = []
        n = len(g)
        while n > 2 and not any(isinstance(x, str) and x.strip() for x in g[n - 1]): n -= 1
        for i in range(2, n):
            gem = [clean(x) for x in g[i] if isinstance(x, str)]
            ra = comm(r[i] if r and i < len(r) else None)
            row = [gem, ra, comm(t[i] if t and i < len(t) else None)]
            if not ra and rb and i < len(rb):
                row[1] = comm(rb[i]); row.append(1)  # בבא בתרא מדף כט.: רשב״ם במקום רש״י, כמו בדפוס וילנא
            amudim.append(row)
        parts, cur, size, start = [], [], 0, 0
        for j, row in enumerate(amudim):
            s = len(json.dumps(row, ensure_ascii=False).encode('utf-8'))
            if cur and size + s > PART:
                parts.append((start, cur)); start, cur, size = j, [], 0
            cur.append(row); size += s
        parts.append((start, cur))
        for pi, (st, rows) in enumerate(parts):
            body = json.dumps({'from': st, 'a': rows}, ensure_ascii=False, separators=(',', ':'))
            fn = re.sub(r'\W', '', k) + '.' + str(pi) + '.js'
            open(os.path.join(OUT, fn), 'w', encoding='utf-8').write('(window.GIM_TP=window.GIM_TP||{})[' + json.dumps(k + '.' + str(pi)) + ']=' + body + ';\n')
            total += len(body.encode('utf-8'))
        index.append({'k': k, 'he': HE.get(k, k), 'g': seder, 'n': len(amudim), 'parts': [{'f': fn, 'from': st, 'b': os.path.getsize(os.path.join(OUT, fn))} for st, fn in ((st, re.sub(r'\W', '', k) + '.' + str(pi) + '.js') for pi, (st, _) in enumerate(parts))],
                      'rashi': bool(r), 'tosafot': bool(t)})
open(os.path.join(OUT, 'index.js'), 'w', encoding='utf-8').write('window.GIM_TALMUD_INDEX=' + json.dumps(index, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(len(index), 'tractates', sum(len(x['parts']) for x in index), 'parts', round(total / 1e6, 1), 'MB')
