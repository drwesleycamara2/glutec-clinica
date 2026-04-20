import { eq, and, sql } from "drizzle-orm";
import {
  clinicalEvolutions,
  signatureAuditLog,
  clinicalEvolutionEditLog,
  InsertClinicalEvolution,
  InsertSignatureAuditLog,
  InsertClinicalEvolutionEditLog,
  ClinicalEvolution,
  SignatureAuditLog,
  ClinicalEvolutionEditLog
} from "../drizzle/schema-clinical-evolution";
import { users } from "../drizzle/schema";
import { getDb } from "./db";

// Helper: unwrap rows from mysql2/drizzle raw execute
function unwrapRows<T = any>(result: any): T[] {
  if (!result) return [];
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

function isReceptionDeskRole(role?: string | null) {
  const normalized = String(role || "").toLowerCase();
  return normalized === "recepcionista" || normalized === "secretaria";
}

function isSecretaryRecord(record: Record<string, any>) {
  const secretaryNotes = String(record?.secretaryNotes || "").trim();
  const clinicalNotes = String(record?.clinicalNotes || "").trim();
  const icdCode = String(record?.icdCode || "").trim();
  const audioTranscription = String(record?.audioTranscription || "").trim();
  return Boolean(secretaryNotes) && !clinicalNotes && !icdCode && !audioTranscription;
}

function redactClinicalFieldsForViewer<T extends Record<string, any>>(record: T, viewerRole?: string | null): T {
  if (!isReceptionDeskRole(viewerRole)) {
    return record;
  }

  return {
    ...record,
    icdCode: null,
    icdDescription: null,
    clinicalNotes: null,
    audioTranscription: null,
    audioUrl: null,
    audioKey: null,
    attachmentsRaw: null,
  };
}

async function getClinicalEvolutionByIdInternal(
  id: number
): Promise<(ClinicalEvolution & Record<string, unknown>) | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db
    .select({
      evolution: clinicalEvolutions,
      doctorName: users.name,
      doctorEmail: users.email,
      doctorRole: users.role,
    })
    .from(clinicalEvolutions)
    .leftJoin(users, eq(clinicalEvolutions.doctorId, users.id))
    .where(eq(clinicalEvolutions.id, id))
    .limit(1);

  if (!result[0]) return null;
  return {
    ...result[0].evolution,
    doctorName: result[0].doctorName,
    doctorEmail: result[0].doctorEmail,
    doctorRole: result[0].doctorRole,
  } as ClinicalEvolution & Record<string, unknown>;
}

// ─── Clinical Evolution Operations ───────────────────────────────────────────

export async function createClinicalEvolution(
  data: InsertClinicalEvolution
): Promise<ClinicalEvolution | null> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  
  const result = await db.insert(clinicalEvolutions).values(data);
  const id = (result as any)?.[0]?.insertId ?? (result as any)?.[0] ?? (result as any)?.insertId;
  
  if (!id) return null;
  
  return db
    .select()
    .from(clinicalEvolutions)
    .where(eq(clinicalEvolutions.id, id))
    .limit(1)
    .then((rows) => rows[0] || null);
}

export async function getClinicalEvolutionById(
  id: number,
  viewerRole?: string | null,
  viewerUserId?: number | null
): Promise<ClinicalEvolution | null> {
  const evolution = await getClinicalEvolutionByIdInternal(id);
  if (!evolution) return null;
  if (isReceptionDeskRole(viewerRole)) {
    const ownsRecord = [evolution.createdBy, evolution.doctorId, evolution.updatedBy].some(
      (value) => Number(value) === Number(viewerUserId),
    );
    if (!ownsRecord || !isSecretaryRecord(evolution)) {
      return null;
    }
  }
  return redactClinicalFieldsForViewer(evolution, viewerRole) as ClinicalEvolution & Record<string, unknown>;
}

export async function getClinicalEvolutionsByPatient(
  patientId: number,
  viewerRole?: string | null,
  viewerUserId?: number | null
): Promise<ClinicalEvolution[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      evolution: clinicalEvolutions,
      doctorName: users.name,
      doctorEmail: users.email,
      doctorRole: users.role,
    })
    .from(clinicalEvolutions)
    .leftJoin(users, eq(clinicalEvolutions.doctorId, users.id))
    .where(eq(clinicalEvolutions.patientId, patientId))
    .orderBy(clinicalEvolutions.createdAt);

  const current = rows.map((row) => ({
    ...row.evolution,
    doctorName: row.doctorName,
    doctorEmail: row.doctorEmail,
    doctorRole: row.doctorRole,
    isSecretaryRecord: isSecretaryRecord(row.evolution),
    isLegacy: false as const,
  })) as (ClinicalEvolution & Record<string, unknown>)[];

  // Mescla atendimentos legados (medical_records importados de Prontuário
  // Verde / OneDoctor, ou criados antes da tabela clinical_evolutions). Eles
  // representam evoluções e devem aparecer aqui, não na lista de anamneses.
  const legacy = await getLegacyEvolutionsFromMedicalRecords(patientId);
  const visibleCurrent = isReceptionDeskRole(viewerRole)
    ? current.filter(
        (record) =>
          record.isSecretaryRecord &&
          [record.createdBy, record.doctorId, record.updatedBy].some((value) => Number(value) === Number(viewerUserId)),
      )
    : current;
  const visibleLegacy = isReceptionDeskRole(viewerRole) ? [] : legacy;
  return [...visibleCurrent, ...visibleLegacy].map((record) => redactClinicalFieldsForViewer(record, viewerRole)).sort((a: any, b: any) => {
    const da = new Date(a.startedAt ?? a.createdAt ?? 0).getTime();
    const db2 = new Date(b.startedAt ?? b.createdAt ?? 0).getTime();
    return db2 - da;
  });
}

// Retorna registros antigos de `medical_records` mapeados no formato de
// ClinicalEvolution, para exibição unificada na lista de evoluções.
export async function getLegacyEvolutionsFromMedicalRecords(
  patientId: number
): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];

  const rows = unwrapRows<any>(await db.execute(sql`
    select
      mr.id,
      mr.patientId,
      mr.doctorId,
      mr.appointmentId,
      mr.date,
      mr.chiefComplaint,
      mr.anamnesis,
      mr.physicalExam,
      mr.diagnosis,
      mr.icdCode,
      mr.icdDescription,
      mr.plan,
      mr.evolution,
      mr.notes,
      mr.attachments,
      mr.status,
      mr.sourceSystem,
      mr.sourceId,
      mr.createdAt,
      mr.updatedAt,
      u.name  as doctorName,
      u.email as doctorEmail,
      u.role  as doctorRole
    from medical_records mr
    left join users u on u.id = mr.doctorId
    where mr.patientId = ${patientId}
    order by mr.date desc, mr.id desc
  `));

  return rows.map((r: any) => {
    // Monta um texto único de evolução a partir dos campos clássicos
    const parts: string[] = [];
    if (r.chiefComplaint) parts.push(`**Queixa principal**\n${r.chiefComplaint}`);
    if (r.anamnesis)      parts.push(`**Anamnese / História**\n${r.anamnesis}`);
    if (r.physicalExam)   parts.push(`**Exame físico**\n${r.physicalExam}`);
    if (r.diagnosis)      parts.push(`**Diagnóstico / Hipótese**\n${r.diagnosis}`);
    if (r.plan)           parts.push(`**Plano / Conduta**\n${r.plan}`);
    if (r.evolution)      parts.push(`**Evolução**\n${r.evolution}`);
    if (r.notes)          parts.push(`**Observações**\n${r.notes}`);
    const clinicalNotes = parts.join("\n\n").trim();

    const sourceLabel = r.sourceSystem === "prontuario_verde"
      ? "Prontuário Verde (importado)"
      : r.sourceSystem === "onedoctor"
        ? "OneDoctor (importado)"
        : "Registro legado";

    const startedAt = r.date ? new Date(r.date) : (r.createdAt ? new Date(r.createdAt) : null);

    return {
      // Shape compatível com ClinicalEvolution
      id: -Number(r.id), // id negativo sinaliza origem legada no cliente
      legacyRecordId: Number(r.id),
      patientId: r.patientId,
      doctorId: r.doctorId,
      assistantUserId: null,
      medicalRecordId: Number(r.id),
      appointmentId: r.appointmentId,
      icdCode: r.icdCode ?? "",
      icdDescription: r.icdDescription ?? "",
      clinicalNotes: clinicalNotes || "(sem conteúdo registrado)",
      secretaryNotes: null,
      audioTranscription: null,
      audioUrl: null,
      audioKey: null,
      attendanceType: null,
      status: r.status ?? "finalizado",
      startedAt,
      endedAt: null,
      finalizedAt: startedAt,
      isRetroactive: 1,
      retroactiveJustification: null,
      assistantName: "",
      d4signDocumentKey: null,
      d4signStatus: null,
      signedAt: null,
      signedByDoctorId: null,
      signedByDoctorName: null,
      signedPdfUrl: null,
      signatureHash: null,
      signatureProvider: null,
      signatureCertificateLabel: null,
      signatureValidationCode: null,
      createdAt: r.createdAt ? new Date(r.createdAt) : null,
      updatedAt: r.updatedAt ? new Date(r.updatedAt) : null,
      createdBy: null,
      updatedBy: null,
      doctorName: r.doctorName,
      doctorEmail: r.doctorEmail,
      doctorRole: r.doctorRole,
      isSecretaryRecord: false,
      isLegacy: true,
      legacySource: r.sourceSystem ?? null,
      legacySourceLabel: sourceLabel,
      attachmentsRaw: r.attachments ?? null,
    };
  });
}

export async function updateClinicalEvolution(
  id: number,
  data: Partial<InsertClinicalEvolution>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  await db
    .update(clinicalEvolutions)
    .set(data)
    .where(eq(clinicalEvolutions.id, id));
}

export async function updateSecretaryNotes(
  params: {
    id?: number;
    patientId: number;
    secretaryNotes: string;
    userId: number;
  }
): Promise<(ClinicalEvolution & Record<string, unknown>) | null> {
  const db = await getDb();
  if (!db) return null;

  if (params.id) {
    await db
      .update(clinicalEvolutions)
      .set({
        secretaryNotes: params.secretaryNotes,
        updatedBy: params.userId,
      })
      .where(eq(clinicalEvolutions.id, params.id));

    return getClinicalEvolutionByIdInternal(params.id);
  }

  const created = await createClinicalEvolution({
    patientId: params.patientId,
    doctorId: params.userId,
    icdCode: "",
    icdDescription: "",
    clinicalNotes: "",
    secretaryNotes: params.secretaryNotes,
    assistantName: "Ninguém",
    status: "rascunho",
    createdBy: params.userId,
  });

  if (!created?.id) {
    return null;
  }

  return getClinicalEvolutionByIdInternal(created.id);
}

export async function deleteClinicalEvolution(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  await db
    .delete(clinicalEvolutions)
    .where(eq(clinicalEvolutions.id, id));
}

// ─── Digital Signature Operations ────────────────────────────────────────────

export async function signClinicalEvolution(
  evolutionId: number,
  doctorId: number,
  doctorName: string,
  doctorCRM: string | undefined,
  d4signDocumentKey: string,
  signatureMethod: "eletronica" | "icp_brasil_a1" | "icp_brasil_a3" = "eletronica",
  signatureProvider?: string,
  signatureCertificateLabel?: string,
  signatureValidationCode?: string,
  ipAddress?: string,
  userAgent?: string
): Promise<SignatureAuditLog | null> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  
  try {
    // Update clinical evolution status
    await db
      .update(clinicalEvolutions)
      .set({
        status: "assinado",
        d4signDocumentKey,
        d4signStatus: "assinado",
        signedAt: new Date(),
        signedByDoctorId: doctorId,
        signedByDoctorName: doctorName,
        signatureProvider: signatureProvider ?? null,
        signatureCertificateLabel: signatureCertificateLabel ?? null,
        signatureValidationCode: signatureValidationCode ?? null,
      })
      .where(eq(clinicalEvolutions.id, evolutionId));
    
    // Create audit log entry
    const auditData: InsertSignatureAuditLog = {
      clinicalEvolutionId: evolutionId,
      doctorId,
      doctorName,
      doctorCRM,
      action: "signed",
      signatureMethod,
      signatureTimestamp: new Date(),
      d4signDocumentKey,
      ipAddress,
      userAgent,
      details: JSON.stringify({
        timestamp: new Date().toISOString(),
        method: signatureMethod,
        provider: signatureProvider ?? null,
        certificateLabel: signatureCertificateLabel ?? null,
        validationCode: signatureValidationCode ?? null,
      }),
    };
    
    const result = await db.insert(signatureAuditLog).values(auditData);
    const id = (result as any)[0];
    
    if (!id) return null;
    
    return db
      .select()
      .from(signatureAuditLog)
      .where(eq(signatureAuditLog.id, id))
      .limit(1)
      .then((rows) => rows[0] || null);
  } catch (error) {
    console.error("Error signing clinical evolution:", error);
    throw error;
  }
}

export async function getSignatureAuditLog(
  evolutionId: number
): Promise<SignatureAuditLog[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db
    .select()
    .from(signatureAuditLog)
    .where(eq(signatureAuditLog.clinicalEvolutionId, evolutionId))
    .orderBy(signatureAuditLog.createdAt);
}

export async function getSignatureAuditLogByDoctor(
  doctorId: number
): Promise<SignatureAuditLog[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db
    .select()
    .from(signatureAuditLog)
    .where(eq(signatureAuditLog.doctorId, doctorId))
    .orderBy(signatureAuditLog.createdAt);
}

export async function verifySignature(
  evolutionId: number,
  doctorId: number
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  const evolution = await db
    .select()
    .from(clinicalEvolutions)
    .where(
      and(
        eq(clinicalEvolutions.id, evolutionId),
        eq(clinicalEvolutions.signedByDoctorId, doctorId)
      )
    )
    .limit(1);
  
  return evolution.length > 0 && evolution[0]?.status === "assinado";
}

export async function getClinicalEvolutionsByDoctor(
  doctorId: number
): Promise<ClinicalEvolution[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db
    .select()
    .from(clinicalEvolutions)
    .where(eq(clinicalEvolutions.doctorId, doctorId))
    .orderBy(clinicalEvolutions.createdAt);
}

export async function getPendingSignatures(
  doctorId: number
): Promise<ClinicalEvolution[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(clinicalEvolutions)
    .where(
      and(
        eq(clinicalEvolutions.doctorId, doctorId),
        eq(clinicalEvolutions.status, "finalizado")
      )
    )
    .orderBy(clinicalEvolutions.createdAt);
}

// ─── Edit Audit Log Operations ───────────────────────────────────────────────

// Snapshot só dos campos editáveis — evita vazar IDs internos desnecessários.
export function buildEvolutionSnapshot(ev: any): Record<string, any> {
  return {
    status: ev?.status ?? null,
    attendanceType: ev?.attendanceType ?? null,
    icdCode: ev?.icdCode ?? null,
    icdDescription: ev?.icdDescription ?? null,
    clinicalNotes: ev?.clinicalNotes ?? null,
    secretaryNotes: ev?.secretaryNotes ?? null,
    audioTranscription: ev?.audioTranscription ?? null,
    assistantName: ev?.assistantName ?? null,
    assistantUserId: ev?.assistantUserId ?? null,
    startedAt: ev?.startedAt ? new Date(ev.startedAt).toISOString() : null,
    endedAt: ev?.endedAt ? new Date(ev.endedAt).toISOString() : null,
    finalizedAt: ev?.finalizedAt ? new Date(ev.finalizedAt).toISOString() : null,
    isRetroactive: ev?.isRetroactive ?? null,
    retroactiveJustification: ev?.retroactiveJustification ?? null,
  };
}

export function diffSnapshots(
  prev: Record<string, any>,
  next: Record<string, any>
): string[] {
  const changed: string[] = [];
  const keysArray = Array.from(new Set([...Object.keys(prev || {}), ...Object.keys(next || {})]));
  for (const key of keysArray) {
    const a = prev?.[key];
    const b = next?.[key];
    const eq =
      a === b ||
      (a == null && b == null) ||
      (typeof a === "string" && typeof b === "string" && a === b);
    if (!eq) changed.push(key);
  }
  return changed;
}

export async function createClinicalEvolutionEditLog(
  data: InsertClinicalEvolutionEditLog
): Promise<ClinicalEvolutionEditLog | null> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const result = await db.insert(clinicalEvolutionEditLog).values(data);
  const id = (result as any)?.[0]?.insertId ?? (result as any)?.[0] ?? (result as any)?.insertId;
  if (!id) return null;

  const rows = await db
    .select()
    .from(clinicalEvolutionEditLog)
    .where(eq(clinicalEvolutionEditLog.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getClinicalEvolutionEditLogs(
  evolutionId: number
): Promise<ClinicalEvolutionEditLog[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(clinicalEvolutionEditLog)
    .where(eq(clinicalEvolutionEditLog.clinicalEvolutionId, evolutionId))
    .orderBy(clinicalEvolutionEditLog.editedAt);
}
