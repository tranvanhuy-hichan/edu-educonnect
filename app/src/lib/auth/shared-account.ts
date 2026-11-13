/** Only existing teachers share BCH identities. Edu roles alone determine Edu permissions. */
export function forbiddenSharedAccount(u: { accountRole: string; accountSuperAdmin: boolean; teacher: unknown; roles: readonly string[] }): boolean {
  return u.accountRole === "DEPARTMENT_ACCOUNT" || (u.accountRole === "ADMIN" && (u.accountSuperAdmin || !u.teacher || u.roles.includes("STUDENT")));
}
