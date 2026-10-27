#!/usr/bin/env python3
"""בונה את נתוני ספר הזוהר למסך הקריאה: generated/zohar/index.js + קבצי חלקים לכל פרשה (נטענים רק כשפותחים אותה).
שימוש: python3 scripts/build-zohar.py <תיקייה עם קובצי JSON מיצוא ספריא>
בתיקייה (קבצי הגרסאות מ-storage.googleapis.com/sefaria-export/json/Kabbalah/Zohar/..., בשם <ספר>__<גרסה>.json):
  Zohar__Vocalized Zohar, Israel 2013.json            הארמית המנוקדת, עם עמודי וילנא (Vilna Pages)
  Zohar__Hebrew Translation.json                      התרגום לעברית (מנוקד), מקור: אתר תורת אמת
  Sulam on Zohar__Zohar with Sulam commentary, Jerusalem 1945.json   ביאור הסולם
מבנה חלק: window.GIM_TP['<פרשה>.<n>'] = {from, a: [[פסקאות, הסולם, תרגום], …]} — כמו build-talmud.py, אבל "עמוד" j הוא עמוד
בדפוס וילנא של הזוהר: דף (j>>1)+d0, עמוד א (j זוגי) או ב. פסקה = [טקסט]; הסולם / תרגום = [[פסקה, דיבור המתחיל, פירוש], …].
שיוך פסקה לעמוד: העמוד שבו היא מתחילה (סימון הדף בתוך הפסקה מחשיב אותה בדף החדש רק אם הוא בשליש הראשון שלה).
התרגום מיושר לפי קבוצה ופסקה (נשמט בקבוצות שבהן מספר הפסקאות שונה); הסולם — לפי הסדר: ביאור מס' N = פסקה מס' N של הפרשה.
סימונים בטקסט: \\u0001…\\u0002 מילה גדולה, \\u0003…\\u0004 מודגש."""
import json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1]
OUT = os.path.join(ROOT, 'generated', 'zohar')
PART = 2_400_000  # GitHub Pages קוטע קבצים גדולים (ראו scripts/split-corpus.js) — חלקים קטנים

# סדר הפרשות בדפוס (כרך א: הקדמה עד ויחי; כרך ב: שמות עד פקודי; כרך ג: ויקרא עד האזינו וההוספות)
ORDER = [
    ('הקדמה', 1, ['Introduction']),
    ('ספר בראשית', 1, ['Bereshit', 'Noach', 'Lech Lecha', 'Vayera', 'Chayei Sara', 'Toldot', 'Vayetzei', 'Vayishlach', 'Vayeshev', 'Miketz', 'Vayigash', 'Vayechi']),
    ('ספר שמות', 2, ['Shemot', 'Vaera', 'Bo', 'Beshalach', 'Yitro', 'Mishpatim', 'Terumah', 'Sifra DiTzniuta', 'Tetzaveh', 'Ki Tisa', 'Vayakhel', 'Pekudei']),
    ('ספר ויקרא', 3, ['Vayikra', 'Tzav', 'Shmini', 'Tazria', 'Metzora', 'Achrei Mot', 'Kedoshim', 'Emor', 'Behar', 'Bechukotai']),
    ('ספר במדבר', 3, ['Bamidbar', 'Nasso', 'Idra Rabba', "Beha'alotcha", "Sh'lach", 'Korach', 'Chukat', 'Balak', 'Pinchas', 'Matot']),
    ('ספר דברים', 3, ['Vaetchanan', 'Eikev', 'Shoftim', 'Ki Teitzei', 'Vayeilech', "Ha'Azinu", 'Idra Zuta']),
    ('הוספות', 3, ['Addenda I', 'Addenda II', 'Addenda III']),
]
# פרשה שאין בה סימוני עמודים: מטות (פסקאות אחדות) בסוף פנחס
FALLBACK = {'Matot': 259 * 2 + 1}
HE_FIX = {'Introduction': 'הקדמת ספר הזהר', 'Sifra DiTzniuta': 'ספרא דצניעותא', 'Idra Rabba': 'אדרא רבא', 'Idra Zuta': 'אדרא זוטא', 'Addenda I': 'הוספות לכרך א', 'Addenda II': 'הוספות לכרך ב', 'Addenda III': 'הוספות לכרך ג'}


def load(name):
    d = json.load(open(os.path.join(SRC, name), encoding='utf-8-sig'))
    t = d['text']
    for k, v in list(t.items()):
        if isinstance(v, dict):  # הוספות: שלושה כרכים → שלוש "פרשות" (Addenda I, II, III)
            del t[k]
            for vk, x in v.items(): t[k + ' ' + vk.replace('Volume ', '')] = x
    return t, d


V, vmeta = load('Zohar__Vocalized Zohar, Israel 2013.json')
H, _ = load('Zohar__Hebrew Translation.json')
C, _ = load('Sulam on Zohar__Zohar with Sulam commentary, Jerusalem 1945.json')
HE = {n['enTitle']: n['heTitle'] for n in vmeta['schema']['nodes']}

PAGE = re.compile(r'<i data-overlay="Vilna Pages" data-value="([^"]+)"></i>')
GEM = {c: i + 1 for i, c in enumerate('אבגדהוזחט')}
GEM.update({c: (i + 1) * 10 for i, c in enumerate('יכלמנסעפצ')})
GEM.update({c: (i + 1) * 100 for i, c in enumerate('קרשת')})
GEM.update({'ך': 20, 'ם': 40, 'ן': 50, 'ף': 80, 'ץ': 90})


def page_of(v):
    """'15a' / '260b' / 'רס.' / 'רסא:' → מספר עמוד מוחלט d*2+צד; None אם לא מזוהה."""
    v = v.strip()
    m = re.fullmatch(r'(\d+)([ab])', v)
    if m: return int(m.group(1)) * 2 + (m.group(2) == 'b')
    m = re.fullmatch(r'([א-ת]+)([.:])', v)
    if m: return sum(GEM[c] for c in m.group(1)) * 2 + (m.group(2) == ':')
    return None


def clean(s):
    s = PAGE.sub('', s)
    s = re.sub(r'<big>\s*<(?:strong|b)>(.*?)</(?:strong|b)>\s*</big>', '\u0001\\1\u0002', s)
    s = re.sub(r'<big>(.*?)</big>', '\u0001\\1\u0002', s)
    s = re.sub(r'<(?:strong|b)>(.*?)</(?:strong|b)>', '\u0003\\1\u0004', s)
    s = re.sub(r'<br\s*/?>', ' ', s)
    s = re.sub(r'<[^>]+>', '', s)
    s = s.replace('&nbsp;', ' ').replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"').replace('&thinsp;', ' ')
    s = re.sub(r'\u0003\s*\u0004|\u0001\s*\u0002', '', s)
    return re.sub(r'\s+', ' ', s).strip()


def flat(x):
    return [p for g in x for p in g]


def paras_with_pages(k):
    """[(קבוצה, פסקה בקבוצה, טקסט נקי, עמוד מוחלט)] לפרשה."""
    items, cur, first = [], None, None
    for gi, g in enumerate(V[k]):
        for pi, raw in enumerate(g):
            plain_len = max(1, len(re.sub(r'<[^>]+>', '', raw)))
            page = cur
            for m in PAGE.finditer(raw):
                a = page_of(m.group(1))
                if a is None: continue
                if cur is not None and (a < cur or a - cur > 40): continue  # סימון שגוי: אחורה או קפיצה גדולה
                off = len(re.sub(r'<[^>]+>', '', raw[:m.start()])) / plain_len
                if off <= 0.3 or page is None: page = a
                cur = a
                if first is None: first = a
            items.append([gi, pi, clean(raw), page])
    lead = (first - 1) if first is not None else None
    for it in items:
        if it[3] is None: it[3] = lead
        else: break
    last = FALLBACK.get(k)
    for it in items:  # פסקאות בלי סימון בכלל (מטות, הוספות) נשארות בעמוד האחרון הידוע
        if it[3] is None: it[3] = last
        last = it[3]
    return items


def sulam_split():
    """ביאור הסולם לפי פרשה (רשימה של פסקאות); בראשית א+ב מחוברים, ואדרא זוטא שבתוך האזינו מופרד לפי העמודים."""
    out = {k: C[k] for k in C}
    out['Bereshit'] = C['Bereshit I'] + C['Bereshit II']
    out.pop('Bereshit I'); out.pop('Bereshit II')
    ha = paras_with_pages("Ha'Azinu"); zu = paras_with_pages('Idra Zuta')
    zu_first = min(i[3] for i in zu if i[3] is not None)
    x = next(i for i, it in enumerate(ha) if it[3] is not None and it[3] > zu_first)
    z = len(flat(V['Idra Zuta']))
    c = out["Ha'Azinu"]
    assert len(c) == len(ha) + z, (len(c), len(ha), z)
    out['Idra Zuta'] = c[x:x + z]
    out["Ha'Azinu"] = c[:x] + c[x + z:]
    return out


SULAM = sulam_split()


def comm_entry(seg, chunk):
    t = clean(chunk)
    if not t: return None
    m = re.match(r'\u0003(.*?)\u0004\s*(.*)', t)
    dh, body = (m.group(1), m.group(2)) if m else ('', t)
    if not body:
        dh, body = '', dh
    return [seg, dh.replace('\u0003', '').replace('\u0004', ''), body]


os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    os.remove(os.path.join(OUT, f))
index, total, stats = [], 0, []
for g, vol, names in ORDER:
    for k in names:
        items = paras_with_pages(k)
        pages = [it[3] for it in items if it[3] is not None]
        if not pages: sys.exit('no pages: ' + k)
        start = min(pages) & ~1
        n = max(pages) - start + 1
        rows = [[[], [], []] for _ in range(n)]
        suls = SULAM[k] if k in SULAM else []
        if suls and len(suls) != len(items): sys.exit('sulam count mismatch: %s %d %d' % (k, len(suls), len(items)))
        hg = H.get(k, [])
        ntr = nsu = 0
        for idx, (gi, pi, txt, pg) in enumerate(items):
            row = rows[pg - start]
            seg = len(row[0]); row[0].append(txt)
            if gi < len(hg) and len(hg[gi]) == len(V[k][gi]) and hg[gi][pi].strip():
                row[2].append([seg, '', clean(hg[gi][pi])]); ntr += 1
            if idx < len(suls):
                for ch in (suls[idx] if isinstance(suls[idx], list) else [suls[idx]]):
                    e = comm_entry(seg, ch) if isinstance(ch, str) else None
                    if e: row[1].append(e); nsu += 1
        parts, cur, size, st = [], [], 0, 0
        for j, row in enumerate(rows):
            s = len(json.dumps(row, ensure_ascii=False).encode('utf-8'))
            if cur and size + s > PART:
                parts.append((st, cur)); st, cur, size = j, [], 0
            cur.append(row); size += s
        parts.append((st, cur))
        meta = []
        for pi, (s0, rs) in enumerate(parts):
            body = json.dumps({'from': s0, 'a': rs}, ensure_ascii=False, separators=(',', ':'))
            fn = re.sub(r'\W', '', k) + '.' + str(pi) + '.js'
            open(os.path.join(OUT, fn), 'w', encoding='utf-8').write('(window.GIM_TP=window.GIM_TP||{})[' + json.dumps('Z.' + re.sub(r'\W', '', k) + '.' + str(pi)) + ']=' + body + ';\n')
            meta.append({'f': fn, 'from': s0, 'b': len(body.encode('utf-8'))})
            total += len(body.encode('utf-8'))
        key = 'Z.' + re.sub(r'\W', '', k)
        index.append({'k': key, 'he': HE_FIX.get(k) or HE.get(k, k), 'en': k, 'g': g, 'z': 1, 'v': vol, 'd0': start >> 1, 'j0': min(pages) - start, 'n': n, 'parts': meta, 'p': len(items), 'tr': ntr, 'su': nsu})
        stats.append((k, vol, start >> 1, n, len(items), ntr, nsu))
# התאמת מפתח החלקים (GIM_TP) לאינדקס: k + '.' + מספר חלק
open(os.path.join(OUT, 'index.js'), 'w', encoding='utf-8').write('window.GIM_ZOHAR_INDEX=' + json.dumps(index, ensure_ascii=False, separators=(',', ':')) + ';\n')
for s in stats: print('%-16s כרך %d דף %-4d עמודים %-4d פסקאות %-5d תרגום %-5d הסולם %d' % s)
print('סה״כ %.1f MB' % (total / 1e6))
