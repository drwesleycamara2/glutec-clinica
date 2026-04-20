import { eq, sql, or, like, and, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, icd10Codes, userFavoriteIcds, audioTranscriptions, InsertIcd10Code, InsertUserFavoriteIcd, InsertAudioTranscription } from "../drizzle/schema";
import { ENV } from './_core/env';
import { createHash, randomBytes } from "crypto";
import fs from "fs/promises";
import path from "path";

let _db: ReturnType<typeof drizzle> | null = null;
let icd10BootstrapPromise: Promise<void> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const db = await getDb();
    if (!db) return;

    // Check if there's an invited user with this email
    if (user.email) {
      const invitedUser = await db.select().from(users).where(eq(users.email, user.email)).limit(1);
      if (invitedUser.length > 0 && invitedUser[0].openId.startsWith('invited_')) {
        // Sync the invited user with the real openId
        await db.update(users).set({ openId: user.openId }).where(eq(users.id, invitedUser[0].id));
      }
    }

    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    // Super Admin Enforcement: Only the specific email can be admin
    const SUPER_ADMIN_EMAIL = "contato@drwesleycamara.com.br";
    
    if (user.email === SUPER_ADMIN_EMAIL) {
      values.role = 'admin';
      updateSet.role = 'admin';
    } else if (user.role !== undefined) {
      // For other users, respect the role passed but ensure they aren't promoted to admin unless explicitly set
      values.role = user.role;
      updateSet.role = user.role;
    } else {
      values.role = 'user';
      updateSet.role = 'user';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ─── CID-10 ─────────────────────────────────────────────────────────────────

export async function searchIcd10(query: string, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  await ensureIcd10Catalog();
  const q = `%${query}%`;
  return db
    .select()
    .from(icd10Codes)
    .where(or(like(icd10Codes.code, q), like(icd10Codes.description, q)))
    .limit(limit);
}

export async function getIcd10ById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  await ensureIcd10Catalog();
  const result = await db.select().from(icd10Codes).where(eq(icd10Codes.id, id)).limit(1);
  return result[0];
}

export async function getFavoriteIcds(userId: number) {
  const db = await getDb();
  if (!db) return [];
  await ensureIcd10Catalog();
  return db
    .select({
      id: icd10Codes.id,
      code: icd10Codes.code,
      description: icd10Codes.description,
      descriptionAbbrev: icd10Codes.descriptionAbbrev,
    })
    .from(userFavoriteIcds)
    .innerJoin(icd10Codes, eq(userFavoriteIcds.icd10CodeId, icd10Codes.id))
    .where(eq(userFavoriteIcds.userId, userId));
}

export async function addFavoriteIcd(userId: number, icd10CodeId: number) {
  const db = await getDb();
  if (!db) return;
  await ensureIcd10Catalog();
  await db.insert(userFavoriteIcds).values({ userId, icd10CodeId }).onDuplicateKeyUpdate({ set: { userId } });
}

export async function removeFavoriteIcd(userId: number, icd10CodeId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(userFavoriteIcds).where(and(eq(userFavoriteIcds.userId, userId), eq(userFavoriteIcds.icd10CodeId, icd10CodeId)));
}

export async function insertIcd10Batch(values: InsertIcd10Code[]) {
  const db = await getDb();
  if (!db) return;
  const chunkSize = 100;
  for (let i = 0; i < values.length; i += chunkSize) {
    const chunk = values.slice(i, i + chunkSize);
    await db.insert(icd10Codes).values(chunk).onDuplicateKeyUpdate({ set: { description: sql`description` } });
  }
}

async function ensureIcd10Catalog() {
  if (icd10BootstrapPromise) {
    return icd10BootstrapPromise;
  }

  icd10BootstrapPromise = (async () => {
    const db = await getDb();
    if (!db) return;

    const countRows = await db.execute(sql`select count(*) as total from icd10_codes`);
    const total = Number((countRows as any)?.[0]?.total ?? (countRows as any)?.[0]?.[0]?.total ?? 0);
    if (total > 0) return;

    const filePath = path.resolve(process.cwd(), "cid10_data.json");
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Array<{ code: string; description: string; descriptionAbbrev?: string }>;
    if (!Array.isArray(parsed) || parsed.length === 0) return;

    await insertIcd10Batch(
      parsed.map((item) => ({
        code: item.code,
        description: item.description,
        descriptionAbbrev: item.descriptionAbbrev ?? null,
      })),
    );
  })().finally(() => {
    icd10BootstrapPromise = null;
  });

  return icd10BootstrapPromise;
}

// ─── Audio Transcriptions ────────────────────────────────────────────────────

export async function createAudioTranscription(data: InsertAudioTranscription) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const result = await db.insert(audioTranscriptions).values(data);
  const insertId =
    typeof result[0] === "number"
      ? result[0]
      : (result[0] as any)?.insertId ?? (result[0] as any)?.id;

  if (!insertId) {
    return result[0];
  }

  return { id: insertId };
}

export async function getAudioTranscriptionById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(audioTranscriptions).where(eq(audioTranscriptions.id, id)).limit(1);
  return result[0];
}

export async function updateAudioTranscription(id: number, data: Partial<InsertAudioTranscription>) {
  const db = await getDb();
  if (!db) return;
  await db.update(audioTranscriptions).set(data).where(eq(audioTranscriptions.id, id));
}

export async function getAudioTranscriptionsByRecord(medicalRecordId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(audioTranscriptions).where(eq(audioTranscriptions.medicalRecordId, medicalRecordId));
}

// ─── User Management ─────────────────────────────────────────────────────────

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  const result = await db
    .select({
      id: users.id,
      openId: users.openId,
      name: users.name,
      email: users.email,
      loginMethod: users.loginMethod,
      specialty: users.specialty,
      profession: users.profession,
      crm: users.crm,
      professionalLicenseType: users.professionalLicenseType,
      professionalLicenseState: users.professionalLicenseState,
      phone: users.phone,
      role: users.role,
      status: users.status,
      permissions: users.permissions,
      mustChangePassword: users.mustChangePassword,
      twoFactorEnabled: users.twoFactorEnabled,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      lastSignedIn: users.lastSignedIn,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  return result.map((row) => normalizeUserRow(row as any));
}

export async function updateUserStatus(userId: number, status: 'active' | 'inactive' | 'pending_password_change') {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ status }).where(eq(users.id, userId));
}

export async function updateUserPermissions(userId: number, permissions: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ permissions }).where(eq(users.id, userId));
}

export async function deleteUser(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(users).where(eq(users.id, userId));
}

export async function inviteUser(data: {
  email: string;
  name: string;
  role: "user" | "admin" | "medico" | "recepcionista" | "enfermeiro" | "gerente";
  permissions: string;
  profession?: string | null;
}) {
  const db = await getDb();
  if (!db) return;
  
  // Create a placeholder user that will be synced on first login
  // Since we use OAuth, we don't know the openId yet, but we can pre-authorize the email
  // We'll use a special flag or just check the email during upsert
  await db.insert(users).values({
    email: data.email,
    name: data.name,
    role: data.role,
    profession: data.profession ?? null,
    permissions: data.permissions,
    status: 'inactive',
    openId: `invited_${data.email}`, // Temporary openId
  }).onDuplicateKeyUpdate({
    set: {
      name: data.name,
      role: data.role,
      profession: data.profession ?? null,
      permissions: data.permissions,
      status: 'inactive'
    }
  });
}

function normalizeUserRow<T extends Record<string, any>>(row: T | undefined | null) {
  if (!row) return row;
  return {
    ...row,
    mustChangePassword: Boolean(row.mustChangePassword),
    twoFactorEnabled: Boolean(row.twoFactorEnabled),
  };
}

function makeLocalOpenId() {
  return `local_${randomBytes(12).toString("hex")}`;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return normalizeUserRow(result[0] as any);
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return normalizeUserRow(result[0] as any);
}

export async function updateUserLastSignedIn(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, userId));
}

export async function updateUserPassword(userId: number, passwordHash: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(users)
    .set({
      password: passwordHash,
      mustChangePassword: 0,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function updateUser2FABackupCodes(userId: number, backupCodesJson: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(users)
    .set({
      twoFactorBackupCodes: backupCodesJson,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function setUser2FA(
  userId: number,
  params: { secret: string; enabled: boolean; backupCodesJson: string }
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(users)
    .set({
      twoFactorSecret: params.secret,
      twoFactorEnabled: params.enabled ? 1 : 0,
      twoFactorBackupCodes: params.backupCodesJson,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function disableUser2FA(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(users)
    .set({
      twoFactorSecret: null,
      twoFactorEnabled: 0,
      twoFactorBackupCodes: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function createInvitation(data: {
  email: string;
  name: string;
  role: "user" | "admin" | "medico" | "recepcionista" | "enfermeiro";
  token: string;
  invitedById: number;
  expiresAt: Date;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(sql`user_invitations`).values({
    email: data.email,
    name: data.name,
    role: data.role,
    token: data.token,
    invitedById: data.invitedById,
    expiresAt: data.expiresAt,
  });
}

export async function getPendingInvitations() {
  const db = await getDb();
  if (!db) return [];
  return (await db.execute(
    sql`select * from user_invitations where usedAt is null and expiresAt > now() order by createdAt desc`
  )) as any[];
}

export async function getInvitationByToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = (await db.execute(
    sql`select * from user_invitations where token = ${token} limit 1`
  )) as any[];
  return result[0] as any;
}

export async function markInvitationUsed(invitationId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(sql`user_invitations`)
    .set({ usedAt: new Date() })
    .where(eq(sql`id`, invitationId));
}

export async function createUserFromInvite(data: {
  email: string;
  name: string;
  role: "user" | "admin" | "medico" | "recepcionista" | "enfermeiro" | "gerente";
  passwordHash: string;
  profession?: string | null;
}) {
  const db = await getDb();
  if (!db) return null;

  const existing = await getUserByEmail(data.email);
  if (existing) {
    await db
      .update(users)
      .set({
        name: data.name,
        role: data.role,
        profession: data.profession ?? existing.profession ?? null,
        status: "active",
        password: data.passwordHash,
        mustChangePassword: 0,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id));
    return getUserById(existing.id);
  }

  const openId = makeLocalOpenId();
  await db.insert(users).values({
    openId,
    name: data.name,
    email: data.email,
    loginMethod: "local",
    role: data.role,
    profession: data.profession ?? null,
    status: "active",
    permissions: "[]",
    password: data.passwordHash,
    mustChangePassword: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  });

  return getUserByEmail(data.email);
}

export async function getSmtpSettings() {
  const db = await getDb();
  if (!db) return null;
  const result = (await db.execute(sql`select * from smtp_settings limit 1`)) as any[];
  return (result[0] as any) ?? null;
}

export async function saveSmtpSettings(data: {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromName?: string;
  fromEmail?: string;
}) {
  const db = await getDb();
  if (!db) return;
  await db.delete(sql`smtp_settings`);
  await db.insert(sql`smtp_settings`).values({
    host: data.host,
    port: data.port,
    secure: data.secure ? 1 : 0,
    user: data.user,
    password: data.password,
    fromName: data.fromName ?? null,
    fromEmail: data.fromEmail ?? null,
    updatedAt: new Date(),
  });
}

export function hashPasswordResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createPasswordResetToken(data: {
  userId: number;
  tokenHash: string;
  expiresAt: Date;
  requestedIp?: string | null;
  userAgent?: string | null;
}) {
  const db = await getDb();
  if (!db) return;

  await db.execute(
    sql`update password_reset_tokens set usedAt = now() where userId = ${data.userId} and usedAt is null`
  );

  await db.execute(sql`
    insert into password_reset_tokens (
      userId,
      tokenHash,
      requestedIp,
      userAgent,
      expiresAt,
      createdAt
    ) values (
      ${data.userId},
      ${data.tokenHash},
      ${data.requestedIp ?? null},
      ${data.userAgent ?? null},
      ${data.expiresAt},
      ${new Date()}
    )
  `);
}

export async function getPasswordResetTokenByHash(tokenHash: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = (await db.execute(sql`
    select
      prt.*,
      u.email as userEmail,
      u.name as userName,
      u.role as userRole,
      u.status as userStatus
    from password_reset_tokens prt
    inner join users u on u.id = prt.userId
    where prt.tokenHash = ${tokenHash}
    limit 1
  `)) as any[];

  return result[0] as any;
}

export async function markPasswordResetTokenUsed(tokenId: number) {
  const db = await getDb();
  if (!db) return;
  await db.execute(sql`update password_reset_tokens set usedAt = now() where id = ${tokenId}`);
}

export async function invalidatePasswordResetTokensForUser(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.execute(
    sql`update password_reset_tokens set usedAt = now() where userId = ${userId} and usedAt is null`
  );
}
