import { Badge } from "@/components/ui/badge";

type PatientLike = {
  fullName?: string | null;
  name?: string | null;
  recordNumber?: number | string | null;
  gender?: string | null;
  biologicalSex?: string | null;
};

function normalizeSex(value?: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["masculino", "male", "m"].includes(normalized)) return "masculino";
  if (["feminino", "female", "f"].includes(normalized)) return "feminino";
  if (["intersexo", "intersex"].includes(normalized)) return "intersexo";
  return normalized || "nao_informado";
}

export function patientRecordNumber(patient?: PatientLike | null) {
  const value = patient?.recordNumber;
  if (value === null || value === undefined || value === "") return null;
  return `#${value}`;
}

export function isPatientSexGenderDiscordant(patient?: PatientLike | null) {
  const gender = normalizeSex(patient?.gender);
  const biologicalSex = normalizeSex(patient?.biologicalSex);
  if (!gender || !biologicalSex) return false;
  if (gender === "nao_informado" || biologicalSex === "nao_informado") return false;
  if (gender === "outro" || gender === "nao_binario" || biologicalSex === "intersexo") return false;
  return gender !== biologicalSex;
}

export function PatientRecordBadge({ patient }: { patient?: PatientLike | null }) {
  const recordNumber = patientRecordNumber(patient);
  if (!recordNumber) return null;
  return (
    <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px] font-semibold">
      {recordNumber}
    </Badge>
  );
}

export function PatientAttentionMark({ patient }: { patient?: PatientLike | null }) {
  if (!isPatientSexGenderDiscordant(patient)) return null;
  return (
    <span
      aria-label="Atenção cadastral"
      title="Atenção cadastral"
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#C9A55B]/60 bg-[#C9A55B]/15 text-[12px] font-black leading-none text-[#8A6526]"
    >
      ◆
    </span>
  );
}

export function patientDisplayName(patient?: PatientLike | null) {
  const name = String(patient?.fullName ?? patient?.name ?? "Paciente").trim() || "Paciente";
  const recordNumber = patientRecordNumber(patient);
  return recordNumber ? `${recordNumber} ${name}` : name;
}
