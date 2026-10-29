/** Thrown by services when the actor lacks the role; actions guard first, so reaching this means a bypass attempt. */
export class ForbiddenError extends Error {
  constructor() {
    super("forbidden");
  }
}
