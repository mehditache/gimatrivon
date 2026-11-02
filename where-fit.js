/* where-fit.js (v4.16.2) — שם המקום בכפתור בחירת הספר (#rdWhereTxt בקורא, ועותקו בבנר של שולחן העבודה).
   "שולחן ערוך" תמיד שו״ע. כשאין מקום מקצרים בהדרגה בראשי תיבות — שם החלק (או״ח, יו״ד, אה״ע, חו״מ), ואחר כך "סימן"
   (ס׳, ובצר מאוד בלי המילה); "כף החיים" ו"משנה ברורה" לעולם במלואם. ואם גם זה לא נכנס — "…" (CSS). השם המלא ב-data-full.
   קובץ משותף, שנטען גם ב-index.html וגם ב-desktop.html, כדי שהבנר לא יהיה תלוי בגרסת הקורא שבתוך החלון (מטמון). */
(function (G) {
  'use strict';
  const ALWAYS = [[/שולחן ערוך/g, 'שו״ע'], [/Shulchan Arukh,? ?/g, 'SA ']]; // תמיד (M, 2026-11-02), גם כשיש מקום
  const WHERE_AB = [
    [[/אורח חיים/g, 'או״ח'], [/יורה דעה/g, 'יו״ד'], [/אבן העזר/g, 'אה״ע'], [/חושן משפט/g, 'חו״מ'], [/Orach Chayim/g, 'OC'], [/Yoreh De'ah/g, 'YD'], [/Even HaEzer/g, 'EH'], [/Choshen Mishpat/g, 'CM']],
    [[/סימן /g, 'ס׳ '], [/Siman /g, 'Si. ']],
    [[/ · ס׳ /g, ' '], [/ · Si\. /g, ' ']] // בטלפון צר: "שו״ע יו״ד · כף החיים א"
  ];
  function fitWhere(el) {
    if (!el) return;
    const orig = el.dataset.full != null ? el.dataset.full : el.textContent, full = ALWAYS.reduce((a, r) => a.replace(r[0], r[1]), orig), put = x => { if (el.textContent !== x) el.textContent = x; };
    put(full);
    if (!el.clientWidth) { if (full !== orig) el.title = orig; else el.removeAttribute('title'); return; } // מוסתר (למשל הסרגל שבתוך חלון בשולחן העבודה) — השם המלא
    let s = full;
    for (const st of WHERE_AB) { if (el.scrollWidth <= el.clientWidth) break; s = st.reduce((a, r) => a.replace(r[0], r[1]), s); put(s); }
    if (s !== orig || el.scrollWidth > el.clientWidth) el.title = orig; else el.removeAttribute('title');
  }
  G.GT_fitWhere = fitWhere;
})(typeof window !== 'undefined' ? window : globalThis);
