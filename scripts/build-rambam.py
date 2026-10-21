#!/usr/bin/env python3
"""מוסיף לקורפוס (generated/corpus.bundle.js) את משנה תורה לרמב״ם ושלושה מפרשים, מתוך יצוא הנתונים הרשמי של ספריא.
שימוש: python3 scripts/build-rambam.py [תיקיית מטמון להורדות]   ואחריו: node scripts/split-corpus.js
מקור: books.json ב-github.com/Sefaria/Sefaria-Export (רשימת הקבצים) ו-storage.googleapis.com/sefaria-export (הקבצים עצמם).
קטגוריות: 7 רמב״ם (Torat Emet 363/370, מנוקד), 8 כסף משנה (Torat Emet 363), 9 השגות הראב״ד (ToratEmet), 10 משנה למלך (Warsaw 1881).
מהדורת פרידברג (מפרשים נוספים, וכסף משנה על 11 ספרים) לא נכללת: ביצוא אין לה שדה license.
יחידה: [קטגוריה, ספר, פרק, הלכה, טקסט, מספר הערה (במפרשים), 0]. מוחק קודם כל יחידה/ספר מקטגוריה 7 ומעלה, ולכן אפשר להריץ שוב."""
import json, re, sys, os, urllib.request, urllib.parse
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, '.cache', 'sefaria')
BOOKS_URL = 'https://raw.githubusercontent.com/Sefaria/Sefaria-Export/master/books.json'
TOC_URL = 'https://storage.googleapis.com/sefaria-export/table_of_contents.json'
BUNDLE = os.path.join(ROOT, 'generated', 'corpus.bundle.js')
PFX = 'window.CORPUS_BUNDLE='
# קטגוריה בקורפוס: (שם, שם המפרש בספריא, גרסאות לפי סדר העדפה)
CATS = {7: ('רמב״ם', None, ['Torat Emet 363', 'Torat Emet 370']),
        8: ('כסף משנה', 'Kessef Mishneh', ['Torat Emet 363']),
        9: ('השגות הראב״ד', "Hasagot HaRa'avad", ['ToratEmet']),
        10: ('משנה למלך', 'Mishneh LaMelech', ['Warsaw, 1881'])}

def fetch(url, name):
    os.makedirs(CACHE, exist_ok=True); p = os.path.join(CACHE, name)
    if not os.path.exists(p):
        with urllib.request.urlopen(url, timeout=120) as r, open(p + '.tmp', 'wb') as f: f.write(r.read())
        os.replace(p + '.tmp', p)
    return json.load(open(p, encoding='utf-8-sig'))

def clean(s):
    s = re.sub(r'<br\s*/?>', ' ', s)
    s = re.sub(r'<sup[^>]*>.*?</sup>|<i class="footnote">.*?</i>|<small>.*?</small>|<img[^>]*>', ' ', s)
    s = re.sub(r'<[^>]+>', '', s); s = re.sub(r'&nbsp;|&thinsp;', ' ', s); s = re.sub(r'\{[^}]*\}|׆|[*A-Za-z]', ' ', s)
    s = re.sub(r'[֑-֯]', '', s)  # טעמים מוסרים; ניקוד נשמר
    return re.sub(r'\s+', ' ', s).replace(' .', '.').replace(' :', ':').strip()

def flat(t):  # (פרק, הלכה, הערה, טקסט); אינדקסים 1-בסיסיים, הערה = 0 בטקסט הבסיס
    def rec(x, path):
        if isinstance(x, list):
            for i, e in enumerate(x): yield from rec(e, path + [i + 1])
        elif isinstance(x, str) and x.strip(): yield path, x
    for p, s in rec(t, []):
        yield p[0], p[1], (p[2] if len(p) > 2 else 0), s

def main():
    B = json.loads(open(BUNDLE, encoding='utf-8').read()[len(PFX):].strip().rstrip(';'))
    keep = [i for i, b in enumerate(B['books']) if b['cat'] < 7]
    assert keep == list(range(len(keep))), 'ספרי הרמב״ם אמורים להיות בסוף הקורפוס'
    B['books'] = B['books'][:len(keep)]; B['units'] = [u for u in B['units'] if u[0] < 7]
    files = fetch(BOOKS_URL, 'books.json')['books']
    by = {}  # (כותר, גרסה) → כתובת
    for f in files:
        if f['language'] == 'Hebrew' and f['categories'][:2] == ['Halakhah', 'Mishneh Torah']: by[(f['title'].lower(), f['versionTitle'].strip())] = f['json_url']  # כותרים במפרשים לפעמים באותיות שונות (within/Within)
    toc = fetch(TOC_URL, 'table_of_contents.json')
    def find(n):
        if isinstance(n, list):
            for c in n:
                r = find(c)
                if r: return r
        elif isinstance(n, dict):
            if n.get('category') == 'Mishneh Torah': return n
            return find(n.get('contents', []))
    seforim = [s for s in find(toc)['contents'] if s.get('category', '').startswith('Sefer ')]
    order = [(s['heCategory'], c['title'], c['heTitle'].replace('משנה תורה, ', '')) for s in seforim for c in s['contents'] if 'title' in c]
    report = []
    for cat, (cname, prefix, versions) in CATS.items():
        n_books = 0
        for g, title, he in order:
            t = title if prefix is None else prefix + ' on ' + title
            v = next((v for v in versions if (t.lower(), v) in by), None)
            if v is None: continue
            url = by[(t.lower(), v)]; d = fetch(url, urllib.parse.unquote(url.split('/json/')[1]).replace('/', '__'))
            bi = len(B['books']); n = 0; L = 0; chs = set()
            for ch, h, k, s in flat(d['text']):
                t2 = clean(s)
                if not re.search('[א-ת]', t2): continue
                B['units'].append([cat, bi, ch, h, t2, k, 0]); n += 1; L += len(re.findall('[א-ת]', t2)); chs.add(ch)
            B['books'].append({'heTitle': he, 'title': t, 'category': cname, 'cat': cat, 'g': g, 'kind': 'halakha' if cat == 7 else 'comm',
                               'chapters': len(chs), 'segments': n, 'hebrewLetters': L, 'status': 'ok', 'src': d['versionTitle'].strip(), 'lic': d.get('license') or 'unknown'})
            n_books += 1
        report.append((cname, n_books))
    cnt = lambda c: sum(1 for u in B['units'] if u[0] == c)
    B['stats'].update({'rambam': cnt(7), 'kesef': cnt(8), 'raavad': cnt(9), 'lamelech': cnt(10)})
    B['report']['checks'] = [c for c in B['report']['checks'] if not c['name'].startswith('רמב״ם')] + [
        {'name': 'רמב״ם: ' + ' · '.join('%s %d ספרים' % r for r in report), 'ok': report[0][1] == len(order)},
        {'name': 'רמב״ם: אין יחידה ללא אותיות עבריות; תגיות, מראי מקומות וטעמים הוסרו', 'ok': all(re.search('[א-ת]', u[4]) and '<' not in u[4] for u in B['units'] if u[0] >= 7)}]
    open(BUNDLE, 'w', encoding='utf-8').write(PFX + json.dumps(B, ensure_ascii=False, separators=(',', ':')) + ';')
    print(report, {k: B['stats'][k] for k in ('rambam', 'kesef', 'raavad', 'lamelech')}, len(B['books']), 'books', round(os.path.getsize(BUNDLE) / 1e6, 1), 'MB')

main()
