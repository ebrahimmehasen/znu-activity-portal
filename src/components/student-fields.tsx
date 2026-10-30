import { Field, Input } from "@/components/ui";
import { YEAR_LABELS } from "@/lib/students/validation";

const selectCls = "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-base";

/** Booking form fields shared by the public form and the staff manual-add form. */
export function StudentFields({
  faculties,
  errors = {},
}: {
  faculties: { id: number; name: string }[];
  errors?: Record<string, string | undefined>;
}) {
  return (
    <>
      <Field label="الاسم رباعي" error={errors.name}>
        <Input name="name" required maxLength={200} autoComplete="name" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="رقم الهاتف" error={errors.phone}>
          <Input name="phone" required inputMode="tel" autoComplete="tel" maxLength={20} dir="ltr" placeholder="01xxxxxxxxx" className="text-end" />
        </Field>
        <Field label="الرقم القومي" error={errors.nationalId}>
          <Input name="nationalId" required inputMode="numeric" maxLength={20} dir="ltr" autoComplete="off" className="text-end" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="الكلية" error={errors.facultyId}>
          <select name="facultyId" required defaultValue="" className={selectCls}>
            <option value="" disabled>
              اختار الكلية
            </option>
            {faculties.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="الفرقة" error={errors.year}>
          <select name="year" required defaultValue="" className={selectCls}>
            <option value="" disabled>
              اختار الفرقة
            </option>
            {Object.entries(YEAR_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </>
  );
}
