import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { seed } from "@/db/seed";
import { ForbiddenError } from "@/lib/errors";
import { createFaculty, listFaculties, updateFaculty } from "@/lib/faculties/service";
import { createUser, ctx, resetDb } from "./helpers";

describe("faculties", () => {
  beforeEach(async () => {
    await resetDb();
    await seed(db);
  });

  it("admin adds a faculty at the end and duplicates are rejected", async () => {
    const admin = await createUser("admin");
    expect((await createFaculty(admin, "العلاج الطبيعي", ctx)).ok).toBe(true);
    expect((await createFaculty(admin, "  العلاج الطبيعي ", ctx)).ok).toBe(false);
    const rows = await listFaculties();
    expect(rows.at(-1)?.name).toBe("العلاج الطبيعي");
    expect(rows).toHaveLength(8);
  });

  it("renames and deactivates without deleting", async () => {
    const admin = await createUser("admin");
    const [first] = await listFaculties();
    expect((await updateFaculty(admin, first.id, { name: "كلية الطب البشري" }, ctx)).ok).toBe(true);
    expect((await updateFaculty(admin, first.id, { isActive: false }, ctx)).ok).toBe(true);

    expect((await listFaculties()).find((f) => f.id === first.id)?.name).toBe("كلية الطب البشري");
    expect((await listFaculties({ activeOnly: true })).map((f) => f.id)).not.toContain(first.id);
  });

  it("supervisors cannot manage faculties", async () => {
    const sup = await createUser("supervisor");
    await expect(createFaculty(sup, "X Faculty", ctx)).rejects.toThrow(ForbiddenError);
  });
});
