#!/usr/bin/env node
import "dotenv/config";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

const CONFIRM_VALUE = "RESET_ACCESS";
const email = String(process.env.RESET_USER_EMAIL || "").toLowerCase().trim();
const confirm = process.env.CONFIRM_EMERGENCY_RESET;
const allowNonRoot = process.env.ALLOW_NON_ROOT === "1";
const suppliedPassword = process.env.RESET_TEMP_PASSWORD;

function fail(message) {
  console.error(`ERRO: ${message}`);
  process.exit(1);
}

function maskEmail(value) {
  const [name, domain] = String(value || "").split("@");
  if (!domain) return value;
  const safeName = name.length <= 2 ? `${name[0] || "*"}*` : `${name.slice(0, 2)}***${name.slice(-1)}`;
  return `${safeName}@${domain}`;
}

function generateTemporaryPassword() {
  // Strong, URL-safe, readable enough to transcribe once.
  return `Glt-${randomBytes(18).toString("base64url")}-7!A`;
}

function isStrongPassword(password) {
  return (
    typeof password === "string" &&
    password.length >= 12 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

async function tableExists(conn, tableName) {
  const [rows] = await conn.query("show tables like ?", [tableName]);
  return rows.length > 0;
}

async function main() {
  if (process.platform !== "win32" && typeof process.getuid === "function" && process.getuid() !== 0 && !allowNonRoot) {
    fail("este procedimento deve ser executado como root no VPS. Para ambiente local controlado, defina ALLOW_NON_ROOT=1.");
  }

  if (!process.env.DATABASE_URL) fail("DATABASE_URL nao definido.");
  if (!email) fail("defina RESET_USER_EMAIL com o e-mail do usuario.");
  if (confirm !== CONFIRM_VALUE) {
    fail(`defina CONFIRM_EMERGENCY_RESET=${CONFIRM_VALUE} para confirmar conscientemente o reset.`);
  }

  const temporaryPassword = suppliedPassword || generateTemporaryPassword();
  if (!isStrongPassword(temporaryPassword)) {
    fail("RESET_TEMP_PASSWORD precisa ter ao menos 12 caracteres, maiuscula, minuscula, numero e simbolo.");
  }

  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  await conn.beginTransaction();

  try {
    const [users] = await conn.query(
      "select id, email, name, role, status, twoFactorEnabled from users where lower(email)=? limit 1 for update",
      [email],
    );

    const user = users[0];
    if (!user) fail(`usuario nao encontrado: ${maskEmail(email)}`);

    const passwordHash = await bcrypt.hash(temporaryPassword, 12);

    await conn.query(
      `update users
       set password = ?,
           loginMethod = 'local',
           status = 'active',
           mustChangePassword = 1,
           twoFactorSecret = null,
           twoFactorEnabled = 0,
           twoFactorBackupCodes = null,
           updatedAt = now()
       where id = ?`,
      [passwordHash, user.id],
    );

    if (await tableExists(conn, "password_reset_tokens")) {
      await conn.query("update password_reset_tokens set usedAt = now() where userId = ? and usedAt is null", [user.id]);
    }

    await conn.commit();

    console.log("============================================================");
    console.log("RESET EMERGENCIAL CONCLUIDO");
    console.log("============================================================");
    console.log(`Usuario : ${user.name || "(sem nome)"}`);
    console.log(`E-mail  : ${user.email}`);
    console.log(`ID      : ${user.id}`);
    console.log("");
    console.log("Senha temporaria, exibida somente agora:");
    console.log(temporaryPassword);
    console.log("");
    console.log("Proximo login:");
    console.log("1. Usuario entra com e-mail + senha temporaria.");
    console.log("2. Sistema obriga troca de senha.");
    console.log("3. Sistema obriga novo cadastro do Google Authenticator/2FA.");
    console.log("4. Usuario deve salvar novos codigos de backup.");
    console.log("============================================================");
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error("Falha no reset emergencial:", error?.message || error);
  process.exit(1);
});