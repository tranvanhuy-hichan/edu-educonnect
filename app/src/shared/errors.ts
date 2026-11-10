export class ForbiddenError extends Error {
  constructor(message = "Không có quyền thực hiện thao tác này") { super(message); this.name = "ForbiddenError"; }
}
export class ConflictError extends Error {
  constructor(message: string) { super(message); this.name = "ConflictError"; }
}
export class ApplicationError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = "ApplicationError"; }
}
