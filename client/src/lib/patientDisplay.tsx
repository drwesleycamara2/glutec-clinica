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

export function calculatePatientAge(birthDate?: string | Date | null): { years: number; months: number } | null {
  if (!birthDate) return null;
  const birth = birthDate instanceof Date ? birthDate : new Date(String(birthDate));
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  if (birth > now) return null;
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return null;
  return { years, months };
}

export function formatPatientAge(birthDate?: string | Date | null): string | null {
  const age = calculatePatientAge(birthDate);
  if (!age) return null;
  const { years, months } = age;
  if (years === 0 && months === 0) return "recém-nascido";
  if (years === 0) return `${months} ${months === 1 ? "mês" : "meses"}`;
  const y = `${years} ${years === 1 ? "ano" : "anos"}`;
  if (months === 0) return y;
  return `${y} e ${months} ${months === 1 ? "mês" : "meses"}`;
}
