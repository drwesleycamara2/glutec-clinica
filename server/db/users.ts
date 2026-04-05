import { eq } from "drizzle-orm";
import db from "../db"; // Importa a instância do Drizzle ORM como default
import { users } from "./schema";
import { v4 as uuidv4 } from "uuid";

export async function createUser(email: string, passwordHash: string, name: string, role: string = 'user') {
    const id = uuidv4();
    const drizzleDb = await db();
    if (!drizzleDb) throw new Error("DB unavailable");
    await drizzleDb.insert(users).values({
        id,
        email,
        password: passwordHash,
        name,
        role,
    });
    return { id, email, name, role };
}

export async function getUserByEmail(email: string) {
    const drizzleDb = await db();
    if (!drizzleDb) return undefined;
    return drizzleDb.query.users.findFirst({
        where: eq(users.email, email),
    });
}

export async function getUserById(id: string) {
    const drizzleDb = await db();
    if (!drizzleDb) return undefined;
    return drizzleDb.query.users.findFirst({
        where: eq(users.id, id),
    });
}

export async function createInvite(email: string, role: string = 'user') {
    const inviteToken = uuidv4();
    const drizzleDb = await db();
    if (!drizzleDb) throw new Error("DB unavailable");
    await drizzleDb.insert(users).values({
        id: uuidv4(),
        email,
        password: '', // Password will be set on registration
        name: '', // Name will be set on registration
        role,
        status: 'pending',
        inviteToken,
    });
    return inviteToken;
}

export async function getUserByInviteToken(inviteToken: string) {
    const drizzleDb = await db();
    if (!drizzleDb) return undefined;
    return drizzleDb.query.users.findFirst({
        where: eq(users.inviteToken, inviteToken),
    });
}

export async function activateUser(id: string) {
    const drizzleDb = await db();
    if (!drizzleDb) throw new Error("DB unavailable");
    await drizzleDb.update(users).set({ status: 'active', inviteToken: null }).where(eq(users.id, id));
    return { success: true };
}

export async function deactivateUser(id: string) {
    const drizzleDb = await db();
    if (!drizzleDb) throw new Error("DB unavailable");
    await drizzleDb.update(users).set({ status: 'inactive' }).where(eq(users.id, id));
    return { success: true };
}

export async function deleteUser(id: string) {
    const drizzleDb = await db();
    if (!drizzleDb) throw new Error("DB unavailable");
    await drizzleDb.delete(users).where(eq(users.id, id));
    return { success: true };
}

export async function updateUserPermissions(id: string, permissions: string) {
    const drizzleDb = await db();
    if (!drizzleDb) throw new Error("DB unavailable");
    await drizzleDb.update(users).set({ permissions }).where(eq(users.id, id));
    return { success: true };
}

export async function listUsers() {
    const drizzleDb = await db();
    if (!drizzleDb) throw new Error("DB unavailable");
    return drizzleDb.select().from(users);
}

export async function updateUser2FASecret(id: string, secret: string) {
    const drizzleDb = await db();
    if (!drizzleDb) throw new Error("DB unavailable");
    await drizzleDb.update(users).set({ twoFactorSecret: secret }).where(eq(users.id, id));
    return { success: true };
}

export async function updateUser2FAEnabled(id: string, enabled: boolean) {
    const drizzleDb = await db();
    if (!drizzleDb) throw new Error("DB unavailable");
    await drizzleDb.update(users).set({ twoFactorEnabled: enabled }).where(eq(users.id, id));
    return { success: true };
}
