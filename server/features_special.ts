import { getDb } from "./db";
import { eq, like, and, gte, lte, desc, sql } from "drizzle-orm";

/**
 * ─── ATENDIMENTO RETROATIVO ──────────────────────────────────────────────
 * 
 * Permite criar atendimentos em datas passadas com justificativa obrigatória.
 * Registra a data/hora original e marca como retroativo nos relatórios.
 */

export interface RetroactiveAppointmentData {
  patientId: number;
  doctorId: number;
  scheduledAt: string;
  durationMinutes: number;
  type: string;
  notes?: string;
  retroactiveJustification: string; // OBRIGATÓRIO
  isRetroactive: true;
  originalAppointmentDate?: string; // data original planejada
}

export async function createRetroactiveAppointment(
  data: RetroactiveAppointmentData,
  userId: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // Validar justificativa
  if (!data.retroactiveJustification || data.retroactiveJustification.trim().length === 0) {
    throw new Error("Justificativa para atendimento retroativo é obrigatória");
  }

  // Registrar no banco com flag de retroativo
  const result = await db.insert(sql`appointments`).values({
    ...data,
    createdBy: userId,
    isRetroactive: true,
    retroactiveJustification: data.retroactiveJustification,
    retroactiveCreatedAt: new Date().toISOString(), // data de quando foi criado
  });

  // Criar log de auditoria
  await createAuditLog({
    userId,
    action: 'CREATE_RETROACTIVE_APPOINTMENT',
    resourceType: 'appointments',
    resourceId: result[0],
    patientId: data.patientId,
    details: {
      appointmentDate: data.scheduledAt,
      justification: data.retroactiveJustification,
      originalDate: data.originalAppointmentDate,
    },
  });

  return result[0];
}

export async function getRetroactiveAppointments(patientId?: number) {
  const db = await getDb();
  if (!db) return [];

  let query = db.select().from(sql`appointments`).where(eq(sql`isRetroactive`, true));

  if (patientId) {
    query = query.where(eq(sql`patientId`, patientId));
  }

  return query.orderBy(desc(sql`retroactiveCreatedAt`));
}

/**
 * ─── GALERIA DE FOTOS AVANÇADA ──────────────────────────────────────────
 * 
 * Permite organizar fotos em pastas, comparar até 4 imagens lado a lado,
 * e comparar fotos de pastas diferentes.
 */

export interface PhotoFolder {
  id?: number;
  patientId: number;
  name: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PhotoWithFolder {
  id: number;
  patientId: number;
  folderId?: number;
  folderName?: string;
  category: string;
  description?: string;
  photoUrl: string;
  photoKey: string;
  thumbnailUrl?: string;
  takenAt?: string;
  uploadedBy: number;
  createdAt: string;
  sortOrder?: number;
}

// Criar pasta de fotos
export async function createPhotoFolder(
  patientId: number,
  name: string,
  description?: string,
  userId?: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const result = await db.insert(sql`photo_folders`).values({
    patientId,
    name,
    description,
    createdBy: userId,
  });

  return result[0];
}

// Listar pastas de um paciente
export async function getPhotoFolders(patientId: number) {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(sql`photo_folders`)
    .where(eq(sql`patientId`, patientId))
    .orderBy(desc(sql`createdAt`));
}

// Atualizar pasta
export async function updatePhotoFolder(
  folderId: number,
  data: { name?: string; description?: string }
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  await db.update(sql`photo_folders`).set(data).where(eq(sql`id`, folderId));
  return { success: true };
}

// Deletar pasta
export async function deletePhotoFolder(folderId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // Mover fotos para pasta padrão
  await db.update(sql`patient_photos`)
    .set({ folderId: null })
    .where(eq(sql`folderId`, folderId));

  await db.delete(sql`photo_folders`).where(eq(sql`id`, folderId));
  return { success: true };
}

// Upload de foto em pasta
export async function uploadPhotoToFolder(
  patientId: number,
  folderId: number | null,
  category: string,
  description: string | null,
  photoUrl: string,
  photoKey: string,
  userId: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const result = await db.insert(sql`patient_photos`).values({
    patientId,
    folderId: folderId || null,
    category,
    description,
    photoUrl,
    photoKey,
    uploadedBy: userId,
  });

  return result[0];
}

// Obter fotos de uma pasta
export async function getPhotosByFolder(folderId: number | null, patientId: number) {
  const db = await getDb();
  if (!db) return [];

  if (folderId === null) {
    // Fotos sem pasta
    return db.select().from(sql`patient_photos`)
      .where(and(eq(sql`patientId`, patientId), sql`folderId IS NULL`))
      .orderBy(desc(sql`createdAt`));
  }

  return db.select().from(sql`patient_photos`)
    .where(and(eq(sql`patientId`, patientId), eq(sql`folderId`, folderId)))
    .orderBy(desc(sql`createdAt`));
}

// Comparar fotos (até 4 imagens lado a lado)
export interface PhotoComparison {
  photos: PhotoWithFolder[];
  comparison_id: string;
  created_at: string;
}

export async function createPhotoComparison(
  patientId: number,
  photoIds: number[],
  userId: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  if (photoIds.length < 2 || photoIds.length > 4) {
    throw new Error("Deve selecionar entre 2 e 4 fotos para comparação");
  }

  // Buscar fotos
  const photos = await db.select().from(sql`patient_photos`)
    .where(and(
      eq(sql`patientId`, patientId),
      sql`id IN (${photoIds.join(',')})`
    ));

  // Criar registro de comparação
  const comparisonId = `comp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const result = await db.insert(sql`photo_comparisons`).values({
    patientId,
    comparisonId,
    photoIds: JSON.stringify(photoIds),
    createdBy: userId,
  });

  return {
    comparison_id: comparisonId,
    photos: photos as PhotoWithFolder[],
    created_at: new Date().toISOString(),
  };
}

/**
 * ─── BUSCA INTELIGENTE DE PACIENTES ──────────────────────────────────────
 * 
 * Autocomplete conforme digita, mostrando sugestões em tempo real.
 */

export async function searchPatientsAutocomplete(
  query: string,
  limit: number = 20
) {
  const db = await getDb();
  if (!db) return [];

  if (!query || query.trim().length === 0) {
    return [];
  }

  const searchTerm = `%${query}%`;

  // Buscar por nome, CPF ou email
  const results = await db.select({
    id: sql`id`,
    fullName: sql`fullName`,
    cpf: sql`cpf`,
    email: sql`email`,
    phone: sql`phone`,
    birthDate: sql`birthDate`,
    photoUrl: sql`photoUrl`,
  }).from(sql`patients`)
    .where(sql`(fullName LIKE ${searchTerm} OR cpf LIKE ${searchTerm} OR email LIKE ${searchTerm})`)
    .orderBy(sql`CASE WHEN fullName LIKE ${query}% THEN 0 ELSE 1 END, fullName`)
    .limit(limit);

  return results;
}

/**
 * ─── PERMISSÕES CUSTOMIZÁVEIS ───────────────────────────────────────────
 * 
 * Sistema completo de permissões customizáveis por usuário e módulo.
 */

export interface UserPermissionMatrix {
  userId: number;
  permissions: {
    [module: string]: {
      canCreate: boolean;
      canRead: boolean;
      canUpdate: boolean;
      canDelete: boolean;
      customFields?: Record<string, boolean>;
    };
  };
}

export interface PermissionRequest {
  userId: number;
  module: string;
  action: 'create' | 'read' | 'update' | 'delete';
}

// Verificar permissão de um usuário
export async function checkUserPermission(
  userId: number,
  module: string,
  action: 'create' | 'read' | 'update' | 'delete'
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const permission = await db.select().from(sql`permissions`)
    .where(and(
      eq(sql`userId`, userId),
      eq(sql`module`, module)
    )).limit(1);

  if (!permission || !permission[0]) {
    return false;
  }

  const perm = permission[0];
  const actionMap = {
    create: 'canCreate',
    read: 'canRead',
    update: 'canUpdate',
    delete: 'canDelete',
  };

  return perm[actionMap[action]] === true;
}

// Obter matriz de permissões de um usuário
export async function getUserPermissionMatrix(userId: number): Promise<UserPermissionMatrix> {
  const db = await getDb();
  if (!db) return { userId, permissions: {} };

  const permissions = await db.select().from(sql`permissions`)
    .where(eq(sql`userId`, userId));

  const matrix: UserPermissionMatrix = {
    userId,
    permissions: {},
  };

  for (const perm of permissions) {
    matrix.permissions[perm.module] = {
      canCreate: perm.canCreate,
      canRead: perm.canRead,
      canUpdate: perm.canUpdate,
      canDelete: perm.canDelete,
    };
  }

  return matrix;
}

// Definir permissões para um usuário em um módulo
export async function setUserModulePermissions(
  userId: number,
  module: string,
  permissions: {
    canCreate?: boolean;
    canRead?: boolean;
    canUpdate?: boolean;
    canDelete?: boolean;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const existing = await db.select().from(sql`permissions`)
    .where(and(
      eq(sql`userId`, userId),
      eq(sql`module`, module)
    )).limit(1);

  if (existing && existing[0]) {
    await db.update(sql`permissions`)
      .set(permissions)
      .where(eq(sql`id`, existing[0].id));
  } else {
    await db.insert(sql`permissions`).values({
      userId,
      module,
      canCreate: permissions.canCreate ?? false,
      canRead: permissions.canRead ?? true,
      canUpdate: permissions.canUpdate ?? false,
      canDelete: permissions.canDelete ?? false,
    });
  }

  return { success: true };
}

// Copiar permissões de um usuário para outro
export async function copyUserPermissions(
  fromUserId: number,
  toUserId: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const sourcePermissions = await db.select().from(sql`permissions`)
    .where(eq(sql`userId`, fromUserId));

  for (const perm of sourcePermissions) {
    await setUserModulePermissions(toUserId, perm.module, {
      canCreate: perm.canCreate,
      canRead: perm.canRead,
      canUpdate: perm.canUpdate,
      canDelete: perm.canDelete,
    });
  }

  return { success: true, count: sourcePermissions.length };
}

// Criar log de auditoria
export async function createAuditLog(data: any) {
  const db = await getDb();
  if (!db) return;

  await db.insert(sql`audit_logs`).values({
    ...data,
    createdAt: new Date().toISOString(),
  });
}

// Obter histórico de ações de um usuário
export async function getUserAuditLog(userId: number, limit: number = 100) {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(sql`audit_logs`)
    .where(eq(sql`userId`, userId))
    .orderBy(desc(sql`createdAt`))
    .limit(limit);
}

// Obter histórico de ações em um recurso
export async function getResourceAuditLog(
  resourceType: string,
  resourceId: number,
  limit: number = 100
) {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(sql`audit_logs`)
    .where(and(
      eq(sql`resourceType`, resourceType),
      eq(sql`resourceId`, resourceId)
    ))
    .orderBy(desc(sql`createdAt`))
    .limit(limit);
}

