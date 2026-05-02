import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ENCRYPTION_VERSION = "v1";

function getEncryptionKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "JWT_SECRET ausente ou muito curto (mínimo 32 caracteres). secure-storage não pode ser inicializado.",
    );
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptSensitiveValue(value: string | null | undefined) {
  if (!value) return null;

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    ENCRYPTION_VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decryptSensitiveValue(payload: string | null | undefined) {
  if (!payload) return null;

  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== ENCRYPTION_VERSION) {
    return payload;
  }

  const [, ivBase64, tagBase64, encryptedBase64] = parts;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivBase64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagBase64, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, "base64")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

export function maskStoredValue(value: string | null | undefined) {
  if (!value) return null;
  return "********";
}
