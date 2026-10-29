import bcrypt from "bcryptjs";
import { z } from "zod";

// Tests lower the cost via BCRYPT_COST to stay fast; production always uses 12.
const COST = process.env.NODE_ENV === "test" && process.env.BCRYPT_COST ? Number(process.env.BCRYPT_COST) : 12;

/** bcrypt only uses the first 72 bytes, so longer passwords are rejected rather than silently truncated. */
export const passwordSchema = z
  .string()
  .min(8, "الباسورد لازم يكون 8 حروف على الأقل")
  .refine((p) => Buffer.byteLength(p, "utf8") <= 72, "الباسورد طويل جدًا");

export function hashPassword(plain: string) {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

let dummyHash: Promise<string> | undefined;

/** Burns the same bcrypt time when the username does not exist, so response time doesn't reveal valid usernames. */
export async function verifyAgainstDummy(plain: string) {
  dummyHash ??= bcrypt.hash("not-a-real-password", COST);
  await bcrypt.compare(plain, await dummyHash);
  return false;
}
