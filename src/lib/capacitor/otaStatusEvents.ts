"use client";

export const OTA_STATUS_EVENT = "iso-ota-status-changed";

export type OtaUiPhase =
  | "idle"
  | "checking"
  | "uptodate"
  | "downloading"
  | "ready"
  | "error"
  | "offline";

export type OtaStatusDetail = {
  phase: OtaUiPhase;
  message: string;
  appliedBundleId?: string | null;
  availableBundleId?: string | null;
  nativeBuild?: number;
  checkedAt?: number;
};

export function dispatchOtaStatus(detail: OtaStatusDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<OtaStatusDetail>(OTA_STATUS_EVENT, { detail }));
}
