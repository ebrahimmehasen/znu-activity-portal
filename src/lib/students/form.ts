import type { StudentInput } from "./validation";

/** Raw form values; studentInputSchema validates and coerces each field. */
export function studentFormInput(fd: FormData): StudentInput {
  const s = (k: string) => String(fd.get(k) ?? "");
  return { name: s("name"), phone: s("phone"), nationalId: s("nationalId"), facultyId: s("facultyId"), year: s("year") } as unknown as StudentInput;
}
