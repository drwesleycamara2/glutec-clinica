import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  clinicalEvolutions, 
  signatureAuditLog,
  InsertClinicalEvolution,
  InsertSignatureAuditLog,
  ClinicalEvolution,
  SignatureAuditLog
} from "../drizzle/schema-clinical-evolution";
import { getDb } from "./db";

// ─── Clinical Evolution Operations ───────────────────────────────────────────

export async function createClinicalEvolution(
  data: InsertClinicalEvolution
): Promise<ClinicalEvolution | null> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  
  const result = await db.insert(clinicalEvolutions).values(data);
  const id = (result as any)[0];
  
  if (!id) return null;
  
  return db
    .select()
    .from(clinicalEvolutions)
    .where(eq(clinicalEvolutions.id, id))
    .limit(1)
    .then((rows) => rows[0] || null);
}

export async function getClinicalEvolutionById(
  id: number
): Promise<ClinicalEvolution | null> {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db
    .select()
    .from(clinicalEvolutions)
    .where(eq(clinicalEvolutions.id, id))
    .limit(1);
  
  return result[0] || null;
}

export async function getClinicalEvolutionsByPatient(
  patientId: number
): Promise<ClinicalEvolution[]> {
  const db = await getDb();
  if (!db) return [];
  
  return db
    .select()
    .from(clinicalEvolutions)
    .where(eq(clinicalEvolutions.patientId, patientId))
    .orderBy(clinicalEvolutions.createdAt);
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
