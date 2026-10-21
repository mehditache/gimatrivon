#!/usr/bin/env python3
"""בונה את נתוני הטור עם בית יוסף וב״ח למסך הקריאה: generated/tur/index.js + קבצי חלקים לכל טור (נטענים רק כשפותחים סימן בהם).
שימוש: python3 scripts/build-tur.py <תיקייה עם קובצי JSON מיצוא ספריא>
בתיקייה (מ-books.json של Sefaria-Export, מהדורת וילנא תרפ״ג): "Tur__<טור>, Vilna, 1923.json" לכל טור,
"Tur__Tur Orach Chaim, Vilna, 1923.json" (הקדמת הטור לאורח חיים), "Beit Yosef__Tur <טור>[,] Vilna, 1923.json" ו-"Bach__…" לכל טור,
Tur.schema.json (schemas/Tur.json של היצוא: שמות ההלכות וטווחי הסימנים, מבנה "Topic"), ו-links-tur.csv (שורות "מפרש, מקום","Tur, מקום" מתוך links*.csv של היצוא) לחושן משפט.
מבנה חלק: window.GIM_TUR_P['<טור>.<n>'] = {from, s: [[טור, [בית יוסף], [ב״ח]], …]} — סימן 0 = הקדמה (אם יש).
סימונים בטקסט: \\u0003…\\u0004 מודגש, \\n שורה חדשה, \\u0005…\\u0006 בדק הבית, \\u0010y3\\u0011 / \\u0010c3\\u0011 = כאן מתחיל
הדיבור ה-3 (מ-0) של בית יוסף / ב״ח. לכל דיבור יש סימן אחד בדיוק בטקסט הטור."""
import csv, json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1]
OUT = os.path.join(ROOT, 'generated', 'tur')
PART = 2_400_000  # כמו בש״ס: GitHub Pages קוטע קבצים גדולים
PARTS = [('OC', 'Orach Chayim', 'אורח חיים', 'Orach Chaim, Vilna, 1923', 'Tur Orach Chaim, Vilna, 1923'),
         ('YD', "Yoreh De'ah", 'יורה דעה', 'Yoreh Deah, Vilna, 1923', 'Tur Yoreh Deah, Vilna, 1923'),
         ('EH', 'Even HaEzer', 'אבן העזר', 'Even HaEzer, Vilna, 1923', 'Tur Even HaEzer, Vilna, 1923'),
         ('CM', 'Choshen Mishpat', 'חושן משפט', 'Choshen Mishpat, Vilna, 1923', 'Tur Choshen Mishpat Vilna, 1923')]
CM_NAME = {'Beit Yosef': 'y', 'Bach': 'c'}

def load(name):
    d = json.load(open(os.path.join(SRC, name + '.json'), encoding='utf-8-sig'))
    assert d.get('license') in ('Public Domain', 'unknown', None), (name, d.get('license'))  # unknown = רק הקדמת הטור לאו״ח (אותה מהדורת וילנא)
    return d['text']

def ent(s):
    return s.replace('&nbsp;', ' ').replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"')

def clean(s, keep_anchor=False):
    if keep_anchor:  # סימני העוגן של בית יוסף וב״ח נשמרים; של שאר המפרשים (דרישה, פרישה, הגהות) נמחקים
        s = re.sub(r'<i data-commentator="(Beit Yosef|Bach)" data-order="(\d+)(?:\.\d+)?"></i>',
                   lambda m: '\u0010' + CM_NAME[m.group(1)] + str(int(m.group(2)) - 1) + '\u0011', s)
    s = re.sub(r'<small>(.*?)</small>', '\u0005\\1\u0006', s)
    s = re.sub(r'<b>(.*?)</b>', '\u0003\\1\u0004', s)
    s = re.sub(r'<br\s*/?>', '\n', s)
    s = ent(re.sub(r'<[^>]+>', '', s))
    s = re.sub(r'\u0003\s*\u0004|\u0005\s*\u0006', '', s)
    s = re.sub(r'[ \t]+', ' ', s)
    s = re.sub(r' *\n *', '\n', s)
    return s.strip()

DH_END = re.compile(r"^(וכו['׳]?|כו['׳]?|וגו['׳]?)[.:]?$")
def comment(paras):
    """פסקאות של דיבור אחד → טקסט אחד, עם הדיבור המתחיל מודגש (עד וכו׳ או נקודה, בתוך 16 המילים הראשונות)."""
    t = ' '.join(clean(p) for p in paras if isinstance(p, str) and p.strip()).strip()
    if not t: return ''
    if t.startswith('\u0005') or t.startswith('\u0003'): return t
    ws = t.split(' ')
    for i, w in enumerate(ws[:16]):
        if '\u0005' in w or '\n' in w: break
        if DH_END.match(w) or (i > 0 and re.search(r'[א-ת]["׳\']?[.:]$', w)):
            return '\u0003' + ' '.join(ws[:i + 1]) + '\u0004 ' + ' '.join(ws[i + 1:])
    return t

def anchors(t):
    return [(m.group(1), int(m.group(2))) for m in re.finditer('\u0010([yc])(\\d+)\u0011', t)]

def fix_anchors(t, ny, nc):
    """לכל דיבור סימן אחד בדיוק: סימנים כפולים או מעבר למספר הדיבורים נמחקים, ודיבור בלי סימן מקבל סימן מיד אחרי
    הסימן של הדיבור הקודם שלו (או בתחילת הסימן)."""
    seen = set()
    def keep(m):
        k = (m.group(1), int(m.group(2)))
        if k in seen or k[1] >= (ny if k[0] == 'y' else nc): return ''
        seen.add(k); return m.group(0)
    t = re.sub('\u0010([yc])(\\d+)\u0011', keep, t)
    for c, n in (('y', ny), ('c', nc)):
        for i in range(n):
            if (c, i) in seen: continue
            mk = '\u0010' + c + str(i) + '\u0011'
            prev = '\u0010' + c + str(i - 1) + '\u0011'
            p = t.find(prev)
            t = t[:p + len(prev)] + mk + t[p + len(prev):] if p >= 0 else mk + t
            seen.add((c, i))
    return t

def cm_links():
    """חושן משפט: בית יוסף/ב״ח <סימן>:<מקטע>[:<דיבור>] → טור <סימן>:<מקטע>. מחזיר {(מפרש, סימן, מקטע במפרש): מקטע בטור}."""
    out = {}
    for a, b in csv.reader(open(os.path.join(SRC, 'links-tur.csv'), encoding='utf-8')):
        m = re.match(r'(Beit Yosef|Bach), Choshen Mishpat (\d+):(\d+)', a); n = re.match(r'Tur, Choshen Mishpat (\d+):(\d+)', b)
        if m and n and m.group(2) == n.group(1): out[(CM_NAME[m.group(1)], int(m.group(2)), int(m.group(3)))] = int(n.group(2))
    return out

def hilchot():
    """{טור: [[סימן ראשון, שם ההלכות], …]} מתוך המבנה החלופי "Topic" של ספריא."""
    d = json.load(open(os.path.join(SRC, 'Tur.schema.json'), encoding='utf-8'))
    out = {}
    for part in d['alts']['Topic']['nodes']:
        en = next(t['text'] for t in part['titles'] if t['lang'] == 'en' and t.get('primary'))
        out[en] = [[int(re.search(r'(\d+)(?:-\d+)?$', n['wholeRef']).group(1)), n['heTitle'] if 'heTitle' in n else next(t['text'] for t in n['titles'] if t['lang'] == 'he' and t.get('primary'))] for n in part['nodes']]
    return out

os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    os.remove(os.path.join(OUT, f))
LINKS = cm_links()
HIL = hilchot()
print({k: len(v) for k, v in HIL.items()})
index, total = [], 0
for key, en, he, tv, cv in PARTS:
    tur = load('Tur__' + tv)[en]
    by = load('Beit Yosef__' + cv)[en]
    bach = load('Bach__' + cv)[en]
    intro = tur['Introduction'] or (load('Tur__Tur Orach Chaim, Vilna, 1923')[en]['Introduction'] if key == 'OC' else [])
    by_intro = load('Beit Yosef__' + cv).get('Introduction') or []
    rows = []
    t0 = '\n'.join(clean(p) for p in intro if p.strip())
    y0 = [comment(by_intro)] if by_intro else []
    if t0 or y0: rows.append(['\u0010y0\u0011' + t0 if y0 else t0, y0, []])
    else: rows.append(['', [], []])
    body = tur['']
    stats = [0, 0, 0]
    for s, segs in enumerate(body):
        segs = [x for x in segs if isinstance(x, str)] or ['']
        Y = by[s] if s < len(by) else []
        C = bach[s] if s < len(bach) else []
        if key == 'CM':
            # חושן משפט: במפרשים הרמה האמצעית היא מקטע בטור; הדיבורים של מקטע מעוגנים בתחילת המקטע שלו בטור
            ys, cs, pre = [], [], [[] for _ in segs]
            for c, src, lst in (('y', Y, ys), ('c', C, cs)):
                for k, grp in enumerate(src):
                    for x in (grp if isinstance(grp, list) else [grp]):
                        t = comment([x] if isinstance(x, str) else x)
                        if not t: continue
                        seg = LINKS.get((c, s + 1, k + 1), k + 1) - 1
                        pre[min(max(seg, 0), len(segs) - 1)].append('\u0010' + c + str(len(lst)) + '\u0011'); lst.append(t)
            text = '\n'.join(''.join(pre[i]) + clean(re.sub(r'<i data-commentator[^>]*></i>', '', x)) for i, x in enumerate(segs))
        else:
            ys = [comment(x if isinstance(x, list) else [x]) for x in Y]
            cs = [comment(x if isinstance(x, list) else [x]) for x in C]
            text = '\n'.join(clean(x, True) for x in segs)
            # דיבורים ריקים נשארים כמקום ריק כדי שהמספור יתאים לסימנים; מסירים רק ריקים בסוף
            while ys and not ys[-1]: ys.pop()
            while cs and not cs[-1]: cs.pop()
        text = fix_anchors(text, len(ys), len(cs))
        rows.append([text, ys, cs])
        stats[0] += 1; stats[1] += len(ys); stats[2] += len(cs)
    while len(rows) > 1 and not rows[-1][0] and not rows[-1][1] and not rows[-1][2]: rows.pop()
    hil = HIL[next(k for k in HIL if k.replace(' ', '').lower()[:4] == en.replace(' ', '').lower()[:4])]
    parts, cur, size, start = [], [], 0, 0
    for j, row in enumerate(rows):
        sz = len(json.dumps(row, ensure_ascii=False).encode('utf-8'))
        if cur and size + sz > PART:
            parts.append((start, cur)); start, cur, size = j, [], 0
        cur.append(row); size += sz
    parts.append((start, cur))
    for pi, (st, rs) in enumerate(parts):
        out = json.dumps({'from': st, 's': rs}, ensure_ascii=False, separators=(',', ':'))
        fn = key + '.' + str(pi) + '.js'
        open(os.path.join(OUT, fn), 'w', encoding='utf-8').write('(window.GIM_TUR_P=window.GIM_TUR_P||{})[' + json.dumps(key + '.' + str(pi)) + ']=' + out + ';\n')
        total += len(out.encode('utf-8'))
    index.append({'k': key, 'he': he, 'en': en, 'n': len(rows), 'intro': bool(rows[0][0]), 'parts': [{'f': key + '.' + str(pi) + '.js', 'from': st} for pi, (st, _) in enumerate(parts)], 'hil': hil})
    print(key, stats[0], 'simanim', stats[1], 'Beit Yosef', stats[2], 'Bach', len(parts), 'parts', len(hil), 'hilchot')
open(os.path.join(OUT, 'index.js'), 'w', encoding='utf-8').write('window.GIM_TUR_INDEX=' + json.dumps(index, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(round(total / 1e6, 1), 'MB')
