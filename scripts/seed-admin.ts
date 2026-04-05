/**
 * seed-admin.ts — Script para criar o primeiro usuário administrador
 *
 * Execute na VPS com:
 *   npx tsx scripts/seed-admin.ts
 *
 * Ou com uma senha customizada:
 *   ADMIN_EMAIL=seu@email.com ADMIN_PASSWORD=SuaSenha tsx scripts/seed-admin.ts
 */

import "dotenv/config";
import bcrypt from "bcrypt";
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import { users } from "../drizzle/schema";

const ADMIN_EMAIL   = process.env.ADMIN_EMAIL   || "contato@drwesleycamara.com.br";
const ADMIN_NAME    = process.env.ADMIN_NAME    || "Wésley Câmara";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Glutec@2026";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL não definida no .env");
    process.exit(1);
  }

  console.log("\n🔧 Glutec Clínica — Script de criação do administrador");
  console.log("=".repeat(55));

  const db = drizzle(process.env.DATABASE_URL);

  // Verificar se já existe
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, ADMIN_EMAIL))
    .limit(1);

  if (existing.length > 0) {
    const user = existing[0];
    console.log(`\n⚠️  Usuário já existe: ${user.email} (role: ${user.role})`);

    // Atualizar para garantir que é admin e tem senha
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await db
      .update(users)
      .set({
        role:         "admin",
        status:       "active",
        passwordHash,
        loginMethod:  "local",
        mustChangePassword: 1, // Forçar troca na próxima entrada
      })
      .where(eq(users.email, ADMIN_EMAIL));

    console.log("✅ Usuário atualizado para admin com nova senha.");
  } else {
    // Criar novo
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    const openId = `local_admin_${Date.now()}`;

    await db.insert(users).values({
      email:              ADMIN_EMAIL,
      name:               ADMIN_NAME,
      role:               "admin",
      status:             "active",
      openId,
      passwordHash,
      loginMethod:        "local",
      mustChangePassword: 1, // Forçar troca na primeira entrada
      twoFactorEnabled:   0,
    });

    console.log("\n✅ Administrador criado com sucesso!");
  }

  console.log("\n📋 Dados de acesso:");
  console.log(`   E-mail : ${ADMIN_EMAIL}`);
  console.log(`   Senha  : ${ADMIN_PASSWORD}`);
  console.log("\n⚠️  Você será solicitado a trocar a senha no primeiro login.");
  console.log("⚠️  Configure o 2FA imediatamente após o primeiro acesso.");
  console.log("\n🌐 Acesse: http://SEU_DOMINIO/login");
  console.log("=".repeat(55) + "\n");

  process.exit(0);
}

main().catch(err => {
  console.error("❌ Erro ao criar admin:", err);
  process.exit(1);
});
