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
