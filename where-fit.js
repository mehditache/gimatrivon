/* where-fit.js (v4.17.2) — שם המקום בכפתור בחירת הספר (#rdWhereTxt בקורא, ועותקו בבנר של שולחן העבודה).
   "שולחן ערוך" וחלקי השו״ע והטור תמיד בראשי תיבות (שו״ע או״ח). כשאין מקום מקצרים "סימן"
   (ס׳, ובצר מאוד בלי המילה); "כף החיים" ו"משנה ברורה" לעולם במלואם. ואם גם זה לא נכנס — "…" (CSS). השם המלא ב-data-full.
   קובץ משותף, שנטען גם ב-index.html וגם ב-desktop.html, כדי שהבנר לא יהיה תלוי בגרסת הקורא שבתוך החלון (מטמון). */
(function (G) {
  'use strict';
  // תמיד, גם כשיש מקום (M, 2026-11-02): "שולחן ערוך" ← שו״ע, וחלקי השולחן ערוך והטור בראשי התיבות המקובלים (שו״ע או״ח, או״ח · סימן…)
  const ALWAYS = [
    [/שולחן ערוך/g, 'שו״ע'], [/אורח חיים/g, 'או״ח'], [/יורה דעה/g, 'יו״ד'], [/אבן העזר/g, 'אה״ע'], [/חושן משפט/g, 'חו״מ'],
    [/Shulchan Arukh,? ?/g, 'SA '], [/Orach Chayim/g, 'OC'], [/Yoreh De'ah/g, 'YD'], [/Even HaEzer/g, 'EH'], [/Choshen Mishpat/g, 'CM']
  ];
  // רק כשאין מקום: "סימן" ← ס׳, ובצר מאוד בלי המילה
  const WHERE_AB = [
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
