import { describe, expect, it } from "vitest";
import { isValidNationalId, maskNationalId, phoneSchema, toLatinDigits } from "@/lib/students/validation";

describe("student validation", () => {
  it("checks the national ID structure", () => {
    expect(isValidNationalId("30401011612341")).toBe(true);
    expect(isValidNationalId("29912310112345")).toBe(true);
    expect(isValidNationalId("10401011612341")).toBe(false); // century digit
    expect(isValidNationalId("30402301612341")).toBe(false); // 30 February
    expect(isValidNationalId("30401019912341")).toBe(false); // governorate 99
    expect(isValidNationalId("3040101161234")).toBe(false); // 13 digits
    expect(isValidNationalId("30401011612341", new Date("2003-01-01"))).toBe(false); // not born yet
  });

  it("accepts Egyptian mobile numbers only", () => {
    expect(phoneSchema.safeParse("01012345678").success).toBe(true);
    expect(phoneSchema.safeParse("0155 123 4567").success).toBe(true);
    expect(phoneSchema.safeParse("01312345678").success).toBe(false);
    expect(phoneSchema.safeParse("0101234567").success).toBe(false);
  });

  it("converts Arabic-Indic digits and masks IDs", () => {
    expect(toLatinDigits("٠١٢٣٤٥٦٧٨٩ ۴")).toBe("0123456789 4");
    expect(maskNationalId("30401011612341")).toBe("••••••••••2341");
  });
});
