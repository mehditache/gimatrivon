# ייחוס ורישיונות — גימטריבון

מסמך זה מתעד את מקור הטקסטים שבקורפוס (`generated/corpus.bundle.js`) ואת הרישיונות שלהם, כפי שנבדקו בפועל
(לא מתוך הנחה) מול קבצי המקור ומול יצוא הנתונים הרשמי של ספריא (Sefaria). הבדיקה בוצעה ב-2026-10-11.

**הבחנה חשובה**: קוד האפליקציה עצמו (HTML/CSS/JS) הוא **קנייני — כל הזכויות שמורות** (ראו [`LICENSE`](LICENSE)).
הרישיון הקנייני הזה חל *רק* על הקוד, ו**אינו** ואינו יכול לבטל את רישיונות-הטקסט המפורטים למטה — אלה טקסטים
של צד שלישי (בעיקר ספריא והמהדורות שהיא מארחת) שממשיכים להיות כפופים לתנאים שלהם-עצמם.

## תנ"ך (39 ספרים) — "Miqra according to the Masorah"

- **מקור**: [Sefaria](https://www.sefaria.org) (`versionSource` בכל קובץ מצביע ל-`sefaria.org/<שם הספר>`), המבוססת על
  מהדורת [Miqra according to the Masorah](https://en.wikisource.org/wiki/User:Dovi/Miqra_according_to_the_Masorah)
  (ויקיטקסט העברית).
- **רישיון: CC-BY-SA** (Creative Commons Attribution-ShareAlike) — מאומת ישירות מול שדה ה-`license` ביצוא
  הרשמי של ספריא.
- **המשמעות**: בנוסף לחובת ייחוס, הרישיון כולל תניית **ShareAlike** — פרסום של עיבוד/נגזרת של הטקסט הזה
  (כמו הקורפוס המעובד כאן) צריך להיות מוצע תחת **אותו רישיון** (CC-BY-SA), ולא תחת רישיון קנייני/סגור יותר.

## משנה — "Torat Emet 357"

- **מקור**: [Sefaria](https://www.sefaria.org), המבוססת על מהדורת
  [Torat Emet 357](http://www.toratemetfreeware.com/index.html?downloads).
- **רישיון: Public Domain** (נחלת הכלל) — מאומת ישירות מול שדה ה-`license` ביצוא הרשמי של ספריא. ללא הגבלת
  שימוש, אין חובת ייחוס פורמלית (אם כי ראוי).

## רש"י, תרגום אונקלוס, תרגום יונתן — **דגימה נבדקה ב-2026-10-11 (לא כיסוי מלא)**

קבצי המקור שבהם השתמש `scripts/build-sources.py` בפועל (תיקייה חיצונית בזמן ריצה חד-פעמית) אינם שמורים
בפרויקט, כך שאי אפשר לדעת בוודאות איזו גרסה/קובץ-מקור ספציפי נבחר עבור כל אחד מ-70 הספרים (39 רש"י + 5
אונקלוס + 26 תרגום יונתן). לכן נבדקה **דגימה ייצוגית** ישירות מול יצוא הנתונים הרשמי של ספריא
(`Sefaria/database_export` ב-Hugging Face — אותו מקור ששימש לאימות התנ"ך/המשנה למעלה), ספר אחד לכל קטגוריה:

| קטגוריה | ספר שנבדק | גרסה (`versionTitle`) | `license` |
|---|---|---|---|
| תרגום אונקלוס | Onkelos Genesis | Onkelos Genesis (הגרסה הבסיסית/`isPrimary`) | **Public Domain** (מקור: toratemetfreeware.com — אותה משפחת-מקור כמו המשנה) |
| רש"י | Rashi on Genesis | Pentateuch with Rashi's commentary by M. Rosenbaum and A.M. Silbermann, 1929-1934 | **Public Domain** |
| רש"י | Rashi on Genesis | Rashi Chumash, Metsudah Publications, 2009 | **CC-BY** (חובת ייחוס) |
| תרגום יונתן | Targum Jonathan on Amos | Mikraot Gedolot | **Public Domain** |

**המשמעות**: בכל ארבעת הבדיקות — רישיון פתוח (Public Domain או CC-BY), ללא אף מקרה של "כל הזכויות
שמורות" או רישיון מגביל. זה סימן מעודד, **אך זו עדיין דגימה של ספר אחד לקטגוריה, לא בדיקה של כל 70
הספרים בפועל** — ייתכן שספרים אחרים (למשל תרגום יונתן על ספר אחר, או רש"י על נ"ך) השתמשו במהדורות
שהרישיון שלהן שונה. קובץ ה-`merged.json` (גרסת ברירת-המחדל שספריא מציגה, המשלבת כמה מקורות) **אינו נושא
שדה `license` משלו** — הרישיון תמיד נמצא בגרסה-ה"בסיס" (ה-versionTitle) ולא בקובץ הממוזג, ולכן בדיקה
עתידית צריכה לבדוק כל גרסת-מקור קונקרטית, לא את ה-merged.

## ש״ס בבלי עם רש״י ותוספות (`generated/talmud/`, נוסף ב-v3.10.0)

נבדק מול שדה `license` ביצוא הרשמי של ספריא (Sefaria-Export) ב-2026-10-20:

| טקסט | גרסה (`versionTitle`) | `license` |
|---|---|---|
| גמרא (37 מסכתות) | Wikisource Talmud Bavli | **CC-BY-SA** |
| רש״י | Vilna Edition | **Public Domain**, חוץ מרש״י על סנהדרין (**CC-BY-SA**) ורש״י על ראש השנה (שדה הרישיון ריק, מקור: הספרייה הלאומית) |
| תוספות | Vilna Edition | **Public Domain**, חוץ מתוספות על סנהדרין (**CC-BY-SA**) |
| רשב״ם על בבא בתרא | Vilna Edition | **Public Domain** |

גרסת הגמרא המנוקדת של ספריא (Davidson, CC-BY-NC) **לא** נכללה בכוונה. פריסת "צורת הדף" מחושבת בספריית
daf-renderer של TalmudLab (רישיון MIT, ראו `vendor/daf-renderer.LICENSE.txt`).

## משנה תורה לרמב״ם ומפרשיו — נבדק ב-2026-10-20 (כל הקבצים)

- **מקור**: [Sefaria](https://www.sefaria.org/texts/Halakhah/Mishneh%20Torah), דרך יצוא הנתונים הרשמי
  ([Sefaria-Export](https://github.com/Sefaria/Sefaria-Export), `books.json`, והקבצים ב-`storage.googleapis.com/sefaria-export`).
  נבנה ע״י `scripts/build-rambam.py`, שמשתמש בקובץ הגרסה עצמו (לא ב-`merged.json`) ושומר לכל ספר את שם הגרסה (`src`)
  ואת שדה ה-`license` שלה (`lic`) בתוך הקורפוס.

| קטגוריה | גרסה (`versionTitle`) | ספרים | `license` |
|---|---|---|---|
| משנה תורה (מנוקד) | Torat Emet 363 | 77 | **Public Domain** (כולם) |
| משנה תורה, ספר אהבה | Torat Emet 370 | 7 | 2 Public Domain; 5 בלי שדה (`unknown`): תפילה, מילה, תפילין, ברכות, ציצית |
| כסף משנה | Torat Emet 363 | 72 | 68 Public Domain; 4 בלי שדה |
| השגות הראב״ד | ToratEmet | 80 | 74 Public Domain; 6 בלי שדה |
| משנה למלך | Warsaw, 1881 | 82 | **Public Domain** (כולם) |

הקבצים בלי שדה רישיון הם מאותה מהדורת Torat Emet (תוכנת חינם, טקסט רבני מודפס ישן) כמו שאר הספרים שמסומנים Public Domain.
**לא נכללו**: מפרשי "מהדורת פרידברג" (אור שמח, קרית ספר ועוד, וכסף משנה על 11 ספרים), שביצוא אין להם שדה `license`
כלל; מגיד משנה ולחם משנה (חלקיים); וגרסת ויקיטקסט (CC-BY-SA, לא מנוקדת).

## טור, בית יוסף וב״ח (`generated/tur/`, נוסף ב-v3.12.0)

מקור: יצוא הנתונים של ספריא (Sefaria-Export), מהדורת וילנא תרפ״ג (1923), סריקה בספרייה הלאומית
(`versionSource`: NNL_ALEPH001935970). כל הקבצים נבדקו בשדה `license`:

| טקסט | גרסה | רישיון |
|---|---|---|
| טור (ארבעת הטורים) | Orach Chaim / Yoreh Deah / Even HaEzer / Choshen Mishpat, Vilna, 1923 | **Public Domain** |
| הקדמת הטור לאורח חיים | Tur Orach Chaim, Vilna, 1923 | שדה הרישיון `unknown` (אותה מהדורת וילנא; הטקסט עצמו מהמאה ה-14) |
| בית יוסף | Tur … Vilna, 1923 | **Public Domain** |
| ב״ח | Tur … Vilna, 1923 | **Public Domain** |

שמות ההלכות וטווחי הסימנים מתוך `schemas/Tur.json` של אותו יצוא (מבנה "Topic"). בחושן משפט, מקום הדיבורים בטור
נלקח מקובצי הקישורים של היצוא (`links/links*.csv`). הנתונים נבנים ב-`scripts/build-tur.py`.

## שולחן ערוך, משנה ברורה, ביאור הלכה, כף החיים ומפרשים (`generated/sa/`, נוסף ב-v4.13.0)

מקור: יצוא הנתונים של ספריא (Sefaria-Export), נבדק ב-2026-10-31 מול `books.json` (שדה `license` בכל קובץ):

| טקסט | גרסה | רישיון |
|---|---|---|
| שולחן ערוך, אורח חיים | Torat Emet 363 (מנוקד) | **Public Domain** |
| שולחן ערוך, יורה דעה ואבן העזר | Torat Emet 357 (מנוקד) | **Public Domain** |
| שולחן ערוך, חושן משפט | Torat Emet 363 (מנוקד) | שדה הרישיון `unknown` (אותו טקסט במהדורת Lemberg 1898 הוא Public Domain) |
| שולחן ערוך (עוגני המפרשים בלבד) | Lemberg 1886-1898 (מהדורות NLI) | **Public Domain** |
| משנה ברורה, סימנים 187-697 | "On Your Way" (mobile.tora.ws) | **Public Domain** |
| משנה ברורה, סימנים 2-186 | "eu5 text" (mishnaberura.eu5.org) | שדה הרישיון `unknown` — **לבדוק לפני פרסום פומבי** |
| ביאור הלכה | Wikisource | **Public Domain** |
| כף החיים (או״ח, יו״ד) | Kaf Hachayim, Jerusalem 1910-1957 | **Public Domain** |
| ש״ך, ט״ז, סמ״ע (מאירת עיניים), באר היטב, חלקת מחוקק, בית שמואל | Lemberg / Vilna 1876 / Torat Emet 357 | **Public Domain** |

מבנה סימנים והלכות לפי `schemas/Shulchan_Arukh,_<חלק>.json`; מיקום ביאור הלכה וכף החיים לפי `links/links*.csv`. נבנה ב-`scripts/build-sa.py`.

## ברטנורא, מילון עברי — **לא נבדק כלל**

שני אלה (63 ספרי ברטנורא על המשנה, ומילון עברי אחד) נוספו גם הם ל-corpus במהלך הפרויקט אך **לא תועדו
ולא נבדקו אף פעם** — לא כאן ולא בבדיקה הקודמת. לפני הסתמכות משפטית על חלקים אלה, יש לבצע עבורם את אותה
בדיקה שבוצעה למעלה (שדה `license` ביצוא הרשמי של ספריא).

## המלצה לפרסום פומבי (למשל GitHub)

- אין לפרסם את תיקיית `data/` הגולמית (קבצי Sefaria המקוריים של תנ"ך/משנה) ללא בדיקת/שמירת שדות הרישיון
  שבתוכם (למעשה כבר נבדקו ותועדו למעלה).
- אם מפרסמים את הקורפוס המעובד (`generated/corpus.bundle.js`) הכולל את חלק התנ"ך — יש לצרף ייחוס מפורש
  לספריא ול-Miqra according to the Masorah, ולשקול להציע את התוצר תחת CC-BY-SA בעצמו, כדי לעמוד בתניית
  ה-ShareAlike. (בוצע: ראו סעיף "רישיון הטקסטים" ב-README.md.)
- חלק המשנה (Public Domain) אינו מצריך זאת, אך ייחוס נשאר נוהג ראוי.
- רש"י/אונקלוס/תרגום יונתן — הדגימה שנבדקה (למעלה) לא מצאה רישיון מגביל, אך **אינה כיסוי מלא**. ברטנורא
  ומילון עברי לא נבדקו כלל. לפני הסתמכות משפטית מלאה (למשל שימוש מסחרי, או טענה פומבית ש"הכול מאומת"),
  מומלץ לבדוק כל אחד מ-70+63+1 הספרים בנפרד מול יצוא ספריא, באותה שיטה.

## מקורות לבדיקה זו

- [How to Find and Understand Licensing Information — Sefaria Help](https://help.sefaria.org/hc/en-us/articles/18490043237148)
- [Miqra according to the Masorah — Wikisource](https://en.wikisource.org/wiki/User:Dovi/Miqra_according_to_the_Masorah)
- [Sefaria database_export — Hugging Face](https://huggingface.co/Sefaria/database_export)
- קבצי ה-JSON הספציפיים שנבדקו (2026-10-11), לדוגמה:
  `json/Tanakh/Targum/Onkelos/Torah/Onkelos Genesis/Hebrew/Onkelos Genesis.json`,
  `json/Tanakh/Rishonim on Tanakh/Rashi/Torah/Rashi on Genesis/Hebrew/Pentateuch with Rashi's commentary by M. Rosenbaum and A.M. Silbermann, 1929-1934.json`,
  `json/Tanakh/Rishonim on Tanakh/Rashi/Torah/Rashi on Genesis/Hebrew/Rashi Chumash, Metsudah Publications, 2009.json`,
  `json/Tanakh/Targum/Targum Jonathan/Prophets/Targum Jonathan on Amos/Hebrew/Mikraot Gedolot.json`
  (כולם תחת `Sefaria/database_export` ב-Hugging Face).

## גופן סת״ם (רקע שולחן העבודה)

- **Stam Sefarad CLM** מפרויקט [Culmus](https://culmus.sourceforge.io) (גרסה 0.140), © Yoram Gnat. רק 22 אותיות א–ת, בקובץ
  `vendor/fonts/StamSefaradCLM-letters.woff2`.
- **רישיון: GPL-2.0 עם חריג לגופנים** (font exception): הטמעת הגופן במסמך או באפליקציה אינה מחילה עליהם את ה-GPL.
  נוסח הרישיון המלא: `vendor/fonts/StamSefaradCLM-LICENSE.txt`.

## גופן לטיני של הלוגו ("TORAH.ONE")

- **Cormorant Garamond Bold** (© The Cormorant Project Authors), רק האותיות T O R A H N E והנקודה, בקובץ `vendor/fonts/CormorantGaramond-700-torahone.woff2`.
- **רישיון: SIL Open Font License 1.1.** נוסח הרישיון: `vendor/fonts/CormorantGaramond-OFL.txt`.

## ספר הזוהר (v4.7.0)

- **Sefaria-Export**: Zohar — Vocalized Zohar, Israel 2013 (ארמית מנוקדת וחלוקת דפי וילנא), Zohar — Hebrew Translation, ו-Sulam on Zohar — Zohar with Sulam commentary, Jerusalem 1945. הנתונים נבנים על ידי `scripts/build-zohar.py`.
- **רישיון: לא צוין (unknown)** במטא-דאטה של ספריא לגרסאות אלה; יש לאמת לפני הפצה רחבה.

## ביאור הרב שטיינזלץ, מילון ארמי-עברי וספר הערוך (v4.10.0)

- **ביאור הרב עדין שטיינזלץ על הש״ס** (מהדורת William Davidson, עברית), מ-Sefaria-Export: `Talmud/Bavli/Modern Commentary on Talmud/Steinsaltz/<סדר>/Steinsaltz on <מסכת>/Hebrew/merged.json`, 37 מסכתות. נטען ל-`generated/talmud-stz/` (`scripts/build-steinsaltz.py`).
- **רישיון: CC BY-NC 4.0** (שימוש לא מסחרי, עם ייחוס) לפי הודעת ספריא על מהדורת דוידסון (sefaria.org/william-davidson-talmud). **לא לאמת מחדש בקובץ הממוזג** (אין בו שדה `license`) — יש לבדוק את גרסת המקור לפני הפצה מסחרית. האפליקציה חייבת להישאר חינמית ולא מסחרית כל עוד הביאור כלול בה.
- **מילון ארמי-עברי** (`generated/aramaic-gloss.js`): נגזר מזוגות ״מילה מודגשת + [תרגום]״ בביאור שטיינזלץ, ולכן נושא את אותו רישיון (CC BY-NC 4.0).
- **ספר הערוך** (רבי נתן מרומי, דפוס לובלין 1883), Sefaria-Export: `Reference/Dictionary/Sefer HeArukh/Hebrew/merged.json` → `generated/arukh.js`. טקסט היסטורי בנחלת הכלל (תרגום/עיבוד ספריא: לבדוק).

