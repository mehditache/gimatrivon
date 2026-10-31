#!/usr/bin/env python3
"""בונה את נתוני השולחן ערוך (ארבעת החלקים) עם משנה ברורה, ביאור הלכה ושאר המפרשים למסך הקריאה:
generated/sa/index.js + קבצי חלקים לכל חלק (נטענים רק כשפותחים סימן בהם). אותו מודל כמו הטור (scripts/build-tur.py).
שימוש: python3 scripts/build-sa.py <תיקייה עם קובצי JSON מיצוא ספריא (Sefaria-Export)>
קבצים בתיקייה (שם הקובץ ← הספר והגרסה ב-books.json של היצוא):
  SA-OC / SA-YD / SA-EH / SA-CM .json  ← "Shulchan Arukh, <חלק>", Hebrew: Torat Emet 363 (OC, CM), Torat Emet 357 (YD, EH). מנוקד.
  LB-OC / LB-YD / LB-EH / LB-CM .json  ← אותו ספר, מהדורות למברג (Maginei Eretz 1893, Ashlei Ravrevei 1888, Apei Ravrevei 1886, Hoshen ha-Mishpat 1898).
        משמשות רק למקומות העוגנים (<i data-commentator=…>) של המפרשים בתוך הטקסט; מיושרים מילה במילה לטקסט המנוקד.
  MB-OYW.json ("Mishnah Berurah", On Your Way, סימנים 187-697, Public Domain), MB-eu5.json ("eu5 text", סימנים 2-186, רישיון לא מתועד),
  BH.json ("Biur Halacha", Public Domain), TAZ-YD.json, SK-YD.json, SK-CM.json, SMA-CM.json (מאירת עיניים), BS-EH.json (בית שמואל),
  CHM-EH.json (חלקת מחוקק) — כולם מהדורות Lemberg / Vilna 1876 (Public Domain);
  schema-OC/YD/EH/CM.json ← schemas/Shulchan_Arukh,_<חלק>.json של היצוא (שמות ההלכות וטווחי הסימנים, מבנה "Topic");
  links-sa.csv ← שורות מתוך links*.csv של היצוא: "Biur Halacha <סימן>:<סעיף>:<דיבור>","Shulchan Arukh, Orach Chayim <סימן>:<סעיף>".
מבנה חלק: window.GIM_TUR_P['<חלק>.<n>'] = {from, s: [[טקסט, [מפרש 1], [מפרש 2]], …]} — כמו בטור; סימן 0 = ריק.
סימונים בטקסט: \\u0003…\\u0004 מודגש, \\n שורה חדשה (סעיף חדש), \\u0005…\\u0006 הגהה (רמ״א), \\u0010y3\\u0011 / \\u0010c3\\u0011 = כאן מתחיל
הדיבור ה-3 (מ-0) של המפרש הראשון / השני."""
import csv, difflib, json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1]
OUT = os.path.join(ROOT, 'generated', 'sa')
PART = 2_400_000  # כמו בטור ובש״ס: GitHub Pages קוטע קבצים גדולים
# מפתח, שם באנגלית, שם בעברית, מפרש ראשון (y) ושני (c): (קובץ, שם העוגן בלמברג, שם בעברית, סוג עוגן: 'label' = לפי סדר הופעה, 'order' = data-order)
PARTS = [
    ('SOC', 'OC', 'Orach Chayim', 'אורח חיים', ('MB', 'Mishnah Berurah', 'משנה ברורה', 'seq'), ('BH', None, 'ביאור הלכה', 'links')),
    ('SYD', 'YD', "Yoreh De'ah", 'יורה דעה', ('SK-YD', 'Siftei Kohen', 'ש״ך', 'order'), ('TAZ-YD', 'Turei Zahav', 'ט״ז', 'order')),
    ('SEH', 'EH', 'Even HaEzer', 'אבן העזר', ('CHM-EH', 'Chelkat Mechokek', 'חלקת מחוקק', 'order'), ('BS-EH', 'Beit Shmuel', 'בית שמואל', 'order')),
    ('SCM', 'CM', 'Choshen Mishpat', 'חושן משפט', ('SMA-CM', "Me'irat Einayim", 'סמ״ע', 'order'), ('SK-CM', 'Siftei Kohen', 'ש״ך', 'order')),
    ('KOC', 'OC', 'Orach Chayim, with Kaf HaChayim', 'אורח חיים · כף החיים', ('KHOC', None, 'כף החיים', 'links'), ('TAZ-OC', 'Turei Zahav', 'ט״ז', 'order')),
    ('KYD', 'YD', "Yoreh De'ah, with Kaf HaChayim", 'יורה דעה · כף החיים', ('KHYD', None, 'כף החיים', 'links'), ('BH-YD', "Ba'er Hetev", 'באר היטב', 'order')),
]
# מפרשים נוספים לתצוגת "הלכות ומפרשים" (דף שלם כמו בדפוס): (קוד, קובץ, שם העוגן בלמברג, שם בעברית, סוג עוגן: order / seq / struct)
EXTRA = {
    'OC': [('g', 'BG-OC', "Be'er HaGolah", 'באר הגולה', 'order'), ('t', 'BT-OC', "Ba'er Hetev", 'באר היטב', 'order'), ('s', 'ST-OC', "Sha'arei Teshuvah", 'שערי תשובה', 'seq'),
           ('m', 'MA', 'Magen Avraham', 'מגן אברהם', 'order'), ('r', 'GRA-OC', None, 'ביאור הגר״א', 'struct')],
    'YD': [('g', 'BG-YD', "Be'er HaGolah", 'באר הגולה', 'order'), ('t', 'BT-YD', "Ba'er Hetev", 'באר היטב', 'order'), ('r', 'GRA-YD', 'Beur HaGra', 'ביאור הגר״א', 'order')],
    'EH': [('g', 'BG-EH', "Be'er HaGolah", 'באר הגולה', 'order'), ('t', 'BT-EH', "Ba'er Hetev", 'באר היטב', 'order'), ('r', 'GRA-EH', 'Beur HaGra', 'ביאור הגר״א', 'order')],
    'CM': [('g', 'BG-CM', "Be'er HaGolah", 'באר הגולה', 'order'), ('t', 'BT-CM', "Ba'er Hetev", 'באר היטב', 'order'), ('r', 'GRA-CM', 'Beur HaGra', 'ביאור הגר״א', 'order')],
}
NIK = re.compile('[֑-ׇ]')

def load(name, lic=('Public Domain', 'unknown', None)):
    d = json.load(open(os.path.join(SRC, name + '.json'), encoding='utf-8-sig'))
    assert d.get('license') in lic, (name, d.get('license'))
    return d['text']

def sim(t):  # רשימת הסימנים (בחלק עם סעיפי "סדר" נוספים: רק הגוף)
    return t[''] if isinstance(t, dict) else t

def flat(x):
    if isinstance(x, str):
        if x.strip(): yield x
    elif isinstance(x, list):
        for y in x: yield from flat(y)

def ent(s):
    return s.replace('&nbsp;', ' ').replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"')

def clean(s):
    s = re.sub(r'<small>(.*?)</small>', '\u0005\\1\u0006', s, flags=re.S)
    s = re.sub(r'<b>(.*?)</b>', '\u0003\\1\u0004', s, flags=re.S)
    s = re.sub(r'<br\s*/?>', '\n', s)
    s = ent(re.sub(r'<[^>]+>', '', s))
    s = re.sub(r'\u0003\s*\u0004|\u0005\s*\u0006', '', s)
    s = re.sub(r'[ \t]+', ' ', s)
    s = re.sub(r' *\n *', '\n', s)
    return s.strip()

DH_END = re.compile(r"^(וכו['׳]?|כו['׳]?|וגו['׳]?)[.:]?$")
def comment(paras, mb=False, strip=False):
    """קטע אחד של מפרש → טקסט עם הדיבור המתחיל מודגש. במשנה ברורה: "(א) דיבור - הסבר"."""
    t = ' '.join(clean(p) for p in paras if isinstance(p, str) and p.strip()).strip()
    if not t: return ''
    t = re.sub(r'^[(\[]([א-ת"׳\']{1,5})[)\]]\s*', '', t) if mb or strip else t  # המספר ("(א)") נוסף בתצוגה
    if t.startswith('\u0003'): return t
    if mb or ' - ' in t[:120]:
        m = re.match(r'^(.{1,120}?) [-–] (.*)$', t, re.S)
        if m and len(m.group(1).split(' ')) <= 14: return '\u0003' + m.group(1) + '\u0004 ' + m.group(2)
    ws = t.split(' ')
    for i, w in enumerate(ws[:16]):
        if '\u0005' in w or '\n' in w: break
        if DH_END.match(w) or (i > 0 and re.search(r'[א-ת]["׳\']?[.:]$', w)):
            return '\u0003' + ' '.join(ws[:i + 1]) + '\u0004 ' + ' '.join(ws[i + 1:])
    return t

def key(w):
    return re.sub(r'[^א-ת]', '', NIK.sub('', w))

AN = re.compile(r'<i data-commentator="([^"]+)"([^>]*)></i>')
def lemberg_words(seifs):
    """סעיפי למברג → (מילים, עוגנים [(מקום במילים, מפרש, data-order או None)])."""
    words, anchors = [], []
    for s in seifs:
        parts = AN.split(s)  # טקסט, שם, תכונות, טקסט, …
        for i in range(0, len(parts), 3):
            seg = re.sub(r'<[^>]+>', ' ', ent(parts[i]))
            words += [w for w in seg.split() if key(w)]
            if i + 2 < len(parts):
                o = re.search(r'data-order="(\d+)', parts[i + 2])
                anchors.append((len(words), parts[i + 1], int(o.group(1)) if o else None))
    return words, anchors

def align(lw, anchors, toks):
    """מיקום כל עוגן של למברג בטוקני הטקסט המנוקד: מיד אחרי המילה המתאימה האחרונה שלפניו. מחזיר [(מקום בטוקנים, מפרש, order)]."""
    B = [i for i, t in enumerate(toks) if t != '\n' and key(re.sub(r'[\u0003-\u0006]', '', t))]
    bk = [key(re.sub(r'[\u0003-\u0006]', '', toks[i])) for i in B]
    ak = [key(w) for w in lw]
    sm = difflib.SequenceMatcher(None, ak, bk, autojunk=False)
    amap = {}
    for a, b, n in sm.get_matching_blocks():
        for k in range(n): amap[a + k] = b + k
    out = []
    for pos, name, o in anchors:
        j = pos - 1
        while j >= 0 and j not in amap: j -= 1
        out.append(((B[amap[j]] + 1) if j >= 0 else 0, name, o))
    return out

def hilchot(k):
    d = json.load(open(os.path.join(SRC, 'schema-' + k + '.json'), encoding='utf-8'))
    out = []
    for n in d['alts']['Topic']['nodes']:
        he = n.get('heTitle') or next(t['text'] for t in n['titles'] if t['lang'] == 'he' and t.get('primary'))
        out.append([int(re.search(r'(\d+)(?:-\d+)?$', n['wholeRef']).group(1)), he])
    return out

def sa_links():
    """{(מפרש, סימן, מספר בסימן): סעיף בשולחן ערוך} מ-links-sa.csv. BH: סימן:סעיף:דיבור → סעיף (הסעיף שבקישור הוא של הביאור,
    והקישור מחזיר את סעיף השולחן ערוך); KH: סימן:מספר:1 → סעיף."""
    out = {}
    for row in csv.reader(open(os.path.join(SRC, 'links-sa.csv'), encoding='utf-8')):
        a, b = row[0], row[1]
        m = re.match(r'Biur Halacha (\d+):(\d+):(\d+)$', a) or re.match(r'Kaf HaChayim on Shulchan Arukh, (?:Orach Chayim|Yoreh De\'ah) (\d+):(\d+):(\d+)$', a)
        n = re.match(r"Shulchan Arukh, (?:Orach Chayim|Yoreh De'ah) (\d+):(\d+)$", b)
        if not (m and n and m.group(1) == n.group(1)): continue
        nm = 'BH' if a.startswith('Biur') else ('KHOC' if 'Orach' in a else 'KHYD')
        out[(nm, int(m.group(1)), int(m.group(2)), int(m.group(3)) if nm == 'BH' else 1)] = int(n.group(2))
    return out

def find_dh(dh, toks, lo, hi):
    """מקום סוף דיבור ההתחלה של ביאור הלכה בתוך טוקני הסעיף [lo,hi): המילים הראשונות שלו (עד 4) ברצף; לא נמצא → סוף הסעיף."""
    ws = [key(w) for w in re.sub(r'[\u0003-\u0006]', '', dh).split() if key(w)][:4]
    idx = [i for i in range(lo, hi) if toks[i] != '\n' and key(re.sub(r'[\u0003-\u0006]', '', toks[i]))]
    ks = [key(re.sub(r'[\u0003-\u0006]', '', toks[i])) for i in idx]
    for n in range(len(ws), 0, -1):
        for a in range(len(ks) - n + 1):
            if ks[a:a + n] == ws[:n]: return idx[a + n - 1] + 1
    return hi

def fix_anchors(items, n, tag):
    """items = [(מקום, אינדקס)] → סימן אחד בדיוק לכל דיבור: כפולים או מעבר ל-n נמחקים; חסר מקבל מקום מיד אחרי הקודם לו (או 0)."""
    seen = {}
    for pos, i in items:
        if 0 <= i < n and i not in seen: seen[i] = pos
    last = 0
    for i in range(n):
        if i in seen: last = seen[i]
        else: seen[i] = last
    return seen

def stream(code, n_s, L):
    """מפרש → ([רשימת קטעים לכל סימן], [רשימת סעיף-שולחן-ערוך לכל קטע, או None])."""
    lst, sq = [], []
    for s in range(n_s):
        cm, sc = [], []
        if code == 'MB':
            a, b = sim(load('MB-OYW')), sim(load('MB-eu5'))
            src = a[s] if s < len(a) and any(flat(a[s])) else (b[s] if s < len(b) else [])
            cm = [comment([x], True) for x in flat(src)]
        elif code == 'BH':
            t = sim(load('BH')); grp = t[s] if s < len(t) else []
            for qi, g in enumerate(grp):
                for di, x in enumerate(g if isinstance(g, list) else [g]):
                    if isinstance(x, str) and x.strip(): cm.append(comment([x])); sc.append(L.get(('BH', s + 1, qi + 1, di + 1), qi + 1))
        elif code in ('KHOC', 'KHYD'):
            for fn in KH[code]:
                t = fn[s] if s < len(fn) else []
                if any(flat(t)): 
                    for ni, g in enumerate(t):
                        x = ' '.join(flat(g))
                        cm.append(comment([x]) if x.strip() else ''); sc.append(L.get((code, s + 1, ni + 1, 1)))
                    break
        else:
            t = sim(load(code)); cm = [comment([x]) for x in flat(t[s])] if s < len(t) else []
        lst.append(cm); sq.append(sc)
    return lst, sq

KH = {'KHOC': [sim(load('KH-OC-2')), sim(load('KH-OC-1'))], 'KHYD': [sim(load('KH-YD'))]}
LINKS = sa_links()
os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    os.remove(os.path.join(OUT, f))
index, total = [], 0
for key_, k2, en, he, y, c in PARTS:
    sa = sim(load('SA-' + k2)); lb = sim(load('LB-' + k2)); n_s = len(sa)
    hil = hilchot(k2); first = {s: nm for s, nm in hil}
    S = [stream(x[0], n_s, LINKS) for x in (y, c)]
    XD = {code: sim(load(f, ('Public Domain', 'unknown', None))) for code, f, *_ in (EXTRA.get(k2, []) if key_[0] == 'S' else [])}
    rows = [['', [], []]]
    stats = [0, 0, 0]
    for s in range(n_s):
        seifs = [clean(x) for x in sa[s] if isinstance(x, str)] or ['']
        toks = []
        for q, sf in enumerate(seifs):
            if q: toks.append('\n')
            toks += [w for w in sf.replace('\n', ' \n ').split(' ') if w]
        lw, anch = lemberg_words(lb[s] if s < len(lb) else [])
        placed = align(lw, anch, toks)
        starts = [0] + [i + 1 for i, t in enumerate(toks) if t == '\n']
        ends = [i for i, t in enumerate(toks) if t == '\n'] + [len(toks)]
        byp = {}
        for si, spec in enumerate((y, c)):
            xc, mode, lname = 'yc'[si], spec[3], spec[1]
            cm, sq = S[si][0][s], S[si][1][s]
            if mode == 'seq': items = [(p, o) for o, (p, nm, _) in enumerate(q for q in placed if q[1] == lname)]
            elif mode == 'order': items = [(p, o - 1) for p, nm, o in placed if nm == lname and o]
            else:
                items, prev = [], 0
                for gi, t in enumerate(cm):
                    q = sq[gi] if gi < len(sq) and sq[gi] else (items and 0)
                    if not q: continue
                    q = min(max(q, 1), len(seifs)) - 1
                    m = re.match('^\u0003(.*?)\u0004', t)
                    pos = max(find_dh(m.group(1) if m else t[:60], toks, starts[q], ends[q]), prev); prev = pos
                    items.append((pos, gi))
            fx = fix_anchors(items, len(cm), xc)
            for i in range(len(cm)): byp.setdefault(fx[i], []).append((xc, i))
        def assemble(by):
            out = []
            for i in range(len(toks) + 1):
                for xc, j in sorted(by.get(i, []), key=lambda z: ('yc' + 'gtsmr').index(z[0]) * 1000 + z[1]): out.append('\u0010' + xc + str(j) + '\u0011')
                if i < len(toks): out.append(toks[i])
            t = re.sub(r' *\n *', '\n', ' '.join(out).replace('\n ', '\n').replace(' \n', '\n'))
            return '\u0003' + first[s + 1] + '\u0004\n' + t if s + 1 in first else t
        text = assemble(byp)
        extras, byp2 = {}, {k: list(v) for k, v in byp.items()}
        for code, f, lname, hname, mode in (EXTRA.get(k2, []) if key_[0] == 'S' else []):
            T = XD[code]
            if mode == 'struct':
                cm, sq = [], []
                for qi, g in enumerate(T[s] if s < len(T) else []):
                    for x in flat(g): cm.append(comment([x], False, True)); sq.append(qi + 1)
                items, prev = [], 0
                for gi, t in enumerate(cm):
                    q = min(max(sq[gi], 1), len(seifs)) - 1
                    m = re.match('^\u0003(.*?)\u0004', t)
                    pos = max(find_dh(m.group(1) if m else t[:60], toks, starts[q], ends[q]), prev); prev = pos
                    items.append((pos, gi))
            else:
                cm = [comment([x], False, True) for x in flat(T[s])] if s < len(T) else []
                items = [(p, o) for o, (p, nm, _) in enumerate(q for q in placed if q[1] == lname)] if mode == 'seq' else [(p, o - 1) for p, nm, o in placed if nm == lname and o]
            fx = fix_anchors(items, len(cm), code)
            for i in range(len(cm)): byp2.setdefault(fx[i], []).append((code, i))
            if any(cm): extras[code] = cm
        tb = assemble(byp2) if extras else None
        ys, cs = list(S[0][0][s]), list(S[1][0][s])
        while ys and not ys[-1]: ys.pop()
        while cs and not cs[-1]: cs.pop()
        rows.append([text, ys, cs] + ([tb, extras] if extras else []))
        stats[0] += 1; stats[1] += len(ys); stats[2] += len(cs)
    while len(rows) > 1 and not rows[-1][0] and not rows[-1][1] and not rows[-1][2]: rows.pop()
    parts, cur, size, start = [], [], 0, 0
    for j, row in enumerate(rows):
        sz = len(json.dumps(row, ensure_ascii=False).encode('utf-8'))
        if cur and size + sz > PART:
            parts.append((start, cur)); start, cur, size = j, [], 0
        cur.append(row); size += sz
    parts.append((start, cur))
    pinfo = []
    for pi, (st, rs) in enumerate(parts):
        out = json.dumps({'from': st, 's': rs}, ensure_ascii=False, separators=(',', ':'))
        fn = key_ + '.' + str(pi) + '.js'
        open(os.path.join(OUT, fn), 'w', encoding='utf-8').write('(window.GIM_TUR_P=window.GIM_TUR_P||{})[' + json.dumps(key_ + '.' + str(pi)) + ']=' + out + ';\n')
        total += len(out.encode('utf-8')); pinfo.append({'f': fn, 'from': st, 'b': len(out.encode('utf-8'))})
    index.append({'k': key_, 'he': 'שולחן ערוך ' + he, 'en': 'Shulchan Arukh, ' + en, 'n': len(rows), 'intro': False, 'sa': 1, 'a': k2, 'dir': 'sa', **({'kh': 1} if key_[0] == 'K' else {}),
                  'cm': [y[2], c[2]], **({'xs': [[x[0], x[3]] for x in EXTRA[k2]]} if key_[0] == 'S' else {}), 'parts': pinfo, 'hil': hil})
    print(key_, stats[0], 'simanim', stats[1], y[2], stats[2], c[2], len(parts), 'parts')
open(os.path.join(OUT, 'index.js'), 'w', encoding='utf-8').write('window.GIM_SA_INDEX=' + json.dumps(index, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(round(total / 1e6, 1), 'MB')
