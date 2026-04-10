export const CLINICAL_DRAFT_META_KEY = "glutec:open-clinical-draft";
export const CLINICAL_DRAFT_CHANGED_EVENT = "glutec:clinical-draft-changed";
export const CLINICAL_DRAFT_AUTOSAVE_EVENT = "glutec:clinical-draft-autosave";
export const CLINICAL_LOCK_RETURN_TO_KEY = "glutec:auth-lock-return-to";

export type ClinicalDraftMeta = {
  patientId: number;
  patientName: string;
  path: string;
  updatedAt: string;
  status: "em_andamento" | "rascunho";
};

function normalizeClinicalDraftMetas(value: unknown): ClinicalDraftMeta[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .filter((item): item is ClinicalDraftMeta => Boolean(item && typeof item === "object" && "patientId" in item))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }
  if (typeof value === "object" && value !== null && "patientId" in value) {
    return [value as ClinicalDraftMeta];
  }
  return [];
}

export function readClinicalDraftMetas(): ClinicalDraftMeta[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(CLINICAL_DRAFT_META_KEY);
  if (!raw) return [];

  try {
    return normalizeClinicalDraftMetas(JSON.parse(raw));
  } catch {
    window.localStorage.removeItem(CLINICAL_DRAFT_META_KEY);
    return [];
  }
}

export function readClinicalDraftMeta(patientId?: number): ClinicalDraftMeta | null {
  const drafts = readClinicalDraftMetas();
  if (typeof patientId === "number") {
    return drafts.find((draft) => draft.patientId === patientId) ?? null;
  }
  return drafts[0] ?? null;
}

export function writeClinicalDraftMeta(meta: ClinicalDraftMeta) {
  if (typeof window === "undefined") return;
  const nextDrafts = [
    meta,
    ...readClinicalDraftMetas().filter((draft) => draft.patientId !== meta.patientId),
  ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  window.localStorage.setItem(CLINICAL_DRAFT_META_KEY, JSON.stringify(nextDrafts));
  window.dispatchEvent(new CustomEvent(CLINICAL_DRAFT_CHANGED_EVENT, { detail: nextDrafts }));
}

export function clearClinicalDraftMeta(patientId?: number) {
  if (typeof window === "undefined") return;
  if (typeof patientId !== "number") {
    window.localStorage.removeItem(CLINICAL_DRAFT_META_KEY);
    window.dispatchEvent(new CustomEvent(CLINICAL_DRAFT_CHANGED_EVENT, { detail: [] }));
    return;
  }

  const nextDrafts = readClinicalDraftMetas().filter((draft) => draft.patientId !== patientId);
  if (nextDrafts.length === 0) {
    window.localStorage.removeItem(CLINICAL_DRAFT_META_KEY);
  } else {
    window.localStorage.setItem(CLINICAL_DRAFT_META_KEY, JSON.stringify(nextDrafts));
  }

  window.dispatchEvent(new CustomEvent(CLINICAL_DRAFT_CHANGED_EVENT, { detail: nextDrafts }));
}

export function getClinicalDraftPath(patientId: number) {
  return `/prontuarios/${patientId}#evolucao`;
}

