(function () {
'use strict';
const VERSION = '4.6.31'; // מספר גרסה — לעדכן בכל שינוי (ראו CHANGELOG.md)
const BRANCH = 'windows'; // שם הענף שממנו האתר מוגש — מוצג רק במצב פיתוח (5 לחיצות רצופות על מספר הגרסה); לעדכן כשעובדים בענף אחר
const BUILT = '2026-10-25'; // תאריך הגרסה (מוצג במצב פיתוח)
let DEV = false; try { DEV = localStorage.getItem('gimatrivonDev') === '1'; } catch (e) {}
let VER_TXT = 'v' + VERSION + (DEV ? ' · ' + BRANCH : '');
// v1.4.0: נבדקה אופטימיזציה לאיחוד סריקת כמה ערכי-יעד לאותה שיטת חיפוש למעבר אחד על הקורפוס.
// נמדד בפועל שהגישה הזו (סכומי קידומת + טבלת חיפוש) לא מהירה יותר — ולעיתים אף איטית יותר — מהרצת
// מסלול "שני מצביעים" הרגיל בנפרד לכל ערך, כי צוואר הבקבוק האמיתי הוא נפח החישוב האריתמטי עצמו
// (חיבור/החסרה על פני כל התיבות) ולא ה-overhead של בדיקות הסינון. לכן נשמר המסלול הפשוט והמהיר,
// עם API שתומך בכמה יעדים בבת אחת (לשימוש עתידי), ללא פגיעה בביצועים.
const E = window.GematriaEngine, B = window.GIM_CORPUS_INDEX, // רשימת הספרים בלבד; הטקסטים נטענים לפי ספר (corpus-loader.js)
   $ = s => document.querySelector(s), esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// גודל חלון-התצוגה: כמה שורות אמיתיות נמצאות ב-DOM בכל רגע (הגלילה הוירטואלית מחליפה אותן לפי המיקום).
// עד v3.25 זו הייתה גם מגבלת-התוצאות לשיטה; מאז v3.26.0 כל ההתאמות נטענות (ראו מאגר-התוצאות הדחוס, makeStore).
const RESULTS_WINDOW = 200;
function getLimit() { return RESULTS_WINDOW; }
// תקרת-בטיחות לכמות ההתאמות שנטענות לרשימה בחיפוש אחד (13 בתים לשורה, כ-65MB); מעליה ההתאמות רק נספרות
const MAX_RESULTS_PER_SEARCH = 5000000;
const verEl = document.getElementById('ver');
const verPaint = () => { VER_TXT = 'v' + VERSION + (DEV ? ' · ' + BRANCH : ''); if (verEl) { verEl.textContent = VER_TXT; verEl.title = 'מספר גרסה' + (DEV ? ' · מצב פיתוח · ענף: ' + BRANCH + ' · ' + BUILT : ''); } const m = document.getElementById('mMenuVer'); if (m) m.textContent = VER_TXT; };
verPaint();
// 5 לחיצות רצופות (עד 3 שניות) על מספר הגרסה — מצב פיתוח: מוצג שם הענף ופרטי הבנייה (ושוב — כיבוי)
if (verEl) { let taps = 0, tt = 0; verEl.addEventListener('click', () => { taps++; clearTimeout(tt); tt = setTimeout(() => { taps = 0; }, 3000); if (taps < 5) return; taps = 0; DEV = !DEV; try { localStorage.setItem('gimatrivonDev', DEV ? '1' : '0'); } catch (e) {} verPaint(); document.dispatchEvent(new Event('gimDev')); }); }
document.title = `גימטריבון - ${VERSION}`; // כותרת טאב הדפדפן — לא "סביבת עבודה"
// --- ANALYTICS:START ---
// Google Analytics 4 (gtag.js) — חריג-רשת מבודד שני (כמו בלוק EmailJS), נבדק ב-tests/run-tests.js.
// להפעלה: להציב כאן את מזהה-המדידה של ה-property (Admin → Data streams, בפורמט G-XXXXXXXXXX).
// בלי מזהה תקין, או בהרצה מקומית (file://, localhost), שום script לא נטען ושום נתון לא נשלח.
const GA_MEASUREMENT_ID = 'G-Q77MDW4KVT';
(function initAnalytics() {
  if (!/^G-[A-Z0-9]+$/.test(GA_MEASUREMENT_ID)) return;
  if (location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID, { app_version: VERSION });
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_MEASUREMENT_ID);
  document.head.appendChild(s);
})();
// אירוע מותאם ל-GA4; no-op כשהמעקב לא נטען (בלי מזהה / הרצה מקומית).
function trackEvent(name, params) { if (typeof window.gtag === 'function') window.gtag('event', name, params || {}); }
// --- ANALYTICS:END ---
// v3.16.0: פלטה של 10 צבעים לעיגולי ההתאמות, בגווני הבאנר/הספר (בחירת המשתמש מבין 3 הצעות)
const COLORS = ['#3b7fc4', '#d0566b', '#26a39b', '#d99a26', '#8b6cc9', '#5aa346', '#e0783a', '#4f9fd1', '#c45f9a', '#9c7a54'];

/* ---------- שפה (עברית/אנגלית): L(he) מחזיר תרגום-אנגלי כש-LANG==='en' (אם קיים ב-EN), אחרת את העברית
   המקורית כמו-שהיא — ברירת-מחדל בטוחה למחרוזת שלא תורגמה. דיפולט=עברית, נשמר ל-localStorage. מכוון/הגייה
   (לא תרגום) לשמות-שיטות-גימטריה שאין להן מונח אנגלי מקובל (למשל "כולל"→"Kollel") לפי בקשת המשתמש.
   טקסט הקורפוס עצמו (פסוקים/משניות, שמות-ספרים/פרשות) אינו מתורגם בכוונה — זה "הדאטה", לא ממשק האפליקציה;
   מילות-המבנה סביבו (למשל "פרק"/"משנה"/"רש״י על") כן מתורגמות (ראו PFX_EN/heNum למטה). */
let LANG = (() => { try { return localStorage.getItem('gimatrivonLang') === 'en' ? 'en' : 'he'; } catch (e) { return 'he'; } })();
const EN = {
  'בחירת צד': 'Side selection',
  'מעבר בין מראה גוויל למראה לילה': 'Switch between parchment and night themes', 'מראה כהה (לילה בגוויל)': 'Dark theme (night parchment)',
  'הפעלת סיור מודרך קצר באפליקציה': 'Start a short guided tour of the app', '? סיור מודרך': '? Guided Tour',
  'שיטות גימטריה': 'Gematria Methods', 'מידע על האפליקציה': 'About the app', 'ℹ אודות': 'ℹ About',
  'יצירת קשר עם המפתח': 'Contact the developer', '✉ צור קשר': '✉ Contact Us', 'צור קשר': 'Contact Us',
  'שם': 'Name', 'אימייל': 'Email', 'הודעה': 'Message', 'שליחה': 'Send',
  'שולח…': 'Sending…', 'ההודעה נשלחה בהצלחה!': 'Message sent successfully!',
  'שליחה נכשלה — ודאו חיבור לאינטרנט ונסו שוב.': 'Failed to send — check your internet connection and try again.',
  'טוען קורפוס…': 'Loading corpus…', 'טוען מקורות נוספים…': 'Loading more sources…', 'בונה את אינדקס הגימטריה': 'Building the gematria index', 'סופר את אותיות התנ״ך והמשנה…': 'Counting the letters of Tanakh and Mishnah…', 'סופר את אותיות כל המקורות…': 'Counting the letters of all sources…', 'שגיאה בטעינת הקורפוס — נסו לרענן את הדף': 'Could not load the corpus — try reloading the page', 'סביבת עבודה': 'Workspace', 'מספר גרסה': 'Version number', 'סגור': 'Close',
  'שיטות הגימטריה': 'Gematria Methods', 'אודות גימטריבון': 'About Gimatrivon',
  'סינון': 'Filter', 'תוצאות החיפוש במקורות': 'Search Results in Sacred Texts', 'צד א׳': 'Side A', 'צד ב׳': 'Side B', 'קלט': 'Input',
  'סינון טקסטואלי בתוך התוצאות…': 'Text filter within results…',
  'סינון טקסטואלי בתוך תוצאות החיפוש': 'Text filter within search results',
  'כולל הטיות קרובות (הסרת תחיליות/סיומות נפוצות) — לא מדויק, לא תופס טיות פועל פנימיות': 'Includes close inflections (removes common prefixes/suffixes) — not exact, does not catch internal verb inflections',
  'הטיות': 'Inflections', 'נקה': 'Clear', 'סוגי גימטריה לחיפוש': 'Gematria types to search',
  'הצג התאמות לפסוק שלם או משנה שלמה בלבד': 'Show matches for a whole verse or mishnah only',
  'רק מילה בודדת או זוג מילים עם מקף': 'Single word, or a maqaf-joined pair only',
  'מגביל את ההתאמות למילה בודדת, או לשתי תיבות שמחוברות ביניהן במקף-עליון (מקף) בטקסט המקורי — לא כל צירוף של כמה מילים נפרדות': 'Restricts matches to a single word, or two words joined by a maqaf (upper hyphen) in the original text — not any combination of separate words',
  'התאמת נוטריקון': 'Notarikon matching',
  'קובע מתי מילת-החיפוש נחשבת תואמת לחילוץ (ר״ת/אות ב׳/אות ג׳/ס״ת) בתוך פסוק': 'Determines when the search word counts as matching an extraction (acronym/2nd letter/3rd letter/last letters) within a verse',
  'גימטרית': 'Numeric', 'אותיות (צירופים)': 'Letters (permutations)', 'טקסטואלית (מדויקת)': 'Textual (exact)',
  'עץ מקורות וטווח בתוך כל ספר': 'Source tree and range within each book',
  'מ/עד = פרק:פסוק (או פרשה, לספרי התורה/רש״י/אונקלוס) · ריק = כל הספר': "From/to = chapter:verse (or parsha, for Torah/Rashi/Onkelos books) · empty = whole book",
  'הכול': 'All', 'הקלד ביטוי לחישוב - החישוב והחיפוש מתבצע תוך כדי הקלדה': 'Type an expression in Hebrew to calculate and search',
  'או לפי מספר': 'Or by number', 'העתק': 'Copy', 'הועתק ✓': 'Copied ✓',
  'קובע אילו שיטות של מילת החיפוש פעילות (לערך המילה, לחיפוש ולהשוואה)': 'Determines which methods are active for the search word (for its value, search and comparison)',
  'לחצו על שיטה כדי להפעיל/לכבות אותה': 'Click a method to turn it on/off', 'פתח/סגור': 'Open/close',
  'בחר פרשה…': 'Choose a parsha…', 'בחר פרשה': 'Choose a parsha', 'אפס': 'Reset',
  'לחצו לעריכת הטווח': 'Click to edit the range', 'פרשה/טווח': 'Parsha/range', 'טווח': 'Range', 'פרשת ': 'Parsha ',
  'מ ': 'From ', 'עד ': 'to ', 'פרק': 'Ch.', "פס׳": 'Ver.', 'מפרק': 'From chapter', 'מפסוק': 'From verse', 'עד פרק': 'To chapter', 'עד פסוק': 'To verse',
  'רגילה': 'Regular', 'אתב״ש': 'Atbash', 'אטב״ח': 'Atbach', '+כולל': '+Kollel', '+תיבות': '+Words', '+אותיות': '+Letters', 'מילוי': 'Milui',
  'עם הכולל': 'With Kollel', 'עם מספר תיבות': 'With Word Count', 'עם מספר אותיות': 'With Letter Count',
  'רגילה עם הכולל': 'Regular with Kollel', 'רגילה עם מספר תיבות': 'Regular with Word Count', 'רגילה עם מספר אותיות': 'Regular with Letter Count',
  'אתב״ש עם הכולל': 'Atbash with Kollel', 'אתב״ש עם מספר תיבות': 'Atbash with Word Count', 'אתב״ש עם מספר אותיות': 'Atbash with Letter Count',
  'אטב״ח עם הכולל': 'Atbach with Kollel', 'אטב״ח עם מספר תיבות': 'Atbach with Word Count', 'אטב״ח עם מספר אותיות': 'Atbach with Letter Count',
  'ר״ת': 'Acronym', 'אות ב׳': '2nd Letter', 'אות ג׳': '3rd Letter', 'ס״ת': 'Last Letters', 'נוטריקון': 'Notarikon',
  'נוטריקון: ר״ת': 'Acronym', 'נוטריקון: אות ב׳': '2nd Letter', 'נוטריקון: אות ג׳': '3rd Letter', 'נוטריקון: ס״ת': 'Last Letters',
  'התאמה מילולית מדויקת: האותיות שחולצו מאייתות את מילת-החיפוש בדיוק, באותו סדר': 'Exact literal match: the extracted letters spell the search word exactly, in the same order',
  'התאמת צירוף-אותיות: אותן אותיות של מילת-החיפוש, אך בסדר שונה (לא מאייתות אותה בדיוק)': 'Letter-combination match: the same letters as the search word, but in a different order (not spelling it exactly)',
  'התאמה ערכית בלבד: הערך הגימטרי תואם, ללא השוואת-אותיות למילת-החיפוש': 'Numeric match only: the gematria value matches, without comparing letters to the search word',
  'שיטת הגימטריה של הפסוק': 'Gematria method of the verse', 'שיטת הגימטריה של מילת החיפוש שבה נמצאה ההתאמה': 'Gematria method of the search word in which the match was found',
  'תיבות': 'words', 'העתק את הפסוק/המשנה ללוח': 'Copy the verse/mishnah to clipboard', 'פתיחה בספר, במסך הקריאה': 'Open in the book, in the reader', 'העתק את המחרוזת המומרת ללוח': 'Copy the transformed string to clipboard',
  'מספר': 'Number', 'גימ׳': 'Gem.', 'של הפסוק': 'of the verse', 'ערך': 'value', 'התאמות': 'matches', 'של מילת החיפוש': 'of the search word',
  'אין תוצאות התואמות את הסינון הטקסטואלי.': 'No results match the text filter.', 'מסנן…': 'Filtering…', 'אין התאמות בטווח שנבחר.': 'No matches in the selected range.',
  'מחפש…': 'Searching…', 'הקורפוס עדיין נטען…': 'The corpus is still loading…',
  'סמן לפחות סוג גימטריה אחד לחיפוש בפסוקים (⚙).': 'Select at least one gematria type to search verses with (⚙).',
  'סמן לפחות סוג גימטריה אחד עבור מילת החיפוש.': 'Select at least one gematria type for the search word.',
  'סמן לפחות מקור אחד בעץ המקורות.': 'Select at least one source in the source tree.',
  'התחל להקליד — התוצאות יופיעו כאן בזמן אמת.': 'Start typing — results will appear here in real time.',
  'התאמה': 'match', 'מתוך': 'of', 'לחצו להפעלת שיטה זו': 'click to enable this method', 'לחצו לכיבוי שיטה זו': 'click to disable this method',
  'התאמות במקורות': 'matches in sources', 'התאמות נוטריקון': 'notarikon matches', 'פעיל, לחצו לביטול': 'active, click to cancel',
  'לחצו למיון התוצאות לפי שיטה זו': 'click to sort results by this method',
  'הקלד טקסט בשני הצדדים כדי להשוות ביניהם.': 'Type text on both sides to compare them.',
  'אין התאמות בין השיטות המסומנות בשני הצדדים.': 'No matches between the checked methods on both sides.',
  'התאמות בין השיטות המסומנות בשני הצדדים.': 'matches between the checked methods on both sides.',
  'אותיות': 'letters', 'מילים': 'words',
  'נוטריקון: ': 'Notarikon: ', ' נוטריקון': ' notarikon', ' — נוטריקון': ' — notarikon',
  // UX נייד (v3.0.0): גיליון-תחתון עם קלט משולב + לוח-חישוב ממוזג (ראו app.js: setupMobileUX/buildMobileGrid)
  'תוצאות': 'Results', 'בחירת צד לתצוגת תוצאות': 'Choose side for results view',
  'ערוך קלט': 'Edit input', 'לוח חישוב משולב — לחצו על שיטה כדי להפעיל/לכבות אותה': 'Combined calculation panel — click a method to enable/disable it',
  '(ריק)': '(empty)',
  'אודות': 'About', 'סיור מודרך': 'Guided tour', 'שפה': 'Language', 'תפריט': 'Menu',
  'מראה לילה': 'Night theme', 'מראה גוויל': 'Parchment theme',
};
function L(he) { return LANG === 'en' ? (EN[he] != null ? EN[he] : he) : he; }
const MN = {}; E.METHODS.forEach(m => { MN[m.id] = m.name; });
// "עם הכולל"/"עם מספר תיבות"/"עם מספר אותיות" של משפחת רגילה: בתווית תמיד "רגילה" בתחילה, כמו "אתב״ש עם הכולל"
['kollel', 'words', 'letters'].forEach(id => { MN[id] = 'רגילה ' + MN[id]; });
// שלוש משפחות הגימטריה שמוצגות כמלבן 4-עמודות (בסיס/+כולל/+תיבות/+אותיות): רגילה/אתב״ש/אטב״ח.
// משותף ל-renderCenter (תצוגת המלבנים) ול-drawSearchMethods (פנל הסינון בעץ) כדי שהמבנה/התוויות יישארו עקביים.
const GEM_FAMILIES = [
  { key: 'regular', name: 'רגילה', color: '#2563a8', ids: ['regular', 'kollel', 'words', 'letters'], labels: { regular: 'רגילה', kollel: '+כולל', words: '+תיבות', letters: '+אותיות' } },
  { key: 'atbash', name: 'אתב״ש', color: '#c2415a', ids: ['atbash', 'atbashKollel', 'atbashWords', 'atbashLetters'], labels: { atbash: 'אתב״ש', atbashKollel: '+כולל', atbashWords: '+תיבות', atbashLetters: '+אותיות' } },
  { key: 'atbach', name: 'אטב״ח', color: '#1a8f92', ids: ['atbach', 'atbachKollel', 'atbachWords', 'atbachLetters'], labels: { atbach: 'אטב״ח', atbachKollel: '+כולל', atbachWords: '+תיבות', atbachLetters: '+אותיות' } },
];
// שמות קצרים לשיטות הגימטריה (MN הוא השם המלא מ-engine.js, כגון "עם הכולל"/"עם מספר תיבות"/"עם מספר אותיות") —
// משמש רק לתיוג "שיטת הגימטריה של מילת החיפוש" בתוצאות (לא לשיטת הגימטריה של הפסוק עצמו, שממשיכה להציג שם מלא).
const MNS = {};
GEM_FAMILIES.forEach(f => { f.ids.forEach(id => { MNS[id] = id === f.ids[0] ? f.name : `${f.name} ${f.labels[id]}`; }); });
MNS.milui = 'מילוי';
const FAM_OF = {}; GEM_FAMILIES.forEach(f => { f.ids.forEach(id => { FAM_OF[id] = f; }); });
// צבעי-"משפחה" עבור הסקרולר-המותאם (fast-scroll) בפנל-התוצאות: שלוש המשפחות משתמשות באותם צבעים בדיוק
// כמו בשאר האפליקציה (f.color — כבר בשימוש ב-.srcCard/.bdg); נוטריקון ומילוי (שאינם חלק מ-GEM_FAMILIES)
// מקבלים צבע-ייעודי משלהם, שלא בשימוש אצל אף משפחה אחרת.
const NOTARIKON_FAM_COLOR = '#2f8f52', MILUI_FAM_COLOR = '#6a4f99';
// v3.22.0: תווית נפרדת לכל שיטת-מילה (במקום תווית מאוחדת כמו "רגילה +כולל/ +תיבות"). כשמילת-החיפוש היא
// מילה בודדת, ‎+תיבות שווה תמיד ל-‎+כולל (שתיהן ‎+1), ולכן מציגים רק את ‎+כולל של אותה משפחה.
function wmName(id) { const f = FAM_OF[id]; return f ? (id === f.ids[0] ? L(f.name) : `${L(f.name)} ${L(f.labels[id])}`) : (L(MNS[id]) || id); }
function wmsShown(st, wms) {
  if (!wms || !wms.length) return [];
  if (numVal(st.num) || E.normalizeText(st.text).words.length !== 1) return wms;
  return wms.filter(id => { const f = FAM_OF[id]; return !(f && f.labels[id] === '+תיבות' && wms.includes(f.ids[1])); });
}
// סוג התאמת-הנוטריקון (לפי אותו סימון כמו ההדגשה בפסוק): האותיות מאייתות את מילת-החיפוש (מילים), אותן אותיות
// בסדר אחר (אותיות), או ערך גימטרי בלבד (גימ׳)
const NOT_MATCH = { glowY: ['notLit', 'מילים'], glowP: ['notPerm', 'אותיות'], glowG: ['notGim', 'גימ׳'] };
function famKeyOf(method) { if (NOTARIKON_IDS.includes(method)) return 'notarikon'; if (method === 'milui') return 'milui'; const f = FAM_OF[method]; return f ? f.key : method; }
function famColorOf(method) { if (NOTARIKON_IDS.includes(method)) return NOTARIKON_FAM_COLOR; if (method === 'milui') return MILUI_FAM_COLOR; const f = FAM_OF[method]; return f ? f.color : MILUI_FAM_COLOR; }
const CK = ['tanakh', 'mishnah', 'rashi', 'onkelos', 'yonatan', 'bartenura', 'dict', 'rambam', 'kesef', 'raavad', 'lamelech'], CN = B.books.reduce((o, b) => (o[b.cat] = b.category, o), {});
const CN_EN = { 0: 'Tanakh', 1: 'Mishnah', 2: 'Rashi', 3: 'Onkelos', 4: 'Targum Yonatan', 5: 'Bartenura', 6: 'Dictionary', 7: 'Rambam', 8: 'Kessef Mishneh', 9: "Ra'avad", 10: 'Mishneh LaMelech' };
const catName = cat => LANG === 'en' ? (CN_EN[cat] || CN[cat]) : CN[cat];
// שמות-ספרים/פרקים-מסכת/קבוצות-עץ-המקורות/פרשות באנגלית (שמות-תקניים מקובלים) — לפי בקשת המשתמש "עץ
// המקורות כולו צריך להיות באנגלית". לא נוגע בטקסט-הקורפוס עצמו (פסוקים/משניות) — רק בכותרות-הניווט.
const BOOK_EN = {
  'בראשית': 'Genesis', 'שמות': 'Exodus', 'ויקרא': 'Leviticus', 'במדבר': 'Numbers', 'דברים': 'Deuteronomy',
  'יהושע': 'Joshua', 'שופטים': 'Judges', 'שמואל א': 'I Samuel', 'שמואל ב': 'II Samuel', 'מלכים א': 'I Kings', 'מלכים ב': 'II Kings',
  'ישעיהו': 'Isaiah', 'ירמיהו': 'Jeremiah', 'יחזקאל': 'Ezekiel', 'הושע': 'Hosea', 'יואל': 'Joel', 'עמוס': 'Amos', 'עובדיה': 'Obadiah',
  'יונה': 'Jonah', 'מיכה': 'Micah', 'נחום': 'Nahum', 'חבקוק': 'Habakkuk', 'צפניה': 'Zephaniah', 'חגי': 'Haggai', 'זכריה': 'Zechariah', 'מלאכי': 'Malachi',
  'תהילים': 'Psalms', 'משלי': 'Proverbs', 'איוב': 'Job', 'שיר השירים': 'Song of Songs', 'רות': 'Ruth', 'איכה': 'Lamentations',
  'קהלת': 'Ecclesiastes', 'אסתר': 'Esther', 'דניאל': 'Daniel', 'עזרא': 'Ezra', 'נחמיה': 'Nehemiah', 'דברי הימים א': 'I Chronicles', 'דברי הימים ב': 'II Chronicles',
  'משנה ברכות': 'Mishnah Berakhot', 'משנה ביכורים': 'Mishnah Bikkurim', 'משנה חלה': 'Mishnah Challah', 'משנה דמאי': 'Mishnah Demai',
  'משנה כלאים': 'Mishnah Kilayim', 'משנה מעשר שני': 'Mishnah Maaser Sheni', 'משנה מעשרות': 'Mishnah Maasrot', 'משנה ערלה': 'Mishnah Orlah',
  'משנה פאה': 'Mishnah Peah', 'משנה שביעית': 'Mishnah Sheviit', 'משנה תרומות': 'Mishnah Terumot', 'משנה ביצה': 'Mishnah Beitzah',
  'משנה חגיגה': 'Mishnah Chagigah', 'משנה עירובין': 'Mishnah Eruvin', 'משנה מגילה': 'Mishnah Megillah', 'משנה מועד קטן': 'Mishnah Moed Katan',
  'משנה פסחים': 'Mishnah Pesachim', 'משנה ראש השנה': 'Mishnah Rosh Hashanah', 'משנה שבת': 'Mishnah Shabbat', 'משנה שקלים': 'Mishnah Shekalim',
  'משנה סוכה': 'Mishnah Sukkah', 'משנה תענית': 'Mishnah Taanit', 'משנה יומא': 'Mishnah Yoma', 'משנה גיטין': 'Mishnah Gittin',
  'משנה כתובות': 'Mishnah Ketubot', 'משנה קידושין': 'Mishnah Kiddushin', 'משנה נזיר': 'Mishnah Nazir', 'משנה נדרים': 'Mishnah Nedarim',
  'משנה סוטה': 'Mishnah Sotah', 'משנה יבמות': 'Mishnah Yevamot', 'משנה עבודה זרה': 'Mishnah Avodah Zarah', 'משנה בבא בתרא': 'Mishnah Bava Batra',
  'משנה בבא קמא': 'Mishnah Bava Kamma', 'משנה בבא מציעא': 'Mishnah Bava Metzia', 'משנה עדיות': 'Mishnah Eduyot', 'משנה הוריות': 'Mishnah Horayot',
  'משנה מכות': 'Mishnah Makkot', 'משנה סנהדרין': 'Mishnah Sanhedrin', 'משנה שבועות': 'Mishnah Shevuot', 'פרקי אבות': 'Pirkei Avot',
  'משנה ערכין': 'Mishnah Arakhin', 'משנה בכורות': 'Mishnah Bekhorot', 'משנה חולין': 'Mishnah Chullin', 'משנה כריתות': 'Mishnah Keritot',
  'משנה קינים': 'Mishnah Kinnim', 'משנה מעילה': 'Mishnah Meilah', 'משנה מנחות': 'Mishnah Menachot', 'משנה מדות': 'Mishnah Middot',
  'משנה תמיד': 'Mishnah Tamid', 'משנה תמורה': 'Mishnah Temurah', 'משנה זבחים': 'Mishnah Zevachim', 'משנה כלים': 'Mishnah Keilim',
  'משנה מכשירין': 'Mishnah Makhshirin', 'משנה מקואות': 'Mishnah Mikvaot', 'משנה נגעים': 'Mishnah Negaim', 'משנה נדה': 'Mishnah Niddah',
  'משנה אהלות': 'Mishnah Oholot', 'משנה פרה': 'Mishnah Parah', 'משנה טהרות': 'Mishnah Tahorot', 'משנה טבול יום': 'Mishnah Tevul Yom',
  'משנה עוקצים': 'Mishnah Uktzin', 'משנה ידים': 'Mishnah Yadayim', 'משנה זבים': 'Mishnah Zavim',
  'ערכין': 'Arakhin', 'בכורות': 'Bekhorot', 'חולין': 'Chullin', 'כריתות': 'Keritot', 'קינים': 'Kinnim', 'מעילה': 'Meilah',
  'מנחות': 'Menachot', 'מדות': 'Middot', 'תמיד': 'Tamid', 'תמורה': 'Temurah', 'זבחים': 'Zevachim', 'ביצה': 'Beitzah',
  'חגיגה': 'Chagigah', 'עירובין': 'Eruvin', 'מגילה': 'Megillah', 'מועד קטן': 'Moed Katan', 'פסחים': 'Pesachim', 'ראש השנה': 'Rosh Hashanah',
  'שבת': 'Shabbat', 'שקלים': 'Shekalim', 'סוכה': 'Sukkah', 'תענית': 'Taanit', 'יומא': 'Yoma', 'גיטין': 'Gittin', 'כתובות': 'Ketubot',
  'קידושין': 'Kiddushin', 'נזיר': 'Nazir', 'נדרים': 'Nedarim', 'סוטה': 'Sotah', 'יבמות': 'Yevamot', 'עבודה זרה': 'Avodah Zarah',
  'בבא בתרא': 'Bava Batra', 'בבא קמא': 'Bava Kamma', 'בבא מציעא': 'Bava Metzia', 'עדיות': 'Eduyot', 'הוריות': 'Horayot', 'מכות': 'Makkot',
  'סנהדרין': 'Sanhedrin', 'שבועות': 'Shevuot', 'כלים': 'Keilim', 'מכשירין': 'Makhshirin', 'מקואות': 'Mikvaot', 'נגעים': 'Negaim',
  'נדה': 'Niddah', 'אהלות': 'Oholot', 'עוקצים': 'Uktzin', 'פרה': 'Parah', 'טהרות': 'Tahorot', 'טבול יום': 'Tevul Yom', 'ידים': 'Yadayim',
  'זבים': 'Zavim', 'ברכות': 'Berakhot', 'ביכורים': 'Bikkurim', 'חלה': 'Challah', 'דמאי': 'Demai', 'כלאים': 'Kilayim',
  'מעשר שני': 'Maaser Sheni', 'מעשרות': 'Maasrot', 'ערלה': 'Orlah', 'פאה': 'Peah', 'שביעית': 'Sheviit', 'תרומות': 'Terumot',
  'מילון עברי': 'Hebrew Dictionary',
};
// הלכות משנה תורה: השם האנגלי מספריא, בלי "Mishneh Torah, " (הקידומת באה מ-PFX_EN)
B.books.forEach(b => { if (b.cat === 7) BOOK_EN[b.heTitle] = b.title.replace(/^Mishneh Torah, /, ''); });
const bookName = he => LANG === 'en' ? (BOOK_EN[he] || he) : he;
const GROUP_EN = {
  'תורה': 'Torah', 'נביאים': 'Prophets', 'כתובים': 'Writings',
  'סדר זרעים': 'Seder Zeraim', 'סדר מועד': 'Seder Moed', 'סדר נשים': 'Seder Nashim',
  'סדר נזיקין': 'Seder Nezikin', 'סדר קדשים': 'Seder Kodashim', 'סדר טהרות': 'Seder Tahorot',
  'מילון עברי': 'Hebrew Dictionary',
  'ספר מדע': 'Sefer Madda', 'ספר אהבה': 'Sefer Ahavah', 'ספר זמנים': 'Sefer Zemanim', 'ספר נשים': 'Sefer Nashim', 'ספר קדושה': 'Sefer Kedushah',
  'ספר הפלאה': 'Sefer Haflaah', 'ספר זרעים': 'Sefer Zeraim', 'ספר עבודה': 'Sefer Avodah', 'ספר קורבנות': 'Sefer Korbanot', 'ספר טהרה': 'Sefer Taharah',
  'ספר נזיקין': 'Sefer Nezikim', 'ספר קניין': 'Sefer Kinyan', 'ספר משפטים': 'Sefer Mishpatim', 'ספר שופטים': 'Sefer Shoftim',
};
const groupName = he => LANG === 'en' ? (GROUP_EN[he] || he) : he;
// ממשק קטן למסך "קריאה ומפרשים" (reader.js), שרץ מחוץ ל-IIFE הזה ולכן לא רואה את LANG/bookName/groupName/trackEvent ישירות
window.GimApp = { isEn: () => LANG === 'en', bookName: he => bookName(he), groupName: he => groupName(he), trackEvent: (n, p) => trackEvent(n, p), tourBase: () => tourBase() };
const PARSHA_EN = {
  'בראשית': 'Bereshit', 'נח': 'Noach', 'לך לך': 'Lech Lecha', 'וירא': 'Vayera', 'חיי שרה': 'Chayei Sarah', 'תולדות': 'Toldot',
  'ויצא': 'Vayetzei', 'וישלח': 'Vayishlach', 'וישב': 'Vayeshev', 'מקץ': 'Miketz', 'ויגש': 'Vayigash', 'ויחי': 'Vayechi',
  'שמות': 'Shemot', 'וארא': 'Vaera', 'בא': 'Bo', 'בשלח': 'Beshalach', 'יתרו': 'Yitro', 'משפטים': 'Mishpatim', 'תרומה': 'Terumah',
  'תצוה': 'Tetzaveh', 'כי תשא': 'Ki Tisa', 'ויקהל': 'Vayakhel', 'פקודי': 'Pekudei',
  'ויקרא': 'Vayikra', 'צו': 'Tzav', 'שמיני': 'Shemini', 'תזריע': 'Tazria', 'מצורע': 'Metzora', 'אחרי מות': 'Achrei Mot',
  'קדושים': 'Kedoshim', 'אמור': 'Emor', 'בהר': 'Behar', 'בחוקותי': 'Bechukotai',
  'במדבר': 'Bamidbar', 'נשא': "Naso", 'בהעלותך': "Beha'alotcha", 'שלח לך': 'Shlach', 'קרח': 'Korach', 'חקת': 'Chukat',
  'בלק': 'Balak', 'פינחס': 'Pinchas', 'מטות': 'Matot', 'מסעי': 'Masei',
  'דברים': 'Devarim', 'ואתחנן': 'Vaetchanan', 'עקב': 'Eikev', 'ראה': "Re'eh", 'שופטים': 'Shoftim', 'כי תצא': 'Ki Teitzei',
  'כי תבוא': 'Ki Tavo', 'נצבים': 'Nitzavim', 'וילך': 'Vayelech', 'האזינו': "Ha'azinu", 'וזאת הברכה': 'Vezot Haberachah',
};
const parshaName = he => LANG === 'en' ? (PARSHA_EN[he] || he) : he;
/* ---------- נוטריקון: ר״ת / אות ב׳ / אות ג׳ / ס״ת ---------- */
// שורה מקוננת בתוך מלבן ה"רגילה" (לא כפתור/קופסה נפרדת) — תמיד גלויה ולחיצה (ממיינת לפי השיטה), בלי פס-צבע,
// בלי עיגולי-התאמה-לצד-שני), מציגה רק מונה-תוצאות חי לכל אחת מ-4 שיטות-החילוץ. מקורות-החיפוש מוגבלים
// תמיד לתנ״ך/משנה/אונקלוס/יונתן (NOTARIKON_CATS), בחיתוך עם עץ-המקורות שנבחר לצד (st.sel) — לא עץ נפרד.
const NOTARIKON_IDS = ['notRt', 'notB', 'notC', 'notSt'];
const NOTARIKON_LABELS = { notRt: 'ר״ת', notB: 'אות ב׳', notC: 'אות ג׳', notSt: 'ס״ת' };
NOTARIKON_IDS.forEach(m => { MN[m] = 'נוטריקון: ' + NOTARIKON_LABELS[m]; });
// סדר השיטות ברשימת התוצאות = סדר לוח החישוב: רגילה, +כולל … עד סוף השורה, אתב״ש …, אטב״ח …, מילוי, ובסוף נוטריקון
const METHOD_RANK = {}; [...GEM_FAMILIES.flatMap(f => f.ids), 'milui', ...NOTARIKON_IDS].forEach((id, i) => { METHOD_RANK[id] = i; }); // משולב ברשימה המאוחדת (showMore) — כותרת-קבוצה/תגית-שורה משתמשות ב-MN כרגיל
const NOTARIKON_POS = E.NOTARIKON_POS; // {notRt:0, notB:1, notC:2, notSt:-1}
const NOTARIKON_CATS = new Set([0, 1, 3, 4]); // תנ״ך, משנה, אונקלוס, יונתן (לא רש״י/ברטנורא/מילון)
const NOTARIKON_BOOKS = new Set(B.books.map((b, i) => i).filter(i => NOTARIKON_CATS.has(B.books[i].cat)));
const NOTARIKON_MAXWINDOW = 12;
const HEB_MARK = /[֑-ׇֽֿׁׂׅׄ]/; // ניקוד+טעמים — כמו MARKS הפנימי ב-engine.js
const baseify = s => [...s].map(c => E.FINALS[c] || c).join(''); // סופית→בסיס, להשוואת-אותיות עקבית (כמו val() הפנימי ב-engine)
// אשכולות-אותיות (אות בסיס + כל סימני-הניקוד/הטעמים שנדבקים אחריה) בתוך טקסט-מקור (עם ניקוד) — לצורך
// הדגשת-אות-בודדת בתצוגה (צביעת האות שחולצה, לא כל התיבה). מחזיר [{ch,start,end}] לפי סדר-הופעה.
function hebClusters(orig) {
  const out = [];
  for (let i = 0; i < orig.length; i++) {
    if (/[א-ת]/.test(orig[i])) { const start = i; let j = i + 1; while (j < orig.length && HEB_MARK.test(orig[j])) j++; out.push({ ch: orig[i], start, end: j }); i = j - 1; }
  }
  return out;
}
// טווחי-הדגשה (per-token, אבסולוטי לפי אינדקס ב-IDX.toks) של האות שחולצה בחלון [l,r) לפי שיטת-נוטריקון נתונה
function notarikonSpansFor(T, l, r, method) {
  const pos = NOTARIKON_POS[method], spans = [];
  for (let t = l; t < r; t++) { const cl = hebClusters(T[t]); if (!cl.length) continue; const i2 = pos < 0 ? cl.length + pos : pos; if (i2 < 0 || i2 >= cl.length) continue; spans.push({ tokenIdx: t, start: cl[i2].start, end: cl[i2].end }); }
  return spans;
}
// כמו cxHtml אבל מדגיש רק תו-אות בודד לכל תיבה (לא תיבה שלמה) — לצביעת צהוב-זוהר/סגול-זוהר/ירוק-זוהר של אות
// הנוטריקון. title (ראו תג-span) — לא באג! יש כאן בכוונה שלושה גוונים שונים, ולמשתמש אין דרך להבין את
// המשמעות בלי להצביע (hover) על ההדגשה — לכן מוסיפים טקסט-הסבר קצר לכל גוון (ראו קריאה ל-notGlowTitle למטה).
function notarikonCxHtml(T, s, e, spans, cls, title) {
  const spanMap = new Map(); spans.forEach(sp => spanMap.set(sp.tokenIdx, sp));
  const parts = [];
  for (let t = s; t < e; t++) { const orig = T[t], sp = spanMap.get(t); parts.push(sp ? esc(orig.slice(0, sp.start)) + `<span class="${cls}" title="${esc(title)}">${esc(orig.slice(sp.start, sp.end))}</span>` + esc(orig.slice(sp.end)) : esc(orig)); }
  return parts.join(' ');
}
// טקסט-ההסבר (tooltip) לכל אחד משלושת גווני-ההדגשה של תוצאת-נוטריקון — ראו notGlow בקריאה (showMore/renderWindow)
const NOTARIKON_GLOW_TITLE = {
  glowY: 'התאמה מילולית מדויקת: האותיות שחולצו מאייתות את מילת-החיפוש בדיוק, באותו סדר',
  glowP: 'התאמת צירוף-אותיות: אותן אותיות של מילת-החיפוש, אך בסדר שונה (לא מאייתות אותה בדיוק)',
  glowG: 'התאמה ערכית בלבד: הערך הגימטרי תואם, ללא השוואת-אותיות למילת-החיפוש',
};
const SIDE = { A: 'צד א׳', B: 'צד ב׳' }, KS = ['A', 'B'];
function heNum(n) { if (LANG === 'en') return String(n); let s = ''; for (const [v, l] of [[400,'ת'],[300,'ש'],[200,'ר'],[100,'ק'],[90,'צ'],[80,'פ'],[70,'ע'],[60,'ס'],[50,'נ'],[40,'מ'],[30,'ל'],[20,'כ'],[10,'י'],[9,'ט'],[8,'ח'],[7,'ז'],[6,'ו'],[5,'ה'],[4,'ד'],[3,'ג'],[2,'ב'],[1,'א']]) while (n >= v) { s += l; n -= v; } return s.replace('יה', 'טו').replace('יו', 'טז'); }
const fmt = n => n == null ? '—' : n.toLocaleString('he-IL');
// v3.4.1 (ציד-באגים): פרסור ערך תיבת "או לפי מספר" (st.num). קודם היה parseInt(st.num,10), שמחתך על
// התו הלא-ספרתי הראשון — "1e3" → 1 במקום 1000 (ל-type=number הדפדפן בעצמו מתייחס אליו כ-1000 תקף).
// Number(...) מטפל נכון במדע-נוד/רווחים-מקיפים/אפסים-מובילים; Math.trunc מטפל בערך-עשרוני ("13.5"→13),
// בדיוק כמו קודם. #nm${k}'s onblur (למטה, ב-bind) משקף ערך-שלם-בפועל חזרה לתיבה אם המשתמש הקליד עשרוני,
// כדי שהתיבה לא תציג "13.5" בזמן שבפועל מחפשים לפי 13.
const numVal = s => { const n = Math.trunc(Number(s)); return Number.isFinite(n) ? n : NaN; };
function copyText(txt) { (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => { const x = document.createElement('textarea'); x.value = txt; document.body.appendChild(x); x.select(); try { document.execCommand('copy'); } catch (er) {} x.remove(); }); }
const PFX = ['', '', 'רש״י על ', 'אונקלוס ', 'תרגום יונתן על ', 'ברטנורא על ', '', 'רמב״ם ', 'כסף משנה על ', 'השגות הראב״ד על ', 'משנה למלך על '];
const PFX_EN = ['', '', 'Rashi on ', 'Onkelos ', 'Targum Yonatan on ', 'Bartenura on ', '', 'Mishneh Torah, ', 'Kessef Mishneh on ', "Ra'avad on ", 'Mishneh LaMelech on '];
// הטקסט הגולמי של יחידה (לפני טוקניזציה, עדיין עם נקודות) — E.unpackText(IDX.units[ri].t) (באינדקס הוא שמור ארוז), לפי אותו סדר כמו IDX.units

/* ---------- עץ המקורות: קטגוריה ← קבוצה ← ספר ---------- */
// מקורות שאין מחפשים בהם בגימטריה כלל (לא נטענים לאינדקס, לא מופיעים בעץ המקורות ולא בספירות) — רק במסך הקריאה:
// ברטנורא (5), כסף משנה (8), השגות הראב״ד (9), משנה למלך (10)
const NO_SEARCH_CATS = new Set([5, 8, 9, 10]);
const SEARCH_BOOKS = B.books.map((_, i) => i).filter(i => !NO_SEARCH_CATS.has(B.books[i].cat));
const TREE = []; SEARCH_BOOKS.forEach(i => { const b = B.books[i]; let c = TREE.find(x => x.cat === b.cat); if (!c) TREE.push(c = { key: 'c' + b.cat, cat: b.cat, name: b.category, groups: [] }); let g = c.groups.find(x => x.name === b.g); if (!g) c.groups.push(g = { key: 'c' + b.cat + b.g, name: b.g, ids: [] }); g.ids.push(i); });
TREE.forEach(c => { c.ids = [].concat(...c.groups.map(g => g.ids)); });
const ALL = new Set(SEARCH_BOOKS);
const CATCOLORS = { 0: '#23527f', 1: '#8a6d1f', 2: '#6d8f1a', 3: '#9d2f8f', 4: '#c2571f', 5: '#1a8f92', 6: '#6d4b1f', 7: '#7a2e3b', 8: '#3f6f4a', 9: '#5b4a8a', 10: '#8a5a2b' };

/* ---------- 54 פרשות השבוע (פרק:פסוק, חלוקה מסורתית) — רלוונטי רק לספרי החומש ולמקבילים (רש״י/אונקלוס) ---------- */
const PARASHOT = [
  ['בראשית', 'בראשית', 1, 1, 6, 8], ['בראשית', 'נח', 6, 9, 11, 32], ['בראשית', 'לך לך', 12, 1, 17, 27], ['בראשית', 'וירא', 18, 1, 22, 24],
  ['בראשית', 'חיי שרה', 23, 1, 25, 18], ['בראשית', 'תולדות', 25, 19, 28, 9], ['בראשית', 'ויצא', 28, 10, 32, 3], ['בראשית', 'וישלח', 32, 4, 36, 43],
  ['בראשית', 'וישב', 37, 1, 40, 23], ['בראשית', 'מקץ', 41, 1, 44, 17], ['בראשית', 'ויגש', 44, 18, 47, 27], ['בראשית', 'ויחי', 47, 28, 50, 26],
  ['שמות', 'שמות', 1, 1, 6, 1], ['שמות', 'וארא', 6, 2, 9, 35], ['שמות', 'בא', 10, 1, 13, 16], ['שמות', 'בשלח', 13, 17, 17, 16],
  ['שמות', 'יתרו', 18, 1, 20, 23], ['שמות', 'משפטים', 21, 1, 24, 18], ['שמות', 'תרומה', 25, 1, 27, 19], ['שמות', 'תצוה', 27, 20, 30, 10],
  ['שמות', 'כי תשא', 30, 11, 34, 35], ['שמות', 'ויקהל', 35, 1, 38, 20], ['שמות', 'פקודי', 38, 21, 40, 38],
  ['ויקרא', 'ויקרא', 1, 1, 5, 26], ['ויקרא', 'צו', 6, 1, 8, 36], ['ויקרא', 'שמיני', 9, 1, 11, 47], ['ויקרא', 'תזריע', 12, 1, 13, 59],
  ['ויקרא', 'מצורע', 14, 1, 15, 33], ['ויקרא', 'אחרי מות', 16, 1, 18, 30], ['ויקרא', 'קדושים', 19, 1, 20, 27], ['ויקרא', 'אמור', 21, 1, 24, 23],
  ['ויקרא', 'בהר', 25, 1, 26, 2], ['ויקרא', 'בחוקותי', 26, 3, 27, 34],
  ['במדבר', 'במדבר', 1, 1, 4, 20], ['במדבר', 'נשא', 4, 21, 7, 89], ['במדבר', 'בהעלותך', 8, 1, 12, 16], ['במדבר', 'שלח לך', 13, 1, 15, 41],
  ['במדבר', 'קרח', 16, 1, 18, 32], ['במדבר', 'חקת', 19, 1, 22, 1], ['במדבר', 'בלק', 22, 2, 25, 9], ['במדבר', 'פינחס', 25, 10, 30, 1],
  ['במדבר', 'מטות', 30, 2, 32, 42], ['במדבר', 'מסעי', 33, 1, 36, 13],
  ['דברים', 'דברים', 1, 1, 3, 22], ['דברים', 'ואתחנן', 3, 23, 7, 11], ['דברים', 'עקב', 7, 12, 11, 25], ['דברים', 'ראה', 11, 26, 16, 17],
  ['דברים', 'שופטים', 16, 18, 21, 9], ['דברים', 'כי תצא', 21, 10, 25, 19], ['דברים', 'כי תבוא', 26, 1, 29, 8], ['דברים', 'נצבים', 29, 9, 30, 20],
  ['דברים', 'וילך', 31, 1, 31, 30], ['דברים', 'האזינו', 32, 1, 32, 52], ['דברים', 'וזאת הברכה', 33, 1, 34, 12],
].map(([book, name, fc, fv, tc, tv]) => ({ book, name, fc, fv, tc, tv }));
// ספרים שחלוקת הפרשות חלה עליהם: חמשת ספרי התורה עצמם, וכל ספר רש״י/אונקלוס שמקביל לאחד מהם (g==='תורה' מזהה את שניהם — ראו build-sources.py)
const TORAH_IDS = new Set(B.books.map((b, i) => i).filter(i => B.books[i].g === 'תורה'));
const parashotFor = i => PARASHOT.filter(p => p.book === B.books[i].heTitle);
// הפרשה שבה נמצא פסוק נתון (u = {b,ch,n}), רק לספרי התורה/רש״י-על-תורה/אונקלוס; אחרת ''
function parashaOf(u) {
  if (!TORAH_IDS.has(u.b)) return '';
  const pos = u.ch * 1000 + (u.n || 0);
  const p = parashotFor(u.b).find(p => pos >= p.fc * 1000 + p.fv && pos <= p.tc * 1000 + p.tv);
  return p ? p.name : '';
}
// ד״ה (דיבור המתחיל) לפירוש רש״י: כל פירוש בקורפוס פותח במילות הפסוק המפורשות ואז נקודה (למשל "בראשית ברא. אמר רבי יצחק…") —
// נבדק על מדגם רחב ועובד באופן עקבי. ri = אינדקס היחידה (כמו ב-IDX.units, אותו סדר).
function dibburFor(ri) { const raw = (IDX && IDX.units[ri] && E.unpackText(IDX.units[ri].t)) || ''; const idx = raw.indexOf('.'); return idx > 0 ? raw.slice(0, idx).trim() : ''; }
// קיצור טקסט ארוך עם "…" (לד״ה / להערות שיטת מילוי-אתב״ש-אטב״ח) — הערך המלא תמיד זמין ב-title (mouse hover)
const trunc = (s, n) => s.length > (n || 26) ? s.slice(0, n || 26).trim() + '…' : s;
// [טיוטה — לא סופי, ממתין לאישור] הוספת מקף תצוגתי-בלבד בתוך השם המפורש (יהוה ← יה-וה) בטקסט-הפסוק
// המוצג בתוצאות. לא נוגע ב-T (מערך התיבות המקורי) עצמו — רק במחרוזת שמוצגת/מועתקת מתוכו — ולכן לא
// משפיע על חישוב גימטרי/חיפוש/השוואה בשום צורה (אלה כבר רצו לפני שהתוצאה בכלל הגיעה לכאן). מזהה לפי
// *אותיות-הבסיס בלבד* (מתעלם מניקוד/טעמים, שעלולים לשבת בין האותיות) — ולכן תופס גם "יְהֹוָה" עם טעמים.
// דורש בדיוק 4 אותיות עבריות במילה שמאייתות י-ה-ו-ה (לא תת-מחרוזת בתוך מילה ארוכה יותר).
const HEB_LETTER_RE = /[א-ת]/;
function shemHyphenDisplay(word) {
  const pos = []; for (let i = 0; i < word.length; i++) if (HEB_LETTER_RE.test(word[i])) pos.push(i);
  if (pos.length !== 4 || pos.map(i => word[i]).join('') !== 'יהוה') return word;
  const cut = pos[2]; // אחרי "יה" (2 האותיות הראשונות), לפני "ו" (האות השלישית)
  return word.slice(0, cut) + '-' + word.slice(cut);
}
// רינדור קטע "קונטקסט" (.cx) עם כמה שכבות סימון חופפות: <mark> על התאמת החיפוש, <b> על ד״ה (דיבור המתחיל) ברש״י,
// וטווחי הדגשה אופציונליים (tfRanges) לסינון הטקסטואלי החופשי בתוצאות — פיצול לפי כל נקודות הגבול
// (התחלה/סוף קונטקסט, סוף ד״ה, התחלה/סוף ההתאמה, כל טווח הדגשה) כדי שכל שכבה תיושם רק בטווח הנכון, גם כשהן חופפות.
function cxHtml(T, s, e, ml, mr, boldEnd, tfRanges) {
  boldEnd = Math.min(Math.max(boldEnd, s), e);
  const extraPts = []; (tfRanges || []).forEach(x => { extraPts.push(x.a, x.b); });
  const pts = [...new Set([s, boldEnd, ml, mr, e, ...extraPts])].filter(p => p >= s && p <= e).sort((a, b) => a - b);
  const tfrAt = p => (tfRanges || []).find(x => p >= x.a && p < x.b);
  // בונים קודם רשימת "חלקים" שטוחה (מילה/רווח + דגל inMark), ורק בסוף ממזגים ריצות רצופות של inMark:true
  // לתגית <mark> אחת יחידה — ולא עוטפים כל מקטע (ואת הרווחים שביניהם) בתגית <mark> נפרדת משלו. עטיפה נפרדת
  // לכל מקטע הייתה יוצרת "תפרים" חזותיים בין התיבות (ל-mark יש border-radius+padding משלה), כך שקו-התחתון
  // הכחול נראה מפוצל/לא-רציף גם אחרי שהרווח עצמו צויר בתוך mark. תיבת <mark> אחת רציפה פותרת את זה לגמרי.
  const parts = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]; if (a >= b) continue;
    let seg = esc(T.slice(a, b).map(shemHyphenDisplay).join(' '));
    if (boldEnd > s && a < boldEnd) seg = `<b>${seg}</b>`;
    const tfr = tfrAt(a);
    if (tfr) seg = `<span class="${tfr.cls}">${seg}</span>`;
    const inMark = a >= ml && a < mr;
    if (parts.length) { const gapInMark = a - 1 >= ml && a - 1 < mr && inMark; parts.push({ text: ' ', mark: gapInMark }); }
    parts.push({ text: seg, mark: inMark });
  }
  let out = '', i2 = 0;
  while (i2 < parts.length) {
    if (parts[i2].mark) { let buf = ''; while (i2 < parts.length && parts[i2].mark) { buf += parts[i2].text; i2++; } out += `<mark>${buf}</mark>`; }
    else { out += parts[i2].text; i2++; }
  }
  return out;
}

/* ---------- עד 4 שורות לכל תוצאה (v3.28.0) ----------
   בקשת המשתמש: בפנל התוצאות אין להציג טקסט ארוך מ-4 שורות. פירוש או הלכה ארוכים (עד כ-1,700 תיבות ליחידה) הוצגו
   במלואם, ושורה אחת יכלה לתפוס מסך שלם. כאן נבחר מהיחידה רק קטע סביב ההתאמה, בערך באמצע, עם "…" בקצה שנחתך;
   ב-CSS (.resList .cx) יש גם line-clamp של 4 שורות, כך שגם אם ההערכה כאן לא מדויקת, לא יוצגו יותר מ-4 שורות.
   הקיבולת (cap) היא מספר האותיות שנכנסות ב-4 שורות ברוחב הנוכחי של הרשימה, נמדדת בכל ציור (cxCapFor). */
const NIKUD_RE = /[֑-ׇ]/g;
const tokLen = t => t.replace(NIKUD_RE, '').length + 1; // אותיות בלי ניקוד וטעמים, ועוד רווח
const CX_SAMPLE = 'בְּרֵאשִׁית בָּרָא אֱלֹהִים אֵת הַשָּׁמַיִם וְאֵת הָאָרֶץ וְהָאָרֶץ הָיְתָה תֹהוּ וָבֹהוּ וְחֹשֶׁךְ עַל פְּנֵי תְהוֹם';
function cxCapFor(box) {
  const w = box.clientWidth;
  if (!w) return 0; // הרשימה מוסתרת: בלי חיתוך מראש, רק ה-line-clamp
  const probe = document.createElement('button'); probe.className = 'rs'; probe.style.cssText = 'position:absolute;visibility:hidden;inset-inline-start:0;top:0;width:' + w + 'px';
  probe.innerHTML = '<div class="cx"><span>' + CX_SAMPLE + '</span></div>'; box.appendChild(probe);
  const cx = probe.firstChild, sp = cx.firstChild, cxW = cx.clientWidth, spW = sp.getBoundingClientRect().width;
  probe.remove();
  if (!cxW || !spW) return 0;
  const perChar = spW / CX_SAMPLE.replace(NIKUD_RE, '').length;
  return Math.max(40, Math.floor(4 * cxW / perChar * 0.7)); // 0.7: טקסט בלי ניקוד רחב יותר מהדוגמה, ומקום לשבירת שורה בין מילים ולמילים רחבות
}
// מחזיר את טווח התיבות להצגה [a,b) בתוך [s,e), כשההתאמה [ml,mr) בערך באמצע. cap=0: בלי חיתוך
function cxClip(T, s, e, ml, mr, cap) {
  if (!cap) return { a: s, b: e };
  let all = 0;
  for (let t = s; t < e && all <= cap; t++) all += tokLen(T[t]);
  if (all <= cap) return { a: s, b: e };
  ml = Math.min(Math.max(ml, s), e); mr = Math.min(Math.max(mr, ml), e);
  let m = 0; for (let t = ml; t < mr && m <= cap; t++) m += tokLen(T[t]);
  const before = Math.max(cap * 0.08, (cap - m) / 2);
  let a = ml, acc = 0;
  while (a > s && acc + tokLen(T[a - 1]) <= before) acc += tokLen(T[--a]);
  // אחרי ההתאמה: מה שנשאר מהקיבולת, ועוד רבע כדי שה-line-clamp יחתוך בסוף שורה ולא באמצע
  const after = Math.max(0, cap - acc - m) + cap * 0.25;
  let b = mr, acc2 = 0;
  while (b < e && acc2 < after) acc2 += tokLen(T[b++]);
  if (mr === ml && b === ml) b = Math.min(e, ml + 1);
  return { a, b };
}
const CX_CUT = '<span class="cxCut" aria-hidden="true">…</span>';

/* ---------- סינון טקסטואלי חופשי בתוך תוצאות החיפוש (לא קשור לחישוב הגימטרי) ---------- */
// "היתולי": הסרה היוריסטית של תחיליות/סיומות נפוצות — תופס הרבה מהטיות השם/הסמיכות הנפוצות,
// אך לא טיות פועל פנימיות (שינוי אותיות באמצע המילה, כמו כתב/כותב) — אין לכך פתרון בלי מנתח מורפולוגי אמיתי.
// תחילית אחת בלבד (לא שתיים) וסיומת אחת, ואורך-שארית מינימלי של 3 — הסרה כפולה/אגרסיבית מדי גורמת
// להתנגשויות שגויות בין מילים לא-קשורות (למשל "שלשה"→"שה" ו"משה"→"שה" מתנגשות בטעות).
const FUZZ_PRE = 'והבכלמש', FUZZ_SUF = ['ים', 'ות', 'הם', 'הן', 'נו', 'ך', 'ת', 'ה'];
function rootForm(w) {
  let s = w;
  if (s.length > 3 && FUZZ_PRE.includes(s[0])) s = s.slice(1);
  for (const suf of FUZZ_SUF) { if (s.length - suf.length >= 3 && s.endsWith(suf)) { s = s.slice(0, -suf.length); break; } }
  return s;
}
// רווח בתחילת/בסוף שאילתת הסינון (q הגולמי, לפני נרמול) לא מתעלמים ממנו: הוא דורש גבול-מילה באותו צד —
// "דן" (בלי רווחים) תופס גם "עדן"/"דני" (הכלה חופשית), אך " דן " (עם רווחים) תופס רק "דן" כמילה שלמה.
const qBounds = q => ({ lead: /^\s/.test(q), trail: /\s$/.test(q) });
// האם טקסט-יחידה גולמי (rawText, עם ניקוד/טעמים) תואם שאילתת סינון q, במצב מדויק (fuzzy=false) או היתולי (fuzzy=true)
function tfMatch(rawText, q, fuzzy) {
  if (!q || !q.trim()) return true;
  const qn = E.normalizeText(q).normalizedText; if (!qn) return true;
  const { lead, trail } = qBounds(q);
  const n = E.normalizeText(rawText);
  const needle = (lead ? ' ' : '') + qn + (trail ? ' ' : ''), hay = ' ' + n.normalizedText + ' ';
  if (hay.includes(needle)) return true;
  if (!fuzzy) return false;
  const qWords = qn.split(' ').filter(Boolean); if (qWords.length !== 1) return false;
  const qRoot = rootForm(qWords[0]);
  return n.words.some(w => { const wr = rootForm(w); return wr === qRoot || wr.includes(qRoot) || qRoot.includes(wr); });
}
// טווחי הדגשה (מילה-מילה) לצורך סימון חזותי בתוך .cx: hlT = התאמה מדויקת, hlF = התאמה היתולית בלבד.
// שאילתה של מילה בודדת: הכלה חופשית (או עם גבול-מילה לפי qBounds) + תמיכה בהיתולי.
// שאילתה של כמה מילים (ביטוי): מחפשים רצף תיבות תואם — בדיוק כמו ש-tfMatch בודק התאמת מחרוזת על הטקסט המחובר-ברווחים:
// המילה הראשונה בביטוי יכולה להיות סיומת חופשית של התיבה הראשונה (או שוות-ערך אם יש גבול-מילה משמאל),
// המילה האחרונה יכולה להיות תחילית חופשית של התיבה האחרונה (או שוות-ערך אם יש גבול-מילה מימין),
// והמילים שבאמצע חייבות להתאים בדיוק (הן תחומות משני צדדים ברווחים אמיתיים). ללא תמיכה בהיתולי לביטויים (כמו ב-tfMatch).
function tfWordRanges(T, s, e, q, fuzzy) {
  const qn = E.normalizeText(q || '').normalizedText, qWords = qn.split(' ').filter(Boolean);
  if (!qWords.length) return [];
  const { lead, trail } = qBounds(q || ''), out = [];
  if (qWords.length === 1) {
    const qSingle = qWords[0], qRoot = rootForm(qSingle);
    for (let t = s; t < e; t++) {
      const tk = E.tokens(T[t])[0]; if (!tk) continue; const w = tk.norm; if (!w) continue;
      const okLead = !lead || w.startsWith(qSingle), okTrail = !trail || w.endsWith(qSingle);
      if (w.includes(qSingle) && okLead && okTrail) out.push({ a: t, b: t + 1, cls: 'hlT' });
      else if (fuzzy) { const wr = rootForm(w); if (wr === qRoot || wr.includes(qRoot) || qRoot.includes(wr)) out.push({ a: t, b: t + 1, cls: 'hlF' }); }
    }
    return out;
  }
  const n = qWords.length;
  for (let t = s; t + n <= e; t++) {
    let ok = true;
    for (let j = 0; j < n; j++) {
      const tk = E.tokens(T[t + j])[0]; const w = tk ? tk.norm : '';
      if (!w) { ok = false; break; }
      if (j === 0) ok = lead ? w === qWords[j] : w.endsWith(qWords[j]);
      else if (j === n - 1) ok = trail ? w === qWords[j] : w.startsWith(qWords[j]);
      else ok = w === qWords[j];
      if (!ok) break;
    }
    if (ok) out.push({ a: t, b: t + n, cls: 'hlT' });
  }
  return out;
}
/* ---------- מאגר-תוצאות דחוס (v3.26.0) ----------
   לפי בקשת המשתמש: הרשימה מחזיקה את *כל* ההתאמות (גם מיליון ומעלה), לא רק 500 לכל שיטה. אובייקט לכל שורה
   היה תופס מאות מגה-בייט, ולכן כל התאמה נשמרת כמספרים במערכים דחוסים: יחידה (u), תחילת וסוף טווח-התיבות
   (l/r), קבוצה (g: שיטה+ערך+שיטות-המילה, טבלה קטנה ב-groups) ודגלי-נוטריקון (f: 1=מילולי, 2=פרמוטציה) —
   13 בתים לשורה. אובייקט-שורה נבנה רק כשהשורה נכנסת לחלון-התצוגה (rowAt). st.all הוא המאגר הזה. */
function makeStore() {
  const cap = 1024;
  return { n: 0, cap, u: new Int32Array(cap), l: new Int32Array(cap), r: new Int32Array(cap), g: new Uint16Array(cap), f: new Uint8Array(cap), groups: [], gKey: new Map() };
}
function storeGroup(sto, method, target, wms, notarikon) {
  const key = method + '|' + target + '|' + (wms || []).join(',');
  let gi = sto.gKey.get(key);
  if (gi == null) { gi = sto.groups.length; sto.groups.push({ method, target, wms: wms || [], notarikon: !!notarikon }); sto.gKey.set(key, gi); }
  return gi;
}
function storePush(sto, gi, u, l, r, f) {
  if (sto.n === sto.cap) {
    const cap = sto.cap * 2, grow = (a, T) => { const b = new T(cap); b.set(a); return b; };
    sto.u = grow(sto.u, Int32Array); sto.l = grow(sto.l, Int32Array); sto.r = grow(sto.r, Int32Array); sto.g = grow(sto.g, Uint16Array); sto.f = grow(sto.f, Uint8Array); sto.cap = cap;
  }
  const i = sto.n++; sto.u[i] = u; sto.l[i] = l; sto.r[i] = r; sto.g[i] = gi; sto.f[i] = f || 0;
}
// מוסיף שורות-תוצאה כפי ש-E.search/E.searchNotarikon מחזירים אותן (אובייקטים זמניים של פרוסה אחת) למאגר
function storeAdd(sto, rows) {
  let lastKey = null, gi = 0;
  for (const x of rows) {
    const key = x.method + '|' + x.value;
    if (key !== lastKey) { const not = NOTARIKON_IDS.includes(x.method); gi = storeGroup(sto, x.method, x.value, not ? ['regular'] : x.tag, not); lastKey = key; }
    storePush(sto, gi, x.u, x.l, x.r, (x.literal ? 1 : 0) | (x.perm ? 2 : 0));
  }
}
function rowAt(st, i) {
  const sto = st.all; if (i == null || i < 0 || i >= sto.n) return null;
  const g = sto.groups[sto.g[i]], f = sto.f[i];
  return { u: sto.u[i], l: sto.l[i], r: sto.r[i], method: g.method, target: g.target, value: g.target, wms: g.wms, literal: !!(f & 1), perm: !!(f & 2) };
}
// סינון טקסטואלי: תלוי רק בטקסט היחידה, ולכן נשמר ליחידה (לא לשורה) — כמה התאמות באותו פסוק נבדקות פעם אחת.
// 0 = עוד לא נבדק, 1 = מתאים, 2 = לא מתאים. המטמון מתאפס כשהשאילתה או מצב ההיתולי משתנים.
// הטקסט המנורמל נגזר ישר מטקסט היחידה (unitNormText) ולא דרך IDX.toks: עם מאות-אלפי יחידות, פירוק לתיבות,
// חיבור ופירוק שוב (tfMatch על הטקסט המקורי) היה פי כמה איטי. התוצאה זהה ל-E.normalizeText(...).normalizedText:
// רצף של תווים שאינם אותיות הופך לרווח אם יש בו מפריד (כמו ב-E.tokens), ונמחק אם הוא רק ניקוד/טעמים.
const TF_SEP = /[\s\u05BE\-–—_/\\.,;:!?()\[\]{}"'׳״<>|׀׃]/;
function unitNormText(u) { return E.unpackText(IDX.units[u].t || '').replace(/<[^>]*>/g, ' ').replace(/[^א-ת]+/g, m => TF_SEP.test(m) ? ' ' : '').trim(); }
function unitTfOk(st, u) {
  const key = st.tf + '|' + st.fuzzy;
  let c = st.tfCache;
  if (!c || c.key !== key || c.ix !== IDX) {
    const qn = E.normalizeText(st.tf).normalizedText, { lead, trail } = qBounds(st.tf);
    c = st.tfCache = { key, ix: IDX, v: new Uint8Array(IDX.units.length), needle: qn ? (lead ? ' ' : '') + qn + (trail ? ' ' : '') : '' };
  }
  const v = c.v; if (v[u]) return v[u] === 1;
  const norm = unitNormText(u);
  const ok = !c.needle || (' ' + norm + ' ').includes(c.needle) || (st.fuzzy && tfMatch(norm, st.tf, true));
  v[u] = ok ? 1 : 2; return ok;
}
// סינון טקסטואלי על כל המאגר: עם מיליון שורות הבדיקה לוקחת כמה שניות, ולכן היא נסרקת בפרוסות של עד
// TF_SLICE_MS (st.tfScan זוכר עד איזו שורה הגיע ואילו עברו). כל קריאה ממשיכה מהמקום שנעצרה, ושורות חדשות
// שנוספות תוך-כדי חיפוש פשוט נסרקות בהמשך. כל עוד הסריקה לא הסתיימה, מתוזמנת המשך-סריקה (tfContinue) שמרעננת
// את התצוגה — התוצאות הראשונות מופיעות מיד, והשאר מתווספות.
const TF_SLICE_MS = 12;
function tfIdx(st) {
  const sto = st.all, fkey = st.tf + '|' + st.fuzzy;
  let c = st.tfScan;
  if (!c || c.sto !== sto || c.fkey !== fkey) c = st.tfScan = { sto, fkey, n: 0, m: 0, buf: new Int32Array(Math.max(1024, sto.n)) };
  if (c.n < sto.n) {
    if (c.buf.length < sto.n) { const b2 = new Int32Array(Math.max(sto.n, c.buf.length * 2)); b2.set(c.buf.subarray(0, c.m)); c.buf = b2; }
    const t0 = performance.now(), buf = c.buf, U = sto.u, n = sto.n; let i = c.n, m = c.m;
    while (i < n) {
      if (unitTfOk(st, U[i])) buf[m++] = i;
      i++;
      if ((i & 1023) === 0 && performance.now() - t0 > TF_SLICE_MS) break;
    }
    c.n = i; c.m = m;
  }
  if (c.n < sto.n) tfSchedule(st);
  return c.buf.subarray(0, c.m);
}
function tfScanning(st) { const c = st.tfScan; return !!(st.tf && st.tf.trim() && c && c.sto === st.all && c.n < st.all.n); }
function tfSchedule(st) {
  if (st.tfPending) return;
  st.tfPending = true;
  GEM_WAIT(() => { st.tfPending = false; tfContinue(st.k); });
}
// המשך-סריקה: מתקדם פרוסה אחת, ומרענן את התצוגה — במלואה רק כשהחלון עוד לא מלא או כשהסריקה הסתיימה (כדי לא
// להרוס-ולבנות שורות שהמשתמש כבר רואה בכל פרוסה), ואחרת רק את מה שתלוי בסך-הכול (מונה, ספייסר, סימוני-מסלול).
function tfContinue(k) {
  const st = S[k]; if (!(st.tf && st.tf.trim())) return;
  const box = $('#rl' + k), now = performance.now();
  visibleIdx(st);
  const done = !tfScanning(st);
  if (!done && now - (st.tfLastPaint || 0) < 200) return;
  st.tfLastPaint = now;
  if (done || st.winCount < getLimit()) { const keep = box.scrollTop, ws = st.winStart; renderWindow(k, ws); if (ws) box.scrollTop = keep; }
  else {
    computeGroups(k);
    const after = box.lastElementChild; if (after && after.classList.contains('rlSpacer')) after.style.height = Math.round((st.groupsTotal - st.winStart - st.winCount) * vRowH(st, st.groupsTotal)) + 'px';
    updateTfBar(k); fsBuildTicks(k); fsLayout(k);
  }
}
// אינדקסים של st.all בסדר-התצוגה בפועל — null אם אין לא סינון טקסטואלי ולא מיון-לפי-עיגול פעילים (משתמשים
// ב-st.all ישירות, בסדר המקורי). אחרת מוחזר Int32Array: קודם מוחל סינון טקסטואלי (אם יש — ראו tfIdx; תוך-כדי
// סריקה זו רשימה חלקית), ואז — אם יש מיון-לפי-עיגול פעיל (st.hitsSort) — התוצאות ששייכות לשיטה הנבחרת מועלות
// לראש הרשימה (מיון-יציב), בלי לסנן. המיון נשמר (st.sortCache) עד שמשהו מהם משתנה.
function visibleIdx(st) {
  const hasTf = !!(st.tf && st.tf.trim()), hasSort = !!st.hitsSort;
  if (!hasTf && !hasSort) return null;
  const base = hasTf ? tfIdx(st) : null;
  if (!hasSort) return base;
  const sto = st.all, n = base ? base.length : sto.n, key = sto.n + '|' + n + '|' + (hasTf ? st.tfScan.fkey : '') + '|' + st.hitsSort;
  const c = st.sortCache;
  if (c && c.sto === sto && c.key === key) return c.idx;
  // עיגולי-נוטריקון מקודמים לפי השיטה עצמה; עיגולי-גימטריה לפי שיטת-המילה (wms) של הקבוצה
  const id = st.hitsSort, isNot = NOTARIKON_IDS.includes(id), hitG = sto.groups.map(g => isNot ? g.method === id : !g.notarikon && g.wms.includes(id));
  const out = new Int32Array(n); let m = 0;
  for (const want of [true, false]) for (let p = 0; p < n; p++) { const i = base ? base[p] : p; if (hitG[sto.g[i]] === want) out[m++] = i; }
  st.sortCache = { sto, key, idx: out };
  return out;
}
// הופך/מבטל מיון-לפי-עיגול-תוצאות עבור שיטה ספציפית (id) בצד k: מעלה את התוצאות הרלוונטיות לראש פנל
// התוצאות-מהמקורות (בלי לאבד אף תוצאה), ומסמן את העיגול כ"פעיל" (צבוע בצבע הצד). לחיצה על אותו עיגול
// שוב מבטלת את המיון ומחזירה לסדר הרגיל; לחיצה על עיגול אחר מחליפה את יעד-המיון (רק אחד פעיל בכל רגע, לכל צד).
function hitsSortToggle(k, id) {
  const st = S[k];
  if (st.hitsSort === id) {
    // ביטול מיון: כל הנתונים הרלוונטיים כבר טעונים (או שלא היו קיימים מלכתחילה) — אין צורך בחיפוש חדש,
    // רק הצגה-מחדש בסדר הרגיל (מהיר, בלי לפנות שוב לקורפוס).
    // scrollTop=0 לפני renderWindow(k,0): כדי שהחלון-החדש יוצג מההתחלה ממש, לא יישאר "תקוע" באיזשהו
    // scrollTop ישן שכבר לא רלוונטי לתוכן/למיקום-הלוגי החדש.
    st.hitsSort = null; $('#rl' + k).scrollTop = 0; renderWindow(k, 0); renderCenter();
    return;
  }
  st.hitsSort = id;
  // כל ההתאמות כבר טעונות ב-st.all (מאז v3.26.0 אין יותר תקציב-תוצאות לשיטה), כך שאין מה "להשלים" מהקורפוס —
  // רק סידור-מחדש של התצוגה (visibleIdx).
  $('#rl' + k).scrollTop = 0; const fi = renderWindow(k, 0); if (st.cur < 0 && fi != null) select(k, fi); renderCenter();
}

/* ---------- מצב לכל צד ---------- */
// st.ms = שיטות הגימטריה של מילת החיפוש (לחישוב ערכי המילה ולהשוואה בין צד א׳/ב׳)
// st.sms = שיטות הגימטריה לחיפוש בפסוקים (איך מחושבים הפסוקים בקורפוס) — עצמאי לגמרי מ-st.ms
// st.ranges: Map<bookIndex,{fc,fv,tc,tv,pname?}> — טווח פרק:פסוק פר-ספר (ללא ערך = כל הספר); pname אם הוגדר ע״י בחירת פרשה
// winStart/winCount/avgRowH/groups/groupsTotal: שדות הגלילה-הוירטואלית (ראו renderWindow/computeGroups
// למטה) — לא חלק מ"שדות-הגדרה" הסיור שומר/משחזר (SETTINGS_FIELDS), ממש כמו all/info/cur: מתמלאים-מחדש
// נכון מעצמם בכל renderWindow/computeGroups.
const S = {}; KS.forEach(k => { S[k] = { k, text: '', num: '', ms: new Set(E.METHODS.map(m => m.id)), sms: new Set(E.METHODS.map(m => m.id)), sel: new Set(ALL), open: new Set(), rngOpen: new Set(), smOpen: new Set(GEM_FAMILIES.map(f => f.key)), ranges: new Map(), all: makeStore(), winStart: 0, winCount: 0, avgRowH: 0, groups: [], groupsTotal: 0, cur: -1, info: [], tf: '', fuzzy: false, hitsSort: null, notMode: 'perm', notCounts: {}, notGen: 0, fullUnit: false, singleWord: false }; });
let IDX = null, CM = null, FOCUS = null;
// מצב בניית אינדקס הגימטריה (ראו gemStart בסוף הקובץ): gen = מונה לביטול, stage = 0 (אין) / 1 (תנ״ך ומשנה) / 2 (הכל)
const GEM = { gen: 0, busy: false, stage: 0, f: 0 };
let GEM_WAIT = f => setTimeout(f, 0);
// v3.6.0: לחיצה על עיגול-התאמה גורמת לפס-הצבע של התאים המותאמים ולשני העיגולים עצמם — בשני הצדדים — להבהב BLINK_MS. מסמנים *זמן*
// (BLINK_AT) ולא class חד-פעמי, כי renderCenter מצייר את כל הלוח מחדש (גם בהקלדה/חיפוש חי) — כל ציור-מחדש בתוך
// 7 השניות מחזיר את ה-class עם animation-delay שמשכיב את ההבהוב באותה פאזה, כך שאין "קפיצה". בסיום מסירים ידנית.
const BLINK_MS = 7000, BLINK_PERIOD_MS = 800;
let BLINK_AT = 0, blinkTimer = null;
function blinkOn(hl) { return !!(hl && FOCUS != null && hl.id === FOCUS && Date.now() - BLINK_AT < BLINK_MS); }
function blinkDelay() { return `animation-delay:-${((Date.now() - BLINK_AT) % BLINK_PERIOD_MS) / 1000}s;`; }
function focusMatch(id, force) { // force: הדגמת-הסיור מדליקה תמיד (בלי "לחיצה שנייה מכבה")
  FOCUS = !force && FOCUS === id ? null : id;
  BLINK_AT = FOCUS != null ? Date.now() : 0;
  clearTimeout(blinkTimer);
  if (FOCUS != null) blinkTimer = setTimeout(() => document.querySelectorAll('.blinkBar,.blinkBdg,.blinkA,.blinkB').forEach(e => e.classList.remove('blinkBar', 'blinkBdg', 'blinkA', 'blinkB')), BLINK_MS);
  renderCenter();
}

/* ---------- בניית המסך ---------- */
const TITLES = { filt: 'סינון', res: 'תוצאות החיפוש במקורות', ctr: SIDE };
function sideHtml(k) {
  return `<section class="side" data-k="${k}">
  <section class="pn res" data-mode="res" aria-label="${L('תוצאות החיפוש במקורות')} ${L(SIDE[k])}">
    <div class="hd"><h2 id="rh${k}">${L(TITLES.res)}</h2><button class="filtToggle" id="ft${k}" title="${L('סינון')}" aria-label="${L('סינון')}">⚙</button></div>
    <div class="resBody">
      <div class="tsBar" id="tsb${k}">
        <span class="tsIcon" aria-hidden="true"><svg viewBox="0 0 22 22"><circle cx="9.5" cy="9.5" r="5.8" stroke="currentColor" stroke-width="1.5" fill="none"/><line x1="13.7" y1="13.7" x2="19" y2="19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span>
        <input type="text" id="tf${k}" class="tfInp" placeholder="${L('סינון טקסטואלי בתוך התוצאות…')}" aria-label="${L('סינון טקסטואלי בתוך תוצאות החיפוש')} ${L(SIDE[k])}">
        <label class="tsFuzz" title="${L('כולל הטיות קרובות (הסרת תחיליות/סיומות נפוצות) — לא מדויק, לא תופס טיות פועל פנימיות')}">
          <input type="checkbox" class="cb" id="tfz${k}"><span>${L('הטיות')}</span>
        </label>
        <span class="tsCount" id="tfc${k}" hidden></span>
        <button class="sm tsClear" id="tfx${k}" hidden>${L('נקה')}</button>
      </div>
      <div class="sum" id="rs${k}" aria-live="polite"></div>
      <div class="resList">
        <div class="sc" id="rl${k}"></div>
        <div class="fsTrack" id="fsTrack${k}"><div class="fsThumb" id="fsThumb${k}"><div class="fsBubble" id="fsBubble${k}"></div></div></div>
      </div>
      <div class="sc filtPane" id="fp${k}">
        <div class="sec"><h3>${L('סוגי גימטריה לחיפוש')}</h3><div id="ms${k}" class="smTree"></div></div>
        <div class="sec"><label class="opt"><input type="checkbox" class="cb" id="fu${k}"><span>${L('הצג התאמות לפסוק שלם או משנה שלמה בלבד')}</span></label></div>
        <div class="sec"><label class="opt" title="${L('מגביל את ההתאמות למילה בודדת, או לשתי תיבות שמחוברות ביניהן במקף-עליון (מקף) בטקסט המקורי — לא כל צירוף של כמה מילים נפרדות')}"><input type="checkbox" class="cb" id="sw${k}"><span>${L('רק מילה בודדת או זוג מילים עם מקף')}</span></label></div>
        <div class="sec"><h3>${L('התאמת נוטריקון')}<span class="hint">${L('קובע מתי מילת-החיפוש נחשבת תואמת לחילוץ (ר״ת/אות ב׳/אות ג׳/ס״ת) בתוך פסוק')}</span></h3>
          <div class="radioRow">
            <label class="opt"><input type="radio" name="notMode${k}" class="cb" data-notmode="gem"><span>${L('גימטרית')}</span></label>
            <label class="opt"><input type="radio" name="notMode${k}" class="cb" data-notmode="perm" checked><span>${L('אותיות (צירופים)')}</span></label>
            <label class="opt"><input type="radio" name="notMode${k}" class="cb" data-notmode="lit"><span>${L('טקסטואלית (מדויקת)')}</span></label>
          </div>
        </div>
        <div class="sec"><h3>${L('עץ מקורות וטווח בתוך כל ספר')}<span class="hint">${L('מ/עד = פרק:פסוק (או פרשה, לספרי התורה/רש״י/אונקלוס) · ריק = כל הספר')}</span></h3><div class="rowb"><button class="sm" data-t="all">${L('הכול')}</button><button class="sm" data-t="none">${L('נקה')}</button></div><div id="tr${k}" class="srcTree"></div></div>
      </div>
    </div>
  </section>
  <section class="pn ctr" aria-label="${L('קלט')} ${L(SIDE[k])}"><div class="hd"><h2>${L(SIDE[k])}</h2><span class="m" id="st${k}"></span></div>
    <div class="inp"><textarea id="t${k}" placeholder="${L('הקלד ביטוי לחישוב - החישוב והחיפוש מתבצע תוך כדי הקלדה')}" aria-label="${L('קלט')} ${L(SIDE[k])}"></textarea>
    <div class="meta"><label>${L('או לפי מספר')} <input id="nm${k}" type="number" min="1"></label><span class="sp"></span><button class="sm" data-a="clear">${L('נקה')}</button><button class="sm" data-a="copy">${L('העתק')}</button></div></div>
    <div class="sum" id="cs${k}"></div>
    <div class="rowb wrow" id="wrb${k}" title="${L('קובע אילו שיטות של מילת החיפוש פעילות (לערך המילה, לחיפוש ולהשוואה)')}"><button class="sm" data-t="all">${L('הכול')}</button><button class="sm" data-t="none">${L('נקה')}</button></div>
    <div class="sc" id="gr${k}" title="${L('לחצו על שיטה כדי להפעיל/לכבות אותה')}"></div></section></section>`;
}
$('#ws').innerHTML = KS.map(sideHtml).join('');
// פתיחה/סגירה של פנל הסינון (.filtPane): הפנל ממוקם position:absolute (מעל .resBody) בגודל קבוע,
// וה"גלילה מלמטה למעלה" מתבצעת ע"י transform בלבד (translateY + opacity) — ולא ע"י שינוי גובה אמיתי
// (max-height/גריד) — כדי שההנפשה תרוץ על ה-GPU (compositor) בלי reflow בכל פריים, גם כשתוכן הפנל
// כבד (רשימת ספרים/שבבים ארוכה). זו הסיבה שהגרסה הקודמת "תקעה" — אנימציה על גובה-אמיתי מכריחה את
// הדפדפן לחשב מחדש את הפריסה בכל פריים.
function toggleFilt(k, force) {
  const sec = $('#ft' + k).closest('.pn.res'), toFilt = force != null ? force : sec.dataset.mode !== 'filt';
  sec.dataset.mode = toFilt ? 'filt' : 'res';
  $('#rs' + k).hidden = toFilt; $('#rl' + k).hidden = toFilt; $('#tsb' + k).hidden = toFilt;
  const fp = $('#fp' + k);
  fp.classList.toggle('open', toFilt);
  fp.inert = !toFilt; // כשהפנל סגור ומוסט מחוץ לתצוגה, לא ניתן לנווט/להתמקד בפקדים שבתוכו
  $('#rh' + k).textContent = toFilt ? L(TITLES.filt) + ' — ' + L(SIDE[k]) : L(TITLES.res);
  $('#ft' + k).classList.toggle('on', toFilt);
}
KS.forEach(k => { $('#ft' + k).onclick = () => toggleFilt(k); });

/* ---------- עץ + סוגי גימטריה לחיפוש בפסוקים (st.sms) ---------- */
// בנוי בדיוק כמו עץ המקורות (srcCard/srcHd/tw/srcLeaves) — כרטיס מתקפל לכל משפחה (רגילה/אתב״ש/אטב״ח) עם
// תיבת-סימון-הורה (מסמנת/מבטלת את 4 השיטות ביחד, כולל השיטה הבסיסית עצמה כאחד הילדים) ומונה "X/4". שלושת
// הכרטיסים בשורה אחת למעלה (גריד 3 עמודות), מסודרים מימין לשמאל לפי GEM_FAMILIES: רגילה · אתב״ש · אטב״ח.
// מילוי — כרטיס רביעי באותו גריד (ללא חץ-קיפול/מונה, אין לו "ילדים"), באותו רוחב כמו שאר הכרטיסים.
// אין עוד checkbox "הכול" נפרד (הוסר לבקשת המשתמש).
const MILUI_COLOR = '#8a6d1f';
function drawSearchMethods(k) {
  const st = S[k];
  const famHtml = GEM_FAMILIES.map(f => {
    const c = f.ids.filter(id => st.sms.has(id)).length, open = st.smOpen.has(f.key);
    const leaves = open ? `<div class="srcLeaves">${f.ids.map(id => `<label class="opt"><input type="checkbox" class="cb" data-m="${id}" ${st.sms.has(id) ? 'checked' : ''}><span class="nm">${L(f.labels[id])}</span></label>`).join('')}</div>` : '';
    return `<div class="srcCard" style="--c:${f.color}"><div class="srcHd"><button class="tw" data-fo="${f.key}" aria-expanded="${open}" aria-label="${L('פתח/סגור')}">${open ? '▾' : '◂'}</button><label class="opt" style="flex:1;padding:0"><input type="checkbox" class="cb" data-fam="${f.key}" ${c === f.ids.length ? 'checked' : ''} data-p="${c > 0 && c < f.ids.length ? 1 : 0}"><span class="nm">${L(f.name)}</span><span class="ct">${c}/${f.ids.length}</span></label></div>${leaves}</div>`;
  }).join('');
  const miluiHtml = `<div class="srcCard" style="--c:${MILUI_COLOR}"><div class="srcHd"><label class="opt" style="flex:1;padding:0"><input type="checkbox" class="cb" data-m="milui" ${st.sms.has('milui') ? 'checked' : ''}><span class="nm">${L('מילוי')}</span></label></div></div>`;
  $('#ms' + k).innerHTML = famHtml + miluiHtml;
  $('#ms' + k).querySelectorAll('[data-p="1"]').forEach(x => { x.indeterminate = true; });
}
const cnt = (st, ids) => ids.reduce((s, i) => s + st.sel.has(i), 0);
function grpToggleHtml(key, name, ids, c, open) {
  return `<button class="tw" data-o="${key}" aria-expanded="${open}" aria-label="${L('פתח/סגור')}">${open ? '▾' : '◂'}</button><label class="opt" style="flex:1;padding:0"><input type="checkbox" class="cb" data-ids="${ids.join(',')}" ${c === ids.length ? 'checked' : ''} data-p="${c > 0 && c < ids.length ? 1 : 0}"><span class="nm" title="${esc(name)}">${esc(name)}</span><span class="ct">${ids.length > 1 ? c + '/' + ids.length : ''}</span></label>`;
}
// תגית הטווח המוצגת כש-סגור: שם פרשה אם הוגדר כזה, אחרת "פרק:פסוק–פרק:פסוק"
function leafTag(st, i) {
  const rg = st.ranges.get(i); if (!rg) return '';
  if (rg.pname) return L('פרשת ') + parshaName(rg.pname);
  const f = rg.fc ? heNum(rg.fc) + (rg.fv ? ':' + heNum(rg.fv) : '') : '', t = rg.tc ? heNum(rg.tc) + (rg.tv ? ':' + heNum(rg.tv) : '') : '';
  return (f || t) ? `${f}–${t}` : '';
}
function leafHtml(st, i) {
  const b = B.books[i], on = st.sel.has(i), open = st.rngOpen.has(i), rg = st.ranges.get(i), tag = leafTag(st, i), torah = TORAH_IDS.has(i);
  let sub = '';
  if (open) {
    const opts = torah ? parashotFor(i).map(p => `<option value="${esc(p.name)}" ${rg && rg.pname === p.name ? 'selected' : ''}>${esc(parshaName(p.name))}</option>`).join('') : '';
    sub = `<div class="rngEd">
      ${torah ? `<select class="prs" data-rb="${i}" aria-label="${L('בחר פרשה')}"><option value="">${L('בחר פרשה…')}</option>${opts}</select>` : ''}
      <span class="rngInp">${L('מ ')}<input type="number" min="1" class="rin" data-rb="${i}" data-f="fc" value="${rg && rg.fc ? rg.fc : ''}" placeholder="${L('פרק')}" aria-label="${L('מפרק')}"> : <input type="number" min="1" class="rin" data-rb="${i}" data-f="fv" value="${rg && rg.fv ? rg.fv : ''}" placeholder="${L("פס׳")}" aria-label="${L('מפסוק')}"></span>
      <span class="rngInp">${L('עד ')}<input type="number" min="1" class="rin" data-rb="${i}" data-f="tc" value="${rg && rg.tc ? rg.tc : ''}" placeholder="${L('פרק')}" aria-label="${L('עד פרק')}"> : <input type="number" min="1" class="rin" data-rb="${i}" data-f="tv" value="${rg && rg.tv ? rg.tv : ''}" placeholder="${L("פס׳")}" aria-label="${L('עד פסוק')}"></span>
      ${rg ? `<span class="rngA" data-rreset="${i}">${L('אפס')}</span>` : ''}
      <span class="rngA" data-rclose="${i}">${L('סגור')}</span>
    </div>`;
  }
  return `<div class="srcLeaf${rg ? ' mod' : ''}"><label class="opt leafMain"><input type="checkbox" class="cb" data-ids="${i}" ${on ? 'checked' : ''}><span class="nm" title="${esc(bookName(b.heTitle))}">${esc(bookName(b.heTitle))}</span></label>` +
    (open ? `<span class="rngA" data-rclose="${i}">✕</span>` : tag ? `<span class="rngTag" data-ropen="${i}" title="${L('לחצו לעריכת הטווח')}">${esc(tag)}</span>` : `<span class="rngLink" data-ropen="${i}">${L(torah ? 'פרשה/טווח' : 'טווח')}</span>`) +
    `</div>${sub}`;
}
function grpHtml(st, key, name, ids, open) {
  return `<div class="srcGrp"><div class="srcGrpHd">${grpToggleHtml(key, name, ids, cnt(st, ids), open)}</div>${open ? `<div class="srcLeaves">${ids.map(i => leafHtml(st, i)).join('')}</div>` : ''}</div>`;
}
function drawTree(k) {
  const st = S[k], root = $('#tr' + k), sc = root.closest('.sc'), top = sc.scrollTop;
  root.innerHTML = TREE.map(c => {
    const open = st.open.has(c.key);
    const body = open ? `<div class="srcBody">${c.groups.map(g => grpHtml(st, g.key, groupName(g.name), g.ids, st.open.has(g.key))).join('')}</div>` : '';
    return `<div class="srcCard" style="--c:${CATCOLORS[c.cat] || 'var(--ac)'}"><div class="srcHd">${grpToggleHtml(c.key, catName(c.cat), c.ids, cnt(st, c.ids), open)}</div>${body}</div>`;
  }).join('');
  root.querySelectorAll('[data-p="1"]').forEach(x => { x.indeterminate = true; }); sc.scrollTop = top;
}
function bind(k) {
  const st = S[k], q = s => document.querySelector(`.side[data-k=${k}] ${s}`);
  $('#ms' + k).onchange = e => {
    const t = e.target;
    if (t.dataset.fam != null) { const f = GEM_FAMILIES.find(x => x.key === t.dataset.fam); f.ids.forEach(id => t.checked ? st.sms.add(id) : st.sms.delete(id)); }
    else t.checked ? st.sms.add(t.dataset.m) : st.sms.delete(t.dataset.m);
    drawSearchMethods(k); run(k);
  };
  $('#ms' + k).onclick = e => { const tw = e.target.closest('.tw[data-fo]'); if (!tw) return; const o = tw.dataset.fo; st.smOpen.has(o) ? st.smOpen.delete(o) : st.smOpen.add(o); drawSearchMethods(k); };
  $('#wrb' + k).onclick = e => { const t = e.target.dataset.t; if (!t) return; st.ms = t === 'all' ? new Set(E.METHODS.map(m => m.id)) : new Set(); run(k); renderCenter(); };
  $('#gr' + k).addEventListener('click', e => { const ncp = e.target.closest('.cpy'); if (ncp) { e.stopPropagation(); return doCopy(ncp); } if (e.target.closest('.bdg,.bdgH')) return; const row = e.target.closest('.gr,.gr4cell'); if (!row) return; if (row.classList.contains('notCell')) return hitsSortToggle(k, row.dataset.m); const m = row.dataset.m; if (!m) return; st.ms.has(m) ? st.ms.delete(m) : st.ms.add(m); run(k); renderCenter(); });
  $('#gr' + k).addEventListener('keydown', e => { const ncp = e.target.closest('.cpy'); if (!ncp) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); doCopy(ncp); } });
  const debRun = () => { clearTimeout(st.timer); st.timer = setTimeout(() => run(k), 350); }; // ממתינים שההקלדה "תירגע" לפני שמריצים חיפוש כבד
  // עדכון טווח פר-ספר (Map st.ranges): patch חלקי על {fc,fv,tc,tv,pname}; טווח ריק לגמרי מוסר מה-Map
  const patchRange = (i, patch) => { const rg = Object.assign({}, st.ranges.get(i), patch); if (!rg.fc && !rg.fv && !rg.tc && !rg.tv) st.ranges.delete(i); else st.ranges.set(i, rg); };
  const tr = $('#tr' + k);
  tr.onchange = e => {
    const t = e.target;
    if (t.dataset.ids != null) { t.dataset.ids.split(',').map(Number).forEach(i => t.checked ? st.sel.add(i) : st.sel.delete(i)); drawTree(k); run(k); return; }
    if (t.classList.contains('prs')) { const i = +t.dataset.rb, p = parashotFor(i).find(x => x.name === t.value); if (p) st.ranges.set(i, { fc: p.fc, fv: p.fv, tc: p.tc, tv: p.tv, pname: p.name }); else st.ranges.delete(i); drawTree(k); run(k); return; }
  };
  tr.oninput = e => { const t = e.target; if (!t.classList.contains('rin')) return; const i = +t.dataset.rb, v = t.value ? parseInt(t.value, 10) : undefined; patchRange(i, { [t.dataset.f]: v, pname: undefined }); debRun(); };
  tr.onclick = e => {
    const tw = e.target.closest('.tw[data-o]'); if (tw) { const o = tw.dataset.o; st.open.has(o) ? st.open.delete(o) : st.open.add(o); drawTree(k); return; }
    const op = e.target.closest('[data-ropen]'); if (op) { st.rngOpen.add(+op.dataset.ropen); drawTree(k); return; }
    const cl = e.target.closest('[data-rclose]'); if (cl) { st.rngOpen.delete(+cl.dataset.rclose); drawTree(k); return; }
    const rs = e.target.closest('[data-rreset]'); if (rs) { const i = +rs.dataset.rreset; st.ranges.delete(i); drawTree(k); run(k); return; }
  };
  q('.filtPane .rowb').onclick = e => { const t = e.target.dataset.t; if (!t) return; st.sel = t === 'all' ? new Set(ALL) : new Set(); drawTree(k); run(k); };
  $('#t' + k).oninput = e => { st.text = e.target.value; renderCenter(); debRun(); };
  // TAB בתיבת-הטקסט קופץ ישירות לתיבת-הטקסט של הצד השני, וחוזר חלילה; Shift+TAB קופץ לתיבת החיפוש-בתוך-התוצאות
  // (#tf) של אותו צד, ו-Shift+TAB שם מחזיר לכאן (בנייד — מחליף קודם את פנל-התוצאות המוצג לצד הזה). נתפס רק כשהפוקוס בתיבה עצמה — בכל
  // מקום אחר TAB ממשיך לנווט כרגיל (נגישות-מקלדת).
  $('#t' + k).addEventListener('keydown', e => {
    if (e.key !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return;
    const o = $('#' + (e.shiftKey ? 'tf' + k : 't' + (k === 'A' ? 'B' : 'A'))); if (!o) return;
    if (e.shiftKey && !o.getClientRects().length) { const sg = document.querySelector(`.mSumSeg[data-side="${k}"]`); if (sg) sg.click(); }
    e.preventDefault(); o.focus(); const n = o.value.length; o.setSelectionRange(n, n);
  });
  $('#nm' + k).oninput = e => { st.num = e.target.value; debRun(); };
  // v3.4.1: אם המשתמש הקליד ערך לא-שלם ("13.5"), רק ב-blur (לא תוך-כדי הקלדה, כדי לא "לבלוע" את הנקודה
  // שהמשתמש אולי עדיין ממשיך אחריה) משקפים חזרה את הערך-השלם-בפועל שבו משתמש החיפוש (numVal, למעלה) —
  // כדי שהתיבה לא תטעה ותציג "13.5" בזמן שבפועל התוצאות הן עבור 13.
  $('#nm' + k).onblur = e => { const v = e.target.value; if (!v) return; const n = numVal(v); if (Number.isFinite(n) && String(n) !== v) { e.target.value = n; st.num = String(n); } };
  q('.meta').onclick = e => { const a = e.target.dataset.a; if (!a) return; if (a === 'clear') { st.text = ''; st.num = ''; $('#t' + k).value = ''; $('#nm' + k).value = ''; renderCenter(); run(k); } else { const t = E.METHODS.filter(m => st.ms.has(m.id)).map(m => L(MN[m.id]) + ': ' + fmt(E.calculateGematria(st.text, m.id).value)).join('\n'); copyText(L(SIDE[k]) + ': ' + st.text + '\n' + t); e.target.textContent = L('הועתק ✓'); setTimeout(() => { e.target.textContent = L('העתק'); }, 1200); } };
  const doCopy = cp => { copyText(cp.dataset.copy); cp.textContent = '✓'; setTimeout(() => { cp.textContent = '⧉'; }, 900); };
  $('#rl' + k).onclick = e => { const cp = e.target.closest('.cpy'); if (cp) { e.stopPropagation(); return doCopy(cp); } const go = e.target.closest('.goRd,.goRef'); if (go) { e.stopPropagation(); return openInReader(go); } const b = e.target.closest('.rs'); if (!b) return; select(k, +b.dataset.i); };
  $('#rl' + k).addEventListener('keydown', e => { const cp = e.target.closest('.cpy,.goRd'); if (!cp) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); cp.classList.contains('goRd') ? openInReader(cp) : doCopy(cp); } });
  // גלילה אינסופית: טוענים את מנת ה-100 הבאה כשמתקרבים לתחתית הרשימה (במקום כפתור "הצג עוד")
  $('#rl' + k).addEventListener('scroll', () => { fsLayout(k); maybeShiftWindow(k); });
  // סינון טקסטואלי חופשי בתוך התוצאות המוצגות (לא קשור לחישוב הגימטרי) — מהיר, פועל על מה שכבר נמצא בזיכרון
  const tfDeb = () => { clearTimeout(st.tfTimer); st.tfTimer = setTimeout(() => tfRebuild(k), 80); };
  $('#tf' + k).oninput = e => { st.tf = e.target.value; tfDeb(); };
  // Shift+TAB בתיבת החיפוש-בתוך-התוצאות מחזיר לתיבת-הטקסט של אותו צד (המשלים של Shift+TAB שם, למעלה).
  $('#tf' + k).addEventListener('keydown', e => {
    if (e.key !== 'Tab' || !e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return;
    const o = $('#t' + k); e.preventDefault(); o.focus(); const n = o.value.length; o.setSelectionRange(n, n);
  });
  $('#tfz' + k).onchange = e => { st.fuzzy = e.target.checked; tfRebuild(k); };
  $('#fu' + k).onchange = e => { st.fullUnit = e.target.checked; run(k); };
  $('#sw' + k).onchange = e => { st.singleWord = e.target.checked; run(k); };
  $('#tfx' + k).onclick = () => { st.tf = ''; $('#tf' + k).value = ''; tfRebuild(k); };
  $('#fp' + k).querySelectorAll('input[data-notmode]').forEach(r => { r.onchange = () => { if (r.checked) { st.notMode = r.dataset.notmode; run(k); } }; });
  drawSearchMethods(k); drawTree(k); fsInit(k);
}

// מספר ההתאמות בפועל שנמצאו בחיפוש-במקורות (st.info) עבור ערך-המילה שחושב לפי שיטה ספציפית (id) —
// סוכם על פני כל שיטות-החיפוש הפעילות (st.info נבנה פר (שיטת-חיפוש, יעד), עם wms = רשימת שיטות-המילה
// שהניבו אותו יעד). מוצג כעיגול-מידע נוסף (ללא צבע-מילוי) ליד תגי-ההתאמה בין הצדדים.
function sourceHits(st, id) { return (st.info || []).reduce((s, x) => s + (!x.notarikon && x.wms && x.wms.includes(id) ? x.total : 0), 0); }

/* ---------- אזור מרכזי: ערכי כל סוגי הגימטריה + השוואה בין הצדדים ---------- */
function renderCenter() {
  const res = {}; KS.forEach(k => { res[k] = {}; E.METHODS.forEach(m => { res[k][m.id] = E.calculateGematria(S[k].text, m.id); }); });
  CM = E.compareAll(S.A.text, S.B.text, E.METHODS.map(m => m.id).filter(m => S.A.ms.has(m)), E.METHODS.map(m => m.id).filter(m => S.B.ms.has(m)));
  CM.matches.forEach(m => { m.color = COLORS[(m.id - 1) % COLORS.length]; });
  const empty = !S.A.text.trim() || !S.B.text.trim();
  KS.forEach(k => {
    const st = S[k], n = E.normalizeText(st.text), side = k === 'A' ? 'a' : 'b';
    $('#st' + k).textContent = `${L('אותיות')} ${n.normalizedText.replace(/ /g, '').length} · ${L('מילים')} ${n.words.length}`;
    $('#cs' + k).innerHTML = empty ? L('הקלד טקסט בשני הצדדים כדי להשוות ביניהם.') : CM.matches.length ? `<b>${CM.matches.length}</b> ${L('התאמות בין השיטות המסומנות בשני הצדדים.')}` : L('אין התאמות בין השיטות המסומנות בשני הצדדים.');
    // רגילה/אתב״ש/אטב״ח מוצגות כל אחת כמלבן 4-עמודות (בסיס/+כולל/+תיבות/+אותיות) — 3 מלבנים כאלה, לפי
    // GEM_FAMILIES (משותף עם פנל הסינון). לאתב״ש/אטב״ח (לא לרגילה, שאין לה "המרה") מתווספת שורת-הערה
    // לאורך כל רוחב המלבן, עם המחרוזת המומרת בלבד (ללא טקסט-המקור/נוסחה — לבקשת המשתמש). מילוי נשאר
    // שורת-הערה בודדת (מלבן נפרד) כמו היום.
    const hasTxt = !!st.text.trim();
    const gr4Html = GEM_FAMILIES.map(f => {
      const cells = `<div class="gr4">${f.ids.map(id => {
        const r = res[k][id], on = st.ms.has(id), mine = CM.matches.filter(x => x[side].method === id), hl = mine.find(x => x.id === FOCUS) || mine[0];
        const matchBdgs = mine.map(x => `<button class="bdg${blinkOn(x) ? ' blinkBdg' : ''}" style="--c:${x.color};${blinkOn(x) ? blinkDelay() : ''}" data-f="${x.id}" title="${L('התאמה')} ${heNum(x.id)}">${heNum(x.id)}</button>`).join('');
        const badges = matchBdgs ? `<div class="bdgSmall">${matchBdgs}</div>` : '';
        // עיגול-התוצאות מוצג תמיד (גם "0" כשאין עדיין/בכלל התאמות) כדי שהערך יוכל "לגדול" באופן חי תוך
        // כדי חיפוש בלי שהעיגול יקפוץ פנימה/החוצה מהתא (מה שהיה גורם לקפיצות-פריסה קטנות).
        const hits = sourceHits(st, id), hitOn = st.hitsSort === id ? ' on' : '', hitsBdg = `<span class="bdgH${hitOn}" data-m="${id}" title="${fmt(hits)} ${L('התאמות במקורות')}${hitOn ? ' — ' + L('פעיל, לחצו לביטול') : ' — ' + L('לחצו למיון התוצאות לפי שיטה זו')}">${fmt(hits)}</span>`;
        const bk = blinkOn(hl);
        return `<div class="gr4cell${on ? '' : ' off'}${bk ? ' blinkBar' : ''}" data-m="${id}" style="--c:${hl ? hl.color : 'var(--ln2)'};${bk ? blinkDelay() : ''}" title="${L(f.labels[id])} · ${fmt(r.value)}${on ? ' · ' + L('לחצו לכיבוי שיטה זו') : ' · ' + L('לחצו להפעלת שיטה זו')}"><div class="mn">${L(f.labels[id])}</div><div class="num">${fmt(r.value)}</div><div class="bdgRow">${hitsBdg}${badges}</div></div>`;
      }).join('')}</div>`;
      if (f.key === 'regular') {
        // שורת נוטריקון מקוננת בתוך אותו מלבן (לא כפתור/קופסה נפרדת) — תמיד גלויה, בלי פס-צבע עליון
        // (אין style="--c:…"): רק מונה-תוצאות חי לכל שיטת-חילוץ. לחיצה על התא (כמו על העיגול) ממיינת לפי השיטה,
        // ללא ערך-גי' (תמיד שווה ל'רגילה' שכבר מוצג למעלה) וללא עיגולי-התאמה-לצד-שני.
        const notCells = NOTARIKON_IDS.map(m => { const c = (st.notCounts && st.notCounts[m]) || 0, hitOn = st.hitsSort === m ? ' on' : ''; return `<div class="gr4cell notCell${hitOn}" data-m="${m}" title="${L(NOTARIKON_LABELS[m])} — ${L('נוטריקון')}${hitOn ? ' — ' + L('פעיל, לחצו לביטול') : ' — ' + L('לחצו למיון התוצאות לפי שיטה זו')}"><div class="mn">${L(NOTARIKON_LABELS[m])}</div><div class="bdgRow"><span class="bdgH${hitOn}" data-m="${m}" title="${fmt(c)} ${L('התאמות נוטריקון')}${hitOn ? ' — ' + L('פעיל, לחצו לביטול') : ' — ' + L('לחצו למיון התוצאות לפי שיטה זו')}">${fmt(c)}</span></div></div>`; }).join('');
        return `<div class="gr4Wrap">${cells}<hr class="notDivider"><div class="gr4">${notCells}</div></div>`;
      }
      const baseR = res[k][f.ids[0]], noteFull = hasTxt ? (baseR.transformedText || '') : '';
      const note = `<div class="gr4Note" title="${noteFull ? esc(noteFull) : ''}">${noteFull ? `<span class="cpy" role="button" tabindex="0" title="${L('העתק את המחרוזת המומרת ללוח')}" data-copy="${esc(noteFull)}">⧉</span>` : ''}<span class="noteTxt">${noteFull ? esc(noteFull) : '&nbsp;'}</span></div>`;
      return `<div class="gr4Wrap">${cells}${note}</div>`;
    }).join('');
    // מילוי: אותה "מראה" כמו אתב״ש/אטב״ח — מלבן + שורת-הערה לאורך כל הרוחב בתחתית, עם המחרוזת המומרת
    // בלבד (שמות-האותיות המלאים, ללא נוסחת-הסכום), במקום ההערה-הקטנה-ליד-השם הישנה.
    const restHtml = E.METHODS.filter(m => m.id === 'milui').map(m => { const r = res[k][m.id], on = st.ms.has(m.id), mine = CM.matches.filter(x => x[side].method === m.id), hl = mine.find(x => x.id === FOCUS) || mine[0];
      const noteFull = hasTxt ? (r.transformedText || '') : '';
      const hits = sourceHits(st, m.id), hitsOn = st.hitsSort === m.id ? ' on' : '', hitsBdg = `<span class="bdgH${hitsOn}" data-m="${m.id}" title="${fmt(hits)} ${L('התאמות במקורות')}${hitsOn ? ' — ' + L('פעיל, לחצו לביטול') : ' — ' + L('לחצו למיון התוצאות לפי שיטה זו')}">${fmt(hits)}</span>`;
      const matchBdgs = mine.map(x => `<button class="bdg${blinkOn(x) ? ' blinkBdg' : ''}" style="--c:${x.color};${blinkOn(x) ? blinkDelay() : ''}" data-f="${x.id}" title="${L('התאמה')} ${heNum(x.id)}">${heNum(x.id)}</button>`).join('');
      // שורה שטוחה אחת (לא עמודה מוערמת כמו ב-gr4cell הצר): משמאל לימין — ערך, עיגול-תוצאות, עיגולי-התאמה, כותרת
      const bk = blinkOn(hl), row = `<div class="gr${on ? '' : ' off'}${bk ? ' blinkBar' : ''}" data-m="${m.id}" style="--c:${hl ? hl.color : 'var(--ln2)'};${bk ? blinkDelay() : ''}" title="${on ? L('לחצו לכיבוי שיטה זו') : L('לחצו להפעלת שיטה זו')}"><div class="mn">${L(m.name)}</div>${matchBdgs}${hitsBdg}<span class="num">${fmt(r.value)}</span></div>`;
      const note = `<div class="gr4Note" title="${noteFull ? esc(noteFull) : ''}">${noteFull ? `<span class="cpy" role="button" tabindex="0" title="${L('העתק את המחרוזת המומרת ללוח')}" data-copy="${esc(noteFull)}">⧉</span>` : ''}<span class="noteTxt">${noteFull ? esc(noteFull) : '&nbsp;'}</span></div>`;
      return `<div class="gr4Wrap">${row}${note}</div>`; }).join('');
    $('#gr' + k).innerHTML = gr4Html + restHtml;
    $('#gr' + k).querySelectorAll('.bdg').forEach(b => { b.onclick = () => focusMatch(+b.dataset.f); });
    $('#gr' + k).querySelectorAll('.bdgH').forEach(b => { b.onclick = () => hitsSortToggle(k, b.dataset.m); });
  });
  // UX נייד (v3.0.0, ראו המדריך למעלה ליד #mShell): אותו res/CM/FOCUS בדיוק שכבר חושבו למעלה, רק מרונדרים
  // למבנה-תצוגה שונה (לוח משולב אחד, לא שני לוחות gr4). אם #mgr לא קיים (לא אמור לקרות — האלמנט תמיד
  // ב-DOM, רק מוסתר ב-CSS כש-לא-נייד) פשוט מדלגים, בלי לקרוס.
  if ($('#mgr')) buildMobileGrid(res);
  if ($('#mMatchSum')) {
    $('#mMatchSum').innerHTML = empty ? L('הקלד טקסט בשני הצדדים כדי להשוות ביניהם.') : CM.matches.length ? `<b>${CM.matches.length}</b> ${L('התאמות בין השיטות המסומנות בשני הצדדים.')}` : L('אין התאמות בין השיטות המסומנות בשני הצדדים.');
    // v3.2.0: קטע-הקלט+הערך-הגימטרי של כל צד (שהוצג בעבר בשבבי-הסיכום בגיליון, .mPeekChip, שהוסרו)
    // מוצג כעת ב-#mSummaryBar למעלה (ראו index.html/setupMobileUX) — אותם שדות, יעד שונה בלבד.
    KS.forEach(k => {
      const st = S[k];
      const txt = $('#sumTxt' + k), num = $('#sumNum' + k);
      if (txt) txt.textContent = st.text.trim() ? st.text : L('(ריק)');
      if (num) num.textContent = st.text.trim() ? fmt(res[k].regular.value) : '';
    });
  }
}
// עדכון-חי *קל-משקל* של רק המספרים-המשתנים (עיגולי "התאמות במקורות"/נוטריקון) בתאי-שיטות-הגימטריה, לשימוש
// בלולאת-החיפוש הפעילה (step() ב-run(), עד פעם ב-150 מ"ש) — בלי להרוס-ולבנות-מחדש את כל רשת-התאים
// (renderCenter המלא עושה innerHTML על #gr{k} כולו). בדיוק כמו ב-appendLiveRows/renderWindow ברשימת-
// התוצאות (ראו ההערות שם): הריסה-ובנייה-מחדש חוזרת-ונשנית של אלמנטים גורמת למשפחת-באגי-ההבהוב (מסגרת/
// hover/סמן-עכבר) כש-העכבר נח מעל אחד מהמלבנים תוך-כדי חישוב — שדווח גם כאן. הפתרון: מעדכנים רק את
// ה-textContent/title של עיגולי-ה-"בדגה" הקיימים (לפי data-m), בלי לגעת בשאר התא (מסגרת/צבע/מבנה) —
// כי אלה ממילא לא משתנים תוך-כדי חיפוש בודד (רק מספר-ההתאמות גדל בהדרגה). renderCenter המלא עדיין
// משמש בכל שינוי *מבני* אמיתי (הקלדה, הפעלה/כיבוי שיטה, תחילת/סיום חיפוש וכו').
function updateCenterCounts(k) {
  const st = S[k], root = $('#gr' + k);
  if (!root) return;
  root.querySelectorAll('.bdgH[data-m]').forEach(el => {
    const m = el.dataset.m, isNot = NOTARIKON_IDS.includes(m);
    const hits = isNot ? ((st.notCounts && st.notCounts[m]) || 0) : sourceHits(st, m);
    const on = el.classList.contains('on');
    el.textContent = fmt(hits);
    el.title = LANG === 'en'
      ? `${fmt(hits)} ${isNot ? 'notarikon' : 'source'} matches${on ? ' — active, click to cancel' : ' — click to sort results by this method'}`
      : `${fmt(hits)} התאמות ${isNot ? 'נוטריקון' : 'במקורות'}${on ? ' — פעיל, לחצו לביטול' : ' — לחצו למיון התוצאות לפי שיטה זו'}`;
  });
  // אותו עדכון-חי קל-משקל, גם על לוח-החישוב המשולב של UX הנייד (#mgr) — ראו buildMobileGrid למטה.
  // ה-class ccHits הוא גם עיגול-"תוצאות במקורות" וגם עיגול-נוטריקון, מבדילים לפי NOTARIKON_IDS
  // בדיוק כמו למעלה — data-k מזהה לאיזה צד (א׳/ב׳) העיגול הזה שייך בתוך התא הממוזג.
  const mroot = $('#mgr');
  if (mroot) {
    mroot.querySelectorAll(`.ccHits[data-k="${k}"]`).forEach(el => {
      const m = el.dataset.m, isNot = NOTARIKON_IDS.includes(m);
      const hits = isNot ? ((st.notCounts && st.notCounts[m]) || 0) : sourceHits(st, m);
      el.textContent = fmt(hits);
    });
  }
}

/* ============ UX נייד (v3.0.0): לוח-חישוב משולב (#mgr) ============
   מחליף את שני מלבנים-ה-gr4 הנפרדים (אחד לכל צד) בתא *אחד* לכל שיטה, שמכיל את ערכי-שני-הצדדים זה-לצד-זה
   ("צ'יפ" צבוע לכל צד) — ראו המוקים שהוצגו למשתמש לפני המימוש. קורא את *אותו* res/CM/FOCUS/st.ms שכבר
   חושבו ב-renderCenter (לא מחשב שום דבר מחדש) כדי שההתאמות/המספרים תמיד זהים-בהכרח לאלה שמוצגים בלוח
   הרגיל (לא עוד "מקור אמת" שעלול להתבדר ממנו). עיגולי-ההתאמה (ccBdg2) ועיגולי-"תוצאות במקורות" (ccHits)
   משתמשים באותה data בדיוק כמו .bdg/.bdgH הרגילים — רק מסודרים אחרת ויזואלית. קליקים על הלוח מטופלים
   ב-event-delegation יחיד שנרשם פעם אחת ב-setupMobileUX (לא נרשם-מחדש בכל renderCenter, כי #mgr עצמו
   לא מוחלף/מנותק מה-DOM — רק innerHTML שלו מתעדכן). */
function mobileChip(k, id, label, r, res) {
  const st = S[k], side = k === 'A' ? 'a' : 'b';
  const on = st.ms.has(id);
  const mine = CM.matches.filter(x => x[side].method === id);
  const hl = mine.find(x => x.id === FOCUS) || mine[0];
  const hits = sourceHits(st, id), hitOn = st.hitsSort === id ? ' on' : '';
  const matchBdg = hl ? `<button class="ccBdg2${blinkOn(hl) ? ' blinkBdg' : ''}" data-k="${k}" data-match="${hl.id}" style="--mc:${hl.color};${blinkOn(hl) ? blinkDelay() : ''}" title="${L('התאמה')} ${heNum(hl.id)}">${heNum(hl.id)}</button>` : '';
  const barVar = hl ? `--bar${k}:${hl.color};` : '';
  return { foc: blinkOn(hl), html: `<div class="ccChip${on ? '' : ' off'}${hl ? ' matched' : ''}" data-k="${k}" data-m="${id}" style="${hl ? `--mc:${hl.color}` : ''}" title="${L(label)} · ${fmt(r.value)}">${matchBdg}<span class="ccNum">${fmt(r.value)}</span><button class="ccHits${hitOn}" data-k="${k}" data-m="${id}" title="${fmt(hits)} ${L('התאמות במקורות')}">${fmt(hits)}</button></div>`, barVar };
}
function buildMobileGrid(res) {
  const hasTxtA = !!S.A.text.trim(), hasTxtB = !!S.B.text.trim();
  const famHtml = GEM_FAMILIES.map((f, fi) => {
    // v3.4.1: לתא-השיטה *הראשון* בלבד יש id ייעודי (mgrFirstFam) — הסיור-המודרך-בנייד מצביע עליו, לא על
    // כל #mgr (ראו bugfix בהמשך: #mgr כולו גבוה מ-1000px, גבוה בהרבה מגובה-המסך, ולכן ה-highlight של
    // driver.js היה "נמתח" הרבה מעבר לתצוגה — בפועל נראה כאילו שום דבר לא מודגש/מטושטש).
    const idAttr = fi === 0 ? ' id="mgrFirstFam"' : '';
    let barA = '', barB = '';
    const cellsHtml = f.ids.map(id => {
      const a = mobileChip('A', id, f.labels[id], res.A[id], res), b = mobileChip('B', id, f.labels[id], res.B[id], res);
      if (a.barVar) barA = a.barVar.match(/--barA:([^;]+)/)[1];
      if (b.barVar) barB = b.barVar.match(/--barB:([^;]+)/)[1];
      const bk = a.foc || b.foc;
      return `<div class="ccell${a.foc ? ' blinkA' : ''}${b.foc ? ' blinkB' : ''}" style="--barA:${barA || 'var(--acA)'};--barB:${barB || 'var(--acB)'};${bk ? blinkDelay() : ''}"><div class="ccMn">${L(f.labels[id])}</div><div class="ccVals">${a.html}${b.html}</div></div>`;
    }).join('');
    if (f.key === 'regular') {
      const notCells = NOTARIKON_IDS.map(m => {
        const cA = (S.A.notCounts && S.A.notCounts[m]) || 0, cB = (S.B.notCounts && S.B.notCounts[m]) || 0;
        const hitOnA = S.A.hitsSort === m ? ' on' : '', hitOnB = S.B.hitsSort === m ? ' on' : '';
        return `<div class="ccell notCell"><div class="ccMn">${L(NOTARIKON_LABELS[m])}</div><div class="ccVals">
          <div class="ccChip" data-k="A" data-not="${m}"><button class="ccHits${hitOnA}" data-k="A" data-m="${m}" title="${L('התאמות נוטריקון')}">${fmt(cA)}</button></div>
          <div class="ccChip" data-k="B" data-not="${m}"><button class="ccHits${hitOnB}" data-k="B" data-m="${m}" title="${L('התאמות נוטריקון')}">${fmt(cB)}</button></div>
        </div></div>`;
      }).join('');
      return `<div class="cGrid4"${idAttr}>${cellsHtml}</div><hr class="notDivider"><div class="cGrid4">${notCells}</div>`;
    }
    const baseR_A = res.A[f.ids[0]], baseR_B = res.B[f.ids[0]];
    const noteA = hasTxtA ? (baseR_A.transformedText || '') : '', noteB = hasTxtB ? (baseR_B.transformedText || '') : '';
    const noteTxt = (noteA || noteB) ? `<b>${L('צד א׳')}</b> ${esc(noteA || '—')} &nbsp;·&nbsp; <b>${L('צד ב׳')}</b> ${esc(noteB || '—')}` : '&nbsp;';
    const copyData = (noteA || noteB) ? `${L('צד א׳')}: ${noteA}\n${L('צד ב׳')}: ${noteB}` : '';
    const note = `<div class="ccNote">${copyData ? `<span class="cpy" role="button" tabindex="0" title="${L('העתק את המחרוזת המומרת ללוח')}" data-copy="${esc(copyData)}">⧉</span>` : ''}<span class="noteTxt">${noteTxt}</span></div>`;
    return `<div class="cGrid4"${idAttr}>${cellsHtml}</div>${note}`;
  }).join('');
  const miluiA = mobileChip('A', 'milui', 'מילוי', res.A.milui, res), miluiB = mobileChip('B', 'milui', 'מילוי', res.B.milui, res);
  const mBarA = miluiA.barVar.match(/--barA:([^;]+)/), mBarB = miluiB.barVar.match(/--barB:([^;]+)/);
  const mbk = miluiA.foc || miluiB.foc;
  const miluiCell = `<div class="ccell${miluiA.foc ? ' blinkA' : ''}${miluiB.foc ? ' blinkB' : ''}" style="--barA:${mBarA ? mBarA[1] : 'var(--acA)'};--barB:${mBarB ? mBarB[1] : 'var(--acB)'};${mbk ? blinkDelay() : ''}"><div class="ccMn">${L('מילוי')}</div><div class="ccVals">${miluiA.html}${miluiB.html}</div></div>`;
  const noteMA = hasTxtA ? (res.A.milui.transformedText || '') : '', noteMB = hasTxtB ? (res.B.milui.transformedText || '') : '';
  const miluiNoteTxt = (noteMA || noteMB) ? `<b>${L('צד א׳')}</b> ${esc(noteMA || '—')} &nbsp;·&nbsp; <b>${L('צד ב׳')}</b> ${esc(noteMB || '—')}` : '&nbsp;';
  const miluiCopy = (noteMA || noteMB) ? `${L('צד א׳')}: ${noteMA}\n${L('צד ב׳')}: ${noteMB}` : '';
  const miluiNote = `<div class="ccNote">${miluiCopy ? `<span class="cpy" role="button" tabindex="0" title="${L('העתק את המחרוזת המומרת ללוח')}" data-copy="${esc(miluiCopy)}">⧉</span>` : ''}<span class="noteTxt">${miluiNoteTxt}</span></div>`;
  $('#mgr').innerHTML = famHtml + `<div class="cGridSingle cGrid4">${miluiCell}</div>${miluiNote}`;
}
// event-delegation יחיד על #mgr (נרשם פעם אחת ב-setupMobileUX) — מטפל בכל הקליקים האפשריים בתוך הלוח
// הממוזג: עיגול-התאמה (ccBdg2, ממקד כמו .bdg הרגיל), עיגול-תוצאות (ccHits, ממיין כמו .bdgH הרגיל), כפתור-
// העתקה (cpy, כמו בלוחות הרגילים), ולחיצה על ה"צ'יפ" עצמו (מדליק/מכבה את השיטה הזו ל*צד הזה בלבד* — בדיוק
// כמו לחיצה על gr4cell בלוח הרגיל, רק שכאן שני הצדדים גלויים זה-לצד-זה באותו תא).
function bindMobileGrid() {
  const mgr = $('#mgr'); if (!mgr) return;
  mgr.addEventListener('click', e => {
    const mb = e.target.closest('.ccBdg2');
    if (mb) { focusMatch(+mb.dataset.match); return; }
    const hb = e.target.closest('.ccHits[data-m]');
    if (hb) { hitsSortToggle(hb.dataset.k, hb.dataset.m); return; }
    const cp = e.target.closest('.cpy');
    if (cp) { copyText(cp.dataset.copy); cp.textContent = '✓'; setTimeout(() => { cp.textContent = '⧉'; }, 900); return; }
    const nchip = e.target.closest('.ccChip[data-not]');
    if (nchip) { hitsSortToggle(nchip.dataset.k, nchip.dataset.not); return; }
    const chip = e.target.closest('.ccChip[data-m]');
    if (chip) { const k = chip.dataset.k, m = chip.dataset.m, st = S[k]; st.ms.has(m) ? st.ms.delete(m) : st.ms.add(m); run(k); renderCenter(); }
  });
}

/* ============ UX נייד (v3.0.0): מעטפת-הטלפון (#mShell) ============
   מזהים "טלפון" לפי בדיוק אותו matchMedia שה-CSS משתמש בו (styles.css) — חייבים זהות מושלמת בין השניים,
   אחרת ה-JS עלול "להזיז" אלמנטים לתוך מעטפת שה-CSS בכלל לא מציג (או להפך). ברגע שה-matchMedia משתנה
   (סיבוב מכשיר/שינוי-גודל חלון, כולל במעבר בין טלפון לטאבלט כש-DevTools-emulation משתנה) — מעבירים
   (לא משכפלים!) את פנלי-התוצאות/הקלט האמיתיים פנימה/החוצה, כך שאין אף פעם שני מופעים חיים של אותו
   #rlA/#tA וכו' — תמיד בדיוק אחד, רק במקום אחר ב-DOM. */
const MQ_PHONE = window.matchMedia('(pointer:coarse) and (max-width:500px), (pointer:coarse) and (orientation:landscape) and (max-height:500px)');
let mobileActive = false;
function enterMobileLayout() {
  if (mobileActive) return; mobileActive = true;
  KS.forEach(k => {
    const resEl = document.querySelector(`.side[data-k="${k}"] .pn.res`);
    const inpEl = document.querySelector(`.side[data-k="${k}"] .pn.ctr .inp`);
    if (resEl) { resEl.dataset.k = k; $('#mRes' + k).appendChild(resEl); }
    if (inpEl) { $('#mInpHost' + k).appendChild(inpEl); }
  });
  renderCenter();
  // המסלול-המותאם (.fsTrack) נמדד לפי clientHeight בפועל — אפס כל עוד הפנל היה בתוך #ws המוסתר (display:none),
  // לכן חייבים לחשב-מחדש אחרי שהפנל קיבל לראשונה גודל אמיתי (ברגע שעבר ל-#mShell הגלוי).
  setTimeout(() => KS.forEach(fsLayout), 0);
}
function exitMobileLayout() {
  if (!mobileActive) return; mobileActive = false;
  KS.forEach(k => {
    const sideEl = document.querySelector(`.side[data-k="${k}"]`);
    const ctrEl = sideEl && sideEl.querySelector('.pn.ctr');
    const resEl = $('#mRes' + k).querySelector('.pn.res');
    const inpEl = $('#mInpHost' + k).querySelector('.inp');
    if (resEl && sideEl) { delete resEl.dataset.k; sideEl.insertBefore(resEl, sideEl.firstChild); }
    if (inpEl && ctrEl) { const sumEl = ctrEl.querySelector('.sum'); ctrEl.insertBefore(inpEl, sumEl); }
  });
  setTimeout(() => KS.forEach(fsLayout), 0);
}
function applyMobileLayout() { (phoneForced || MQ_PHONE.matches) ? enterMobileLayout() : exitMobileLayout(); }
/* מתג נסתר: "תצוגת סמארטפון" בחלון רגיל (למשל בתצוגה המקדימה של האפליקציה, שבה אין מסך-מגע). פריסת-הנייד נקבעת ע״י
   matchMedia — מסך-מגע (pointer:coarse) *וגם* רוחב עד 500px — ולכן אי-אפשר להפעיל אותה בצמצום-חלון. כאן: (1) html.forcePhone
   מפעיל ב-styles.css עותק-מראה של כללי ה-@media הרלוונטיים (לא קורא cssRules — בקובץ file:// הוא חסום); (2) הגוף מצטמצם
   ל-390px; (3) applyMobileLayout מתייחס ל-phoneForced.
   הפעלה/כיבוי: 5 לחיצות מהירות על הכותרת "גימטריבון", או #phone / #desktop בסוף הכתובת. */
let phoneForced = false;
function setPhoneForced(on) {
  on = !!on; if (on === phoneForced) return; phoneForced = on;
  document.documentElement.classList.toggle('forcePhone', on);
  applyMobileLayout();
  window.dispatchEvent(new Event('resize'));
}
// יציאה ממצב טלפון במסך רחב חוזרת לשולחן העבודה (אותם תנאים כמו ההפניה בראש index.html), לא לממשק הקלאסי
function backToDesktop() {
  try { if (window.top !== window || navigator.webdriver || /[?&]embed=/.test(location.search) || innerWidth < 1000 || matchMedia('(pointer:coarse)').matches) return; } catch (e) { return; }
  location.href = 'desktop.html';
}
(() => {
  const h1 = document.querySelector('.brand h1'); let n = 0, t = 0;
  if (h1) h1.addEventListener('click', () => { const now = Date.now(); n = now - t < 700 ? n + 1 : 1; t = now; if (n >= 5) { n = 0; setPhoneForced(!phoneForced); if (!phoneForced) backToDesktop(); } });
  const fromHash = () => { if (location.hash === '#phone') setPhoneForced(true); else if (location.hash === '#desktop') setPhoneForced(false); };
  window.addEventListener('hashchange', fromHash); setTimeout(fromHash, 0);
})();
// טקסט תלוי-שפה של מעטפת-הנייד — מופרד מ-setupMobileUX כדי ש-applyLang יוכל לקרוא לו שוב (בלי לרשום
// מחדש את כל המאזינים) כש-המשתמש מחליף שפה תוך-כדי שימוש בטלפון.
function applyMobileLangStatic() {
  const en = LANG === 'en';
  $('#mSummaryBar').setAttribute('aria-label', L('בחירת צד לתצוגת תוצאות'));
  $('#mPanelTitle').textContent = L('לוח חישוב משולב — לחצו על שיטה כדי להפעיל/לכבות אותה');
  ['A', 'B'].forEach(k => {
    const short = en ? k : (k === 'A' ? 'א׳' : 'ב׳');
    $('#sumTag' + k).textContent = short; $('#mCTag' + k).textContent = short;
  });
  $('#mLegA').textContent = en ? 'A' : 'א׳'; $('#mLegB').textContent = en ? 'B' : 'ב׳';
  $('#mKebab').setAttribute('title', L('תפריט')); $('#mKebab').setAttribute('aria-label', L('תפריט'));
  $('#mmThemeTxt').textContent = ($('#themeChk').checked) ? L('מראה גוויל') : L('מראה לילה');
  $('#mmLangTxt').textContent = en ? 'עברית' : 'English';
  $('#mmTourTxt').textContent = L('סיור מודרך');
  $('#mmMethodsTxt').textContent = L('שיטות גימטריה');
  $('#mmAboutTxt').textContent = L('אודות');
  $('#mmContactTxt').textContent = L('צור קשר');
  $('#mMenuVer').textContent = VER_TXT;
}
// mSide: הצד המוצג כרגע בפנל-התוצאות של הנייד — נשלט ע״י #mSummaryBar (למעלה, מתחת לכותרת; גם בורר-צד
// וגם מציג קטע-מהקלט+ערך-גימטרי של כל צד — ראו renderCenter/index.html).
let mSide = 'A';
function setupMobileUX() {
  bindMobileGrid();
  applyMobileLangStatic();
  const segs = () => document.querySelectorAll('.mSumSeg');
  const renderMSide = () => {
    segs().forEach(s => s.classList.toggle('active', s.dataset.side === mSide));
    document.querySelectorAll('.mResPane').forEach(p => p.classList.toggle('on', p.dataset.side === mSide));
  };
  segs().forEach(s => { s.onclick = () => { mSide = s.dataset.side; renderMSide(); }; });
  renderMSide();
  // גיליון תחתון: פתיחה/סגירה רק ע״י לחיצה על הידית (כפתור "ערוך קלט" נפרד הוסר ב-v3.2.0) או ע״י הקלקה
  // על המסך-הכהה (scrim) כש-פתוח. ראו styles.css להסבר על מנגנון-הכיווץ (max-height על #mSheetBody בלבד).
  const sheet = $('#mSheet'), scrim = $('#mScrim');
  const setSheetOpen = open => { sheet.classList.toggle('collapsed', !open); scrim.classList.toggle('show', open); };
  $('#mSheetHandle').onclick = () => setSheetOpen(sheet.classList.contains('collapsed'));
  scrim.onclick = () => setSheetOpen(false);
  // v3.4.0: פנל-ההתאמות פתוח כברירת-מחדל בעת טעינת האפליקציה (לא מכווץ) — ב-HTML הסטטי הוא עדיין
  // מתחיל עם class="collapsed" (כדי שלא "יהבהב" פתוח רגע לפני ש-JS מתחבר), ו-setupMobileUX פותח אותו
  // מיידית כאן ברגע שה-handlers כבר מוכנים.
  setSheetOpen(true);
  // תפריט ⋮: לא כפילות-לוגיקה — כל פריט רק "מקליק" על הכפתור המקורי המתאים (שעדיין קיים ב-DOM, רק מוסתר
  // ויזואלית בטלפון), כך שכל הלוגיקה (דיאלוגים, מעבר שפה/מראה) ממשיכה לרוץ ממקום אחד יחיד.
  const menu = $('#mMenuPanel'), menuScrim = $('#mMenuScrim');
  const setMenuOpen = open => { menu.classList.toggle('show', open); menu.setAttribute('aria-hidden', String(!open)); menuScrim.classList.toggle('show', open); };
  $('#mKebab').onclick = () => setMenuOpen(!menu.classList.contains('show'));
  menuScrim.onclick = () => setMenuOpen(false);
  const proxy = (menuId, realId) => { $(menuId).onclick = () => { setMenuOpen(false); $(realId).click(); }; };
  // מראה-כהה: הלייבל בתפריט ("מראה לילה"/"מראה גוויל") תלוי-מצב, ולא מתעדכן לבד ע״י ה-onchange של
  // #themeChk (שאינו יודע כלל שהתפריט קיים) — לכן מרעננים אותו ידנית מיד אחרי ההקלקה.
  $('#mmTheme').onclick = () => { setMenuOpen(false); $('#themeChk').click(); applyMobileLangStatic(); };
  proxy('#mmLang', '#langSw'); proxy('#mmTour', '#startTour');
  proxy('#mmMethods', '#openMethods'); proxy('#mmAbout', '#openAbout'); proxy('#mmContact', '#openContact');
  MQ_PHONE.addEventListener('change', applyMobileLayout);
  window.addEventListener('orientationchange', () => setTimeout(applyMobileLayout, 60));
  window.addEventListener('resize', () => { if (mobileActive) KS.forEach(fsLayout); });
  applyMobileLayout();
}

/* ---------- חיפוש ---------- */
// ייחוס לתצוגה — "הערה N" הוסרה לגמרי לבקשת המשתמש (מספור פנימי של קטעי פירוש, לא משמעותי למשתמש)
const ref = u => {
  const b = B.books[u.b]; if (b.kind === 'word') return E.unpackText(u.t);
  const p = (LANG === 'en' ? PFX_EN[b.cat] : PFX[b.cat]) + bookName(b.heTitle);
  if (b.kind === 'mishnah') return LANG === 'en' ? `${p} ch. ${heNum(u.ch)} mishnah ${heNum(u.n)}` : `${p} פרק ${heNum(u.ch)} משנה ${heNum(u.n)}`;
  if (b.kind === 'halakha') return LANG === 'en' ? `${p} ch. ${heNum(u.ch)} halakhah ${heNum(u.n)}` : `${p} פרק ${heNum(u.ch)} הלכה ${heNum(u.n)}`;
  if (b.kind === 'talmud') return LANG === 'en' ? `${p} ${heNum(u.ch)} side ${u.s === 1 ? 'a' : 'b'}${u.k ? `, line ${u.n}` : ''}` : `${p} ${heNum(u.ch)} ע״${u.s === 1 ? 'א' : 'ב'}${u.k ? `, שורה ${u.n}` : ''}`;
  return `${p} ${heNum(u.ch)}:${heNum(u.n)}`;
};
// חיפוש מדורג (chunked): כל שיטת-חיפוש נסרקת כ"חתיכה" נפרדת, עם "נשימה" לדפדפן (setTimeout) בין חתיכה לחתיכה —
// כך המסך לא קופא גם כשכל השיטות/המקורות פעילים, התוצאות מופיעות בהדרגה, ואפשר לבטל חיפוש ישן (st.gen)
// ברגע שמתחיל חיפוש חדש (למשל כשממשיכים להקליד) בלי לחכות שהישן יסתיים.
// מחשב את "הקשר-החיפוש" הבסיסי של צד (k): מילת/מספר-החיפוש, שיטות פעילות, תקציב-תוצאות, מסנן-מקורות,
// וערכי מילת-החיפוש לפי כל שיטת-מילה.
function buildSearchContext(st) {
  const q = st.text, num = numVal(st.num);
  const wms = E.METHODS.map(m => m.id).filter(m => st.ms.has(m)); // שיטות של מילת החיפוש
  const sms = E.METHODS.map(m => m.id).filter(m => st.sms.has(m)); // שיטות לחיפוש בפסוקים
  const limit = MAX_RESULTS_PER_SEARCH;
  const filt = { books: st.sel.size === ALL.size ? null : st.sel, ranges: st.ranges.size ? st.ranges : null, fullUnit: st.fullUnit, singleWord: st.singleWord };
  // ערכי מילת החיפוש לפי כל שיטת-מילה פעילה (מחושב פעם אחת; המספר, אם הוזן, לא תלוי בשיטת-מילה כלשהי)
  const wmVal = new Map();
  if (!num) for (const wm of wms) { const v = E.calculateGematria(q, wm).value; if (v) wmVal.set(wm, v); }
  // בונה את רשימת היעדים לשיטת-חיפוש נתונה (sm) — עם דה-דופ לערכים זהים, ובכפוף לחוק אי-ההתאמה:
  // קולל/עם-תיבות/עם-אותיות לעולם לא ייחשבו התאמה כנגד קולל/עם-תיבות/עם-אותיות (ראו E.pairAllowed),
  // כך שלכל שיטת-חיפוש יכולה להיות רשימת-יעדים שונה (שיטת-מילה אסורה לצמד הזה פשוט לא תורמת יעד עבורו).
  const targetsFor = sm => {
    if (num) return [{ value: num, tag: [] }];
    const vmap = new Map();
    for (const [wm, v] of wmVal) { if (!E.pairAllowed(wm, sm)) continue; if (!vmap.has(v)) vmap.set(v, []); vmap.get(v).push(wm); }
    return [...vmap].map(([value, srcWms]) => ({ value, tag: srcWms }));
  };
  return { q, num, wms, sms, limit, filt, wmVal, targetsFor };
}
// חיפוש הנוטריקון (ר״ת/אות ב׳/אות ג׳/ס״ת) — עצמאי לגמרי מ-run() (לא חלק מ-sms/ms, אין עוד כפתור-הפעלה),
// נקרא תמיד מתוך run() כדי שיתעדכן בכל טריגר (הקלדה/שינוי עץ-מקורות/מגבלת-תוצאות וכו') בלי לשכפל קריאות
// בכל האתרים שקוראים ל-run(). ה-target הוא ערך ה'רגילה' של מילת/ביטוי-החיפוש (או st.num אם הוזן מספר —
// במקרה הזה אין "אותיות מילת-חיפוש" להשוואה מילולית, כך שהתאמה-טקסטואלית תחזיר 0 תוצאות).
// שורות-הנוטריקון מתמזגות ישירות ל-st.all/st.info (אותו מנגנון בדיוק כמו תוצאות-חיפוש רגילות — showMore,
// סינון טקסטואלי, גלילה אינסופית, ולחיצה-על-עיגול-כדי-להקפיץ-למעלה) — לא רשימה/קונטיינר נפרד. wms:['regular']
// (ערך ה'רגילה' של מילת-החיפוש הוא תמיד היעד) כדי שכותרת-הקבוצה ("= רגילה של מילת החיפוש") תיבנה
// בלי קוד מיוחד, ו-method נשאר notRt/notB/notC/notSt (מזהה ל-showMore שמדובר בשורת-נוטריקון, לרינדור
// צביעת-האות-הבודדת ולקידום-לפי-עיגול ב-visibleIdx/hitsSortToggle).
function runNotarikon(k) {
  const st = S[k]; st.notGen = (st.notGen || 0) + 1; const myGen = st.notGen;
  const finish = (counts, rows, target) => {
    if (myGen !== st.notGen) return;
    st.notCounts = counts;
    if (rows.length) {
      const add = () => { st.info = st.info.concat(NOTARIKON_IDS.filter(m => counts[m]).map(m => ({ method: m, target, wms: ['regular'], total: counts[m], notarikon: true }))); storeAdd(st.all, rows); };
      // שורות הנוטריקון תמיד בסוף הרשימה (אחרי מילוי): כל עוד החיפוש הראשי רץ הן נשמרות בצד, ו-run() מוסיף
      // אותן כשהוא מסיים (flushNot). אחרת היו נכנסות לראש הרשימה, כי בדרך-כלל הן מסיימות ראשונות.
      if (st.mainBusy) { st.notPend = add; updateCenterCounts(k); return; }
      add();
      // שימו-לב: *לא* בוחרים (select) כאן, בכוונה — runNotarikon בדרך-כלל מסיים *לפני* ש-run()'s step()-loop
      // החיצוני (שיטות-חיפוש רגילות) מסיים; אם היינו בוחרים כבר כאן, הבחירה הייתה מתווספת-מחדש (class "on")
      // על אלמנט-DOM חדש בכל רענון-חי נוסף של הלולאה החיצונית (עד שזו מסיימת) — בדיוק אותו באג-הבהוב-מסגרת
      // שתואר ע״י המשתמש (כולל וידאו), רק דרך מסלול-קוד נפרד. הבחירה-הראשונית היחידה קורית ב-run()'s step(),
      // ברגע שה-run *כולו* נגמר (ראו liveRefresh(k, true) שם) — מאוחר אחרי ש-st.all כבר כולל גם את שורות-
      // הנוטריקון שנוספו כאן.
      // appendLiveRows (לא renderWindow ישירות!) — ראו ההערה המפורטת ליד appendLiveRows/liveRefresh: קריאה
      // ישירה ל-renderWindow כאן הייתה הורסת-ובונה-מחדש את כל ה-DOM, כולל שורות שכבר הוצגו ואולי נבחרו/
      // ה-עכבר מעליהן ע״י המשתמש תוך-כדי שהחיפוש הראשי (run()'s step()) עדיין רץ — בדיוק הבאג שדווח (זמן-
      // ההתרחשות תאם במדויק לרגע ש-runNotarikon מסיים, בד״כ קצת אחרי תחילת החיפוש הראשי).
      if (!appendLiveRows(k)) { renderWindow(k, 0); }
      updateTfBar(k);
    }
    // updateCenterCounts (לא renderCenter המלא!) — מאותה סיבה בדיוק כמו ה-appendLiveRows למעלה: runNotarikon
    // מסיים בד״כ *תוך-כדי* שהחיפוש הראשי עדיין רץ, ו-renderCenter המלא היה הורס-ובונה-מחדש את כל מלבני-
    // השיטות (כולל אלה שהעכבר אולי מעליהם באותו רגע) — הבהוב נוסף שדווח, הפעם במלבני השיטות עצמם.
    updateCenterCounts(k);
  };
  if (!IDX) return; // ייקרא שוב דרך KS.forEach(run) ברגע שהאינדקס מוכן
  const num = numVal(st.num);
  const target = num ? num : E.calculateGematria(st.text, 'regular').value;
  const books = new Set(); NOTARIKON_BOOKS.forEach(b => { if (st.sel.has(b)) books.add(b); });
  if (!target || (!num && !E.normalizeText(st.text).words.length) || !books.size) { finish({}, [], 0); return; }
  const filt = { books, ranges: st.ranges.size ? st.ranges : null };
  const compareLetters = num ? null : baseify(E.normalizeText(st.text).normalizedText.replace(/ /g, ''));
  const literalOnly = st.notMode === 'lit', permOnly = st.notMode === 'perm';
  const limit = MAX_RESULTS_PER_SEARCH;
  const ix = IDX;
  E.ensureNotarikonAsync(ix, err => {
    if (err || myGen !== st.notGen || IDX !== ix) return;
    const counts = {}, rows = [];
    NOTARIKON_IDS.forEach(m => { const r = E.searchNotarikon(IDX, target, [m], filt, limit, { maxWindow: NOTARIKON_MAXWINDOW, compareLetters, literalOnly, permOnly }); counts[m] = r.counts[m] || 0; for (const x of r.results) rows.push(x); }); // לא push(...) — עם מאות-אלפי שורות זה חורג ממגבלת-הארגומנטים
    finish(counts, rows, target);
  }, GEM_WAIT);
}
// מוסיף את שורות-הנוטריקון שחיכו לסוף החיפוש הראשי (ראו runNotarikon). מחזיר true אם נוספו שורות
function flushNot(st) {
  st.mainBusy = false;
  const f = st.notPend; st.notPend = null;
  if (f) f();
  return !!f;
}
function run(k) {
  const st = S[k]; st.gen = (st.gen || 0) + 1; const myGen = st.gen; // מבטל כל חיפוש מדורג קודם של הצד הזה
  if (!IDX) { if (GEM.busy) gemShowWait(); else $('#rs' + k).textContent = L('הקורפוס עדיין נטען…'); return; }
  const box = $('#rl' + k);
  st.all = makeStore(); st.cur = -1; st.winStart = 0; st.winCount = 0; st.info = []; box.innerHTML = ''; box.classList.add('searching'); updateTfBar(k);
  st.mainBusy = true; st.notPend = null;
  runNotarikon(k); // אחרי האיפוס (לא לפניו) — כדי שמסקנה-סינכרונית (אינדקס-נוטריקון כבר בנוי) לא תימחק ע״י האיפוס
  renderCenter(); // מרענן מייד את עיגולי-המידע (כולל איפוסם) — גם אם החיפוש נעצר כאן (למשל טקסט ריק) ולא מגיע לסופו
  const say = h => { $('#rs' + k).innerHTML = h; };
  // עצירה מוקדמת (אין שיטות/מקורות/טקסט): אין חיפוש ראשי, ולכן שורות-נוטריקון שכבר חיכו מוצגות מיד
  const stop = h => { say(h); if (flushNot(st)) { if (!appendLiveRows(k)) renderWindow(k, 0); updateTfBar(k); } };
  const { q, num, wms, sms, limit, filt, targetsFor } = buildSearchContext(st);
  if (!sms.length) return stop(L('סמן לפחות סוג גימטריה אחד לחיפוש בפסוקים (⚙).'));
  if (!num && !wms.length) return stop(L('סמן לפחות סוג גימטריה אחד עבור מילת החיפוש.'));
  if (!st.sel.size) return stop(L('סמן לפחות מקור אחד בעץ המקורות.'));
  if (!num && !E.normalizeText(q).words.length) return stop(L('התחל להקליד — התוצאות יופיעו כאן בזמן אמת.'));
  const t0 = performance.now();
  // כל שיטת-חיפוש נסרקת כ"חתיכה" נפרדת: נבדק בעבר שפיצול עדין יותר לפי *טווח יחידות* (כמה פרוסות
  // לכל שיטה) רק האט את הזמן הכולל — ל-setTimeout יש overhead לא-מבוטל, וכפל הקריאות עלה יותר משהחיסכון
  // בחסימת ה-thread היה שווה. *אבל* כששיטת-מילה אחת (או יותר) מפיקה כמה ערכי-יעד שונים (למשל "רגילה"
  // ו"קולל" לא שוות כשיש כמה מילים, או מילוי/אתב״ש/אטב״ח שאינן מוגבלות ע״י חוק אי-ההתאמה) — ל-engine.js
  // יש לולאת-יעדים פנימית (`tmap`) שרצה *בלי לוותר על ה-thread* בין יעד ליעד, ועם טקסט-חיפוש ארוך/חריג
  // שמפיק 3-4 ערכים שונים לכמה שיטות-חיפוש בבת-אחת, זה יכול לחסום את הדפדפן לזמן ממושך בפנייה אחת בלבד
  // (כולל לחיצות על כפתורים כמו מעבר לתצוגת התוצאות, שמחכות בתור עד שהחסימה משתחררת). לכן כאן מפרקים כל
  // שיטת-חיפוש לתור שטוח של (שיטה, יעד-בודד) — יחידת-העבודה הקטנה ביותר (המסלול המהיר של "שני מצביעים"
  // ב-engine.js) — ונותנים לדפדפן "לנשום" בין *כל* יעד בודד, לא רק בין שיטת-חיפוש לשיטת-חיפוש. ה-"מגבלת
  // תקרת-הבטיחות (limit) נשמרת ע״י תקציב פוחת (left) המשותף לכל השיטות והיעדים.
  // רק אם עדיין אין מה להציג (אין תוצאות-נוטריקון שכבר נותרו ע״י runNotarikon למעלה — ראו הערה שם; קריאה
  // אסינכרונית-למעשה-אך-מתבצעת-מיידית כש-ensureNotarikonAsync מוצא את אינדקס-הנוטריקון כבר בנוי, *בתוך*
  // אותה קריאה סינכרונית ל-run) — מציגים את "מחפש…"; אחרת היינו מוחקים תוצאות-נוטריקון אמיתיות שכבר
  // הוצגו, ובלי לנקות אותן בהמשך (ל-step למטה אין דרך לדעת שצריך לנקות, כי st.all.length כבר לא 0 מראש).
  say(L('מחפש…')); if (!st.all.n) box.innerHTML = `<div class="emp">${L('מחפש…')}</div>`;
  // אם יש מיון-לפי-עיגול-תוצאות פעיל (st.hitsSort — לחיצה על עיגול-המקורות): היעדים ששייכים לשיטת-המילה
  // הזו (tg.tag כולל אותה) מוזזים לראש רשימת-היעדים של כל שיטת-חיפוש, לפני בניית התור — כך שהם מקבלים
  // עדיפות על התקציב (left) — רלוונטי רק כשתקרת-הבטיחות נחצית.
  const queue = []; for (const sm of [...sms].sort((a, b) => METHOD_RANK[a] - METHOD_RANK[b])) { const list = targetsFor(sm); if (st.hitsSort) list.sort((a, b) => (b.tag.includes(st.hitsSort) ? 1 : 0) - (a.tag.includes(st.hitsSort) ? 1 : 0)); for (const tg of list) queue.push({ sm, tg }); }
  let left = limit;
  // שיטות-חיפוש שלא קיבלו אף יעד (למשל קולל/תיבות/אותיות כש-*כל* שיטות-המילה הפעילות אסורות עליהן לפי חוק
  // אי-ההתאמה) לא יופיעו בתור כלל — נחשבות "גמורות" כבר מההתחלה, כדי שמונה ההתקדמות (X/Y שיטות) יהיה מדויק.
  const zeroTargetSms = sms.length - new Set(queue.map(x => x.sm)).size;
  let total = 0, shown = 0, pos = 0, smsDone = 0, lastSm = null, uAt = 0, tgCount = 0;
  const nUnits = IDX.units.length, SLICE_UNITS = 25000;
  // עדכון-חי של רשימת-התוצאות תוך-כדי הסריקה: renderWindow (כמו renderCenter) לא נקרא על כל "חתיכה"
  // בודדת (יכולות להיות מאות) — תמיד בונה-מחדש את כל חלון-התצוגה (עד N = getLimit() שורות, ראו renderWindow)
  // ולא רק מוסיף שורות, אז העלות-לקריאה דומה בכל המקרים (עם/בלי סינון-טקסטואלי/מיון) — ולכן, בניגוד לגרסה
  // הקודמת, אין יותר צורך להבחין בין "חי בלי הגבלה" ל"חי מוגבל-קצב" לפי tf/hitsSort: תמיד מוגבל-קצב לעד
  // פעם ב-150 מ״ש (חוץ מה"חתיכה" הראשונה, שתמיד נענית מיד — כדי שתחושת-התגובתיות לא תיפגע).
  // *אם המשתמש כבר גלל הרחק מתחילת הרשימה* (st.winStart !== 0) — לא "קופצים" לו בחזרה לראש על כל עדכון-חי:
  // רק מרעננים את המידע התלוי-בסך-הכול (groups/ticks/thumb), בלי לגעת בחלון שהוא רואה כרגע (ראו liveRefresh).
  let lastLiveRender = performance.now(), lastLiveRefresh = performance.now();
  const step = () => {
    if (myGen !== st.gen) return; // חיפוש חדש יותר כבר התחיל — מפסיקים את זה בשקט
    if (pos >= queue.length) {
      // אם תקרת-הבטיחות (MAX_RESULTS_PER_SEARCH) חתכה תוצאות — אומרים זאת במפורש, כדי שהפער בין מספר-ההתאמות
      // הכולל לבין מה שנטען לרשימה (ומוצג ב"תוצאה X מתוך Y") לא ייראה כמו טעות
      const capNote = shown < total ? (LANG === 'en' ? ` · showing the first <b>${fmt(shown)}</b> (up to ${fmt(limit)})` : ` · מוצגות <b>${fmt(shown)}</b> הראשונות (עד ${fmt(limit)})`) : '';
      say(LANG === 'en' ? `<b>${fmt(total)}</b> matches in ${Math.round(performance.now() - t0)} ms${capNote}` : `<b>${fmt(total)}</b> התאמות ב-${Math.round(performance.now() - t0)} מ״ש${capNote}`);
      box.classList.remove('searching'); // ראו הערה למעלה ליד ההוספה — רק מעכשיו :hover שוב מגיב-מיידית כרגיל
      flushNot(st); // שורות-הנוטריקון נכנסות רק עכשיו, בסוף הרשימה
      if (!st.all.n) box.innerHTML = `<div class="emp">${L('אין התאמות בטווח שנבחר.')}</div>`;
      else liveRefresh(k, true);
      updateTfBar(k);
      renderCenter(); // מרענן את עיגולי-המידע (מספר ההתאמות במקורות) במלבנים עם התוצאה הסופית של החיפוש
      return;
    }
    // v3.16.0: כל יעד נסרק בפרוסות של SLICE_UNITS יחידות (filter.uFrom/uTo — אותה תוצאה בדיוק), כי סריקה של כל הקורפוס
    // בבת אחת לקחה 100–200 מ״ש במחשב (ופי כמה בטלפון) — זמן שבו לחיצה (למשל מעבר למסך הקריאה) מחכה
    // כמה פרוסות ברצף עד ~14 מ״ש, ורק אז עדכון שורת המצב ונשימה לדפדפן
    const tS = performance.now(); let c = 0, cAny = false;
    do {
      const { sm, tg } = queue[pos];
      if (sm !== lastSm) { smsDone++; lastSm = sm; }
      const uTo = Math.min(nUnits, uAt + SLICE_UNITS);
      const r = E.search(IDX, [tg], [sm], Object.assign({}, filt, { uFrom: uAt, uTo }), Math.max(0, left));
      total += r.total; shown += r.results.length; left -= r.results.length;
      tgCount += r.counts[sm] ? r.counts[sm].get(tg.value) || 0 : 0;
      c = 0;
      if (uTo >= nUnits) { c = tgCount; tgCount = 0; uAt = 0; pos++; } else uAt = uTo;
      if (c) st.info.push({ method: sm, target: tg.value, wms: tg.tag, total: c });
      if (r.total) {
        storeAdd(st.all, r.results);
        const firstChunk = st.all.n === r.results.length;
        const liveNow = performance.now();
        if (firstChunk || liveNow - lastLiveRefresh > 150) { liveRefresh(k); lastLiveRefresh = liveNow; }
      }
      if (c) cAny = true;
    } while (pos < queue.length && performance.now() - tS < 14);
    say(LANG === 'en'
      ? `<b>${fmt(total)}</b> matches · searching… (${smsDone + zeroTargetSms}/${sms.length} methods) · ${Math.round(performance.now() - t0)} ms`
      : `<b>${fmt(total)}</b> התאמות · מחפש… (${smsDone + zeroTargetSms}/${sms.length} שיטות) · ${Math.round(performance.now() - t0)} מ״ש`);
    const nowT = performance.now();
    if (cAny && nowT - lastLiveRender > 150) { updateCenterCounts(k); lastLiveRender = nowT; } // עדכון-חי מוגבל-קצב של עיגולי-התוצאות (בלי הרס-ובנייה-מחדש — ראו הערה ליד updateCenterCounts)
    GEM_WAIT(step);
  };
  GEM_WAIT(step);
}
// מציג את המנה הבאה של תוצאות (עד 100). אם st.tf מוגדר (שדה הסינון הטקסטואלי), מתבצע דיפדוף על רשימת
// האינדיקסים המסוננת (idx) במקום על st.all ישירות — כך שה-"הצג עוד" וכותרות הקבוצה ממשיכים לעבוד נכון.
/* ---------- גלילה וירטואלית בפנל-התוצאות ----------
   לפי בקשת המשתמש: פס-הגלילה (וה-scrollbar-המותאם fsTrack/fsThumb) צריכים "להרגיש" כאילו *כל* התוצאות
   (idx.length — יכול להגיע למיליון ומעלה) מרונדרות,
   אבל בפועל רק חלון של עד N = getLimit() (RESULTS_WINDOW) שורות אמיתיות
   נמצא ב-DOM בכל רגע; ה-DOM גדל/קטן לפי מיקום-הגלילה, לא רק גדל ללא-הגבלה (כמו שהיה עד כה, עם showMore
   מצטבר). כל הנתונים (st.all) כבר נמצאים בזיכרון במלואם ברגע שהחיפוש מתקדם — זו לא "אחזור מרחוק לפי
   offset" אלא חיתוך (slice) של מערך שכבר קיים, ולכן לא נדרש שינוי במנוע (engine.js): החידוש הוא ברינדור
   בלבד (renderWindow), לא באיך הנתונים מובאים.
   עיצוב: box (#rl{k}) מכיל תמיד שלושה ילדים — .rlSpacer (לפני) / .rlRows (השורות עצמן, עד N) / .rlSpacer
   (אחרי) — בגבהים מוערכים (st.avgRowH, מתעדן בכל רינדור לפי המדידה בפועל של .rlRows.offsetHeight/count).
   כך ש-box.scrollHeight תמיד מייצג (בקירוב טוב והולך-ומשתפר) את הגובה הכולל של *כל* התוצאות — וה-
   scrollbar-המותאם הקיים (fsLayout, שממשיך לעבוד על scrollHeight/scrollTop בלי שינוי) "מרגיש" נכון אוטומטית.
   כותרת-קבוצה (.gh): נקבעת כעת לפי st.groups (מחושב אנליטית ע״י computeGroups על *כל* idx, לא רק מה
   שמרונדר) — ולא לפי מדידת-DOM בזמן-אמת כמו קודם (fsMeasure הישן) — פתרון נקי יותר שגם פותר לחלוטין את
   בעיית-התזמון המקורית של position:sticky (שם המדידה חייבת הייתה לקרות *לפני* שהכותרת "נתקעת"). בנוסף,
   אם החלון מתחיל *באמצע* קבוצה (למשל אחרי קפיצה ישירה ע״י גרירת ה-thumb) — תמיד מוצגת כותרת לשורה
   הראשונה של החלון בכל מקרה (לא רק כש-היא *באמת* תחילת-קבוצה), כך שתמיד יש הקשר ("איזו שיטה/ערך אני רואה
   עכשיו"), בדיוק כמו שכותרת-דביקה (sticky) אמורה להתנהג. */
// עובר על *כל* idx (לא רק החלון המרונדר) וקובע את רשימת גבולות-הקבוצה (שינוי method/target) — משמש גם
// לקביעת הכותרות בתוך renderWindow וגם ל-fsBuildTicks/fsBubbleLines (עצמאי לגמרי ממה שבפועל מרונדר).
function computeGroups(k) {
  const st = S[k], idxArr = visibleIdx(st), total = idxArr ? idxArr.length : st.all.n, sto = st.all;
  const groups = []; let prevR = null;
  for (let p = 0; p < total; p++) {
    const g = sto.groups[sto.g[idxArr ? idxArr[p] : p]];
    if (!prevR || prevR.method !== g.method || prevR.target !== g.target) groups.push({ pos: p, method: g.method, target: g.target });
    prevR = g;
  }
  st.groups = groups; st.groupsTotal = total;
}
// בונה HTML של שורה בודדת (+ כותרת-קבוצה אם רלוונטי) במיקום p (במרחב-ה-idx). משותף ל-renderWindow (בנייה
// מלאה) ול-appendLiveRows (הוספה אינקרמנטלית — ראו שם) כדי שלא יהיו שני עותקים של אותו HTML-template
// שעלולים להתבדר-זה-מזה. מחלקת "on" (התוצאה הנבחרת) נאפית ישירות כאן ב-HTML של הכפתור, *לא* מתווספת בנפרד
// אחרי ההכנסה ל-DOM — כי ל-.rs (כפתור) יש transition כללי על border-color/background/box-shadow (מוגדר על
// button), ואם ה-class הייתה מתווספת לאלמנט *קיים*, זה היה נחשב "שינוי" ומפעיל את ה-transition מחדש בכל
// רענון-חי — בדיוק באג-ההבהוב שדווח (גם כש-הבחירה אוטומטית וגם כש-המשתמש בוחר בעצמו בלחיצה תוך-כדי חיפוש).
const GO_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 5.5h6a4 4 0 0 1 4 4V20a3 3 0 0 0-3-3H2z"/><path d="M22 5.5h-6a4 4 0 0 0-4 4V20a3 3 0 0 1 3-3h7z"/></svg>';
const openInReader = el => { const [b, ch, n] = el.dataset.go.split(',').map(Number); if (window.GimReader) window.GimReader.openUnit(b, ch, n); };
/* הסבר בריחוף לכפתורים ולייחוס בתוצאות ([data-tip] בתוך .resList): מופיע מהר, מעל האלמנט, ולא נחתך בגבולות השורה
   (ה-title של הדפדפן מופיע רק אחרי כשנייה). רק במכשיר עם עכבר */
(function resTips() {
  if (!matchMedia('(hover: hover)').matches) return;
  const tip = document.createElement('div'); tip.className = 'resTip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true; document.body.appendChild(tip);
  let cur = null, t = 0;
  const hide = () => { clearTimeout(t); cur = null; tip.hidden = true; };
  const show = el => {
    tip.textContent = el.dataset.tip; tip.hidden = false;
    const r = el.getBoundingClientRect(), w = tip.offsetWidth, hh = tip.offsetHeight;
    const x = Math.max(6, Math.min(innerWidth - w - 6, r.left + r.width / 2 - w / 2)), y = r.top - hh - 6 < 4 ? r.bottom + 6 : r.top - hh - 6;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  };
  // הרשימה נבנית מחדש תוך כדי חיפוש: אם האלמנט הוחלף בזמן ההמתנה, לוקחים את מה שמתחת לעכבר עכשיו
  let mx = 0, my = 0;
  const under = () => { const x = document.elementFromPoint(mx, my); return x && x.closest('.resList [data-tip]'); };
  document.addEventListener('mouseover', e => {
    mx = e.clientX; my = e.clientY;
    const el = e.target.closest && e.target.closest('.resList [data-tip]');
    if (el === cur) return; hide(); if (!el) return;
    cur = el; t = setTimeout(() => { const x = el.isConnected ? el : under(); if (cur === el && x) { cur = x; show(x); } }, 250);
  });
  ['scroll', 'mousedown', 'keydown'].forEach(ev => document.addEventListener(ev, hide, true));
})();
function buildRowHtml(st, p, idxArr, groupPos, forceHeaderAt) {
  const i = idxArr ? idxArr[p] : p, r = rowAt(st, i), u = IDX.units[r.u], s = IDX.start[r.u], e = IDX.start[r.u + 1], T = IDX.toks;
  let h = '';
  // forceHeaderAt: שימוש ע״י renderWindow בלבד (ראו שם) — תמיד מציג כותרת לשורה הראשונה-בחלון (p===start),
  // גם אם היא לא *באמת* תחילת-קבוצה (למשל אחרי קפיצה ישירה ע״י גרירת ה-thumb לאמצע קבוצה), כדי שתמיד יהיה
  // הקשר ("איזו שיטה/ערך אני רואה עכשיו"). ב-appendLiveRows אין צורך בזה כלל: שם p=0 הוא *תמיד* גם תחילת-
  // הקבוצה הראשונה-בפועל (computeGroups תמיד מוסיף גבול ב-pos=0), כך ש-groupPos.has(p) כבר מכסה את זה.
  if (p === forceHeaderAt || groupPos.has(p)) {
    const notRow = NOTARIKON_IDS.includes(r.method);
    const f = st.info.find(x => x.method === r.method && (notRow ? x.notarikon : x.target === r.target));
    const fw = f ? wmsShown(st, f.wms) : [];
    const wmTag = fw.length ? `<span class="ghW">= ${fw.map(id => `<i data-m="${id}">${esc(wmName(id))}</i>`).join(' · ')} ${L('של מילת החיפוש')}</span>` : '';
    // בנוטריקון אין ערך לשורה (r.target ריק) — לא מציגים את תג-הערך בכלל, במקום "ערך —"
    const vTag = notRow ? '' : `<span class="ghV">${L('ערך')} <b>${fmt(r.target)}</b></span>`;
    h += `<div class="gh" data-m="${r.method}"><span class="ghM" data-fam="${famKeyOf(r.method)}" data-m="${r.method}">${L(MN[r.method])} ${L('של הפסוק')}</span>${vTag}${wmTag}${f ? `<span class="ghN">${fmt(f.total)} ${L('התאמות')}</span>` : ''}</div>`;
  }
  const copyTxt = `${ref(u)}\n${T.slice(s, e).join(' ')}`;
  const bk = B.books[u.b], prs = parashaOf(u), seder = bk.cat === 1 || bk.cat >= 7 ? bk.g : '';
  const metaTag = prs ? `<span class="tag prs">${esc(parshaName(prs))}</span>` : seder ? `<span class="tag seder">${esc(groupName(seder))}</span>` : '';
  // ד״ה ברש״י: לא מוצג כתגית נפרדת ליד הייחוס — מודגש (bold) בתוך גוף הפירוש עצמו (.cx), ע״י ספירת התיבות של הד״ה
  const dhLen = (bk.cat === 2 || bk.cat === 5 || bk.cat >= 8) ? E.tokens(dibburFor(r.u)).length : 0, boldEnd = dhLen ? s + dhLen : s;
  const cap = st.cxCap || 0, hasTf = !!(st.tf && st.tf.trim());
  let segs = [cxClip(T, s, e, r.l, r.r, cap)]; // עד 4 שורות סביב ההתאמה (ראו cxClip)
  let tfRanges = hasTf ? tfWordRanges(T, segs[0].a, segs[0].b, st.tf, st.fuzzy) : null;
  // סינון טקסטואלי שהמילה שלו נמצאת בחלק שקוצר: מציגים קטע סביב ההתאמה הגימטרית, "…", ואז קטע סביב המילה שחיפשו
  if (hasTf && cap && !tfRanges.length) {
    const all = tfWordRanges(T, s, e, st.tf, st.fuzzy), half = Math.max(20, Math.floor(cap * 0.45));
    const g = cxClip(T, s, e, r.l, r.r, half);
    const m = all.find(x => x.a >= g.b) || all.filter(x => x.b <= g.a).pop();
    if (m) {
      const t = cxClip(T, s, e, m.a, m.b, half);
      if (m.a >= g.b) t.a = Math.max(t.a, g.b); else t.b = Math.min(t.b, g.a);
      segs = [g, t]; tfRanges = all;
    }
  }
  // שורת-נוטריקון (method ∈ notRt/notB/notC/notSt): צביעת האות הבודדת שחולצה (צהוב-זוהר = גם מילולי,
  // ירוק-זוהר = ערכי-בלבד) במקום הדגשת-כל-החלון הרגילה של cxHtml (אין תמיכה ב-tfRanges כאן — זניח,
  // שדה-הסינון-הטקסטואלי עדיין מסנן איזה שורות מוצגות דרך tfRowOk, רק ההדגשה-בתוך-הטקסט לא חלה כאן).
  const isNot = NOTARIKON_IDS.includes(r.method);
  const notGlow = r.literal ? 'glowY' : (r.perm ? 'glowP' : 'glowG');
  // תגיות שיטת-מילת-החיפוש: אחת לכל שיטה; בנוטריקון — סוג ההתאמה (מילים/אותיות/גימ׳); בחיפוש לפי מספר — "מספר"
  const wmTitle = L('שיטת הגימטריה של מילת החיפוש שבה נמצאה ההתאמה');
  const wmIds = wmsShown(st, r.wms);
  const wmTags = isNot ? `<span class="tag" data-m="${NOT_MATCH[notGlow][0]}" title="${L(NOTARIKON_GLOW_TITLE[notGlow])}">${L(NOT_MATCH[notGlow][1])}</span>`
    : wmIds.length ? wmIds.map(id => `<span class="tag" data-fam="${famKeyOf(id)}" data-m="${id}" title="${wmTitle}">${esc(wmName(id))}</span>`).join('')
    : `<span class="tag" title="${wmTitle}">${L('מספר')}</span>`;
  const piece = (a, b) => isNot ? notarikonCxHtml(T, a, b, notarikonSpansFor(T, r.l, r.r, r.method), notGlow, L(NOTARIKON_GLOW_TITLE[notGlow])) : cxHtml(T, a, b, r.l, r.r, boldEnd, tfRanges);
  const lastB = segs[segs.length - 1].b;
  const cxContent = segs.map((g, j) => (j ? ' ' + CX_CUT + ' ' : g.a > s ? CX_CUT + ' ' : '') + piece(g.a, g.b)).join('') + (lastB < e ? ' ' + CX_CUT : '');
  // כפתור "פתיחה בספר" ליד ההעתקה: מעבר למסך הקריאה, לספר (או לספר שעליו המפרש / התרגום), לפרק וליחידה של התוצאה
  // ⧉ וכפתור הספר בשורת התגיות, אחרי הקטגוריה והפרשה / הסדר
  const canGo = window.GimReader && window.GimReader.canOpen(u.b), goAt = `data-go="${u.b},${u.ch},${u.n}"`, goTip = esc(`${L('פתיחה בספר, במסך הקריאה')}: ${ref(u)}`);
  const goBtn = canGo ? `<span class="goRd" role="button" tabindex="0" data-tip="${goTip}" aria-label="${goTip}" ${goAt}>${GO_ICON}</span>` : '';
  const refHtml = canGo ? `<b class="goRef" data-tip="${goTip}" ${goAt}>${esc(ref(u))}</b>` : `<b>${esc(ref(u))}</b>`;
  const btns = `<span class="cxBtns"><span class="cpy" role="button" tabindex="0" data-tip="${L('העתק את הפסוק/המשנה ללוח')}" aria-label="${L('העתק את הפסוק/המשנה ללוח')}" data-copy="${esc(copyTxt)}">⧉</span>${goBtn}</span>`;
  h += `<button class="rs${i === st.cur ? ' on' : ''}" data-i="${i}"><div class="rf">${refHtml}<span class="tag">${catName(bk.cat)}</span>${metaTag}${btns}<span class="tag meth" data-fam="${famKeyOf(r.method)}" data-m="${r.method}" title="${L('שיטת הגימטריה של הפסוק')}">${L(MN[r.method])}</span><span class="tagArrow">↔</span>${wmTags}</div><div class="cx">${cxContent}</div></button>`;
  return h;
}
// בונה-מחדש את כל תוכן #rl{k} כחלון של עד N שורות המתחיל ב-start (במרחב-ה-idx, לא בהכרח במרחב st.all) —
// מחליף לגמרי את showMore הישן (לא עוד "הוספה" מצטברת). מחזיר את אינדקס-st.all של השורה הראשונה בחלון
// (לשימוש ע״י הקוראים לבחירה-ראשונית, select(k,…)), או null אם אין תוצאות כלל.
function renderWindow(k, start) {
  const st = S[k], box = $('#rl' + k);
  computeGroups(k);
  const total = st.groupsTotal;
  if (!total) {
    st.winStart = 0; st.winCount = 0;
    if (st.tf && st.tf.trim() && st.all.n) box.innerHTML = `<div class="emp">${L(tfScanning(st) ? 'מסנן…' : 'אין תוצאות התואמות את הסינון הטקסטואלי.')}</div>`;
    updateTfBar(k); fsBuildTicks(k); fsLayout(k);
    return null;
  }
  const idxArr = visibleIdx(st);
  const WINDOW = Math.max(1, getLimit());
  start = Math.max(0, Math.min(start, total - 1));
  const count = Math.min(WINDOW, total - start);
  st.winStart = start; st.winCount = count;
  const groupPos = new Set(st.groups.map(g => g.pos));
  st.cxCap = cxCapFor(box);
  let h = '';
  for (let p = start; p < start + count; p++) h += buildRowHtml(st, p, idxArr, groupPos, start);
  const vh = vRowH(st, total);
  const beforeH = Math.round(start * vh), afterH = Math.round((total - start - count) * vh);
  box.innerHTML = `<div class="rlSpacer" style="height:${beforeH}px"></div><div class="rlRows">${h}</div><div class="rlSpacer" style="height:${afterH}px"></div>`;
  const rowsEl = box.querySelector('.rlRows');
  if (rowsEl && count) { const measured = rowsEl.offsetHeight / count; if (measured > 10) st.avgRowH = st.avgRowH ? (st.avgRowH * 0.5 + measured * 0.5) : measured; }
  if (st.cur >= 0) { const c = box.querySelector(`[data-i="${st.cur}"]`); if (c) c.classList.add('on'); }
  updateTfBar(k); fsBuildTicks(k); fsLayout(k);
  return idxArr ? idxArr[start] : start;
}
// עדכון-חי *אינקרמנטלי* (ללא הרס-ובנייה-מחדש של כל ה-DOM) לשימוש תוך-כדי חיפוש פעיל, כש-אין שום סיבה
// שהסדר-הקיים ישתנה (ראו תנאי-ה-fallback למטה): מוסיף ל-.rlRows רק את השורות ה-*חדשות* (שלא היו קיימות
// בפעם הקודמת), בלי לגעת כלל באלמנטים הקיימים. זה פותר את כל משפחת-באגי-ההבהוב (border/hover/box-shadow,
// וגם סמן-העכבר שה"קפיצה" בין אלמנטים גורמת לו "לקפוץ" בין cursor:pointer לברירת-המחדל) בבת-אחת ומהשורש —
// שורות קיימות (כולל זו שהעכבר מעליה, כולל זו שנבחרה) פשוט *לא נוגעים בהן בכלל* יותר, אז אין להן שום סיבה
// "להבהב". מחזיר true אם ההוספה-האינקרמנטלית בוצעה בהצלחה, false אם צריך fallback לבנייה-מחדש-מלאה
// (renderWindow) — למשל כש-יש סינון-טקסטואלי/מיון-לפי-עיגול פעילים (visibleIdx מחזיר מערך לא-טריוויאלי,
// והסדר/זהות-האלמנטים יכולים להשתנות עם כל תוצאה חדשה שנוספת — "הוספה-בטוחה" כבר לא מובטחת), או כש-החלון
// לא מתחיל מההתחלה (st.winStart!==0 — המשתמש גלל/קפץ הרחק), או כש-עדיין אין .rlRows בנוי כלל (רינדור ראשון).
function appendLiveRows(k) {
  const st = S[k], box = $('#rl' + k);
  if (st.winStart !== 0 || visibleIdx(st)) return false; // tf/hitsSort פעילים — הסדר לא-יציב, לא בטוח להוסיף
  const rowsEl = box.querySelector('.rlRows');
  if (!rowsEl) return false; // עדיין אין רינדור ראשוני — renderWindow הרגיל יטפל בזה
  computeGroups(k);
  const total = st.groupsTotal, WINDOW = Math.max(1, getLimit());
  const renderedCount = rowsEl.querySelectorAll('.rs').length;
  const targetCount = Math.min(WINDOW, total);
  st.winCount = targetCount;
  if (targetCount > renderedCount) { // יש שורות-חדשות להוסיף בסוף (עד תקרת-החלון)
    const groupPos = new Set(st.groups.map(g => g.pos));
    if (!st.cxCap) st.cxCap = cxCapFor(box);
    let h = '';
    for (let p = renderedCount; p < targetCount; p++) h += buildRowHtml(st, p, null, groupPos);
    rowsEl.insertAdjacentHTML('beforeend', h);
    const measured = rowsEl.offsetHeight / targetCount; if (measured > 10) st.avgRowH = st.avgRowH ? (st.avgRowH * 0.5 + measured * 0.5) : measured;
  } // אם targetCount===renderedCount (החלון כבר מלא) — אין מה להוסיף; עדיין מעדכנים afterSpacer/groups/ticks למטה
  const afterH = Math.round((total - targetCount) * vRowH(st, total));
  const afterSpacer = box.lastElementChild; if (afterSpacer && afterSpacer.classList.contains('rlSpacer')) afterSpacer.style.height = afterH + 'px';
  updateTfBar(k); fsBuildTicks(k); fsLayout(k);
  return true;
}
// עדכון-חי תוך-כדי חיפוש (נקרא מתוך run()'s step()): אם המשתמש עדיין בתחילת הרשימה (לא גלל/קפץ הרחק ממנה)
// מרעננים את החלון מההתחלה כרגיל; אחרת לא "קופצים" לו — רק מרעננים את מה שתלוי-בסך-הכול (קבוצות/סימוני-
// מסלול/מיקום-הידית), כי st.all רק גדל (concat), לא משתנה-בדיעבד, אז החלון שהוא כבר רואה עדיין תקף במדויק.
function liveRefresh(k, finalize) {
  const st = S[k];
  // finalize=true רק מתוך step()'s branch-הסיום (ראו run): כל עוד החיפוש עדיין רץ, *לא* בוחרים (select)
  // אוטומטית את התוצאה הראשונה — רק כש-החיפוש *נגמר*. זו בחירת-UX (לא לקפוץ-לבחירה לפני שהתמונה סופית),
  // לא עניין של הבהוב: הבהוב-ה-DOM-מחדש טופל בשורש (ראו buildRowHtml/appendLiveRows) כך שגם בחירה *ידנית*
  // ע״י המשתמש תוך-כדי חיפוש-פעיל (קליק) לא מהבהבת יותר כלל.
  if (st.winStart !== 0) { computeGroups(k); fsBuildTicks(k); fsLayout(k); return; }
  // appendLiveRows (מועדף): מוסיף רק את השורות-החדשות בסוף .rlRows, בלי לגעת בשורות הקיימות — כך ששום
  // אלמנט-DOM קיים (כולל זה שהעכבר מעליו, כולל זה שנבחר) לא נהרס-ונבנה-מחדש בזמן חיפוש-פעיל, מה שמחסל
  // מהשורש את כל משפחת-באגי-ההבהוב (מסגרת/hover/box-shadow/סמן-העכבר) ולא רק סימפטום בודד שלה. חוזר false
  // (ונופל ל-renderWindow המלא) רק כש-זה לא-בטוח: רינדור ראשוני (.rlRows עוד לא קיים) או סינון/מיון פעילים.
  if (appendLiveRows(k)) { if (finalize && st.cur < 0) { const idxArr = visibleIdx(st); const fi = idxArr ? idxArr[0] : 0; if (fi < st.all.n) select(k, fi); } return; }
  const fi = renderWindow(k, 0); if (finalize && st.cur < 0 && fi != null) select(k, fi);
}
/* ---------- סקרולר-מותאם לרשימת-התוצאות (fast-scroll, בסגנון Google Photos) ----------
   ראו הערת-CSS ב-styles.css (.fsTrack וכו׳) לרקע-העיצוב. שלוש פונקציות-ליבה (+maybeShiftWindow, חדשה):
   fsBuildTicks — מחושבת אנליטית (מ-st.groups, לא מדידת-DOM) בכל renderWindow/liveRefresh.
   fsLayout — נקראת בכל גלילה/שינוי-תוכן; מעדכנת גובה/מיקום הידית לפי היחס clientHeight/scrollHeight —
     ממשיכה לעבוד בלי שינוי, כי box.scrollHeight כבר מייצג נכון (בקירוב) את הגובה הכולל בזכות ה-spacers.
   fsPositionAt — ממירה scrollTop נוכחי למיקום-לוגי-משוער (0..total-1) בתוך *כל* התוצאות.
   maybeShiftWindow — הלב של הגלילה הוירטואלית: כש-מיקום-הגלילה זז מספיק הרחק ממרכז החלון המרונדר כרגע
     (היסטרזיס, כדי לא לבנות-מחדש על כל פיקסל), בונים-מחדש חלון חדש הממורכז סביב המיקום הנוכחי. נקראת גם
     מ-scroll רגיל וגם מגרירת ה-thumb/קליק על ה-track — באותה נוסחה בדיוק, כך שהתנהגות "קפיצה ישירה"
     (גרירת הידית לאמצע) ו"גלילה טבעית" (עכבר/מגע) מתכנסות לאותו מנגנון. */
// גובה-שורה "וירטואלי" לספייסרים שמחוץ לחלון המרונדר: הגובה הממוצע הנמדד, אבל לא יותר מ-MAX_SCROLL_PX
// בסך-הכול — לדפדפנים יש תקרה לגובה אלמנט (כ-17 מיליון פיקסלים בפיירפוקס, כ-33 בכרום), ומיליון שורות של
// 110px היו חוצות אותה בהרבה. בתוך החלון המרונדר השורות בגובהן האמיתי, כך שגלילה רגילה מרגישה טבעית.
const MAX_SCROLL_PX = 8000000;
function vRowH(st, total) { return Math.min(st.avgRowH || 110, MAX_SCROLL_PX / Math.max(1, total)); }
// ממירה scrollTop למיקום-לוגי (שבר, 0..total) בתוך *כל* התוצאות: בספייסר שלפני/אחרי החלון לפי vRowH, ובתוך
// החלון המרונדר לפי הגובה האמיתי של השורות שבו.
function fsPosRaw(k, scrollTop) {
  const st = S[k], box = $('#rl' + k), total = st.groupsTotal || 0; if (!total) return 0;
  const vh = vRowH(st, total), rowsEl = box.querySelector('.rlRows');
  if (!rowsEl || !st.winCount) return Math.max(0, Math.min(total, scrollTop / vh));
  const top = rowsEl.previousElementSibling ? rowsEl.previousElementSibling.offsetHeight : 0, h = rowsEl.offsetHeight;
  const pos = scrollTop < top ? scrollTop / vh
    : scrollTop < top + h ? st.winStart + (scrollTop - top) / Math.max(1, h) * st.winCount
    : st.winStart + st.winCount + (scrollTop - top - h) / vh;
  return Math.max(0, Math.min(total, pos));
}
function fsPositionAt(k, scrollTop) {
  const total = S[k].groupsTotal || 0; if (!total) return 0;
  return Math.min(total - 1, Math.floor(fsPosRaw(k, scrollTop)));
}
// הלב של הגלילה הוירטואלית: כש-מיקום-הגלילה זז מספיק הרחק ממרכז החלון המרונדר (היסטרזיס, כדי לא לבנות-מחדש
// על כל פיקסל), בונים-מחדש חלון ממורכז סביב המיקום הנוכחי — ומחזירים את scrollTop לאותו מיקום-לוגי בדיוק
// בתוך החלון החדש, כדי שהתוכן לא "יקפוץ" (הספייסרים והשורות האמיתיות לא באותו גובה-לשורה).
function maybeShiftWindow(k) {
  const st = S[k], box = $('#rl' + k), total = st.groupsTotal || 0; if (!total) return;
  const count = Math.min(Math.max(1, getLimit()), total);
  const raw = fsPosRaw(k, box.scrollTop), pos = Math.min(total - 1, Math.floor(raw));
  const desired = Math.max(0, Math.min(total - count, pos - Math.floor(count / 2)));
  const threshold = Math.max(20, Math.floor(count / 4));
  const atStart = desired === 0 && st.winStart !== 0;
  const atEnd = desired + count >= total && st.winStart + st.winCount < total;
  if (!(atStart || atEnd || Math.abs(desired - st.winStart) >= threshold)) return;
  renderWindow(k, desired);
  const rowsEl = box.querySelector('.rlRows'); if (!rowsEl || !st.winCount) return;
  const top = rowsEl.previousElementSibling ? rowsEl.previousElementSibling.offsetHeight : 0;
  box.scrollTop = top + (raw - st.winStart) / st.winCount * rowsEl.offsetHeight;
}
function fsBuildTicks(k) {
  const st = S[k], track = $('#fsTrack' + k); if (!track) return;
  const total = st.groupsTotal || 0, seen = new Set(); let h = '';
  if (total) (st.groups || []).forEach(g => {
    const fam = famKeyOf(g.method); if (seen.has(fam)) return; seen.add(fam);
    h += `<div class="fsTick" style="top:${(g.pos / total * 100).toFixed(2)}%;background:${famColorOf(g.method)}"></div>`;
  });
  const thumb = track.querySelector('.fsThumb');
  track.innerHTML = h; if (thumb) track.appendChild(thumb);
}
function fsLayout(k) {
  const box = $('#rl' + k), track = $('#fsTrack' + k); if (!track) return;
  const thumb = track.querySelector('.fsThumb'); if (!thumb) return;
  const trackH = track.clientHeight; if (!trackH) return;
  const ratio = box.clientHeight / Math.max(1, box.scrollHeight);
  const th = Math.max(34, trackH * ratio);
  const maxScroll = box.scrollHeight - box.clientHeight;
  const pos = maxScroll > 0 ? (box.scrollTop / maxScroll) * (trackH - th) : 0;
  thumb.style.height = th + 'px'; thumb.style.top = pos + 'px';
}
// שתי שורות לבועת-התווית (לפי בקשת המשתמש): שורה 1 = הקבוצה (שיטה·ערך) הקרובה למיקום הנוכחי, שורה 2 =
// "תוצאה X מתוך Y" — Y הוא *כל* התוצאות (groupsTotal), לא רק מה שבפועל מרונדר כרגע.
function fsBubbleLines(k, scrollTop) {
  const st = S[k], total = st.groupsTotal || 0;
  if (!total) return ['', ''];
  const pos = fsPositionAt(k, scrollTop);
  let g = null; for (const x of st.groups) { if (x.pos <= pos) g = x; else break; }
  const line1 = g ? `${L(MN[g.method])} · ${L('ערך')} ${fmt(g.target)}` : '';
  const line2 = LANG === 'en' ? `result ${fmt(pos + 1)} of ${fmt(total)}` : `תוצאה ${fmt(pos + 1)} מתוך ${fmt(total)}`;
  return [line1, line2];
}
// אתחול חד-פעמי (לכל צד) של גרירת-הידית ולחיצה-על-המסלול — נקרא מתוך bind(k)
function fsInit(k) {
  const box = $('#rl' + k), track = $('#fsTrack' + k), thumb = $('#fsThumb' + k), bubble = $('#fsBubble' + k);
  if (!track) return;
  const updateBubble = () => { const [l1, l2] = fsBubbleLines(k, box.scrollTop); bubble.innerHTML = `<div class="fsBubbleL1">${esc(l1)}</div><div class="fsBubbleL2">${esc(l2)}</div>`; };
  // הגרירה *לא* מבצעת רינדור-כבד (renderWindow/maybeShiftWindow) ישירות על כל pointermove — יש כבר
  // מאזין-scroll קבוע על box (ראו bind(k) למטה) שעושה בדיוק את זה בכל שינוי-scrollTop, כך שקריאה כפולה
  // כאן רק מכפילה עבודה-כבדה (כולל renderWindow עם innerHTML+reflow) על כל אירוע-מגע, מה שבפועל היה שורש
  // תחושת ה"גלילה לא חלקה": pointermove יכול לירות בתדירות גבוהה הרבה יותר מ-60Hz במגע אמיתי, ובלי
  // throttling זה מציף את ה-thread הראשי. התיקון: ממזגים כל אירועי pointermove שמגיעים בין פריים לפריים
  // לעדכון יחיד דרך requestAnimationFrame (תואם לקצב-הרענון האמיתי של המסך), ומשאירים ל-scroll-listener
  // (שגם הוא טבעית מתואמת ל-vsync ע״י הדפדפן) את כל העבודה-הכבדה.
  let dragging = false, startY = 0, startTop = 0, raf = 0, pendingY = null;
  const applyPending = () => {
    raf = 0;
    if (pendingY == null) return;
    const trackH = track.clientHeight, th = thumb.offsetHeight, trackRange = trackH - th;
    const maxScroll = box.scrollHeight - box.clientHeight;
    const deltaScroll = trackRange > 0 ? ((pendingY - startY) / trackRange) * maxScroll : 0;
    box.scrollTop = Math.max(0, Math.min(maxScroll, startTop + deltaScroll));
    updateBubble();
  };
  thumb.addEventListener('pointerdown', e => {
    dragging = true; thumb.classList.add('dragging'); thumb.setPointerCapture(e.pointerId);
    startY = e.clientY; startTop = box.scrollTop; updateBubble(); e.preventDefault();
  });
  window.addEventListener('pointermove', e => {
    if (!dragging) return;
    pendingY = e.clientY;
    if (!raf) raf = requestAnimationFrame(applyPending);
  });
  window.addEventListener('pointerup', e => {
    if (!dragging) return;
    dragging = false; thumb.classList.remove('dragging'); pendingY = null;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    try { thumb.releasePointerCapture(e.pointerId); } catch (_) {}
  });
  thumb.addEventListener('pointerenter', () => { if (!dragging) updateBubble(); });
  track.addEventListener('pointerdown', e => {
    if (e.target === thumb || thumb.contains(e.target)) return;
    const r = track.getBoundingClientRect(), th = thumb.offsetHeight, trackRange = track.clientHeight - th;
    const yRatio = Math.max(0, Math.min(1, (e.clientY - r.top - th / 2) / Math.max(1, trackRange)));
    box.scrollTop = yRatio * (box.scrollHeight - box.clientHeight);
  });
  new ResizeObserver(() => fsLayout(k)).observe(box);
}
// מרענן את תווית "X מתוך Y" וכפתור הניקוי ליד שדה הסינון הטקסטואלי
function updateTfBar(k) {
  const st = S[k], cnt = $('#tfc' + k), clr = $('#tfx' + k); if (!cnt) return;
  const has = !!(st.tf && st.tf.trim()); cnt.hidden = !has; clr.hidden = !has;
  if (has) {
    const idx = visibleIdx(st), c = st.tfScan, pct = tfScanning(st) ? Math.floor(c.n / Math.max(1, st.all.n) * 100) : -1;
    cnt.textContent = (LANG === 'en' ? `${fmt(idx.length)} of ${fmt(st.all.n)}` : `${fmt(idx.length)} מתוך ${fmt(st.all.n)}`) + (pct >= 0 ? (LANG === 'en' ? ` · filtering… ${pct}%` : ` · מסנן… ${pct}%`) : '');
  }
}
// מאפס את תצוגת התוצאות ובונה אותה מחדש (נקרא כשמשתנה שדה הסינון הטקסטואלי/ה-checkbox ההיתולי)
function tfRebuild(k) { $('#rl' + k).scrollTop = 0; renderWindow(k, 0); }
function select(k, i) {
  const st = S[k]; if (!(i >= 0 && i < st.all.n)) return; st.cur = i; $('#rl' + k).querySelectorAll('.rs.on').forEach(x => x.classList.remove('on')); const el = $('#rl' + k).querySelector(`[data-i="${i}"]`); if (el) el.classList.add('on');
}

/* ---------- חלונות מידע ---------- */
function renderDocs() {
  const ex = ['אבא', 'דן'];
  const how = LANG === 'en' ? {
    regular: 'Sum of letter values; final letters = regular', kollel: 'Regular + 1', words: 'Regular + word count', letters: 'Regular + letter count',
    milui: "Each letter is replaced by its full spelled-out name and calculated (ג=Gimel=83)", atbash: 'Substitution א↔ת, ב↔ש… then Regular', atbach: 'Each letter substituted per the Atbach table (below), then Regular',
    atbashKollel: 'Atbash + 1', atbashWords: 'Atbash + word count', atbashLetters: 'Atbash + letter count',
    atbachKollel: 'Atbach + 1', atbachWords: 'Atbach + word count', atbachLetters: 'Atbach + letter count',
  } : {
    regular: 'סכום ערכי האותיות; סופיות = רגילות', kollel: 'רגילה + 1', words: 'רגילה + מספר התיבות', letters: 'רגילה + מספר האותיות', milui: 'כל אות מוחלפת בשמה המלא ומחושבת (ג=גימל=83)', atbash: 'החלפה א↔ת, ב↔ש… ואז רגילה', atbach: 'החלפת כל אות לפי טבלת אטב״ח (למטה), ואז רגילה',
    atbashKollel: 'אתב״ש + 1', atbashWords: 'אתב״ש + מספר התיבות', atbashLetters: 'אתב״ש + מספר האותיות',
    atbachKollel: 'אטב״ח + 1', atbachWords: 'אטב״ח + מספר התיבות', atbachLetters: 'אטב״ח + מספר האותיות',
  };
  // תצוגת כרטיסים (לא טבלה) לשיטות — ניצול טוב יותר של רוחב החלון; טבלאות אטב״ח/מילוי כרשת שבבים אחידה (כמו אטב״ח כבר הוצג) במקום טבלה צרה וארוכה אנכית
  $('#methodsDoc').innerHTML = `<h2>${L('שיטות הגימטריה')}</h2><div class="mcards">${E.METHODS.map(m => `<div class="mcard"><b>${L(m.name)}</b><p>${how[m.id]}</p><div class="ex">${ex.map(x => `<span>${esc(x)}: ${E.calculateGematria(x, m.id).value}</span>`).join('')}</div></div>`).join('')}</div>
  <h2>${LANG === 'en' ? 'Atbach Table' : 'טבלת אטב״ח'}</h2><div class="chipWrap">${Object.entries(E.getAtbachTable()).map(([a, b]) => `<span class="tag">${a} ↔ ${b}</span>`).join('')}</div>
  <h2>${LANG === 'en' ? 'Milui Table' : 'טבלת המילוי'}</h2><div class="chipWrap miluiGrid">${Object.keys(E.MILUI_NAMES).map(k => `<span class="tag">${k} = ${esc(E.MILUI_NAMES[k])} (${E.MILUI[k]})</span>`).join('')}</div>
  <p class="emp">${LANG === 'en'
    ? 'Words = words after normalization (a hyphen separates words; punctuation, vowel points and cantillation marks are not counted). The spelling of letter names in Milui can be changed via <code>MILUI_NAMES</code> in engine.js.'
    : 'תיבות = מילים לאחר נרמול (מקף מפריד תיבות; פיסוק, ניקוד וטעמים אינם נספרים). איות שמות האותיות במילוי ניתן לשינוי ב-<code>MILUI_NAMES</code> בקובץ engine.js.'}</p>`;
}
$('#openMethods').onclick = () => $('#dlgMethods').showModal();
// "אודות": מידע בסיסי על האפליקציה והמפתח. חלק מהשדות (רישיון/אתר) הם placeholder ("מוק") ולא מחויבים
// כרגע למידע אמיתי — אפשר להחליף בעתיד בלי לשנות את שאר הקוד, רק את האובייקט ABOUT_INFO כאן.
const ABOUT_INFO = { dev: 'Gad Zvi Mehditache', license: 'קנייני — כל הזכויות שמורות', licenseEn: 'Proprietary — All Rights Reserved', site: '—' };
function renderAbout() {
  const unitsCount = B.books.reduce((n, b) => n + (b.n || 0), 0);
  const en = LANG === 'en';
  $('#aboutDoc').innerHTML = `<div class="aboutBox">
    <div class="row"><span class="k">${en ? 'App name' : 'שם האפליקציה'}</span><span class="v"><b>גימטריבון</b> (Gimatrivon)</span></div>
    <div class="row"><span class="k">${en ? 'Version' : 'גרסה'}</span><span class="v">${esc(VERSION)}</span></div>
    ${DEV ? `<div class="row"><span class="k">${en ? 'Branch' : 'ענף'}</span><span class="v">${esc(BRANCH)}</span></div><div class="row"><span class="k">${en ? 'Built' : 'נבנה'}</span><span class="v">${esc(BUILT)}</span></div><div class="row"><span class="k">${en ? 'Dev mode' : 'מצב פיתוח'}</span><span class="v">${en ? 'on (5 taps on the version to turn off)' : 'פעיל (5 לחיצות על הגרסה לכיבוי)'}</span></div>` : ''}
    <div class="row"><span class="k">${en ? 'Description' : 'תיאור'}</span><span class="v">${en ? 'A gematria engine + comparison + search tool for the Tanakh, Mishnah, Rashi, Targumim and the Rambam\'s Mishneh Torah.' : 'מנוע גימטריה + השוואה + חיפוש בתנ״ך, משנה, רש״י, תרגומים ומשנה תורה לרמב״ם.'}</span></div>
    <div class="row"><span class="k">${en ? 'Corpus' : 'קורפוס'}</span><span class="v">${unitsCount ? fmt(unitsCount) + (en ? ' units (verses/mishnahs)' : ' יחידות (פסוקים/משניות)') : (en ? 'Loading…' : 'נטען…')}</span></div>
    <div class="row"><span class="k">${en ? 'Developer' : 'מפתח'}</span><span class="v">${esc(ABOUT_INFO.dev)}</span></div>
    <div class="row"><span class="k">${en ? 'License' : 'רישיון'}</span><span class="v">${esc(en ? ABOUT_INFO.licenseEn : ABOUT_INFO.license)}</span></div>
  </div>`;
}
$('#openAbout').onclick = () => { renderAbout(); $('#dlgAbout').showModal(); trackEvent('about_open'); };
/* ---------- "צור קשר" (EmailJS) ----------
   היחיד בכל האפליקציה שדורש רשת בפועל: שאר גימטריבון עובד לגמרי אופליין (ראו tests/run-tests.js, בדיקת
   "offline", שמחריגה בפירוש את הבלוק הזה — ראו שם לפרטים). ה-SDK של EmailJS נטען מ-CDN רק כשנלחץ בפועל
   כפתור "שליחה" בטופס (lazy — פתיחת הדיאלוג עצמו, או עצם טעינת האפליקציה, אינה נוגעת ברשת כלל). אם אין
   חיבור לאינטרנט ברגע הלחיצה, הטעינה/השליחה נכשלת בחן (הודעת-שגיאה בטופס), והאפליקציה ממשיכה לפעול
   כרגיל בכל השאר. */
// --- EMAILJS:START ---
const EMAILJS_PUBLIC_KEY = 'E61ZjfIBFJSKU7q_k', EMAILJS_SERVICE_ID = 'service_audv8eb', EMAILJS_TEMPLATE_ID = 'template_zmmo3pg';
let emailjsReady = null;
function loadEmailJs() {
  if (emailjsReady) return emailjsReady;
  emailjsReady = new Promise((resolve, reject) => {
    if (window.emailjs) { resolve(window.emailjs); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
    s.onload = () => { try { window.emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY }); resolve(window.emailjs); } catch (e) { reject(e); } };
    s.onerror = () => reject(new Error('emailjs script failed to load'));
    document.head.appendChild(s);
  }).catch(e => { emailjsReady = null; throw e; }); // נכשל? לא "נועלים" כישלון לצמיתות — ניסיון הבא יטען מחדש
  return emailjsReady;
}
$('#openContact').onclick = () => {
  const st = $('#contactStatus'); if (st) st.textContent = '';
  const f = $('#contactForm'); if (f) f.reset();
  $('#dlgContact').showModal();
  trackEvent('contact_open');
};
$('#contactForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#contactSend'), st = $('#contactStatus'), form = e.target;
  btn.disabled = true; st.textContent = L('שולח…');
  try {
    const em = await loadEmailJs();
    await em.sendForm(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, form);
    st.textContent = L('ההודעה נשלחה בהצלחה!');
    trackEvent('contact_sent');
    form.reset();
  } catch (err) {
    st.textContent = L('שליחה נכשלה — ודאו חיבור לאינטרנט ונסו שוב.');
  } finally {
    btn.disabled = false;
  }
});
// --- EMAILJS:END ---
document.querySelectorAll('[data-close]').forEach(x => { x.onclick = () => x.closest('dialog').close(); });
document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));
$('#sideSw').onclick = e => { const v = e.target.dataset.v; if (!v) return; document.body.dataset.view = v; document.querySelectorAll('#sideSw button').forEach(b => b.classList.toggle('on', b.dataset.v === v)); };
/* ---------- מראה (theme): toggle "לילה בגוויל" ---------- */
// שחזור/שמירת הבחירה ב-localStorage; הקריאה הראשונית ל-data-theme מתבצעת כבר ב-<head> (script מוקדם) כדי למנוע "הבהוב" של המראה הבהיר בטעינה
// מחליף את data-theme על <html> — אך *לפני* כן מנתק-זמנית מה-DOM את שתי רשימות-התוצאות (#rlA/#rlB),
// שעלולות להכיל אלפי כרטיסי-תוצאה (וכל כרטיס, כמה אלמנטי <mark>). שורש-באג-קיפאון-ידוע (נמדד עם
// Chrome DevTools Tracing — UpdateLayoutTree): שינוי משתנה-CSS מותאם-אישית (custom property, למשל --ac/--tx)
// על :root מכריח recalculation של ה-style המחושב עבור *כל* אלמנט-צאצא שמשתמש בו, כולל אלפי כרטיסי-תוצאה
// שמחוץ-למסך — על אף ש-content-visibility:auto על .rs (ראו styles.css) כבר פותר layout/paint עבורם, הוא
// *לא* פוטר אותם מ-style recalculation כש-ההפעלה מגיעה משינוי ירושה מ-:root (נמדד: עם 7,000 כרטיסים,
// UpdateLayoutTree לבדו לקח ~770 מ"ש — חסימה סינכרונית מורגשת כ"קיפאון" ממשי של כל הדף). הפתרון: אלמנט
// המנותק-לגמרי מה-DOM (לא רק content-visibility:hidden — זה נבדק ולא הספיק, עדיין ~540 מ"ש) *אינו מקבל
// style כלל*, ללא קשר לשינויי-משתנים ב-:root — וכש-הוא מוחזר ל-DOM מיד אח"כ (סינכרונית, באותו tick, כדי
// שלא ייפתח חלון-זמן ל-JS אחר, כגון טעינה-מדורגת של חיפוש פעיל, לרוץ באמצע), content-visibility:auto "רואה"
// אותו כאילו הוכנס-מחדש לראשונה ומיישם נכון את ההדלגה שלו על כרטיסים מחוץ-למסך מההתחלה. נמדד אחרי התיקון:
// UpdateLayoutTree ירד ל-~75 מ"ש (כמו רשימה של כמה מאות שורות בלבד) — אין יותר קיפאון, גם עם רשימות
// ענקיות, וגם אם מחליפים תוך-כדי חיפוש עדיין רץ (ה-scrollTop נשמר ומשוחזר במפורש כי הדפדפן לא מבטיח את זה
// לאלמנט מנותק; שאר ה-state של החיפוש לא נוגע בכלל, כי הניתוק/חיבור מתבצעים סינכרונית ב-tick אחד).
function setTheme(dark) {
  const boxes = Array.from(document.querySelectorAll('.resList .sc'));
  const info = boxes.map(el => ({ el, parent: el.parentNode, next: el.nextSibling, scrollTop: el.scrollTop }));
  info.forEach(i => i.el.remove());
  if (dark) document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  info.forEach(i => { i.parent.insertBefore(i.el, i.next); i.el.scrollTop = i.scrollTop; });
}
(() => {
  const chk = $('#themeChk');
  chk.checked = document.documentElement.getAttribute('data-theme') === 'dark';
  chk.onchange = () => {
    setTheme(chk.checked);
    try { localStorage.setItem('gimatrivonTheme', chk.checked ? 'dark' : 'light'); } catch (e) {}
  };
})();

/* ---------- שפה (עברית/אנגלית): כפתור #langSw ליד "תרגומים" בכותרת ----------
   מעדכן את כל חלקי-הממשק הקבועים ב-index.html (שאינם מתעדכנים לבד, בניגוד לרוב התוכן שנוצר ע״י app.js —
   ראו L()/EN למעלה) ואז בונה-מחדש את שני הצדדים (sideHtml+bind, בדיוק כמו seedDemoQuery/restoreDemoQuery
   בסיור המודרך למטה — תבנית קיימת ובטוחה) כדי שכל הטקסט שנוצר ב-sideHtml/drawTree/drawSearchMethods/
   renderCenter/buildRowHtml יתורגם גם הוא, ומריץ run() מחדש כדי לרענן את תוצאות-החיפוש בשפה הנכונה. */
function applyLangStatic() {
  const en = LANG === 'en';
  document.documentElement.lang = en ? 'en' : 'he';
  const sideSwA = document.querySelector('#sideSw [data-v="A"]'), sideSwB = document.querySelector('#sideSw [data-v="B"]');
  if (sideSwA) sideSwA.textContent = L('צד א׳'); if (sideSwB) sideSwB.textContent = L('צד ב׳');
  const sideSw = $('#sideSw'); if (sideSw) sideSw.setAttribute('aria-label', L('בחירת צד'));
  const themeLbl = document.querySelector('.themeSw'); if (themeLbl) themeLbl.title = L('מעבר בין מראה גוויל למראה לילה');
  const themeChk = $('#themeChk'); if (themeChk) themeChk.setAttribute('aria-label', L('מראה כהה (לילה בגוויל)'));
  const tourBtn = $('#startTour'); if (tourBtn) { tourBtn.title = L('הפעלת סיור מודרך קצר באפליקציה'); tourBtn.textContent = L('? סיור מודרך'); }
  const methBtn = $('#openMethods'); if (methBtn) methBtn.textContent = L('שיטות גימטריה');
  const aboutBtn = $('#openAbout'); if (aboutBtn) { aboutBtn.title = L('מידע על האפליקציה'); aboutBtn.textContent = L('ℹ אודות'); }
  const contactBtn = $('#openContact'); if (contactBtn) { contactBtn.title = L('יצירת קשר עם המפתח'); contactBtn.textContent = L('✉ צור קשר'); }
  const ws = $('#ws'); if (ws) ws.setAttribute('aria-label', L('סביבת עבודה'));
  const h1 = document.querySelector('.brand h1'); if (h1) h1.textContent = en ? 'Gimatrivon' : 'גימטריבון';
  document.title = en ? `Gimatrivon - ${VERSION}` : `גימטריבון - ${VERSION}`;
  const verEl = $('#ver'); if (verEl) verEl.title = L('מספר גרסה');
  const methH2 = document.querySelector('#dlgMethods .dh h2'); if (methH2) methH2.textContent = L('שיטות הגימטריה');
  const aboutH2 = document.querySelector('#dlgAbout .dh h2'); if (aboutH2) aboutH2.textContent = en ? 'About Gimatrivon' : 'אודות גימטריבון';
  const contactH2 = document.querySelector('#dlgContact .dh h2'); if (contactH2) contactH2.textContent = L('צור קשר');
  const cNameLbl = document.querySelector('label[for="cName"]'); if (cNameLbl) cNameLbl.textContent = L('שם');
  const cEmailLbl = document.querySelector('label[for="cEmail"]'); if (cEmailLbl) cEmailLbl.textContent = L('אימייל');
  const cMsgLbl = document.querySelector('label[for="cMsg"]'); if (cMsgLbl) cMsgLbl.textContent = L('הודעה');
  const contactSend = $('#contactSend'); if (contactSend) contactSend.textContent = L('שליחה');
  document.querySelectorAll('[data-close]').forEach(x => x.setAttribute('aria-label', L('סגור')));
  if (!IDX && GEM.busy && document.body.dataset.mode !== 'read') { const st = $('#status'); if (st) st.textContent = L('טוען קורפוס…'); }
  const langBtn = $('#langSw'); if (langBtn) langBtn.textContent = en ? 'עב' : 'EN';
}
function applyLang() {
  try { localStorage.setItem('gimatrivonLang', LANG); } catch (e) {}
  applyLangStatic();
  // בונים מחדש את שני הצדדים (מבנה+טקסט בשפה הנכונה) ומשחזרים את מצב-ההגדרה הקיים לתוכם — אותו דפוס
  // בדיוק כמו seedDemoQuery/refreshSideDom בסיור המודרך (ראו שם), רק בלי לשנות את ה-state עצמו.
  // אם UX-הנייד פעיל כרגע, .pn.res/.inp האמיתיים "חיים" כרגע בתוך #mShell, לא בתוך #ws — innerHTML על
  // #ws לא היה נוגע בהם, אבל כן היה יוצר עותק *שני* חדש (עם אותם ids!) בתוך #ws. לכן קודם מחזירים אותם
  // למקומם המקורי (exitMobileLayout, בטוח-לקרוא-תמיד — no-op אם ממילא לא במצב-נייד), ואז אחרי הבנייה-
  // מחדש וה-bind, מכניסים-אותם-בחזרה (applyMobileLayout — ייכנס-מחדש רק אם עדיין בטלפון בפועל).
  const wasMobile = mobileActive;
  exitMobileLayout();
  $('#ws').innerHTML = KS.map(sideHtml).join('');
  KS.forEach(k => { $('#ft' + k).onclick = () => toggleFilt(k); });
  KS.forEach(bind);
  KS.forEach(refreshSideDom);
  if (wasMobile) { applyMobileLangStatic(); applyMobileLayout(); }
  renderCenter();
  renderDocs();
  if ($('#dlgAbout') && $('#dlgAbout').open) renderAbout();
}
applyLangStatic();
(() => {
  const langBtn = $('#langSw'); if (!langBtn) return;
  langBtn.onclick = () => { LANG = LANG === 'en' ? 'he' : 'en'; applyLang(); };
})();

/* ---------- סיור מודרך ("? סיור מודרך") ----------
   בעבר (עד v2.6.2) הייתה כאן "הדגמה" אוטומטית: סמן-עכבר מדומה שהריץ חיפושים אמיתיים (כולל שינוי-theme
   על אלפי תוצאות) ללא פיקוח המשתמש — גרמה לקיפאון דפדפן אמיתי (תוקן בנפרד, אך רק עבור theme; לא היתה
   דרך למנוע סוג-בעיות דומה בעתיד כש"ממציאים" אינטראקציה שלא קיימת בשימוש האמיתי) ולמצבים לא-צפויים
   ("חורים" בבחירת-מקורות כש-המשתמש הפריע תוך-כדי). הוחלפה כעת בסיור-הסברי מבוסס Driver.js (vendor/driver.js
   — MIT, kamranahmed/driver.js, מצורף offline, ללא CDN): מצביע ומסביר אלמנטים אמיתיים בקצב שהמשתמש קובע
   (הבא/הקודם/דלג/X/Esc), ואינו מדמה שום אינטראקציה שלא קיימת בשימוש אמיתי — לא "מקליד" תו-אחר-תו, לא
   מלחיץ כפתורים, לא מחליף theme בפועל. עיצוב הפופ-אובר/ה-spotlight מותאם-ל-theme ולכיווניות (RTL)
   ב-styles.css (בלוק "סיור מודרך").
   חריג אחד, מכוון: בכל פתיחת סיור — גם אם האפליקציה *כבר בשימוש* (יש למשתמש טקסט/בחירות משלו בצד א׳
   ו/או ב׳) — מנקים זמנית את שני הצדדים וטוענים-מראש זוג ביטויי-דוגמה, כדי שצעדי "תוצאות החיפוש"/"תוצאה
   בודדת"/"השוואה בין הצדדים" תמיד יראו תוכן אמיתי ומוכר מראש, ולא את מצב-האפליקציה הנוכחי (שעלול להיות
   ריק, לא קשור, או עם הרבה תוצאות שמקשות להצביע על דוגמה ברורה) — "עניו" (צד א׳) ו"סבלן" (צד ב׳), ששתיהן
   שוות 137 (עניו ב"רגילה +כולל", סבלן באטב״ח), כדי שגם צעד-ההשוואה-בין-הצדדים יראה עיגול-התאמה
   אמיתי. זו קריאה *רגילה* ל-run('A')/run('B') באותו מסלול-קוד המשמש כל חיפוש אמיתי (לא DOM מדומה/מפוברק)
   — מוגבלת בכוונה לספר אחד, לשיטת-חיפוש אחת ולשיטת-מילה אחת (רגילה) כדי שתסתיים במהירות ותציג התאמה-
   אחת-נקייה. **כל** שדות-ההגדרה הרלוונטיים של שני הצדדים (SETTINGS_FIELDS למטה — כולל מקורות/טווחים/
   שיטות/סינון-טקסטואלי/מיון, לא רק הטקסט) נשמרים לפני הניקוי ומשוחזרים **במדויק** כש-הסיור נגמר (בכל
   דרך — סיום, X, Esc, קליק על הרקע), כך שהמשתמש חוזר בדיוק למה שהיה לו לפני שלחץ על "סיור מודרך" —
   ראו onDestroyed בהגדרות הסיור למטה. */
// שדות-ה"הגדרה" של צד (st) שהסיור שומר/משחזר — לא כולל שדות-תוצאה-מחושבת (all/info/cur/notCounts/notGen/
// winStart/winCount/avgRowH/groups/groupsTotal), שמתמלאים-מחדש נכון מעצמם ע״י run(k) כש-משחזרים את שדות-ההגדרה.
const SETTINGS_FIELDS = ['text', 'num', 'ms', 'sms', 'sel', 'open', 'rngOpen', 'smOpen', 'ranges', 'tf', 'fuzzy', 'hitsSort', 'notMode', 'fullUnit', 'singleWord'];
function snapshotSettings(st) { const o = {}; SETTINGS_FIELDS.forEach(f => { o[f] = structuredClone(st[f]); }); return o; }
function applySettings(st, snap) { SETTINGS_FIELDS.forEach(f => { st[f] = snap[f]; }); }
// מרענן את כל ה-DOM שתלוי בשדות-ההגדרה (לא רק מריץ run()) — נקרא גם אחרי זריעת-הדוגמה וגם אחרי השחזור
function refreshSideDom(k) {
  const st = S[k];
  $('#t' + k).value = st.text; $('#nm' + k).value = st.num; $('#tf' + k).value = st.tf; $('#tfz' + k).checked = st.fuzzy; $('#fu' + k).checked = st.fullUnit; $('#sw' + k).checked = st.singleWord;
  drawTree(k); drawSearchMethods(k); updateTfBar(k); run(k);
}
function seedDemoQuery() {
  if (!IDX) return null;
  const snap = { A: snapshotSettings(S['A']), B: snapshotSettings(S['B']) };
  const seedOne = (k, word, ms) => {
    const st = S[k];
    applySettings(st, {
      text: word, num: '', ms: new Set(ms), sms: new Set(['regular']),
      sel: new Set([0]), // רק בראשית — כדי שהחיפוש-לדוגמה יהיה מהיר וממוקד, לא "יחפור" בכל הקורפוס
      open: new Set(), rngOpen: new Set(), smOpen: new Set(GEM_FAMILIES.map(f => f.key)), ranges: new Map(),
      tf: '', fuzzy: true, hitsSort: null, notMode: 'lit', fullUnit: false, singleWord: false, // החיפוש בפסוקים (sms) ברגילה בלבד — לא "רעש" מכל 13 השיטות יחד
    });
    refreshSideDom(k);
  };
  // כל 13 השיטות פעילות בשני הצדדים — כך מופיעים 6 עיגולי-התאמה אמיתיים בין "עניו" ל"סבלן" (למשל עניו +כולל
  // = סבלן באטב״ח = 137), והסיור מסביר את א׳, ג׳ ו-ו׳ מביניהם. החיפוש בפסוקים (sms) נשאר ברגילה בלבד.
  const allM = E.METHODS.map(m => m.id);
  seedOne('A', 'עניו', allM); seedOne('B', 'סבלן', allM);
  renderCenter();
  return snap;
}
function restoreDemoQuery(snap) {
  if (!snap) return;
  KS.forEach(k => { applySettings(S[k], snap[k]); refreshSideDom(k); });
  renderCenter();
}
// גרסה נפרדת של הסיור לפריסת-הנייד (v3.4.0): הסיור הדסקטופי מצביע על אלמנטים כמו #grA/.themeSw/#startTour
// שעל הנייד הם בדיוק אלה ש-*נשארים מוסתרים* (display:none/0×0) אחרי enterMobileLayout — כי רק .inp
// ו-.pn.res עצמם עוברים למעטפת-הנייד, לא כל #grA/.tools (ראו enterMobileLayout למעלה). עם
// skipMissingElement:true זה לא "קורס", אבל בפועל מדלג בשקט על רוב הצעדים האלה, ומשאיר סיור חסר שלא
// מסביר כלום על ה-UI הספציפי-לנייד (מתג א׳/ב׳, הגיליון התחתון, התפריט ⋮, לוח-החישוב הממוזג) — בדיוק מה
// שדווח כ"לא עובד טוב". startTour() בוחר בין שתי הפונקציות לפי mobileActive.
// v3.6.0: חלון-נוסף בסיור. driver.js מציג פופ-אובר אחד בלבד, והסיור צריך לפעמים *שני* חלונות-הסבר בו-זמנית (למשל צד א׳
// וצד ב׳ של אותה התאמה). החלון השני הוא div צף משלו עם מסגרת-הדגשה סביב היעד שלו; מוצג מ-onHighlighted (אחרי שהגלילה
// והאנימציה של driver נגמרו, אחרת המיקום מחושב לפני הגלילה) ומוסר בתחילת כל צעד/בסיום הסיור. מיקום: מנסים מתחת/מעל/
// מימין/משמאל ליעד, ובוחרים את הראשון שנכנס במסך ולא מכסה את הפופ-אובר הראשי או את היעד הראשי.
let tourExtras = [];
function tourExtraClear() { tourExtras.forEach(e => e.remove()); tourExtras = []; }
function tourExtraShow(w) {
  tourExtraClear();
  const target = typeof w.el === 'function' ? w.el() : document.querySelector(w.el);
  const win = document.createElement('div'); win.className = 'gtTourWin'; win.dir = LANG === 'en' ? 'ltr' : 'rtl';
  const t = document.createElement('div'); t.className = 't'; t.textContent = w.title;
  const d = document.createElement('div'); d.className = 'd'; d.textContent = w.desc;
  win.append(t, d); document.body.appendChild(win); tourExtras.push(win);
  const vw = window.innerWidth, vh = window.innerHeight, M = 10;
  win.style.width = Math.min(300, vw - 2 * M) + 'px';
  const ww = win.offsetWidth, wh = win.offsetHeight;
  const tr = target ? target.getBoundingClientRect() : null;
  if (tr && tr.width && tr.height) {
    const ring = document.createElement('div'); ring.className = 'gtTourRing';
    ring.style.cssText = `left:${tr.left - 5}px;top:${tr.top - 5}px;width:${tr.width + 10}px;height:${tr.height + 10}px`;
    document.body.appendChild(ring); tourExtras.push(ring);
  }
  const avoid = [document.querySelector('.driver-popover'), document.querySelector('.driver-active-element')].filter(Boolean).map(e => e.getBoundingClientRect());
  const hit = (x, y) => avoid.some(r => x < r.right + 6 && x + ww > r.left - 6 && y < r.bottom + 6 && y + wh > r.top - 6);
  const clampX = x => Math.max(M, Math.min(vw - ww - M, x)), clampY = y => Math.max(M, Math.min(vh - wh - M, y));
  let pos = null;
  if (tr && tr.width && tr.height) {
    const cx = tr.left + tr.width / 2 - ww / 2, cy = tr.top + tr.height / 2 - wh / 2;
    const cands = [[clampX(cx), tr.bottom + 14], [clampX(cx), tr.top - wh - 14], [tr.right + 14, clampY(cy)], [tr.left - ww - 14, clampY(cy)]];
    pos = cands.find(([x, y]) => x >= M && y >= M && x + ww <= vw - M && y + wh <= vh - M && !hit(x, y)) || null;
  }
  if (!pos) { // אין יעד נראה (או אין מקום): בפינה פנויה של המסך
    const corners = [[M, M], [vw - ww - M, M], [M, vh - wh - M], [vw - ww - M, vh - wh - M]];
    pos = corners.find(([x, y]) => !hit(x, y)) || corners[0];
  }
  win.style.left = pos[0] + 'px'; win.style.top = pos[1] + 'px';
}
// v3.6.0: הסבר על עיגולי-ההתאמה בין שני הצדדים (א׳, ג׳, ו׳ מתוך 6) על מילות-ההדגמה (עניו / סבלן). לכל צעד שני חלונות — צד א׳
// (הפופ-אובר הראשי) וצד ב׳ (win2) — והסיור *לוחץ בפועל* על העיגול (demo) כדי שיראו את ההבהוב בשני הצדדים. ההתאמות נשלפות
// מ-E.compareAll על אותן 13 שיטות ש-seedDemoQuery מפעיל. בדסקטופ היעד הוא תא-השיטה (.gr4cell), בנייד — שבב-השיטה (.ccChip).
function matchTourSteps(mobile) {
  const en = LANG === 'en', WA = 'עניו', WB = 'סבלן', NA = en ? 'anav' : WA, NB = en ? 'savlan' : WB;
  const ids = E.METHODS.map(m => m.id);
  const ms = E.compareAll(WA, WB, ids, ids).matches;
  const cell = (k, id) => mobile ? `.ccChip[data-k="${k}"][data-m="${id}"]` : `#gr${k} .gr4cell[data-m="${id}"]`;
  const side = mobile ? 'top' : 'bottom', align = 'center';
  const one = (n, intro) => {
    const m = ms[n - 1]; if (!m) return null;
    const la = L(MN[m.a.method]), lb = L(MN[m.b.method]), ch = heNum(m.id);
    const lead = intro ? (en
      ? `There are ${ms.length} match circles here; the colour and letter are the same on both sides for equal gematria values. Clicking a circle makes both sides blink. `
      : `יש כאן ${ms.length} עיגולי-התאמה, צבע ואות זהים בשני הצדדים לערכי גימטריה זהים. לחיצה על עיגול תגרום להיבהוב בשני הצדדים. `) : '';
    // הצעד הראשון כבר מסביר מה לחיצה עושה (lead); השני מסביר במלואו; האחרון בקצרה
    const click = intro ? '' : n === 3
      ? (en ? 'We just clicked the circle for you: the colour bar and both circles of this match now blink on both sides for 7 seconds. Click it again to stop.' : 'הרגע לחצנו בשבילכם על העיגול: פס-הצבע ושני עיגולי ההתאמה מהבהבים עכשיו בשני הצדדים במשך 7 שניות. לחיצה נוספת עליו עוצרת את ההבהוב.')
      : (en ? 'We just clicked the circle for you: the colour bar and both circles blink.' : 'הרגע לחצנו בשבילכם על העיגול: פס-הצבע ושני עיגולי ההתאמה מהבהבים.');
    return {
      id: 'match' + n, element: cell('A', m.a.method),
      demo: () => { focusMatch(m.id, true); return () => { if (FOCUS != null) focusMatch(FOCUS); }; },
      popover: { title: en ? `Side A — match ${ch}` : `צד א׳ — התאמה ${ch}`, description: lead + (en ? `"${NA}" in "${la}" = ${m.value}. ` : `"${NA}" בשיטת "${la}" = ${m.value}. `) + click, side, align },
      win2: { el: cell('B', m.b.method), title: en ? `Side B — match ${ch}` : `צד ב׳ — התאמה ${ch}`, desc: en ? `"${NB}" in "${lb}" = ${m.value}. The same value as on Side A, so the two methods match.` : `"${NB}" בשיטת "${lb}" = ${m.value}. אותו ערך כמו בצד א׳, ולכן שתי השיטות מותאמות.` },
    };
  };
  const names = en ? 'circles א, ג and ו' : 'העיגולים א׳, ג׳ ו-ו׳';
  return [one(1, names), one(3), one(6)].filter(Boolean);
}
// v3.6.0: עיגול-התוצאות ("כמה התאמות נמצאו בקורפוס") — שני חלונות: העיגול עצמו (פופ-אובר ראשי) ורשימת-התוצאות (win2),
// והסיור לוחץ בפועל על העיגול של "עם הכולל" בצד א׳ כדי להראות שהתוצאות של השיטה עולות לראש הרשימה.
function hitsTourStep(mobile) {
  const en = LANG === 'en';
  return {
    id: 'hits', element: mobile ? '.ccHits[data-k="A"][data-m="kollel"]' : '#grA .gr4cell[data-m="kollel"] .bdgH',
    demo: () => { if (S.A.hitsSort !== 'kollel') hitsSortToggle('A', 'kollel'); return () => { if (S.A.hitsSort === 'kollel') hitsSortToggle('A', 'kollel'); }; },
    popover: {
      title: en ? 'Info circle: number of results' : 'עיגול-מידע: מספר התוצאות',
      description: en ? 'The number in this circle is how many matches were actually found in the sources for this method on Side A ("regular + kollel"). We just clicked it for you.' : 'המספר בעיגול הזה הוא כמה התאמות נמצאו בפועל במקורות עבור השיטה הזו בצד א׳ ("רגילה +כולל"). הרגע לחצנו עליו בשבילכם.',
      side: mobile ? 'top' : 'bottom', align: 'center',
    },
    win2: { el: '#rlA', title: en ? 'The results list' : 'רשימת התוצאות', desc: en ? 'After the click, the matches of this method moved to the top of the list. Clicking the circle again restores the normal order.' : 'אחרי הלחיצה, ההתאמות של השיטה הזו עלו לראש הרשימה. לחיצה נוספת על העיגול מחזירה את הסדר הרגיל.' },
  };
}
// v3.6.0: סינון בתוך התוצאות — הסיור מקליד בפועל מילה בתיבת-הסינון של צד א׳ ורואים את הרשימה מסתננת (שני חלונות: התיבה והרשימה).
// ה-demo מחזיר undo (ניקוי-הסינון) שמופעל לפני המעבר לצעד אחר (ראו wrapTourSteps).
function filterTourStep(mobile) {
  const en = LANG === 'en', word = 'פרי';
  return {
    id: 'filter', element: '.tfInp',
    demo: () => { const inp = $('#tfA'); inp.value = word; inp.dispatchEvent(new Event('input', { bubbles: true })); return () => { const x = $('#tfxA'); if (S.A.tf && x) x.click(); }; },
    popover: { title: en ? 'Filtering results' : 'סינון תוצאות', description: en ? `When there are many results, type a word here and the list narrows instantly. We just typed "${word}" for you — only the verses containing it remain.` : `כש-יש הרבה תוצאות, מקלידים כאן מילה והרשימה מסתננת מיד. הרגע הקלדנו בשבילכם "${word}" — נשארו רק הפסוקים שמכילים אותה.`, side: 'bottom', align: 'start' },
    win2: { el: '#rlA', title: en ? 'The filtered list' : 'הרשימה אחרי הסינון', desc: en ? 'Only matching verses are shown, with the typed word highlighted, and a counter next to the box shows how many remain. "Clear" brings everything back.' : 'מוצגים רק הפסוקים המתאימים, והמילה שהוקלדה מודגשת בהם; מונה ליד התיבה מראה כמה נשארו. הכפתור "נקה" מחזיר את כל התוצאות.' },
  };
}
// v3.6.0: מתג המראה — הסיור מעביר בפועל למראה השני, ואחרי כמה שניות (או ביציאה/מעבר צעד) חוזר למראה שהיה.
function tourThemeDemo() {
  const chk = $('#themeChk'), was = chk.checked; let back = false;
  const flip = v => { chk.checked = v; chk.onchange(); };
  flip(!was);
  const t = setTimeout(() => { if (!back) { back = true; flip(was); } }, 2600);
  return () => { clearTimeout(t); if (!back) { back = true; if (chk.checked !== was) flip(was); } };
}
// מוסיף לכל צעד עם demo/undo: לפני מעבר "הבא"/"הקודם" מריצים את ה-undo של הצעד (למשל מבטלים מיקוד-התאמה/סינון/מיון) — *לפני*
// ש-driver.js פותר את היעד של הצעד הבא, כך שהיעד הבא לא מוחלף ב-DOM אחרי שכבר סומן.
// v3.6.0: תוצאה בודדת — צעד נפרד (עם פוקוס) לכל תווית בכותרת התוצאה הראשונה, עם הסבר על משמעותה. היעדים הם אלמנטים
// בתוך .rs הראשון (ראו buildRowHtml: <b>ייחוס</b>, .tag קטגוריה, .tag.prs/.seder, ⧉ (.cpy) וכפתור הספר (.goRd), .tag.meth, .tagArrow, .tag; ובתוך .cx: <mark>).
function resultTourSteps(mobile) {
  const en = LANG === 'en', R = '.resList .rs ';
  const one = (sel, title, desc, side) => ({ element: R + sel, popover: { title, description: desc, side: side || 'bottom', align: 'start' } });
  // כמה תגיות סמוכות בצעד אחד: אלמנט-עזר צף (#gtTourUnion) שעוטף את כולן — driver.js מסמן אלמנט אחד בלבד
  const group = (sels, title, desc) => ({ unionDim: true, element: () => tourUnion(sels.map(x => R + x)), popover: { title, description: desc, side: 'bottom', align: 'start' } });
  return en ? [
    group(['.rf > b', '.rf > b + .tag', '.rf .tag.prs', '.rf .tag.seder'], 'Result: reference, category and parsha / order', 'The reference is the exact place of the match: book and chapter:verse (for Mishnah — tractate, chapter and mishnah). The category tag says which part of the corpus the text belongs to (Tanakh, Mishnah, Rashi or Targum), and next to it, where relevant, appears the parsha of the verse, or for Mishnah its order (seder). The whole box is one result.'),
    group(['.rf .tag.meth', '.rf .tagArrow', '.rf .tagArrow + .tag'], 'Result: the two gematria methods', 'Two gematria tags joined by an arrow ↔: the first is the method by which the value of the verse (or of the matching part of it) was calculated, the second is the method of the word you searched, in which the match was found. The value is the same in both.'),
    one('.rf .cpy', 'Result: copy', 'Copies the whole verse (or mishnah) to the clipboard.'),
    one('.rf .goRd', 'Result: open in the book', 'Opens the reading screen at the exact place of this result: the book, the chapter and the verse (or mishnah / halakhah), which blinks for a moment. A result in a commentary or a translation opens the book it comments on. Clicking the reference itself does the same. The reading screen has its own guided tour, in the ⋮ menu.'),
    one('.cx mark', 'Result: the highlighted words', 'The words that actually matched, highlighted inside the text of the verse.', 'top'),
  ] : [
    group(['.rf > b', '.rf > b + .tag', '.rf .tag.prs', '.rf .tag.seder'], 'תוצאה: ייחוס, קטגוריה ופרשה / סדר', 'הייחוס הוא המקום המדויק של ההתאמה: ספר ופרק:פסוק (במשנה — מסכת, פרק ומשנה). תגית הקטגוריה אומרת לאיזה חלק בקורפוס שייך הטקסט (תנ״ך, משנה, רש״י או תרגום), ולידה מופיעה, כשזה רלוונטי, הפרשה שאליה שייך הפסוק, ובמשנה — הסדר שבו היא נמצאת. כל התיבה היא תוצאה אחת: פסוק או משנה.'),
    group(['.rf .tag.meth', '.rf .tagArrow', '.rf .tagArrow + .tag'], 'תוצאה: שתי שיטות הגימטריה', 'שתי תגיות-גימטריה מחוברות בחץ ↔: הראשונה היא השיטה שלפיה חושב ערך הפסוק (או הקטע התואם בו), והשנייה היא שיטת מילת-החיפוש שלכם שבה נמצאה ההתאמה. הערך בשתיהן זהה.'),
    one('.rf .cpy', 'תוצאה: העתקה', 'מעתיקה את הפסוק (או המשנה) כולו ללוח.'),
    one('.rf .goRd', 'תוצאה: פתיחה בספר', 'פותח את מסך הקריאה בדיוק במקום של התוצאה: הספר, הפרק והפסוק (או המשנה / ההלכה), שמהבהב לרגע. תוצאה בפירוש או בתרגום פותחת את הספר שעליו הם. גם לחיצה על הייחוס עצמו עושה את זה. למסך הקריאה יש סיור מודרך משלו, בתפריט ⋮.'),
    one('.cx mark', 'תוצאה: המילים המודגשות', 'המילים שתאמו בפועל, מודגשות בתוך טקסט הפסוק.', 'top'),
  ];
}
// אלמנט-עזר צף שעוטף כמה אלמנטים (לצעד עם כמה תגיות). נוצר/מתעדכן בכל קריאה, ומוסר רק בסוף הסיור (tourUnionRemove) —
// לא בתחילת צעד, כי driver.js כבר פתר את היעד לפני onHighlightStarted.
let tourUnionInfo = null;
// בתוך מלבן-הפוקוס של צעד-תגיות יכולות להיכנס תגיות שלא מוסברות בו (כשהתגיות עוטפות לשתי שורות, המלבן הוא התיבה החוסמת). כאן
// מכהים אותן באותה כהות כמו שכבת-ההחשכה של driver.js, כך שנראות מוארות רק התגיות שמוסברות. נקרא מ-onHighlighted (אחרי
// tourExtraClear של תחילת-הצעד, ולכן הכיסויים נרשמים ב-tourExtras ונמחקים בצעד הבא).
function tourUnionDim() {
  const info = tourUnionInfo; if (!info) return;
  const row = info.els[0].closest('.rf'); if (!row) return;
  const path = document.querySelector('.driver-overlay path'), op = path ? parseFloat(path.style.opacity) : 0.5;
  const R = info.rect;
  [...row.children].filter(c => !info.els.includes(c)).forEach(c => {
    const r = c.getBoundingClientRect(); if (!r.width || !r.height) return;
    const l = Math.max(r.left, R.l - 6), t = Math.max(r.top, R.t - 6), rr = Math.min(r.right, R.r + 6), bb = Math.min(r.bottom, R.b + 6);
    if (rr <= l || bb <= t) return;
    const d = document.createElement('div'); d.className = 'gtTourDim';
    d.style.cssText = `left:${l}px;top:${t}px;width:${rr - l}px;height:${bb - t}px;background:rgba(0,0,0,${op})`;
    document.body.appendChild(d); tourExtras.push(d);
  });
}
function tourUnion(sels) {
  const els = sels.map(x => document.querySelector(x)).filter(Boolean);
  if (!els.length) return null;
  const rs = els.map(e => e.getBoundingClientRect());
  const l = Math.min(...rs.map(r => r.left)), t = Math.min(...rs.map(r => r.top)), r2 = Math.max(...rs.map(r => r.right)), b2 = Math.max(...rs.map(r => r.bottom));
  tourUnionInfo = { els, rect: { l, t, r: r2, b: b2 } };
  // אלמנט נפרד לכל צעד (לפי הסלקטורים) — אלמנט משותף נדרס כש-driver.js פותר את היעד של צעד אחר
  const uid = 'gtTourUnion' + sels.join('|').length + sels[0].length;
  let u = document.getElementById(uid);
  if (!u) { u = document.createElement('div'); u.id = uid; u.className = 'gtTourUnionEl'; document.body.appendChild(u); }
  u.style.cssText = `position:fixed;pointer-events:none;visibility:hidden;left:${l}px;top:${t}px;width:${r2 - l}px;height:${b2 - t}px`;
  return u;
}
function tourUnionRemove() { document.querySelectorAll('.gtTourUnionEl').forEach(u => u.remove()); }
// פנל-ההגדרות של התוצאות (⚙) — הסבר *כללי* בלבד: הסיור פותח אותו בפועל (toggleFilt) וסוגר אותו במעבר צעד (undo).
function settingsPanelStep(mobile) {
  const en = LANG === 'en';
  return {
    id: 'settings', element: '#fpA',
    demo: () => { toggleFilt('A', true); return () => toggleFilt('A', false); },
    popover: { title: en ? 'The results settings panel' : 'פנל ההגדרות של התוצאות',
      description: en ? 'This is the panel the ⚙ button opens. In general, it lets you choose which gematria methods and which books are searched, and fine-tune how matches are counted. You do not need to set anything to start; the defaults suit most searches.' : 'זה הפנל שנפתח בלחיצה על ⚙. בגדול, כאן בוחרים באילו שיטות גימטריה ובאילו ספרים לחפש, ומכוונים איך נספרות ההתאמות. אין צורך להגדיר כלום כדי להתחיל — ברירות המחדל מתאימות לרוב החיפושים.',
      side: mobile ? 'top' : 'left', align: 'start' },
  };
}
function buildMobileTourSteps() {
  if (LANG === 'en') return [
    { popover: { title: 'Welcome to Gimatrivon', description: 'A short tour (skip/exit any time) — two "sides" (A/B) you can compare side by side. Let\'s start with Side A.' } },
    { element: '#tA', popover: { title: 'Typing an expression', description: 'Type a word or expression here — the gematria calculation and the search for matches update instantly as you type.', side: 'bottom', align: 'start' } },
    { element: '.mSumSeg', popover: { title: 'Switching between sides', description: 'These two buttons switch which side\'s results are shown below — Side A and Side B have independent input and results.', side: 'bottom', align: 'start' } },
    { element: '#mSheetHandle', popover: { title: 'The input & calculation panel', description: 'Drag or tap this handle to show or collapse the panel with both inputs and the combined calculation grid, without leaving the results view.', side: 'top', align: 'center' } },
    { element: '#mgrFirstFam', popover: { title: 'Gematria methods', description: 'Each box here is a calculation method (regular, Atbash, Atbach, milui and more) for both sides at once — scroll down for more methods. Tapping a value turns that method on/off for the search.', side: 'top', align: 'center' } },
    hitsTourStep(true),
    ...matchTourSteps(true),
    { element: '.resList', popover: { title: 'Search results', description: 'Matches found in the sources for the value you typed appear here, grouped by method. To copy a whole verse to the clipboard, click ⧉.', side: 'top', align: 'start' } },
    ...resultTourSteps(true),
    filterTourStep(true),
    { element: '#ftA', popover: { title: 'Choosing sources and range', description: 'Tapping here opens a panel to choose which books (and chapter/parsha ranges) to search, and which gematria methods are included.', side: 'bottom', align: 'end' } },
    settingsPanelStep(true),
    { id: 'theme', demo: tourThemeDemo, element: '#mKebab', popover: { title: "That's it, you're ready!", description: 'This menu holds appearance (light/dark), language, "About", contact, and this tour again any time. We just switched the appearance for you, and in a few seconds it returns to your look.', side: 'bottom', align: 'end' } },
  ];
  return [
    { popover: { title: 'ברוכים הבאים לגימטריבון', description: 'סיור קצר (אפשר לדלג/לצאת בכל רגע) — שני "צדדים" (א׳/ב׳) שאפשר להשוות ביניהם. נתחיל מצד א׳.' } },
    { element: '#tA', popover: { title: 'הקלדת ביטוי', description: 'מקלידים כאן מילה או ביטוי — החישוב הגימטרי וחיפוש ההתאמות מתעדכנים מיד, תוך כדי ההקלדה.', side: 'bottom', align: 'start' } },
    { element: '.mSumSeg', popover: { title: 'מעבר בין הצדדים', description: 'שני הכפתורים האלה מחליפים איזה צד מוצג למטה — לצד א׳ ולצד ב׳ יש קלט ותוצאות עצמאיים משלהם.', side: 'bottom', align: 'start' } },
    { element: '#mSheetHandle', popover: { title: 'פנל הקלט והחישוב', description: 'גוררים או לוחצים על הידית הזו כדי להציג או לכווץ את הפנל עם הקלט של שני הצדדים ולוח-החישוב המשולב, בלי לצאת מתצוגת התוצאות.', side: 'top', align: 'center' } },
    { element: '#mgrFirstFam', popover: { title: 'שיטות גימטריה', description: 'כל תא כאן הוא שיטת-חישוב (רגילה, אתב״ש, אטב״ח, מילוי ועוד) לשני הצדדים יחד — גוללים למטה לעוד שיטות. לחיצה על ערך מדליקה/מכבה את השיטה הזו לחיפוש.', side: 'top', align: 'center' } },
    hitsTourStep(true),
    ...matchTourSteps(true),
    { element: '.resList', popover: { title: 'תוצאות החיפוש', description: 'כאן מופיעות ההתאמות שנמצאו במקורות לערך שהקלדתם, מקובצות לפי שיטה. העתקת פסוק שלם ללוח: לחיצה על ⧉.', side: 'top', align: 'start' } },
    ...resultTourSteps(true),
    filterTourStep(true),
    { element: '#ftA', popover: { title: 'בחירת מקורות וטווח', description: 'לחיצה כאן פותחת פנל שבו בוחרים באילו ספרים (ואילו טווחים) לחפש, ואילו שיטות-גימטריה ייכללו.', side: 'bottom', align: 'end' } },
    settingsPanelStep(true),
    { id: 'theme', demo: tourThemeDemo, element: '#mKebab', popover: { title: 'זהו, אפשר להתחיל!', description: 'בתפריט הזה נמצאים גם מראה (בהיר/כהה), שפה, "אודות", יצירת-קשר, ואפשר להפעיל את הסיור הזה שוב בכל רגע. הרגע העברנו את המראה למראה השני, ובעוד כמה שניות הוא חוזר למראה שהיה לכם.', side: 'bottom', align: 'end' } },
  ];
}
function buildTourSteps() {
  if (LANG === 'en') return [
    { popover: { title: 'Welcome to Gimatrivon', description: 'A short tour (skip/exit any time) — two identical "columns" (A/B) that let you compare two expressions/searches side by side. Let\'s start with Side A.' } },
    { element: '#tA', popover: { title: 'Typing an expression', description: 'Type a word or expression here — the gematria calculation and the search for matches in the corpus (Tanakh, Mishnah, Rashi and more) update instantly as you type. Side B (the second column) has an identical box.', side: 'bottom', align: 'start' } },
    { element: '#grA', popover: { title: 'Gematria methods', description: 'Each row here is a calculation method (regular, Atbash, Atbach, milui and more). You can turn specific methods on/off — the value and the search update according to the active methods only.', side: 'left', align: 'start' } },
    hitsTourStep(false),
    ...matchTourSteps(false),
    { element: '.resList', popover: { title: 'Search results', description: 'Matches found in the sources for the value you typed appear here, grouped by method. To copy a whole verse to the clipboard, click ⧉.', side: 'right', align: 'start' } },
    ...resultTourSteps(false),
    filterTourStep(false),
    { element: '#ftA', popover: { title: 'Choosing sources and range', description: 'Clicking here opens a panel where you choose which books (and which chapter/parsha ranges) to search, and which gematria methods are included in the search itself and in notarikon matching.', side: 'bottom', align: 'end' } },
    settingsPanelStep(true),
    { id: 'theme', demo: tourThemeDemo, element: '.themeSw', popover: { title: 'App appearance', description: 'This toggle switches between a light "parchment" look and a dark "night" look, whichever you prefer. We just switched it for you, and in a few seconds it returns to your look.', side: 'bottom', align: 'end' } },
    { element: '#startTour', popover: { title: "That's it, you're ready!", description: 'You can start this tour again any time from here.', side: 'bottom', align: 'end' } },
  ];
  return [
    { popover: { title: 'ברוכים הבאים לגימטריבון', description: 'סיור קצר (אפשר לדלג/לצאת בכל רגע) — שתי "עמודות" זהות (א׳/ב׳) שמאפשרות להשוות בין שני ביטויים/חיפושים זה לצד זה. נתחיל מצד א׳.' } },
    { element: '#tA', popover: { title: 'הקלדת ביטוי', description: 'מקלידים כאן מילה או ביטוי — החישוב הגימטרי וחיפוש ההתאמות בקורפוס (תנ״ך, משנה, רש״י ועוד) מתעדכנים מיד, תוך כדי ההקלדה. בצד ב׳ (העמודה השנייה) יש תיבה זהה.', side: 'bottom', align: 'start' } },
    { element: '#grA', popover: { title: 'שיטות גימטריה', description: 'כל שורה כאן היא שיטת-חישוב (רגילה, אתב״ש, אטב״ח, מילוי ועוד). אפשר להדליק/לכבות שיטות ספציפיות — הערך והחיפוש מתעדכנים לפי השיטות הפעילות בלבד.', side: 'left', align: 'start' } },
    hitsTourStep(false),
    ...matchTourSteps(false),
    { element: '.resList', popover: { title: 'תוצאות החיפוש', description: 'כאן מופיעות ההתאמות שנמצאו במקורות לערך שהקלדתם, מקובצות לפי שיטה. העתקת פסוק שלם ללוח: לחיצה על ⧉.', side: 'right', align: 'start' } },
    ...resultTourSteps(false),
    filterTourStep(false),
    { element: '#ftA', popover: { title: 'בחירת מקורות וטווח', description: 'לחיצה כאן פותחת פנל שבו בוחרים באילו ספרים (ואילו טווחי פרקים/פרשות) לחפש, ואילו שיטות-גימטריה ייכללו בחיפוש עצמו ובהתאמת-נוטריקון.', side: 'bottom', align: 'end' } },
    settingsPanelStep(false),
    { id: 'theme', demo: tourThemeDemo, element: '.themeSw', popover: { title: 'מראה האפליקציה', description: 'מתג זה מחליף בין מראה "גוויל" בהיר למראה "לילה" כהה, לפי הנוחות שלכם. הרגע העברנו אותו למראה השני, ובעוד כמה שניות הוא חוזר למראה שהיה לכם.', side: 'bottom', align: 'end' } },
    { element: '#startTour', popover: { title: 'זהו, אפשר להתחיל!', description: 'אפשר להפעיל את הסיור הזה שוב בכל רגע מכאן.', side: 'bottom', align: 'end' } },
  ];
}
// הגדרות driver.js המשותפות לשני הסיורים (מסך הגימטריה כאן, מסך הקריאה ב-reader.js: GimReader.tour)
function tourBase() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    showProgress: true,
    progressText: LANG === 'en' ? '{{current}} of {{total}}' : '{{current}} מתוך {{total}}',
    nextBtnText: LANG === 'en' ? 'Next' : 'הבא',
    prevBtnText: LANG === 'en' ? 'Previous' : 'הקודם',
    doneBtnText: LANG === 'en' ? 'Done' : 'סיום',
    closeBtnText: L('סגור'),
    allowClose: true,
    overlayOpacity: dark ? 0.55 : 0.5,
    stagePadding: 6,
    stageRadius: 8,
    animate: true,
    smoothScroll: true,
    popoverClass: 'gtTourPopover',
  };
}
function startTour() {
  if (!window.driverjs) return;
  // בנייד: לפני שמתחילים, מוודאים שצד א׳ מוצג (ה-switcher) ושהגיליון התחתון פתוח (לא מכווץ) — אחרת
  // צעדי-הסיור ש-מצביעים על #mgr/.resList-של-צד-א׳ יפנו לאלמנטים מוסתרים/בגובה-אפס. משתמשים ב-click
  // אמיתי (לא במניפולציית-class ישירה) כדי להפעיל את אותה לוגיקה בדיוק שהמשתמש היה מפעיל בעצמו.
  if (mobileActive) {
    const segA = document.querySelector('.mSumSeg[data-side="A"]');
    if (segA && !segA.classList.contains('active')) segA.click();
    const sheet = $('#mSheet');
    if (sheet && sheet.classList.contains('collapsed')) $('#mSheetHandle').click();
  }
  FOCUS = null; BLINK_AT = 0;
  const demoSnap = seedDemoQuery();
  let restored = false;
  const restoreOnce = () => { if (restored) return; restored = true; document.documentElement.classList.remove('gtNoAnim'); runUndo(); tourExtraClear(); tourUnionRemove(); clearTimeout(blinkTimer); FOCUS = null; BLINK_AT = 0; restoreDemoQuery(demoSnap); };
  // צעדים עם demo (לחיצה אמיתית על עיגול): ה-demo מצייר מחדש את הלוח ולכן מחליף את ה-DOM שעליו driver.js כבר סימן — אחרי
  // ה-demo קוראים ל-moveTo לאותו צעד כדי ש-driver יפתור את היעד מחדש; demoRanFor מונע לולאה (ה-demo רץ פעם אחת לכל כניסה לצעד).
  let demoRanFor = null, activeUndo = null;
  const runUndo = () => { const u = activeUndo; activeUndo = null; if (u) u(); };
  const wrapSteps = steps => steps.map(st => !st.demo ? st : { ...st, popover: { ...st.popover,
    onNextClick: (el, step, o) => { runUndo(); o.driver.moveNext(); },
    onPrevClick: (el, step, o) => { runUndo(); o.driver.movePrevious(); } } });
  const tour = window.driverjs.driver({
    ...tourBase(),
    skipMissingElement: true, // אם היעד של צעד מסוים לא קיים (למשל: למשתמש יש חיפוש-משלו בלי התאמה בין הצדדים) — מדלגים עליו בשקט, בלי פופ-אובר "תועה" במרכז המסך
    steps: wrapSteps(mobileActive ? buildMobileTourSteps() : buildTourSteps()), // v3.4.0: סט-צעדים נפרד לנייד (ראו buildMobileTourSteps)
    // v3.4.1: בנייד, יעדי-הצעדים מתחלקים בין תוכן *בתוך* הגיליון-התחתון (#tA/#mgrFirstFam/.ccHits/.ccBdg2
    // — כולם חיים בתוך #mSheet) לבין תוכן *מאחורי* הגיליון (.resList/#ftA/.tfInp — חיים ב-.mResPane, שה-
    // גיליון-הפתוח מכסה אותו לגמרי). בלי הלוגיקה הזו, אחרי הצעד "שיטות גימטריה" (שפותח את הגיליון) הסיור
    // ממשיך ישר ל"תוצאות החיפוש" בלי להנמיך את הגיליון — כך שפנל-התוצאות שהצעד אמור להסביר עליו נשאר מוסתר
    // מתחת לגיליון הפתוח (באג שדווח: "כשהסיור מסביר על פנל התוצאות הוא שוכח להנמיך את פנל השיטות"). הגיליון
    // גם נפתח-מחדש כש-חוזרים לצעדי ה-#mgr (.ccHits/.ccBdg2 מגיעים *אחרי* צעדי-התוצאות ברשימה) וגם כש-לוחצים
    // "הקודם" (onHighlightStarted נקרא תמיד, בשני הכיוונים — לא רק ב"הבא").
    onHighlighted: (el, step) => {
      if (step && step.demo && demoRanFor !== step.id) { demoRanFor = step.id; activeUndo = step.demo() || null; const ix = tour.getActiveIndex(); setTimeout(() => { document.documentElement.classList.add('gtNoAnim'); tour.setConfig({ ...tour.getConfig(), animate: false }); tour.moveTo(ix); }, 60); return; } // setTimeout: driver.js עוד מעדכן את מצבו הפנימי מיד אחרי החזרה מה-hook הזה
      if (!step || !step.demo) demoRanFor = null;
      if (step && step.unionDim) tourUnionDim();
      if (step && step.win2) tourExtraShow(step.win2);
    },
    onHighlightStarted: (el, step) => {
      // רק בכניסה-מחדש אחרי demo נשארים בלי אנימציה (הסרת המחלקה באמצע הצעד מפעילה אותה מחדש = הבהוב)
      if (!(step && step.demo && demoRanFor === step.id) && document.documentElement.classList.contains('gtNoAnim')) { tour.setConfig({ ...tour.getConfig(), animate: true }); document.documentElement.classList.remove('gtNoAnim'); }
      tourExtraClear();
      if (!mobileActive) return;
      const sheet = $('#mSheet'), scrim = $('#mScrim'); if (!sheet || !scrim) return;
      const sel = step && step.element;
      const needsOpen = ['#tA', '#mgrFirstFam'].includes(sel) || (typeof sel === 'string' && /^\.(ccChip|ccHits|ccBdg2)/.test(sel));
      const needsClosed = ['#ftA', '#fpA', '.tfInp'].includes(sel) || typeof sel === 'function' && !needsOpen || (typeof sel === 'string' && sel.startsWith('.resList'));
      if (needsOpen) { sheet.classList.remove('collapsed'); scrim.classList.add('show'); }
      else if (needsClosed) { sheet.classList.add('collapsed'); scrim.classList.remove('show'); }
    },
    onDestroyed: restoreOnce, // סיום/X/Esc/קליק-רקע — כולם מגיעים לכאן; משחזרים את מצב שני הצדדים שהיה לפני הסיור
  });
  tour.drive();
}
// v3.31.0: במסך הקריאה הכפתור (דרך ⋮) מפעיל את הסיור של מסך הקריאה, ולא מעביר יותר לגימטריה
$('#startTour').onclick = () => {
  const rd = document.body.dataset.mode === 'read' && window.GimReader && window.GimReader.tour;
  trackEvent('tour_start', { layout: mobileActive ? 'mobile' : 'desktop', screen: rd ? 'read' : 'gem' });
  if (rd) window.GimReader.tour(); else startTour();
};
// משיכת-תשומת-לב עדינה לכפתור "סיור מודרך" ב-5 השניות הראשונות בלבד (לא חוזר, לא לולאה אינסופית) —
// מניחה class שמפעיל אנימציה (ראו styles.css: .tourBtn.attract) ומסירה אותה אחרי 5 שניות; לחיצה על
// הכפתור (או על כל מקום אחר) באמצע מפסיקה אותה מיידית (prefers-reduced-motion מכבד — ראו ה-CSS).
(() => {
  const btn = $('#startTour'); if (!btn) return;
  btn.classList.add('attract');
  const stop = () => btn.classList.remove('attract');
  setTimeout(stop, 5000);
  btn.addEventListener('pointerdown', stop, { once: true });
})();


KS.forEach(bind); renderDocs(); renderCenter();
setupMobileUX();
/* v3.12.0: הקורפוס נטען לפי ספר (corpus-loader.js). קודם תנ״ך ומשנה, כדי שהתוצאות הראשונות יופיעו מהר, ואחר כך
   שאר המקורות ברקע; אז האינדקס נבנה מחדש על הכל והחיפושים רצים שוב (כמו בטעינה הראשונה — run מאפס את התוצאות).
   v3.16.0:
   - האינדקס נבנה בפרוסות קצרות (E.buildIndexAsync), כך שהמסך לא נתקע אף פעם — גם לא כשעוברים למסך הקריאה באמצע.
     במסך הקריאה הבנייה (והחיפושים) ממשיכים רק בזמן פנוי של הדפדפן (requestIdleCallback).
   - אחרי שהאינדקס נבנה, קובצי הספרים עצמם כבר לא נחוצים לגימטריה (הטקסט נמצא ב-IDX.units) ומשתחררים.
   - אחרי 5 דקות רצופות במסך הקריאה האינדקס (מאות MB) משתחרר; בחזרה לגימטריה הוא נבנה שוב (מהמטמון), והחיפושים רצים שוב.
   - בזמן ההמתנה לאינדקס: האותיות ג־י־מ־ט־ר־י־ה מתמלאות לפי ההתקדמות, כל אות עם הערך שלה (gemLoadHtml). */
const GEM_LETTERS = [['ג', 3], ['י', 10], ['מ', 40], ['ט', 9], ['ר', 200], ['י', 10], ['ה', 5]];
const GEM_IDLE_MS = window.GIM_GEM_IDLE_MS || 5 * 60 * 1000; // GIM_GEM_IDLE_MS: לבדיקות בלבד
const inRead = () => document.body.dataset.mode === 'read';
// יש לחיצה/הקלדה שמחכה לטיפול (Chrome): עוצרים את הפרוסה מיד, כך שפרוסות ארוכות יותר (מהירות יותר) לא מעכבות תגובה
const inputWaiting = () => !!(navigator.scheduling && navigator.scheduling.isInputPending && navigator.scheduling.isInputPending());
const gemWait = f => inRead() && window.requestIdleCallback ? requestIdleCallback(f, { timeout: 3000 }) : setTimeout(f, 0);
// שלב ב׳ (כל המקורות) רץ ברקע בזמן פנוי, כדי לא להאט את החיפוש בתוצאות הראשונות (תנ״ך ומשנה)
const gemBgWait = f => window.requestIdleCallback ? requestIdleCallback(f, { timeout: inRead() ? 3000 : 400 }) : setTimeout(f, 0);
GEM_WAIT = gemWait;
function gemLoadHtml(label, mini) {
  let cards = ''; if (!mini) for (let i = 0; i < 5; i++) cards += `<div class="gmSk" aria-hidden="true"><i class="gmLn h" style="--i:${i};width:${28 + i * 7 % 20}%"></i><i class="gmLn" style="--i:${i + 1};width:96%"></i><i class="gmLn" style="--i:${i + 2};width:${68 + i * 11 % 25}%"></i></div>`;
  return `<div class="gmLoad${mini ? ' gmMini' : ''}" role="progressbar" aria-label="${L('בונה את אינדקס הגימטריה')}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
    <div class="gmLet">${GEM_LETTERS.map(([c, v]) => `<div style="--p:0"><b class="o">${c}</b><b class="f" aria-hidden="true">${c}</b><i>${v}</i></div>`).join('')}</div>
    <div class="gmPct">0%</div><div class="gmTxt">${label}</div></div>${cards}`;
}
// f = 0..1: כל אות מתמלאת בשביעית משלה (מימין לשמאל), והערך שלה מופיע כשהיא מלאה
// מתעדכן לכל היותר פעם ב-100 מ״ש (עדכון בכל פרוסה עלה בזמן ציור והאט את הבנייה בטלפון)
function gemProg(f) {
  const now = Date.now(); GEM.f = f; if (f < 1 && now - (GEM.drawn || 0) < 100) return; GEM.drawn = now;
  const pct = Math.round(f * 100);
  document.querySelectorAll('.gmLoad').forEach(el => {
    el.setAttribute('aria-valuenow', pct);
    el.querySelectorAll('.gmLet>div').forEach((d, i) => { const p = Math.max(0, Math.min(1, f * 7 - i)); d.style.setProperty('--p', Math.round(p * 100)); d.classList.toggle('on', p >= 1); });
    const t = el.querySelector('.gmPct'); if (t) t.textContent = pct + '%';
  });
}
const gemLabel = () => GEM.stage === 0 && !GEM.one ? L('סופר את אותיות התנ״ך והמשנה…') : L('סופר את אותיות כל המקורות…');
// מציג את מסך ההמתנה בצדדים שאין בהם עדיין תוצאות (כשאין אינדקס בכלל)
// בטלפון חלונית הקלט מכסה את התוצאות, ולכן מוצגת גם גרסה קטנה בראש החלונית (בלי השלד)
function gemShowWait() {
  if (IDX) return;
  KS.forEach(k => { $('#rs' + k).textContent = ''; $('#rl' + k).innerHTML = gemLoadHtml(gemLabel()); });
  const sb = $('#mSheetBody');
  if (sb && !sb.querySelector('.gmMini')) sb.insertAdjacentHTML('afterbegin', gemLoadHtml(gemLabel(), true));
  GEM.drawn = 0; gemProg(GEM.f || 0);
}
const gemHideMini = () => document.querySelectorAll('.gmMini').forEach(e => e.remove());
// התקדמות טעינת קבצים לפי גודל (books[b].fb): כל ספר זוחל לעבר 90% וקופץ למלא כשנטען (כמו במסך הקריאה)
function gemFiles(ids, set) {
  const sz = ids.map(b => (B.books[b].fb || [1]).reduce((a, x) => a + x, 0)), tot = sz.reduce((a, x) => a + x, 0) || 1, got = sz.map(() => 0), t0 = Date.now();
  const rep = () => set(got.reduce((a, x) => a + x, 0) / tot);
  const tick = setInterval(() => { const sec = (Date.now() - t0) / 1000; sz.forEach((n, i) => { if (got[i] < n) got[i] = Math.max(got[i], n * 0.9 * (1 - Math.exp(-sec / Math.max(0.6, n / 2e6)))); }); rep(); }, 120);
  return GimCorpus.load(ids, b => { const i = ids.indexOf(b); got[i] = sz[i]; rep(); }).then(r => { clearInterval(tick); set(1); return r; }, e => { clearInterval(tick); throw e; });
}
// שלב בנייה אחד: טעינת הקבצים (40% מההתקדמות), איסוף היחידות ובנייה בפרוסות (60%). מחזיר את האינדקס, או null אם בוטל
function gemStage(ids, gen, prog, wait) {
  const live = () => gen === GEM.gen;
  return gemFiles(ids, f => { if (live()) prog(0.4 * f); }).then(() => new Promise(ok => {
    const units = [], books = B.books.map((_, b) => b).filter(b => GimCorpus.ready(b) && ids.includes(b)); let i = 0;
    const more = () => {
      if (!live()) return ok(null);
      const t0 = Date.now();
      while (i < books.length && Date.now() - t0 < 12) GimCorpus.each(books[i++], (c, bb, ch, n, t, k, s) => { units.push({ c: CK[c], b: bb, ch, n, t, k, s }); });
      if (i < books.length) wait(more); else ok(units);
    };
    wait(more);
  })).then(units => units && E.buildIndexAsync(units, null, { ms: 40, urgent: inputWaiting, wait, cancelled: () => !live(), onProgress: f => { if (live()) prog(0.4 + 0.6 * f); } }));
}
function gemStart() {
  if (GEM.busy || (IDX && GEM.stage === 2)) return;
  const gen = ++GEM.gen; GEM.busy = true; GEM.stage = 0; GEM.f = 0;
  const first = [...ALL].filter(i => B.books[i].cat <= 1), all = [...ALL];
  // יש כבר מה לחפש באחד הצדדים: בונים את כל המקורות בשלב אחד ומחפשים פעם אחת. בשני שלבים החיפוש היה רץ על
  // תנ״ך ומשנה, נקטע באמצע כשהשלב השני הסתיים, ומתחיל מחדש
  const hasQ = () => KS.some(k => numVal(S[k].num) || E.normalizeText(S[k].text).words.length);
  GEM.one = hasQ();
  // הקבצים מוחזקים עד שהיחידות נאספו; את שלב א׳ משחררים רק אחרי ששלב ב׳ כבר מחזיק את כל הספרים (בלי לטעון פעמיים)
  const rel1 = GEM.one ? () => {} : GimCorpus.use(first); let rel2 = null;
  const end = () => { rel1(); if (rel2) rel2(); if (gen === GEM.gen) GEM.busy = false; };
  const stage2 = fg => {
    if (!rel2) { rel2 = GimCorpus.use(all); rel1(); }
    return fg ? gemStage(all, gen, gemProg, gemWait) : gemStage(all, gen, f => { $('#status').textContent = L('טוען מקורות נוספים…') + ' ' + Math.round(f * 100) + '%'; }, gemBgWait);
  };
  $('#status').textContent = L('טוען קורפוס…'); gemShowWait();
  (GEM.one ? stage2(true) : gemStage(first, gen, gemProg, gemWait).then(ix => {
    if (!ix) return null;
    // הערכים הגיעו בזמן שלב א׳ (שולחן העבודה משחזר את שדות חלון הגימטריה כ-0.4 שנ׳ אחרי שהוא נטען):
    // לא מחפשים על תנ״ך ומשנה, אלא ממשיכים מיד לכל המקורות, עם מסך ההמתנה
    if (hasQ()) {
      GEM.one = true; GEM.f = 0; GEM.drawn = 0;
      document.querySelectorAll('.gmLoad .gmTxt').forEach(t => { t.textContent = gemLabel(); }); gemProg(0);
      return stage2(true);
    }
    IDX = ix; GEM.stage = 1; gemHideMini(); KS.forEach(run);
    $('#status').textContent = L('טוען מקורות נוספים…');
    return stage2(false);
  })).then(ix => {
    if (!ix) return;
    IDX = ix; GEM.stage = 2; gemHideMini(); $('#status').textContent = ''; KS.forEach(run);
  }).catch(() => { if (gen === GEM.gen) $('#status').textContent = L('שגיאה בטעינת הקורפוס — נסו לרענן את הדף'); }).then(end);
}
// משחרר את האינדקס (וכל מה שנבנה ממנו); חיפוש שרץ עכשיו נעצר (st.gen), ובחזרה לגימטריה הכל נבנה ורץ שוב
function gemRelease() {
  if (!inRead() || (!IDX && !GEM.busy)) return;
  GEM.gen++; GEM.busy = false; GEM.stage = 0; GEM.f = 0; IDX = null; gemHideMini();
  KS.forEach(k => { const st = S[k]; st.gen = (st.gen || 0) + 1; st.notGen = (st.notGen || 0) + 1; st.all = makeStore(); st.info = []; st.cur = -1; st.winStart = 0; st.winCount = 0; $('#rl' + k).innerHTML = ''; $('#rs' + k).textContent = ''; });
  $('#status').textContent = '';
}
// מי שפותח ישר במסך הקריאה (reader.js זוכר את המסך האחרון) לא טוען את הקורפוס לגימטריה עד שעובר אליה —
// מסך הקריאה טוען לבד רק את הספר הפתוח.
let gemIdleT = 0;
new MutationObserver(() => {
  clearTimeout(gemIdleT);
  if (inRead()) { gemIdleT = setTimeout(gemRelease, GEM_IDLE_MS); return; }
  if (!GEM.busy && !(IDX && GEM.stage === 2)) setTimeout(gemStart, 0); // אחרי שהמסך התחלף ונצבע
}).observe(document.body, { attributes: true, attributeFilter: ['data-mode'] });
setTimeout(() => { if (inRead()) { $('#status').textContent = ''; gemIdleT = setTimeout(gemRelease, GEM_IDLE_MS); } else gemStart(); }, 40);
// Service Worker (sw.js): שומר את קובצי הספרים בדפדפן — ביקור חוזר לא מוריד אותם שוב, והאתר עובד גם בלי רשת.
// רק באתר עצמו (http/https), לא ב-file:// וגם לא בהרצה מקומית, כדי לא להגיש גרסה ישנה בזמן פיתוח.
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !/^(localhost|127\.|\[::1\])/.test(location.hostname)) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
})();
