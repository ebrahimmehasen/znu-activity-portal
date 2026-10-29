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

## الأوامر

| الأمر | الوظيفة |
|---|---|
| `npm run dev` | تشغيل السيرفر للتطوير |
| `npm run db:generate` | توليد migration من تغييرات `src/db/schema.ts` |
| `npm run db:migrate` | تطبيق الـ migrations |
| `npm run db:seed` | السوبر أدمن + الكليات + الإعدادات الافتراضية |
| `npm test` | تشغيل التستات |
