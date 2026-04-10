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

export function readClinicalDraftMeta(): ClinicalDraftMeta | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(CLINICAL_DRAFT_META_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as ClinicalDraftMeta;
  } catch {
    window.localStorage.removeItem(CLINICAL_DRAFT_META_KEY);
    return null;
  }
}

export function writeClinicalDraftMeta(meta: ClinicalDraftMeta) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CLINICAL_DRAFT_META_KEY, JSON.stringify(meta));
  window.dispatchEvent(new CustomEvent(CLINICAL_DRAFT_CHANGED_EVENT, { detail: meta }));
}

export function clearClinicalDraftMeta() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CLINICAL_DRAFT_META_KEY);
  window.dispatchEvent(new CustomEvent(CLINICAL_DRAFT_CHANGED_EVENT, { detail: null }));
}

export function getClinicalDraftPath(patientId: number) {
  return `/prontuarios/${patientId}#evolucao`;
}

