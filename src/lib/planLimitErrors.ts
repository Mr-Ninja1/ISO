import type { PlanLimitDetails, PlanLimitKind } from "@/lib/planLimitMessaging";

export class PlanLimitReachedError extends Error {
  readonly kind: PlanLimitKind;
  readonly details: PlanLimitDetails;

  constructor(kind: PlanLimitKind, message: string, details: PlanLimitDetails = {}) {
    super(message);
    this.name = "PlanLimitReachedError";
    this.kind = kind;
    this.details = details;
  }
}

export function isPlanLimitError(err: unknown): err is PlanLimitReachedError {
  return err instanceof PlanLimitReachedError;
}
