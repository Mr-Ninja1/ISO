import { createHash } from "crypto";

export function normalizePin(pin: string) {
  return pin.trim();
}

export function isValidPin(pin: string) {
  return /^\d{4,8}$/.test(pin);
}

export function hashPin(pin: string) {
  return createHash("sha256").update(normalizePin(pin)).digest("hex");
}
