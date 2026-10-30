import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { STUDENT_SESSION_TTL_SECONDS, getStudentSession } from "./auth";

/** Separate from the staff cookie: one phone may hold both a student and a staff login. */
export const STUDENT_COOKIE = "znu_student";

export async function setStudentCookie(token: string) {
  (await cookies()).set(STUDENT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: STUDENT_SESSION_TTL_SECONDS,
  });
}

export async function getStudentToken() {
  return (await cookies()).get(STUDENT_COOKIE)?.value ?? null;
}

export async function clearStudentCookie() {
  (await cookies()).delete(STUDENT_COOKIE);
}

export const getCurrentStudent = cache(async () => {
  const token = await getStudentToken();
  return token ? getStudentSession(token) : null;
});

export async function requireStudent() {
  const student = await getCurrentStudent();
  if (!student) redirect("/portal/login");
  return student;
}
