#!/usr/bin/env python3
"""בונה את ביאור הרב שטיינזלץ על הש״ס ומילון ארמי-עברי למסך הקריאה:
  generated/talmud-stz/<מסכת>.<c>.js   window.GIM_TS['<מסכת>.<c>'] = {from, a: [[ביאור לכל קטע גמרא], …]} — 24 עמודים (12 דפים) בקובץ: עמוד j בקובץ מספר floor(j/24); נטען לפי הדף שקוראים
  generated/aramaic-gloss.js           window.GIM_GLOSS = {מילה ארמית מנורמלת: [תרגום, …]} — מזוגות ״מילה מודגשת + [תרגום]״ שבביאור
  generated/arukh.js                   window.GIM_ARUKH = {ערך: הסבר} — ספר הערוך (לובלין 1883), נטען רק כשמבקשים הסבר מורחב
שימוש: python3 scripts/build-steinsaltz.py <תיקייה עם קובצי JSON מיצוא ספריא>
בתיקייה: "Steinsaltz on <Title>.json" (גרסת merged, עברית) לכל מסכת, ו-"Sefer HeArukh.json".
(storage.googleapis.com/sefaria-export/json/Talmud/Bavli/Modern Commentary on Talmud/Steinsaltz/<סדר>/Steinsaltz on <Title>/Hebrew/merged.json,
 json/Reference/Dictionary/Sefer HeArukh/Hebrew/merged.json). רישיון הביאור: CC BY-NC 4.0 (ראו ATTRIBUTION.md).
סימונים בטקסט הביאור: \\u0003…\\u0004 = הטקסט המקורי (מודגש), \\u0005…\\u0006 = תרגום קצר בסוגריים מרובעים (קטן ועמום).
יישור לקטעי הגמרא: אם מספר הקטעים בעמוד זהה — אחד לאחד; אחרת כל קטע ביאור משויך לקטע הגמרא שבו מופיעות מילותיו המודגשות הראשונות."""
import json, os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1]
OUT = os.path.join(ROOT, 'generated', 'talmud-stz')
TAL = os.path.join(ROOT, 'generated', 'talmud')

NIK = re.compile('[֑-ׇ]')
FIN = str.maketrans('ךםןףץ', 'כמנפצ')
def norm(s):
    return re.sub('[^א-ת]', '', NIK.sub('', s)).translate(FIN)
def words(s):
    return [w for w in (norm(x) for x in re.split(r'[\s\-־]+', NIK.sub('', s))) if w]

def clean(s):
    s = re.sub(r'<big>.*?</big>', '', s)
    s = re.sub(r'<b>(.*?)</b>', '\u0003\\1\u0004', s)
    s = s.replace('<small>', '\u0005').replace('</small>', '\u0006')
    s = re.sub(r'<br\s*/?>', ' ', s)
    s = re.sub(r'<[^>]+>', '', s)
    s = s.replace('&nbsp;', ' ').replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').replace('&quot;', '"')
    s = re.sub(r'\u0003\s*\u0004|\u0005\s*\u0006', '', s)
    return re.sub(r'\s+', ' ', s).strip()

def first_bold(s):
    m = re.search('\u0003(.*?)\u0004', s)
    return words(m.group(1))[:3] if m else []

def align(gem, stz):
    """gem = קטעי הגמרא בעמוד, stz = קטעי הביאור בעמוד → רשימה באורך gem, בכל תא טקסט הביאור המשויך"""
    out = [[] for _ in gem]
    if not gem: return []
    if len(gem) == len(stz):
        return [[s] if s else [] for s in stz]
    flat = [(w, i) for i, g in enumerate(gem) for w in words(g)]
    pos, cur = 0, 0
    for s in stz:
        fb = first_bold(s)
        hit = None
        if fb:
            for p in range(pos, len(flat) - len(fb) + 1):
                if all(flat[p + q][0] == fb[q] for q in range(len(fb))): hit = p; break
        if hit is not None: pos = hit; cur = flat[hit][1]
        out[cur].append(s)
    return out

def load(path):
    return json.load(open(path, encoding='utf-8-sig'))

index = json.loads(open(os.path.join(TAL, 'index.js'), encoding='utf-8').read().split('=', 1)[1].rstrip().rstrip(';'))
os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT): os.remove(os.path.join(OUT, f))

gloss = {}
PAIR = re.compile('\u0003([^\u0003\u0004]{1,60}?)\u0004\\s*\u0005\\[([^\\]\u0005\u0006]{1,80})\\]')
total, mism, unmatched, namud, nfiles = 0, 0, 0, 0, 0
CH = 24  # עמודים (12 דפים) בקובץ — נטען רק האזור שקוראים (reader.js: STZ_CH)
for t in index:
    k = t['k']; p = os.path.join(SRC, 'Steinsaltz on ' + k + '.json')
    if not os.path.exists(p): print('חסר ביאור:', k); continue
    st = load(p)['text']
    gem = {}
    for part in t['parts']:
        src = open(os.path.join(TAL, part['f']), encoding='utf-8').read()
        d = json.loads(src.split(']=', 1)[1].rstrip().rstrip(';'))
        for r, row in enumerate(d['a']): gem[d['from'] + r] = row[0]
    rows = {}
    for j in range(t['n']):
        i = j + 2
        segs = [clean(x) for x in (st[i] if i < len(st) else []) if isinstance(x, str)]
        segs = [x for x in segs if x]
        g = gem.get(j, [])
        if len(segs) != len(g) and segs: mism += 1
        namud += 1
        al = align(g, segs)
        rows[j] = [' '.join(c) for c in al]
        for s in segs:
            for m in PAIR.finditer(s):
                key = ' '.join(words(m.group(1)))
                val = m.group(2).strip(' ,.:;')
                if key and val and len(key) <= 40:
                    d2 = gloss.setdefault(key, {}); d2[val] = d2.get(val, 0) + 1
    for c in range(0, (t['n'] + CH - 1) // CH):
        body = json.dumps({'from': c * CH, 'a': [rows[j] for j in range(c * CH, min(t['n'], (c + 1) * CH))]}, ensure_ascii=False, separators=(',', ':'))
        fn = re.sub(r'\W', '', k) + '.' + str(c) + '.js'
        open(os.path.join(OUT, fn), 'w', encoding='utf-8').write('(window.GIM_TS=window.GIM_TS||{})[' + json.dumps(k + '.' + str(c)) + ']=' + body + ';\n')
        total += len(body.encode('utf-8')); nfiles += 1
print('ביאור:', nfiles, 'קבצים,', round(total / 1e6, 1), 'MB;', mism, 'מתוך', namud, 'עמודים עם מספר קטעים שונה (יושרו לפי מילים מודגשות)')

# מילון: לכל מילה ארמית עד 3 התרגומים הנפוצים (מילים בודדות ושילובים קצרים), רק מה שמופיע לפחות פעמיים או שהוא יחיד
G = {}
for key, vals in gloss.items():
    if len(key.split()) > 3 or (len(key.split()) > 1 and sum(vals.values()) < 2): continue
    top = sorted(vals.items(), key=lambda kv: -kv[1])[:3]
    G[key] = [v for v, _ in top]
open(os.path.join(ROOT, 'generated', 'aramaic-gloss.js'), 'w', encoding='utf-8').write('window.GIM_GLOSS=' + json.dumps(G, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('מילון:', len(G), 'ערכים,', round(os.path.getsize(os.path.join(ROOT, 'generated', 'aramaic-gloss.js')) / 1e6, 2), 'MB')

# ספר הערוך
ap = os.path.join(SRC, 'Sefer HeArukh.json')
if os.path.exists(ap):
    A = {}
    def walk(x):
        if isinstance(x, str):
            m = re.match(r'\s*<b>(.*?)</b>\s*(.*)', x, re.S)
            if not m: return
            head = norm(re.sub(r'<[^>]+>', '', m.group(1)))
            body = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', m.group(2))).strip()
            if head and body and head not in A: A[head] = body[:420]
        elif isinstance(x, list):
            for y in x: walk(y)
        elif isinstance(x, dict):
            for y in x.values(): walk(y)
    walk(load(ap)['text'])
    open(os.path.join(ROOT, 'generated', 'arukh.js'), 'w', encoding='utf-8').write('window.GIM_ARUKH=' + json.dumps(A, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print('ערוך:', len(A), 'ערכים,', round(os.path.getsize(os.path.join(ROOT, 'generated', 'arukh.js')) / 1e6, 2), 'MB')
