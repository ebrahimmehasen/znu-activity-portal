# ZNU Activity Portal — بوابة أنشطة جامعة الزقازيق الأهلية

بوابة لإدارة أنشطة الجامعة. الإصدار الأول خاص بالرحلات، وقاعدة البيانات مصممة للتوسع لأنواع أنشطة تانية.
الخطة الكاملة في [docs/PLAN.md](docs/PLAN.md).

## الستاك

- **Next.js 16** (App Router, Server Actions) + TypeScript
- **Tailwind CSS 4** — واجهة عربي RTL ومتجاوبة مع الموبايل
- **PostgreSQL** على **Supabase** عن طريق **Drizzle ORM**
- **PGlite** (Postgres مدمج) للتطوير المحلي والتستات — مش محتاج تسطّب أي داتابيز

## التشغيل محليًا

```bash
npm install
cp .env.example .env    # وحط SEED_SUPER_ADMIN_PASSWORD
npm run db:migrate
npm run db:seed
npm run dev
```

لو `DATABASE_URL` فاضي، الداتا بتتحفظ في `./.pglite`. للربط بـ Supabase حط الـ connection string في `DATABASE_URL`.

> PGlite بيشتغل من process واحد بس: اقفل `npm run dev` قبل ما تشغّل `db:migrate` أو `db:seed`.

## الأوامر

| الأمر | الوظيفة |
|---|---|
| `npm run dev` | تشغيل السيرفر للتطوير |
| `npm run db:generate` | توليد migration من تغييرات `src/db/schema.ts` |
| `npm run db:migrate` | تطبيق الـ migrations |
| `npm run db:seed` | السوبر أدمن + الكليات + الإعدادات الافتراضية |
| `npm run db:reset-super-admin` | يغيّر يوزر وباسورد السوبر أدمن للقيم اللي في `.env` |
| `npm test` | تشغيل التستات |

## النشر على Vercel

1. اعمل مشروع جديد على [Vercel](https://vercel.com/new) من الريبو ده (الإعدادات الافتراضية لـ Next.js).
2. في **Settings → Environment Variables** حط:

   | المتغير | القيمة |
   |---|---|
   | `DATABASE_URL` | من Supabase: **Connect → Transaction pooler** (بورت 6543) والباسورد مكان `[YOUR-PASSWORD]` |
   | `QR_ENCRYPTION_KEY` | **نفس القيمة** اللي استخدمتها قبل كده. لو اتغيرت، أكواد الـ QR اللي اتعملت مش هتشتغل |
   | `SEED_SUPER_ADMIN_USERNAME` / `SEED_SUPER_ADMIN_PASSWORD` | اختياري: بيتستخدموا بس لو مفيش سوبر أدمن في الداتابيز |

3. Deploy. أمر `vercel-build` بيعمل `db:migrate` و `db:seed` قبل الـ build، فالداتابيز بتتحدث لوحدها مع كل نشر.

ملاحظات:
- Vercel بيشغّل الموقع على HTTPS، وده شرط عشان كاميرا الاسكان تشتغل على الموبايل.
- كل نسخة من الموقع على Vercel بتفتح اتصال واحد بس بالداتابيز (`src/db/index.ts`)، والـ rate limiting متخزن في الداتابيز، فبيشتغل مع أي عدد نسخ.
- لو `DATABASE_URL` مش متحط على Vercel، الموقع بيقف بـ error واضح بدل ما يشتغل على داتابيز مؤقتة.

## التقارير ومسح البيانات

- **تقرير الرحلة** (صفحة الرحلة ← التقرير): ملخص الحجوزات والحضور لكل تجمع وكشف كامل. فيه زرار **تحميل Excel**، وزرار **طباعة / PDF** بيفتح الطباعة من المتصفح (اختار "Save as PDF").
- **مسح البيانات**: البيانات بتفضل محفوظة بعد انتهاء الرحلة. الأدمن يقدر يمسح رحلة منتهية (من صفحتها) أو طالب (من صفحة الطلبة)، بكتابة تأكيد + رسالة تأكيد، والعملية بتتسجل في سجل العمليات.
