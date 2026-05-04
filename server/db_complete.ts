import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execFileSync } from "child_process";
import { getDb } from "./db";
import { eq, like, and, gte, lte, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  emitNfseWithNationalApi,
  fetchMunicipalParameters,
  testNationalApiConnection,
} from "./lib/nfse-nacional";
import {
  isLegacyNumericCityCode,
  normalizeCityNameValue,
  normalizeEmailValue,
  normalizePatientAddressFields,
  normalizePtBrTitleCase,
  normalizeStateCode,
  nullableOrNull,
  parseStoredPatientAddress,
} from "./lib/patient-normalization-safe";
import { encryptSensitiveValue, maskStoredValue } from "./lib/secure-storage";
import { createWhatsAppService } from "./whatsapp";

function unwrapRows<T = any>(result: any): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as T[];
  }

  return (result ?? []) as T[];
}

function normalizePatientCity(rowCity?: string | null, addressCity?: string | null) {
  return normalizeCityNameValue(isLegacyNumericCityCode(rowCity) ? addressCity : rowCity) || normalizeCityNameValue(addressCity);
}

function unwrapInsertId(result: any): number {
  const header = Array.isArray(result) ? result[0] : result;
  return Number(header?.insertId ?? 0);
}


async function ensureOptionalModuleTables(db: any) {
  if (!ensureOptionalModuleTablesPromise) {
    ensureOptionalModuleTablesPromise = (async () => {
      await db.execute(sql.raw("CREATE TABLE IF NOT EXISTS budget_procedure_catalog (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, name VARCHAR(256) NOT NULL, category VARCHAR(128) NULL, description TEXT NULL, estimatedSessionsMin INT DEFAULT 1, estimatedSessionsMax INT DEFAULT 1, sessionIntervalDays INT DEFAULT 30, active TINYINT(1) NOT NULL DEFAULT 1, createdBy INT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, KEY idx_budget_procedure_catalog_active (active), KEY idx_budget_procedure_catalog_name (name)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"));
      await db.execute(sql.raw("CREATE TABLE IF NOT EXISTS budget_procedure_areas (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, procedureId INT NOT NULL, areaName VARCHAR(128) NOT NULL, sortOrder INT DEFAULT 0, active TINYINT(1) NOT NULL DEFAULT 1, KEY idx_budget_procedure_areas_procedure (procedureId), KEY idx_budget_procedure_areas_active (active)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"));
      await db.execute(sql.raw("CREATE TABLE IF NOT EXISTS budget_procedure_pricing (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, procedureId INT NOT NULL, areaId INT NOT NULL, complexity ENUM('P','M','G') NOT NULL, priceInCents INT NOT NULL, active TINYINT(1) NOT NULL DEFAULT 1, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY uniq_budget_procedure_price (procedureId, areaId, complexity), KEY idx_budget_procedure_pricing_active (active)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"));
      await db.execute(sql.raw("CREATE TABLE IF NOT EXISTS budget_payment_plans (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, name VARCHAR(128) NOT NULL, type ENUM('a_vista','parcelado_sem_juros','parcelado_com_juros','financiamento','pagamento_programado') NOT NULL, discountPercent DECIMAL(5,2) DEFAULT 0, maxInstallments INT DEFAULT 1, interestRatePercent DECIMAL(5,2) DEFAULT 0, description TEXT NULL, active TINYINT(1) NOT NULL DEFAULT 1, sortOrder INT DEFAULT 0, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY idx_budget_payment_plans_active (active)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"));
      await db.execute(sql.raw("CREATE TABLE IF NOT EXISTS financial_transactions (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, type ENUM('receita','despesa') NOT NULL, category VARCHAR(128) NOT NULL, description VARCHAR(512) NOT NULL, amountInCents INT NOT NULL, paymentMethod ENUM('pix','dinheiro','cartao_credito','cartao_debito','transferencia','boleto','outro') NULL, patientId INT NULL, budgetId INT NULL, appointmentId INT NULL, dueDate DATE NULL, paidAt TIMESTAMP NULL, status ENUM('pendente','pago','atrasado','cancelado') NOT NULL DEFAULT 'pendente', createdBy INT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, KEY idx_financial_transactions_createdAt (createdAt), KEY idx_financial_transactions_type (type), KEY idx_financial_transactions_status (status)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"));
      await db.execute(sql.raw("CREATE TABLE IF NOT EXISTS inventory_products (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, name VARCHAR(256) NOT NULL, sku VARCHAR(64) NULL, category VARCHAR(128) NULL, description TEXT NULL, unit VARCHAR(32) DEFAULT 'un', currentStock INT NOT NULL DEFAULT 0, minimumStock INT DEFAULT 5, costPriceInCents INT NULL, supplierName VARCHAR(256) NULL, supplierContact VARCHAR(128) NULL, active TINYINT(1) NOT NULL DEFAULT 1, createdBy INT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY uniq_inventory_products_sku (sku), KEY idx_inventory_products_active (active), KEY idx_inventory_products_stock (currentStock, minimumStock)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"));
      await db.execute(sql.raw("CREATE TABLE IF NOT EXISTS inventory_movements (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, productId INT NOT NULL, type ENUM('entrada','saida','ajuste') NOT NULL, quantity INT NOT NULL, reason VARCHAR(256) NULL, patientId INT NULL, appointmentId INT NULL, createdBy INT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY idx_inventory_movements_product (productId), KEY idx_inventory_movements_createdAt (createdAt)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"));
      await db.execute(sql.raw("CREATE TABLE IF NOT EXISTS crm_indications (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, patientId INT NOT NULL, procedureName VARCHAR(256) NOT NULL, notes TEXT NULL, status ENUM('indicado','agendado','realizado','cancelado') NOT NULL DEFAULT 'indicado', indicatedBy INT NULL, convertedAt TIMESTAMP NULL, appointmentId INT NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, KEY idx_crm_indications_patient (patientId), KEY idx_crm_indications_status (status), KEY idx_crm_indications_createdAt (createdAt)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"));
      await db.execute(sql.raw("CREATE TABLE IF NOT EXISTS chat_messages (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, channelId VARCHAR(64) NOT NULL DEFAULT 'geral', senderId INT NULL, content TEXT NOT NULL, messageType ENUM('text','file','system') NOT NULL DEFAULT 'text', fileUrl TEXT NULL, fileKey VARCHAR(256) NULL, mentions JSON NULL, readBy JSON NULL, createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY idx_chat_messages_channel (channelId), KEY idx_chat_messages_createdAt (createdAt)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"));
    })();
  }

  try {
    await ensureOptionalModuleTablesPromise;
  } catch (error) {
    ensureOptionalModuleTablesPromise = null;
    throw error;
  }
}

function normalizeStoredBloodType(value: unknown) {
  const normalized = String(value ?? "").trim().toUpperCase();
  const validBloodTypes = new Set(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]);
  return validBloodTypes.has(normalized) ? normalized : null;
}

const tableColumnCache = new Map<string, Promise<Map<string, string>>>();
let ensurePrescriptionSchemaPromise: Promise<void> | null = null;
let ensureCloudSignatureUserColumnsPromise: Promise<void> | null = null;
let ensureOptionalModuleTablesPromise: Promise<void> | null = null;

function clearTableColumnCache(tableName: string) {
  tableColumnCache.delete(tableName);
}

async function getTableColumns(tableName: string) {
  let cached = tableColumnCache.get(tableName);
  if (!cached) {
    cached = (async () => {
      const db = await getDb();
      if (!db) return new Map<string, string>();

      const rows = unwrapRows<any>(await db.execute(sql`
        select
          column_name as columnName,
          column_type as columnType,
          data_type as dataType
        from information_schema.columns
        where table_schema = database()
          and table_name = ${tableName}
      `));

      return new Map(
        rows.map((row) => [
          String(row.columnName),
          String(row.columnType || row.dataType || ""),
        ]),
      );
    })();
    tableColumnCache.set(tableName, cached);
  }

  return cached;
}

async function ensurePrescriptionSchema(db: any) {
  if (!ensurePrescriptionSchemaPromise) {
    ensurePrescriptionSchemaPromise = (async () => {
      const columns = await getTableColumns("prescriptions");
      const alterations: string[] = [];

      if (!columns.has("type")) {
        const afterClause = columns.has("medicalRecordId") ? " AFTER `medicalRecordId`" : "";
        alterations.push(`ADD COLUMN \`type\` VARCHAR(64) NULL${afterClause}`);
      }

      if (!columns.has("observations")) {
        const afterClause = columns.has("content")
          ? " AFTER `content`"
          : columns.has("items")
            ? " AFTER `items`"
            : "";
        alterations.push(`ADD COLUMN \`observations\` TEXT NULL${afterClause}`);
      }

      if (alterations.length > 0) {
        await db.execute(sql.raw(`ALTER TABLE prescriptions ${alterations.join(", ")}`));
        clearTableColumnCache("prescriptions");
      }
    })();
  }

  try {
    await ensurePrescriptionSchemaPromise;
  } catch (error) {
    ensurePrescriptionSchemaPromise = null;
    throw error;
  }
}

function formatSqlDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function stripHtmlToPlainText(value?: string | null) {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function parsePrescriptionItems(items: unknown) {
  if (!items) return null;
  try {
    const parsed = typeof items === "string" ? JSON.parse(items) : items;
    if (Array.isArray(parsed)) {
      return {
        text: parsed
          .map((item: any) => [item?.description, item?.instructions]
            .filter(Boolean)
            .map((value) => String(value).trim())
            .join("\n"))
          .filter(Boolean)
          .join("\n\n"),
      };
    }
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, any>;
    }
  } catch {
    return null;
  }
  return null;
}

function normalizePrescriptionRecord(record: any) {
  const parsedItems = parsePrescriptionItems(record?.items);
  const contentFromItems = parsedItems?.html || parsedItems?.content || parsedItems?.text || "";
  const normalizedContent = String(record?.content ?? contentFromItems ?? "");
  const normalizedObservations = record?.observations ?? parsedItems?.observations ?? null;
  const normalizedType = String(record?.type ?? parsedItems?.type ?? "simples");

  return {
    ...record,
    content: normalizedContent,
    observations: normalizedObservations,
    type: normalizedType,
  };
}
function normalizeMediaUrl(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("data:")) {
    return raw;
  }
  return raw.startsWith("/") ? raw : `/${raw}`;
}

type DefaultAnamnesisQuestion = {
  id: string;
  text: string;
  type: "text" | "radio" | "checkbox" | "select";
  options?: string[];
  required?: boolean;
  placeholder?: string;
  followUp?: {
    prompt: string;
    triggerValues: string[];
    required?: boolean;
    placeholder?: string;
  };
  visibleWhen?: {
    questionId: string;
    values: string[];
  };
};

const DEFAULT_ANAMNESIS_QUESTIONS: DefaultAnamnesisQuestion[] = [
  { id: "sexo-biologico", text: "Sexo biológico", type: "radio", options: ["Masculino", "Feminino"], required: true },
  { id: "genero", text: "Gênero (como você se identifica?)", type: "radio", options: ["Igual ao sexo biológico", "Discordante do sexo biológico (pacientes trans, por exemplo)"], required: true },
  { id: "estado-civil", text: "Estado civil", type: "text", required: true, placeholder: "Informe o estado civil" },
  { id: "profissao", text: "Profissão", type: "text", required: true, placeholder: "Informe a profissão" },
  { id: "cidade-estado", text: "Cidade e estado em que mora", type: "text", required: true, placeholder: "Ex: Mogi Guaçu - SP" },
  { id: "peso", text: "Peso atual aproximado em kg", type: "text", required: true, placeholder: "Ex: 62" },
  { id: "altura", text: "Sua estatura aproximada (em metros)", type: "text", required: true, placeholder: "Ex: 1,67" },
  { id: "alergia", text: "Tem alergia a algum medicamento, alimento ou substância?", type: "radio", options: ["Sim", "Não"], required: true, followUp: { prompt: "Qual alergia é essa?", triggerValues: ["Sim"], required: true, placeholder: "Descreva a alergia" } },
  { id: "fumante", text: "É fumante?", type: "radio", options: ["Sim", "Não"], required: true },
  { id: "alcool", text: "Consome bebida alcoólica?", type: "radio", options: ["Sim, muito e com frequência", "Bebo pouco, socialmente", "Não bebo"], required: true },
  { id: "droga", text: "Usa alguma droga ilícita?", type: "radio", options: ["Sim", "Não"], required: true, followUp: { prompt: "Qual droga?", triggerValues: ["Sim"], required: true, placeholder: "Informe qual droga" } },
  { id: "hormonio", text: "Usa algum tipo de hormônio?", type: "radio", options: ["Sim", "Não"], required: true, followUp: { prompt: "Quais hormônios?", triggerValues: ["Sim"], required: true, placeholder: "Informe quais hormônios" } },
  { id: "anticoagulante", text: "Faz uso de anticoagulante? (ou AAS?)", type: "radio", options: ["Sim", "Não"], required: true },
  { id: "vitamina-d", text: "Toma vitamina D? Qual a dose e em que frequência?", type: "text", required: true, placeholder: "Descreva a dose e frequência" },
  { id: "medicamentos", text: "Faz uso de medicamentos regularmente?", type: "radio", options: ["Sim", "Não"], required: true, followUp: { prompt: "Liste todos os medicamentos de uso regular", triggerValues: ["Sim"], required: true, placeholder: "Informe os medicamentos" } },
  { id: "problemas-saude", text: "Selecione os problemas de saúde que tem atualmente", type: "checkbox", options: ["Nenhum problema de saúde", "Diabetes", "Pressão alta", "Problemas no coração ou arritmias", "Problema nos rins ou no fígado", "Tumores", "Alterações psiquiátricas", "Outros problemas de saúde"], required: true, followUp: { prompt: "Se marcou outros problemas de saúde, escreva quais", triggerValues: ["Outros problemas de saúde"], required: true, placeholder: "Descreva os outros problemas" } },
  { id: "gestacoes", text: "Teve gestações? Se sim, quando foi o último parto?", type: "text", required: true, placeholder: "Descreva", visibleWhen: { questionId: "sexo-biologico", values: ["Feminino"] } },
  { id: "anticoncepcional", text: "Usa método anticoncepcional? Qual?", type: "text", required: true, placeholder: "Descreva o método", visibleWhen: { questionId: "sexo-biologico", values: ["Feminino"] } },
  { id: "cicatrizacao", text: "Já teve problemas de cicatrização, como queloides?", type: "radio", options: ["Sim", "Não"], required: true },
  { id: "anestesia", text: "Já teve alguma reação ruim com anestesia?", type: "radio", options: ["Sim", "Não"], required: true },
  { id: "hemorragia", text: "Já teve alguma hemorragia? (como evacuar ou vomitar sangue?)", type: "radio", options: ["Sim", "Não"], required: true },
  { id: "atividade-fisica", text: "Realiza atividade física regular?", type: "radio", options: ["Sim, três ou mais vezes por semana", "Não realizo com frequência"], required: true, followUp: { prompt: "Se sim, diga qual atividade física realiza", triggerValues: ["Sim, três ou mais vezes por semana"], required: true, placeholder: "Descreva a atividade física" } },
  { id: "dor", text: "Você é muito sensível à dor (sente dor com facilidade ou frequentemente)?", type: "radio", options: ["Sim", "Não"], required: true },
  { id: "trombose", text: "Já teve trombose, embolia ou AVC?", type: "radio", options: ["Sim", "Não"], required: true },
  { id: "arritmia", text: "Já teve ou trata arritmia cardíaca?", type: "radio", options: ["Sim", "Não"], required: true },
  { id: "pedras-rins", text: "Tem ou já teve pedras nos rins?", type: "radio", options: ["Sim", "Não"], required: true },
  { id: "cirurgia", text: "Já realizou alguma cirurgia?", type: "radio", options: ["Sim", "Não"], required: true, followUp: { prompt: "Quais cirurgias realizou?", triggerValues: ["Sim"], required: true, placeholder: "Descreva as cirurgias" } },
  { id: "informar-medico", text: "Há algo que gostaria de informar ao médico?", type: "text", required: true, placeholder: "Escreva aqui" },
];

function getDefaultAnamnesisDefinition(_patient: any) {
  return {
    name: "Anamnese inicial",
    questions: DEFAULT_ANAMNESIS_QUESTIONS,
  };
}

function canViewAnamnesisAnswers(role?: string | null) {
  return role === "admin" || role === "medico" || role === "enfermeiro";
}

function buildAnamnesisWhatsappMessage(patientName: string, shareUrl: string) {
  return [
    `Olá, ${patientName}.`,
    "",
    "A Clínica Glutée solicita o preenchimento da sua anamnese antes do atendimento.",
    "Esse preenchimento ajuda a agilizar a consulta e aumentar a segurança clínica.",
    "",
    `Clique aqui para preencher: ${shareUrl}`,
  ].join("\n");
}

function buildAppointmentReminderWhatsappMessage(params: {
  patientName: string;
  scheduledAt: string | Date;
  doctorName?: string | null;
  room?: string | null;
  anamnesisLink?: string | null;
}) {
  const date = new Date(params.scheduledAt);
  const dateLabel = date.toLocaleDateString("pt-BR");
  const timeLabel = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const lines = [
    `Olá, ${params.patientName}.`,
    "",
    `Lembrete da sua consulta na Clínica Glutée para ${dateLabel} às ${timeLabel}.`,
  ];

  if (params.doctorName) {
    lines.push(`Profissional: ${params.doctorName}`);
  }
  if (params.room) {
    lines.push(`Sala: ${params.room}`);
  }

  lines.push("", "Se precisar, responda esta mensagem para confirmar ou solicitar ajuste.");

  if (params.anamnesisLink) {
    lines.push("", "Antes do atendimento, pedimos também o preenchimento da anamnese:", params.anamnesisLink);
  }

  return lines.join("\n");
}

type TussCatalogEntry = {
  code: string;
  name: string;
  description?: string;
};

let tussCatalogCache: TussCatalogEntry[] | null = null;
let tussCatalogPromise: Promise<TussCatalogEntry[]> | null = null;

function normalizeSearchText(value?: string | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

async function loadTussCatalog() {
  if (tussCatalogCache) {
    return tussCatalogCache;
  }

  if (!tussCatalogPromise) {
    tussCatalogPromise = fs.promises
      .readFile(path.resolve(process.cwd(), "tuss22_data.json"), "utf-8")
      .then((raw) => JSON.parse(raw) as TussCatalogEntry[])
      .then((rows) =>
        rows.filter((row) => row?.code && row?.name).map((row) => ({
          code: String(row.code).trim(),
          name: String(row.name).trim(),
          description: String(row.description ?? "").trim(),
        })),
      )
      .catch(() => [])
      .finally(() => {
        tussCatalogPromise = null;
      });
  }

  tussCatalogCache = await tussCatalogPromise;
  return tussCatalogCache;
}

function inferExtensionFromMimeType(mimeType?: string | null) {
  const normalized = String(mimeType ?? "").toLowerCase();
  if (normalized.includes("pdf")) return "pdf";
  if (normalized.includes("msword")) return "doc";
  if (normalized.includes("wordprocessingml")) return "docx";
  if (normalized.includes("excel")) return "xls";
  if (normalized.includes("spreadsheetml")) return "xlsx";
  if (normalized.includes("zip")) return "zip";
  if (normalized.includes("text/plain")) return "txt";
  if (normalized.includes("mp4")) return "mp4";
  if (normalized.includes("quicktime") || normalized.includes("mov")) return "mov";
  if (normalized.includes("webm")) return "webm";
  if (normalized.includes("png")) return "png";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("gif")) return "gif";
  if (normalized.includes("heic")) return "heic";
  return "jpg";
}

function inferMediaType(mimeType?: string | null, filePath?: string | null) {
  const normalizedMimeType = String(mimeType ?? "").toLowerCase();
  const normalizedPath = String(filePath ?? "").toLowerCase();
  if (normalizedMimeType.startsWith("video/")) return "video";
  if (normalizedPath.endsWith(".mp4") || normalizedPath.endsWith(".mov") || normalizedPath.endsWith(".webm")) {
    return "video";
  }
  return "image";
}

let ffmpegAvailability: boolean | null = null;

function hasFfmpeg() {
  if (ffmpegAvailability !== null) {
    return ffmpegAvailability;
  }

  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    ffmpegAvailability = true;
  } catch {
    ffmpegAvailability = false;
  }

  return ffmpegAvailability;
}

function maybeOptimizeVideo(absolutePath: string, mimeType?: string | null, shouldOptimize: boolean = false) {
  if (inferMediaType(mimeType, absolutePath) !== "video") {
    return { absolutePath, mimeType: mimeType ?? "image/jpeg" };
  }

  if (!shouldOptimize || !hasFfmpeg()) {
    return { absolutePath, mimeType: mimeType ?? "video/mp4" };
  }

  const optimizedPath = absolutePath.replace(/\.[^.]+$/, ".mp4");

  try {
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-i",
        absolutePath,
        "-vf",
        "scale=1280:-2:force_original_aspect_ratio=decrease",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "30",
        "-movflags",
        "+faststart",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        optimizedPath,
      ],
      { stdio: "ignore" },
    );

    if (fs.existsSync(optimizedPath)) {
      if (optimizedPath !== absolutePath && fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
      return { absolutePath: optimizedPath, mimeType: "video/mp4" };
    }
  } catch {
    // Keep original file when optimization is unavailable or fails.
  }

  return { absolutePath, mimeType: mimeType ?? "video/mp4" };
}

function savePatientMediaToPublicDir(
  patientId: number,
  base64: string,
  mimeType?: string | null,
  sourceFolder: "manual" | "patient-submissions" = "manual",
) {
  const extension = inferExtensionFromMimeType(mimeType);
  const relativeDir = path.join("imports", sourceFolder, `patient-${patientId}`);
  const absoluteDir = path.resolve(process.cwd(), "public", relativeDir);
  fs.mkdirSync(absoluteDir, { recursive: true });

  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
  const initialAbsolutePath = path.join(absoluteDir, fileName);
  fs.writeFileSync(initialAbsolutePath, Buffer.from(base64, "base64"));

  const optimized = maybeOptimizeVideo(
    initialAbsolutePath,
    mimeType,
    sourceFolder === "patient-submissions",
  );
  const finalAbsolutePath = optimized.absolutePath;
  const finalFileName = path.basename(finalAbsolutePath);

  return {
    photoUrl: normalizeMediaUrl(path.posix.join("/", relativeDir.replace(/\\/g, "/"), finalFileName)),
    photoKey: path.posix.join(relativeDir.replace(/\\/g, "/"), finalFileName),
    mimeType: optimized.mimeType,
    mediaType: inferMediaType(optimized.mimeType, finalAbsolutePath),
  };
}

function normalizePhotoRow(row: any) {
  return {
    ...row,
    photoUrl: normalizeMediaUrl(row.photoUrl),
    thumbnailUrl: normalizeMediaUrl(row.thumbnailUrl ?? row.photoUrl),
    mediaType: row.mediaType ?? inferMediaType(row.mimeType, row.photoUrl ?? row.photoKey),
  };
}

const CLINICAL_DOCUMENT_METADATA_PREFIX = "__GLUTEC_CLINICAL_DOC__:";

function parseClinicalDocumentMetadata(description?: string | null) {
  const raw = String(description ?? "").trim();
  if (!raw.startsWith(CLINICAL_DOCUMENT_METADATA_PREFIX)) return null;
  try {
    return JSON.parse(raw.slice(CLINICAL_DOCUMENT_METADATA_PREFIX.length));
  } catch {
    return null;
  }
}

function serializeClinicalDocumentMetadata(metadata: Record<string, unknown>) {
  return `${CLINICAL_DOCUMENT_METADATA_PREFIX}${JSON.stringify(metadata)}`;
}

function resolveStoredTextDocumentContent(row: any) {
  const metadata = parseClinicalDocumentMetadata(row?.description);
  if (typeof metadata?.content === "string" && metadata.content.trim()) return metadata.content;

  const fileReference = String(row?.fileKey ?? row?.fileUrl ?? "").replace(/^\/+/, "").trim();
  const mimeType = String(row?.mimeType ?? "").toLowerCase();
  if (!fileReference || !(mimeType.includes("text/plain") || mimeType.includes("text/html") || /\.(?:txt|html?)$/i.test(fileReference))) {
    return "";
  }

  const publicRoot = path.resolve(process.cwd(), "public");
  const absolutePath = path.resolve(publicRoot, fileReference.replace(/^public[\\/]/i, ""));
  if (!absolutePath.startsWith(publicRoot)) return "";

  try {
    if (!fs.existsSync(absolutePath)) return "";
    return fs.readFileSync(absolutePath, "utf8");
  } catch {
    return "";
  }
}

function summarizeClinicalDocumentContent(content?: string | null) {
  return String(content ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function extractLegacyProntuarioVerdeStorageKey(value?: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "";

  const normalized = text.replace(/\\/g, "/");
  const legacyKey = normalized.match(/legacy\/verde\/([^\s"'<>]+?\.(?:pdf|docx?|jpe?g|png|txt|html?))/i);
  if (legacyKey?.[1]) return `legacy/verde/${legacyKey[1].replace(/^\/+/, "")}`;

  const oldPath = normalized.match(/prontuarioverde-documentos[;/]+(?:\d+\/)?(\d+)\/documentos\/([^\s"'<>;,]+?\.(?:pdf|docx?|jpe?g|png|txt|html?))/i);
  if (oldPath?.[1] && oldPath?.[2]) {
    return `legacy/verde/${oldPath[1]}/documentos/${oldPath[2]}`;
  }

  return "";
}

function extractStorageKeyFromUrl(value?: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const legacy = extractLegacyProntuarioVerdeStorageKey(text);
  if (legacy) return legacy;

  try {
    const parsed = new URL(text);
    const pathname = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    const bucketPrefix = "glutec-clinica/";
    if (pathname.startsWith(bucketPrefix)) return pathname.slice(bucketPrefix.length);
    if (pathname.startsWith("legacy/verde/")) return pathname;
  } catch {
    // Not an absolute URL.
  }

  const cleaned = text.replace(/^\/+/, "").replace(/^public[\/]/i, "");
  if (/^(imports|uploads|legacy\/verde)\//i.test(cleaned)) return cleaned;
  return "";
}

function extractDocumentFileReference(row: any) {
  const values = [
    row?.fileUrl,
    row?.fileKey,
    row?.url,
    row?.storageKey,
    row?.path,
    row?.originalPath,
    row?.description,
    row?.name,
  ];

  for (const value of values) {
    const text = String(value ?? "").trim();
    if (!text) continue;
    const legacyKey = extractLegacyProntuarioVerdeStorageKey(text);
    if (legacyKey) return legacyKey;
    if (/^(https?:|data:|\/).+\.(pdf|docx?|jpe?g|png|txt|html?)$/i.test(text)) return text;

    const markerMatch = text.match(/arquivo original:\s*([^\n]+?\.(?:pdf|docx?|jpe?g|png|txt|html?))/i);
    if (markerMatch?.[1]) return markerMatch[1].trim();

    const knownPathMatch = text.match(/((?:prontuarioverde|imports|uploads|patient-documents|documents|legacy\/verde)[a-z0-9_;\-\/. ]+\.(?:pdf|docx?|jpe?g|png|txt|html?))/i);
    if (knownPathMatch?.[1]) return knownPathMatch[1].trim();

    const genericPathMatch = text.match(/([a-z0-9_-]+(?:\/[a-z0-9_. -]+)+\.(?:pdf|docx?|jpe?g|png|txt|html?))/i);
    if (genericPathMatch?.[1]) return genericPathMatch[1].trim();
  }

  return "";
}

function normalizeDocumentStorageKey(row: any, fileReference = extractDocumentFileReference(row)) {
  return extractStorageKeyFromUrl(row?.fileKey)
    || extractStorageKeyFromUrl(row?.storageKey)
    || extractStorageKeyFromUrl(row?.fileUrl)
    || extractStorageKeyFromUrl(fileReference);
}

function buildPatientDocumentDownloadUrl(row: any, fileReference: string, storageKey: string) {
  if (row?.id && (storageKey || fileReference)) return `/api/patient-documents/${row.id}/download`;
  return normalizeMediaUrl(fileReference);
}

function normalizeDocumentRow(row: any) {
  const fileReference = extractDocumentFileReference(row);
  const storageKey = normalizeDocumentStorageKey(row, fileReference);
  const fileUrl = buildPatientDocumentDownloadUrl(row, fileReference, storageKey);
  const metadata = parseClinicalDocumentMetadata(row?.description);
  const content = resolveStoredTextDocumentContent({ ...row, fileKey: storageKey || row?.fileKey, fileUrl });
  const summary = metadata?.summary || summarizeClinicalDocumentContent(content) || row?.description || "";
  return {
    ...row,
    fileKey: storageKey || row?.fileKey,
    fileUrl,
    url: fileUrl,
    rawFileUrl: row?.fileUrl ?? null,
    rawDescription: row?.description ?? null,
    description: summary,
    content,
    templateGroup: typeof metadata?.templateGroup === "string" ? metadata.templateGroup : null,
    signedAt: metadata?.signedAt ?? row?.signedAt ?? null,
    signedByName: metadata?.signedByName ?? row?.signedByName ?? null,
    signatureProvider: metadata?.signatureProvider ?? row?.signatureProvider ?? null,
    signatureValidationCode: metadata?.signatureValidationCode ?? row?.signatureValidationCode ?? null,
  };
}

function normalizeDocumentKeyPart(value?: string | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function inferContractDocumentKind(document: any) {
  const haystack = normalizeDocumentKeyPart([document?.name, document?.description, document?.type].filter(Boolean).join(" "));
  if (haystack.includes("contrato")) return "contrato";
  if (haystack.includes("termo")) return "termo";
  return String(document?.type || "documento").toLowerCase();
}

function extractDocumentDateKey(document: any) {
  const source = [document?.name, document?.description, document?.createdAt].filter(Boolean).join(" ");
  const iso = source.match(/\b(20\d{2})[-_/](\d{1,2})[-_/](\d{1,2})\b/);
  if (iso) return iso[1] + "-" + iso[2].padStart(2, "0") + "-" + iso[3].padStart(2, "0");

  const br = source.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/);
  if (br) {
    const year = br[3].length === 2 ? "20" + br[3] : br[3];
    return year + "-" + br[2].padStart(2, "0") + "-" + br[1].padStart(2, "0");
  }

  if (document?.createdAt) {
    const date = new Date(document.createdAt);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }

  return "sem-data";
}

function contractDocumentDedupKey(document: any) {
  const type = String(document?.type || "").toLowerCase();
  if (type !== "contrato" && type !== "termo") return "documento:" + document?.id;

  const patientId = String(document?.patientId ?? "sem-paciente");
  const kind = inferContractDocumentKind(document);
  const dateKey = extractDocumentDateKey(document);
  const source = String(document?.sourceSystem || "importado").toLowerCase();
  return [patientId, source, kind, dateKey].join(":");
}

function documentAvailabilityScore(document: any) {
  let score = 0;
  if (document?.fileUrl || document?.url) score += 1000;
  if (document?.fileKey) score += 300;
  if (Number(document?.fileSize || 0) > 0) score += 100;
  if (document?.mimeType === "application/pdf") score += 20;
  if (document?.sourceSystem === "prontuario_verde") score += 5;
  score += Number(document?.id || 0) / 1000000;
  return score;
}

function isContractOrTermDocument(document: any) {
  const type = String(document?.type || "").toLowerCase();
  return type === "contrato" || type === "termo";
}

function hasDownloadableDocumentFile(document: any) {
  return Boolean(document?.fileUrl || document?.url || document?.fileKey);
}

function shouldShowDocumentInPatientLists(document: any) {
  return !isContractOrTermDocument(document) || hasDownloadableDocumentFile(document);
}

function dedupeDocumentsForDisplay(documents: any[]) {
  const byKey = new Map<string, any>();
  for (const document of documents) {
    const key = contractDocumentDedupKey(document);
    const current = byKey.get(key);
    if (!current || documentAvailabilityScore(document) > documentAvailabilityScore(current)) {
      byKey.set(key, document);
    }
  }

  return Array.from(byKey.values()).sort((a, b) => {
    const da = new Date(a?.createdAt ?? 0).getTime();
    const db = new Date(b?.createdAt ?? 0).getTime();
    if (db !== da) return db - da;
    return Number(b?.id || 0) - Number(a?.id || 0);
  });
}

function parseTemplateSections(sections: any) {
  if (Array.isArray(sections)) return sections;
  if (typeof sections === "string" && sections.trim()) {
    try {
      return JSON.parse(sections);
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeTemplateGroup(value?: unknown) {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");

  if (normalized.includes("anamn")) return "anamnese";
  if (normalized.includes("evolu") || normalized.includes("consulta") || normalized.includes("prontuario")) return "evolucao";
  if (normalized.includes("declar")) return "declaracao";
  if (normalized.includes("prescr")) return "prescricao";
  if (normalized.includes("solicitacao") || normalized.includes("pedido de exame") || normalized.includes("exame")) return "solicitacao_exames";
  return "atestado";
}

function getTemplateGroupLabel(group: string) {
  switch (group) {
    case "anamnese": return "Anamnese";
    case "evolucao": return "Evolução";
    case "declaracao": return "Declaração";
    case "prescricao": return "Prescrição";
    case "solicitacao_exames": return "Solicitação de exames";
    default: return "Atestado médico";
  }
}

const DEFAULT_CLINIC_STRUCTURAL_SECTORS = ["Consultório", "Centro Cirúrgico"];
const DEFAULT_PATIENT_ATTACHMENT_FOLDERS = ["Documentos pessoais", "Resultados de exames"];

function normalizeClinicStructuralSectors(input: unknown): string[] {
  const source = Array.isArray(input)
    ? input
    : typeof input === "string" && input.trim()
    ? (() => {
        try {
          const parsed = JSON.parse(input);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return input
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
        }
      })()
    : [];

  const seen = new Set<string>();
  const normalized = source
    .map((item) => normalizePtBrTitleCase(String(item || "").trim()))
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLocaleLowerCase("pt-BR");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return normalized.length ? normalized : [...DEFAULT_CLINIC_STRUCTURAL_SECTORS];
}

function normalizeClinicAttachmentFolders(input: unknown): string[] {
  const source = Array.isArray(input)
    ? input
    : typeof input === "string" && input.trim()
    ? (() => {
        try {
          const parsed = JSON.parse(input);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return input
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
        }
      })()
    : [];

  const seen = new Set<string>();
  const normalized = source
    .map((item) => normalizePtBrTitleCase(String(item || "").trim()))
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLocaleLowerCase("pt-BR");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return normalized.length ? normalized : [...DEFAULT_PATIENT_ATTACHMENT_FOLDERS];
}

function normalizeTemplateRow(row: any) {
  const sections = parseTemplateSections(row.sections);
  const firstSection = Array.isArray(sections) ? sections[0] : null;
  const group = normalizeTemplateGroup([row?.specialty, row?.name, row?.description].filter(Boolean).join(" "));
  return {
    ...row,
    sections,
    group,
    groupLabel: getTemplateGroupLabel(group),
    content:
      firstSection?.content ??
      firstSection?.text ??
      firstSection?.fields?.map?.((field: any) => field.label).join("\n") ??
      "",
  };
}

function latestPatientPhotoUrlExpression(patientAlias = "p") {
  const patientIdRef = sql.raw(`${patientAlias}.id`);
  return sql`(
    select ph.photoUrl
    from patient_photos ph
    where ph.patientId = ${patientIdRef}
      and (
        ph.category = 'perfil'
        or ph.description like 'Foto de perfil enviada na anamnese%'
      )
      and coalesce(ph.mediaType, 'image') <> 'video'
    order by ph.createdAt desc, ph.id desc
    limit 1
  )`;
}

function normalizePatientSexValue(value: unknown, fallback = "nao_informado") {
  const normalized = String(value ?? fallback ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");

  if (["m", "male", "masculino"].includes(normalized)) return "masculino";
  if (["f", "female", "feminino"].includes(normalized)) return "feminino";
  if (["intersexo", "intersex"].includes(normalized)) return "intersexo";
  if (["nao_binario", "non_binary", "nonbinary"].includes(normalized)) return "nao_binario";
  if (["outro", "other"].includes(normalized)) return "outro";
  return fallback || "nao_informado";
}

function normalizeBiologicalSexValue(value: unknown, fallback = "nao_informado") {
  const normalized = normalizePatientSexValue(value, fallback);
  return ["masculino", "feminino", "intersexo"].includes(normalized) ? normalized : "nao_informado";
}

async function getNextPatientRecordNumber(db: any) {
  const rows = unwrapRows<any>(await db.execute(sql`
    select coalesce(max(recordNumber), 0) + 1 as nextRecordNumber
    from patients
  `));
  const nextRecordNumber = Number(rows[0]?.nextRecordNumber ?? 1);
  return Number.isFinite(nextRecordNumber) && nextRecordNumber > 0 ? nextRecordNumber : 1;
}

// --- PATIENTS ----------------------------------------------------------------
export async function listPatients(
  query?: string,
  limit: number = 5000,
  sort: "name_asc" | "name_desc" | "created_desc" | "created_asc" = "name_asc",
) {
  const db = await getDb();
  if (!db) return [];

  const columns = await getTableColumns("patients");
  const normalizedQuery = query?.trim();
  const orderByClause =
    sort === "name_desc"
      ? sql`p.fullName desc`
      : sort === "created_desc"
      ? sql`p.createdAt desc, p.id desc`
      : sort === "created_asc"
      ? sql`p.createdAt asc, p.id asc`
      : sql`p.fullName asc`;

  const searchClauses = normalizedQuery
    ? [
        sql`p.fullName like ${`%${normalizedQuery}%`}`,
        sql`p.cpf like ${`%${normalizedQuery}%`}`,
        sql`p.phone like ${`%${normalizedQuery}%`}`,
      ]
    : [];

  if (normalizedQuery && columns.has("recordNumber") && /^\d+$/.test(normalizedQuery)) {
    searchClauses.push(sql`p.recordNumber = ${Number(normalizedQuery)}`);
  }

  const whereClause = normalizedQuery
    ? sql`
        where coalesce(p.active, 1) <> 0
          and (${sql.join(searchClauses, sql` or `)})
      `
    : sql`where coalesce(p.active, 1) <> 0`;

  const rows = unwrapRows<any>(await db.execute(sql`
    select p.*, ${latestPatientPhotoUrlExpression("p")} as photoUrl
    from patients p
    ${whereClause}
    order by ${orderByClause}
    limit ${limit}
  `));

  return rows.map((row: any) => {
    const addressData = normalizePatientAddressFields(
      parseStoredPatientAddress(row.address),
    );
    const fullName = normalizePtBrTitleCase(row.fullName ?? "");
    const email = normalizeEmailValue(row.email ?? "");
    const city = normalizePatientCity(row.city, addressData.city);
    const state = normalizeStateCode(row.state ?? addressData.state ?? "");
    const zipCode = String(row.zipCode ?? addressData.zip ?? "").trim();

    return {
      ...row,
      fullName,
      name: fullName,
      email,
      zipCode,
      city,
      state,
      neighborhood: addressData.neighborhood ?? "",
      address: addressData.street ?? "",
    };
  });
}

export async function createPatient(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const columns = await getTableColumns("patients");
  const normalizedAddress = normalizePatientAddressFields({
    street: data.address,
    number: data.addressNumber,
    neighborhood: data.neighborhood,
    city: data.city,
    state: data.state,
    zip: data.zipCode,
  });
  const normalizedFullName = normalizePtBrTitleCase(data.fullName);
  const normalizedEmail = normalizeEmailValue(data.email);
  const normalizedEmergencyContactName = normalizePtBrTitleCase(data.emergencyContactName);
  const normalizedGender = normalizePatientSexValue(data.gender);
  const normalizedBiologicalSex = normalizeBiologicalSexValue(data.biologicalSex ?? data.biological_sex ?? data.sex ?? normalizedGender);

  const addressJson = JSON.stringify({
    street: normalizedAddress.street,
    number: normalizedAddress.number,
    neighborhood: normalizedAddress.neighborhood,
    city: normalizedAddress.city,
    state: normalizedAddress.state,
    zip: normalizedAddress.zip,
  });

  const payload: Record<string, unknown> = {};
  const setColumn = (column: string, value: unknown) => {
    if (columns.has(column)) payload[column] = value;
  };

  setColumn("fullName", normalizedFullName);
  setColumn("name", normalizedFullName);
  setColumn("cpf", data.cpf || null);
  setColumn("birthDate", data.birthDate || null);
  setColumn("gender", normalizedGender);
  setColumn("biologicalSex", normalizedBiologicalSex);
  setColumn("phone", data.phone || null);
  setColumn("email", nullableOrNull(normalizedEmail));
  setColumn("address", addressJson);
  setColumn("addressNumber", nullableOrNull(normalizedAddress.number));
  setColumn("neighborhood", nullableOrNull(normalizedAddress.neighborhood));
  setColumn("city", nullableOrNull(normalizedAddress.city));
  setColumn("state", nullableOrNull(normalizedAddress.state));
  setColumn("zipCode", nullableOrNull(normalizedAddress.zip));
  setColumn("rg", data.rg || null);
  setColumn("bloodType", normalizeStoredBloodType(data.bloodType));
  setColumn("allergies", data.allergies || null);
  setColumn("chronicConditions", data.chronicConditions || null);
  setColumn("insuranceName", data.insuranceName || null);
  setColumn("insuranceNumber", data.insuranceNumber || null);
  setColumn("healthInsurance", data.insuranceName || null);
  setColumn("healthInsuranceNumber", data.insuranceNumber || null);
  setColumn("emergencyContactName", nullableOrNull(normalizedEmergencyContactName));
  setColumn("emergencyContactPhone", data.emergencyContactPhone || null);
  setColumn("active", true);
  setColumn("createdBy", userId);
  if (columns.has("recordNumber")) {
    setColumn("recordNumber", await getNextPatientRecordNumber(db));
  }

  const entries = Object.entries(payload);
  if (entries.length === 0) throw new Error("Tabela de pacientes sem colunas validas para cadastro.");

  const result = await db.execute(sql`
    INSERT INTO patients (
      ${sql.join(entries.map(([key]) => sql.raw(`\`${key}\``)), sql`, `)}
    ) VALUES (
      ${sql.join(entries.map(([, value]) => sql`${value}`), sql`, `)}
    )
  `);

  const insertId = (result as any)?.[0]?.insertId ?? (result as any)?.insertId;
  if (!insertId) return { id: null, fullName: normalizedFullName };

  return (await getPatientById(Number(insertId))) ?? { id: insertId, fullName: normalizedFullName };
}

export async function getPatientById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const rows = unwrapRows<any>(await db.execute(sql`
    select p.*, ${latestPatientPhotoUrlExpression("p")} as photoUrl
    from patients p
    where p.id = ${id}
    limit 1
  `));

  const row = rows[0];
  if (!row) return null;

  const addressData = normalizePatientAddressFields(parseStoredPatientAddress(row.address));
  const fullName = normalizePtBrTitleCase(row.fullName ?? "");
  const email = normalizeEmailValue(row.email ?? "");
  const city = normalizePatientCity(row.city, addressData.city);
  const state = normalizeStateCode(row.state ?? addressData.state ?? "");
  const zipCode = String(row.zipCode ?? addressData.zip ?? "").trim();
  const emergencyContactName = normalizePtBrTitleCase(row.emergencyContactName ?? "");

  return {
    ...row,
    fullName,
    name: fullName,
    email,
    zipCode,
    city,
    state,
    neighborhood: addressData.neighborhood ?? "",
    address: addressData.street ?? "",
    addressNumber: addressData.number ?? "",
    emergencyContactName,
    // Compat: schema legado tinha healthInsurance/healthInsuranceNumber
    insuranceName: row.insuranceName ?? row.healthInsurance ?? null,
    insuranceNumber: row.insuranceNumber ?? row.healthInsuranceNumber ?? null,
  };
}

export async function updatePatient(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // Reconstr?i o JSON do endere?o preservando o que não veio no payload
  const existing = await getPatientById(id);
  if (!existing) throw new Error("Paciente não encontrado.");

  const normalizedAddress = normalizePatientAddressFields({
    street: data.address ?? existing.address ?? "",
    number: data.addressNumber ?? existing.addressNumber ?? "",
    neighborhood: data.neighborhood ?? existing.neighborhood ?? "",
    city: isLegacyNumericCityCode(data.city ?? existing.city) ? existing.city || "" : data.city ?? existing.city ?? "",
    state: data.state ?? existing.state ?? "",
    zip: data.zipCode ?? existing.zipCode ?? "",
  });
  const normalizedFullName = normalizePtBrTitleCase(data.fullName ?? existing.fullName ?? "");
  const normalizedEmail = normalizeEmailValue(data.email ?? existing.email ?? "");
  const normalizedEmergencyContactName = normalizePtBrTitleCase(
    data.emergencyContactName ?? existing.emergencyContactName ?? "",
  );

  const addressJson = JSON.stringify({
    street: normalizedAddress.street,
    number: normalizedAddress.number,
    neighborhood: normalizedAddress.neighborhood,
    city: normalizedAddress.city,
    state: normalizedAddress.state,
    zip: normalizedAddress.zip,
  });

  const columns = await getTableColumns("patients");
  const payload: Record<string, unknown> = {};
  const setColumn = (column: string, value: unknown) => {
    if (columns.has(column)) payload[column] = value;
  };

  setColumn("fullName", normalizedFullName);
  setColumn("name", normalizedFullName);
  setColumn("cpf", data.cpf ?? existing.cpf ?? null);
  setColumn("birthDate", data.birthDate ?? existing.birthDate ?? null);
  setColumn("gender", normalizePatientSexValue(data.gender ?? existing.gender ?? "nao_informado"));
  setColumn("biologicalSex", normalizeBiologicalSexValue(data.biologicalSex ?? existing.biologicalSex ?? existing.gender ?? "nao_informado"));
  setColumn("phone", data.phone ?? existing.phone ?? null);
  setColumn("email", nullableOrNull(normalizedEmail));
  setColumn("address", addressJson);
  setColumn("addressNumber", nullableOrNull(normalizedAddress.number));
  setColumn("neighborhood", nullableOrNull(normalizedAddress.neighborhood));
  setColumn("city", nullableOrNull(normalizedAddress.city));
  setColumn("state", nullableOrNull(normalizedAddress.state));
  setColumn("zipCode", nullableOrNull(normalizedAddress.zip));
  setColumn("rg", data.rg ?? existing.rg ?? null);
  setColumn("bloodType", normalizeStoredBloodType(data.bloodType ?? existing.bloodType));
  setColumn("allergies", data.allergies ?? existing.allergies ?? null);
  setColumn("chronicConditions", data.chronicConditions ?? existing.chronicConditions ?? null);

  const insuranceName = data.insuranceName ?? existing.insuranceName ?? existing.healthInsurance ?? null;
  const insuranceNumber = data.insuranceNumber ?? existing.insuranceNumber ?? existing.healthInsuranceNumber ?? null;
  setColumn("insuranceName", insuranceName);
  setColumn("insuranceNumber", insuranceNumber);
  setColumn("healthInsurance", insuranceName);
  setColumn("healthInsuranceNumber", insuranceNumber);
  setColumn("emergencyContactName", nullableOrNull(normalizedEmergencyContactName));
  setColumn("emergencyContactPhone", data.emergencyContactPhone ?? existing.emergencyContactPhone ?? null);

  const setClauses = Object.entries(payload).map(([key, value]) => sql`${sql.raw(`\`${key}\``)} = ${value}`);
  if (columns.has("updatedAt")) {
    setClauses.push(sql`${sql.raw("`updatedAt`")} = NOW()`);
  }

  if (setClauses.length === 0) {
    return { id, fullName: normalizedFullName };
  }

  await db.execute(sql`
    UPDATE patients
    SET ${sql.join(setClauses, sql`, `)}
    WHERE id = ${id}
  `);

  return { id, fullName: normalizedFullName };
}

export async function deletePatient(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  await db.execute(sql`
    update patients
    set active = 0, updatedAt = now()
    where id = ${id}
  `);

  return { success: true };
}

type AppointmentCancellationSource = "clinica" | "paciente" | "sistema";

const APPOINTMENT_CANCELLATION_LABELS: Record<AppointmentCancellationSource, string> = {
  clinica: "Agendamento cancelado pela clínica",
  paciente: "Agendamento cancelado pelo paciente",
  sistema: "Agendamento cancelado pelo sistema",
};

function buildAppointmentCancellationReason(
  cancelledBy: AppointmentCancellationSource,
  note?: string | null,
) {
  const happenedAt = new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
  const label = APPOINTMENT_CANCELLATION_LABELS[cancelledBy] ?? APPOINTMENT_CANCELLATION_LABELS.clinica;
  const normalizedNote = String(note ?? "").trim();

  return normalizedNote
    ? `${label} em ${happenedAt}. Observação: ${normalizedNote}`
    : `${label} em ${happenedAt}.`;
}

function normalizeAppointmentDedupeText(value: unknown) {
  return String(value ?? "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function appointmentDedupeKey(row: any) {
  const date = new Date(row?.scheduledAt);
  const scheduledKey = Number.isNaN(date.getTime())
    ? normalizeAppointmentDedupeText(row?.scheduledAt)
    : date.toISOString();

  return [
    normalizeAppointmentDedupeText(row?.patientName) || row?.patientId,
    normalizeAppointmentDedupeText(row?.doctorName) || row?.doctorId,
    scheduledKey,
  ].join("|");
}

const APPOINTMENT_STATUS_PRIORITY: Record<string, number> = {
  cancelada: 7,
  concluida: 6,
  em_atendimento: 5,
  confirmada: 4,
  agendada: 3,
  falta: 2,
};

function appointmentStatusPriority(row: any) {
  return APPOINTMENT_STATUS_PRIORITY[normalizeAppointmentDedupeText(row?.status)] ?? 0;
}

function appointmentUpdatedTime(row: any) {
  const date = new Date(row?.updatedAt || row?.createdAt || row?.scheduledAt || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function appointmentMetadataScore(row: any) {
  return [row?.patientName, row?.patientPhone, row?.patientEmail, row?.doctorName, row?.notes, row?.cancelReason, row?.room]
    .reduce((score, value) => score + String(value ?? "").trim().length, 0);
}

function shouldReplaceDisplayAppointment(current: any, candidate: any) {
  const currentStatus = appointmentStatusPriority(current);
  const candidateStatus = appointmentStatusPriority(candidate);
  if (candidateStatus !== currentStatus) return candidateStatus > currentStatus;

  const candidateUpdated = appointmentUpdatedTime(candidate);
  const currentUpdated = appointmentUpdatedTime(current);
  if (candidateUpdated !== currentUpdated) return candidateUpdated > currentUpdated;

  const candidateScore = appointmentMetadataScore(candidate);
  const currentScore = appointmentMetadataScore(current);
  if (candidateScore !== currentScore) return candidateScore > currentScore;

  return Number(candidate?.id ?? 0) > Number(current?.id ?? 0);
}

function dedupeAppointmentsForDisplay(rows: any[]) {
  const byKey = new Map<string, any>();

  for (const row of rows) {
    const key = appointmentDedupeKey(row);
    const current = byKey.get(key);
    if (!current || shouldReplaceDisplayAppointment(current, row)) {
      byKey.set(key, row);
    }
  }

  return Array.from(byKey.values());
}
// --- APPOINTMENTS ------------------------------------------------------------
export async function createAppointment(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const scheduledAt = new Date(data.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) {
    throw new Error("Data e hora do agendamento inválidas.");
  }

  const duration = Math.max(5, Number(data.durationMinutes || data.duration || 30));
  const endsAt = new Date(scheduledAt.getTime() + duration * 60 * 1000);
  const room = String(data.room ?? "").trim();

  if (!room) {
    throw new Error("Selecione onde o atendimento acontecerá.");
  }

  const conflictingBlocks = unwrapRows<any>(await db.execute(sql`
    select *
    from appointment_blocks
    where active = true
      and startsAt < ${endsAt}
      and endsAt > ${scheduledAt}
      and (room is null or room = ${room})
      and (doctorId is null or doctorId = ${data.doctorId})
    limit 1
  `));

  if (conflictingBlocks[0]) {
    throw new Error("Existe um bloqueio de agenda para este período.");
  }

  const conflictingAppointments = unwrapRows<any>(await db.execute(sql`
    select *
    from appointments
    where status not in ('cancelada', 'falta')
      and room = ${room}
      and scheduledAt < ${endsAt}
      and date_add(scheduledAt, interval duration minute) > ${scheduledAt}
    limit 1
  `));

  if (conflictingAppointments[0]) {
    throw new Error("Já existe um agendamento nesta sala para o horário informado.");
  }

  const result = await db.execute(sql`
    insert into appointments (
      patientId,
      doctorId,
      scheduledAt,
      duration,
      type,
      status,
      notes,
      room,
      createdBy
    ) values (
      ${data.patientId},
      ${data.doctorId},
      ${scheduledAt},
      ${duration},
      ${data.type ?? "consulta"},
      'agendada',
      ${data.notes ?? null},
      ${room},
      ${userId}
    )
  `);

  const insertedId =
    typeof result[0] === "number"
      ? result[0]
      : result[0]?.insertId ?? result[0]?.id;

  const rows = unwrapRows<any>(await db.execute(sql`
    select *
    from appointments
    where id = ${insertedId}
    limit 1
  `));

  return rows[0] ?? { success: true };
}

export async function updateAppointment(appointmentId: number, data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const scheduledAt = new Date(data.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) {
    throw new Error("Data e hora do agendamento inválidas.");
  }

  const duration = Math.max(5, Number(data.durationMinutes || data.duration || 30));
  const endsAt = new Date(scheduledAt.getTime() + duration * 60 * 1000);
  const room = String(data.room ?? "").trim();

  if (!room) {
    throw new Error("Selecione onde o atendimento acontecerá.");
  }

  const currentRows = unwrapRows<any>(await db.execute(sql`
    select *
    from appointments
    where id = ${appointmentId}
    limit 1
  `));

  if (!currentRows[0]) {
    throw new Error("Agendamento não encontrado.");
  }

  const conflictingBlocks = unwrapRows<any>(await db.execute(sql`
    select *
    from appointment_blocks
    where active = true
      and startsAt < ${endsAt}
      and endsAt > ${scheduledAt}
      and (room is null or room = ${room})
      and (doctorId is null or doctorId = ${data.doctorId})
    limit 1
  `));

  if (conflictingBlocks[0]) {
    throw new Error("Existe um bloqueio de agenda para este período.");
  }

  const conflictingAppointments = unwrapRows<any>(await db.execute(sql`
    select *
    from appointments
    where id <> ${appointmentId}
      and status not in ('cancelada', 'falta')
      and room = ${room}
      and scheduledAt < ${endsAt}
      and date_add(scheduledAt, interval duration minute) > ${scheduledAt}
    limit 1
  `));

  if (conflictingAppointments[0]) {
    throw new Error("Não é possível agendar neste horário porque este local já está ocupado.");
  }

  await db.execute(sql`
    update appointments
    set
      patientId = ${data.patientId},
      doctorId = ${data.doctorId},
      scheduledAt = ${scheduledAt},
      duration = ${duration},
      type = ${data.type ?? "consulta"},
      notes = ${data.notes ?? null},
      room = ${room},
      updatedAt = NOW()
    where id = ${appointmentId}
  `);

  const rows = unwrapRows<any>(await db.execute(sql`
    select *
    from appointments
    where id = ${appointmentId}
    limit 1
  `));

  return rows[0] ?? { success: true };
}

export async function getAppointmentsByDateRange(from: string, to: string) {
  const db = await getDb();
  if (!db) return [];

  const rows = unwrapRows<any>(await db.execute(sql`
    select
      a.*,
      p.fullName as patientName,
      p.phone as patientPhone,
      p.email as patientEmail,
      u.name as doctorName,
      u.role as doctorRole,
      u.specialty as doctorSpecialty
    from appointments a
    left join patients p on p.id = a.patientId
    left join users u on u.id = a.doctorId
    where a.scheduledAt >= ${from}
      and a.scheduledAt <= ${to}
    order by a.scheduledAt asc
  `));

  return dedupeAppointmentsForDisplay(rows);
}

export async function updateAppointmentStatus(
  appointmentId: number,
  data: {
    status: string;
    cancelledBy?: AppointmentCancellationSource;
    note?: string;
  },
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const currentRows = unwrapRows<any>(await db.execute(sql`
    select id, status, cancelReason
    from appointments
    where id = ${appointmentId}
    limit 1
  `));

  if (!currentRows[0]) {
    throw new Error("Agendamento não encontrado.");
  }

  const normalizedStatus = String(data.status ?? "").trim();
  if (!normalizedStatus) {
    throw new Error("Status do agendamento não informado.");
  }

  const cancelReason =
    normalizedStatus === "cancelada"
      ? buildAppointmentCancellationReason(data.cancelledBy ?? "clinica", data.note)
      : null;

  await db.execute(sql`
    update appointments
    set
      status = ${normalizedStatus},
      cancelReason = ${cancelReason},
      updatedAt = NOW()
    where id = ${appointmentId}
  `);

  return { success: true };
}

export async function listAppointmentBlocks(from: string, to: string) {
  const db = await getDb();
  if (!db) return [];

  return unwrapRows<any>(await db.execute(sql`
    select *
    from appointment_blocks
    where active = true
      and startsAt <= ${to}
      and endsAt >= ${from}
    order by startsAt asc
  `));
}

export async function createAppointmentBlock(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const startsAt = new Date(data.startsAt);
  const endsAt = new Date(data.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    throw new Error("Período de bloqueio inválido.");
  }

  const result = await db.execute(sql`
    insert into appointment_blocks (
      title,
      notes,
      room,
      doctorId,
      startsAt,
      endsAt,
      createdBy,
      active
    ) values (
      ${data.title || "Bloqueio de agenda"},
      ${data.notes ?? null},
      ${data.room || null},
      ${data.doctorId || null},
      ${startsAt},
      ${endsAt},
      ${userId},
      true
    )
  `);

  const insertedId =
    typeof result[0] === "number"
      ? result[0]
      : result[0]?.insertId ?? result[0]?.id;

  const rows = unwrapRows<any>(await db.execute(sql`
    select *
    from appointment_blocks
    where id = ${insertedId}
    limit 1
  `));

  return rows[0] ?? { success: true };
}

export async function deleteAppointmentBlock(blockId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  await db.execute(sql`
    update appointment_blocks
    set active = false
    where id = ${blockId}
  `);

  return { success: true };
}

// --- PRESCRIPTIONS -----------------------------------------------------------
export async function createPrescription(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const doctorId = Number(userId);
  if (!Number.isFinite(doctorId) || doctorId <= 0) {
    throw new Error("Usuario responsavel pela prescricao nao foi identificado.");
  }

  await ensurePrescriptionSchema(db);
  const columns = await getTableColumns("prescriptions");
  const normalizedContent = String(data.content ?? "").trim();
  const normalizedObservations = data.observations ? String(data.observations).trim() : null;

  const payload: Record<string, unknown> = {
    patientId: data.patientId,
    doctorId,
  };

  if (columns.has("appointmentId") && data.appointmentId !== undefined) {
    payload.appointmentId = data.appointmentId;
  }
  if (columns.has("medicalRecordId") && data.medicalRecordId !== undefined) {
    payload.medicalRecordId = data.medicalRecordId;
  }
  if (columns.has("date")) {
    payload.date = formatSqlDate();
  }
  if (columns.has("type")) {
    payload.type = data.type;
  }
  if (columns.has("content")) {
    payload.content = normalizedContent;
  }
  if (columns.has("observations")) {
    payload.observations = normalizedObservations;
  }
  if (columns.has("items")) {
    payload.items = JSON.stringify({
      type: data.type,
      html: normalizedContent,
      text: stripHtmlToPlainText(normalizedContent),
      observations: normalizedObservations,
    });
  }

  const entries = Object.entries(payload).filter(([_, value]) => value !== undefined);
  const colNames = entries.map(([key]) => sql.raw(`\`${key}\``));
  const colValues = entries.map(([_, value]) => sql`${value}`);

  const result = await db.execute(sql`
    INSERT INTO prescriptions (${sql.join(colNames, sql`, `)})
    VALUES (${sql.join(colValues, sql`, `)})
  `);

  const insertedId =
    typeof result[0] === "number"
      ? result[0]
      : result[0]?.insertId ?? result[0]?.id;

  if (!insertedId) {
    return { success: true };
  }

  return getPrescriptionById(Number(insertedId));
}

export async function getPrescriptionsByPatient(patientId: number) {
  const db = await getDb();
  if (!db) return [];

  if (!patientId || patientId <= 0) {
    const rows = unwrapRows<any>(await db.execute(sql`
      select *
      from prescriptions
      order by createdAt desc, id desc
    `));
    return rows.map(normalizePrescriptionRecord);
  }

  const rows = unwrapRows<any>(await db.execute(sql`
    select *
    from prescriptions
    where patientId = ${patientId}
    order by createdAt desc, id desc
  `));
  return rows.map(normalizePrescriptionRecord);
}

export async function getPrescriptionById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const rows = unwrapRows<any>(await db.execute(sql`
    select *
    from prescriptions
    where id = ${id}
    limit 1
  `));

  return rows[0] ? normalizePrescriptionRecord(rows[0]) : null;
}

export async function listPrescriptionTemplates() {
  const db = await getDb();
  if (!db) return [];

  const rows = unwrapRows<any>(await db.execute(sql`
    select *
    from medical_record_templates
    where specialty = ${"Prescri\u00e7\u00e3o"}
      and active = 1
    order by name asc
  `));

  return rows.map((row: any) => {
    const sections = parseTemplateSections(row.sections);
    const firstSection = Array.isArray(sections) ? sections[0] : null;

    return {
      ...row,
      sections,
      type: row.description || "simples",
      content: firstSection?.content || firstSection?.text || "",
    };
  });
}

export async function createPrescriptionTemplate(data: any, userId: number) {
  return createTemplateNormalized({
    name: data.name,
    specialty: "Prescrição",
    group: "prescricao",
    description: data.type || "simples",
    sections: [
      {
        title: data.name || "Prescrição",
        type: "richtext",
        content: data.content ?? "",
        fields: [],
      },
    ],
  }, userId);
}

// --- EXAM REQUESTS -----------------------------------------------------------
export async function createExamRequest(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const exams = Array.isArray(data.exams)
    ? data.exams
    : Array.isArray(data.content)
      ? data.content
      : [String(data.content ?? "").trim()].filter(Boolean);

  const result = await db.execute(sql`
    insert into exam_requests
      (patientId, doctorId, medicalRecordId, appointmentId, specialty, exams, clinicalIndication, observations, pdfUrl, pdfKey, d4signDocumentKey, d4signStatus)
    values
      (${Number(data.patientId)}, ${userId}, ${data.medicalRecordId ?? null}, ${data.appointmentId ?? null}, ${data.specialty ?? null}, ${JSON.stringify(exams)}, ${data.clinicalIndication ?? null}, ${data.observations ?? null}, ${data.pdfUrl ?? null}, ${data.pdfKey ?? null}, ${data.d4signDocumentKey ?? null}, ${data.d4signStatus ?? 'pendente'})
  `);

  const insertedId = unwrapInsertId(result);
  return insertedId ? await getExamRequestById(insertedId) : { id: insertedId, ...data, doctorId: userId, exams };
}

export async function getExamRequestsByPatient(patientId: number) {
  const db = await getDb();
  if (!db) return [];

  return unwrapRows<any>(await db.execute(sql`
    SELECT er.*, p.fullName as patientName, p.phone as patientPhone
    FROM exam_requests er
    LEFT JOIN patients p ON p.id = er.patientId
    WHERE er.patientId = ${patientId}
    ORDER BY er.createdAt DESC
  `));
}

export async function getExamRequestById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const rows = unwrapRows<any>(await db.execute(sql`
    select *
    from exam_requests
    where id = ${id}
    limit 1
  `));

  return rows[0] ?? null;
}

export async function listExamTemplates() {
  const db = await getDb();
  if (!db) return [];

  return unwrapRows<any>(await db.execute(sql`
    select *
    from medical_record_templates
    where specialty = ${"Exame"}
      and active = 1
    order by name asc
  `));
}

export async function createExamTemplate(data: any, userId: number) {
  return createTemplateNormalized({
    ...data,
    group: "solicitacao_exames",
    specialty: data.specialty ?? "Solicitação de exames",
    sections: Array.isArray(data.sections)
      ? data.sections
      : [{ title: data.name, type: "richtext", content: data.content ?? "", fields: [] }],
  }, userId);
}

// --- FINANCIAL ---------------------------------------------------------------
export async function createFinancialTransaction(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  await ensureOptionalModuleTables(db);

  const result = await db.execute(sql`
    insert into financial_transactions
      (type, category, description, amountInCents, paymentMethod, patientId, budgetId, appointmentId, dueDate, paidAt, status, createdBy)
    values
      (${data.type}, ${data.category}, ${data.description}, ${Number(data.amountInCents || 0)}, ${data.paymentMethod ?? null}, ${data.patientId ?? null}, ${data.budgetId ?? null}, ${data.appointmentId ?? null}, ${data.dueDate ?? null}, ${data.paidAt ?? null}, ${data.status ?? 'pendente'}, ${userId})
  `);

  const insertedId = unwrapInsertId(result);
  const rows = insertedId
    ? unwrapRows<any>(await db.execute(sql`select * from financial_transactions where id = ${insertedId} limit 1`))
    : [];
  return rows[0] ?? { id: insertedId, ...data, createdBy: userId };
}

export async function listFinancialTransactions() {
  const db = await getDb();
  if (!db) return [];

  await ensureOptionalModuleTables(db);

  return unwrapRows<any>(await db.execute(sql`
    select *
    from financial_transactions
    order by createdAt desc, id desc
  `));
}

export async function getFinancialSummary(from?: string, to?: string) {
  const db = await getDb();
  if (!db) return { totalReceita: 0, totalDespesa: 0, saldo: 0 };

  await ensureOptionalModuleTables(db);

  const rows = unwrapRows<any>(await db.execute(
    from && to
      ? sql`
          select type, coalesce(sum(amountInCents), 0) as total
          from financial_transactions
          where createdAt >= ${from}
            and createdAt <= ${to}
          group by type
        `
      : sql`
          select type, coalesce(sum(amountInCents), 0) as total
          from financial_transactions
          group by type
        `,
  ));

  const summary = { totalReceita: 0, totalDespesa: 0, saldo: 0 };

  for (const row of rows) {
    const total = Number(row.total || 0);
    if (row.type === "receita") summary.totalReceita = total;
    if (row.type === "despesa") summary.totalDespesa = total;
  }

  summary.saldo = summary.totalReceita - summary.totalDespesa;
  return summary;
}

// --- CATALOG -----------------------------------------------------------------
export async function listProcedures() {
  const db = await getDb();
  if (!db) return [];

  await ensureOptionalModuleTables(db);

  return unwrapRows<any>(await db.execute(sql`
    select *
    from budget_procedure_catalog
    where active = 1
    order by name asc
  `));
}

export async function createProcedure(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  await ensureOptionalModuleTables(db);

  const result = await db.execute(sql`
    insert into budget_procedure_catalog
      (name, category, description, estimatedSessionsMin, estimatedSessionsMax, sessionIntervalDays, active, createdBy)
    values
      (${data.name}, ${data.category ?? null}, ${data.description ?? null}, ${data.estimatedSessionsMin ?? 1}, ${data.estimatedSessionsMax ?? 1}, ${data.sessionIntervalDays ?? 30}, 1, ${userId})
  `);

  const insertedId = unwrapInsertId(result);
  return insertedId ? await getProcedureById(insertedId) : { id: insertedId, ...data, createdBy: userId, active: true };
}

export async function createProcedureArea(data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  await ensureOptionalModuleTables(db);

  const result = await db.execute(sql`
    insert into budget_procedure_areas
      (procedureId, areaName, sortOrder, active)
    values
      (${Number(data.procedureId)}, ${data.areaName}, ${data.sortOrder ?? 0}, 1)
  `);

  const insertedId = unwrapInsertId(result);
  const rows = insertedId
    ? unwrapRows<any>(await db.execute(sql`select * from budget_procedure_areas where id = ${insertedId} limit 1`))
    : [];
  return rows[0] ?? { id: insertedId, ...data, active: true };
}

export async function getProcedureAreas(procedureId: number) {
  const db = await getDb();
  if (!db) return [];

  await ensureOptionalModuleTables(db);

  return unwrapRows<any>(await db.execute(sql`
    select *
    from budget_procedure_areas
    where procedureId = ${procedureId}
      and active = 1
    order by sortOrder asc, areaName asc
  `));
}

export async function getProcedureById(id: number) {
  const db = await getDb();
  if (!db) return null;

  await ensureOptionalModuleTables(db);

  const rows = unwrapRows<any>(await db.execute(sql`
    select *
    from budget_procedure_catalog
    where id = ${id}
    limit 1
  `));
  return rows[0] ?? null;
}

export async function getProcedurePrice(procedureId: number, areaId: number, complexity: string) {
  const db = await getDb();
  if (!db) return null;

  await ensureOptionalModuleTables(db);

  const rows = unwrapRows<any>(await db.execute(sql`
    select *
    from budget_procedure_pricing
    where procedureId = ${procedureId}
      and areaId = ${areaId}
      and complexity = ${complexity}
      and active = 1
    limit 1
  `));

  return rows[0] ?? null;
}

export async function listPaymentPlans() {
  const db = await getDb();
  if (!db) return [];

  await ensureOptionalModuleTables(db);

  return unwrapRows<any>(await db.execute(sql`
    select *
    from budget_payment_plans
    where active = 1
    order by sortOrder asc, name asc
  `));
}

export async function createPaymentPlan(data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  await ensureOptionalModuleTables(db);

  const result = await db.execute(sql`
    insert into budget_payment_plans
      (name, type, discountPercent, maxInstallments, interestRatePercent, description, active, sortOrder)
    values
      (${data.name}, ${data.type}, ${data.discountPercent ?? 0}, ${data.maxInstallments ?? 1}, ${data.interestRatePercent ?? 0}, ${data.description ?? null}, 1, ${data.sortOrder ?? 0})
  `);

  const insertedId = unwrapInsertId(result);
  const rows = insertedId
    ? unwrapRows<any>(await db.execute(sql`select * from budget_payment_plans where id = ${insertedId} limit 1`))
    : [];
  return rows[0] ?? { id: insertedId, ...data, active: true };
}

export async function upsertProcedurePrice(data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  await ensureOptionalModuleTables(db);

  const existing = await getProcedurePrice(data.procedureId, data.areaId, data.complexity);

  if (existing) {
    await db.execute(sql`
      update budget_procedure_pricing
      set priceInCents = ${Number(data.priceInCents || 0)}, updatedAt = now()
      where id = ${existing.id}
    `);
  } else {
    await db.execute(sql`
      insert into budget_procedure_pricing
        (procedureId, areaId, complexity, priceInCents, active)
      values
        (${Number(data.procedureId)}, ${Number(data.areaId)}, ${data.complexity}, ${Number(data.priceInCents || 0)}, 1)
    `);
  }

  return { success: true };
}

// --- INVENTORY ---------------------------------------------------------------
export async function listInventoryProducts() {
  const db = await getDb();
  if (!db) return [];

  await ensureOptionalModuleTables(db);

  return unwrapRows<any>(await db.execute(sql`
    select *
    from inventory_products
    where active = 1
    order by name asc
  `));
}

export async function createInventoryProduct(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  await ensureOptionalModuleTables(db);

  const result = await db.execute(sql`
    insert into inventory_products
      (name, sku, category, description, unit, currentStock, minimumStock, costPriceInCents, supplierName, supplierContact, active, createdBy)
    values
      (${data.name}, ${data.sku ?? null}, ${data.category ?? null}, ${data.description ?? null}, ${data.unit ?? 'un'}, ${Number(data.currentStock ?? 0)}, ${Number(data.minimumStock ?? 5)}, ${data.costPriceInCents ?? null}, ${data.supplierName ?? null}, ${data.supplierContact ?? null}, 1, ${userId})
  `);

  const insertedId = unwrapInsertId(result);
  const rows = insertedId
    ? unwrapRows<any>(await db.execute(sql`select * from inventory_products where id = ${insertedId} limit 1`))
    : [];
  return rows[0] ?? { id: insertedId, ...data, createdBy: userId, active: true };
}

export async function getLowStockItems() {
  const db = await getDb();
  if (!db) return [];

  await ensureOptionalModuleTables(db);

  return unwrapRows<any>(await db.execute(sql`
    select *
    from inventory_products
    where currentStock <= coalesce(minimumStock, 0)
      and active = 1
    order by currentStock asc, name asc
  `));
}

export async function createInventoryMovement(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  await ensureOptionalModuleTables(db);

  const result = await db.execute(sql`
    insert into inventory_movements
      (productId, type, quantity, reason, patientId, appointmentId, createdBy)
    values
      (${Number(data.productId)}, ${data.type}, ${Number(data.quantity || 0)}, ${data.reason ?? null}, ${data.patientId ?? null}, ${data.appointmentId ?? null}, ${userId})
  `);

  const products = unwrapRows<any>(await db.execute(sql`
    select currentStock
    from inventory_products
    where id = ${Number(data.productId)}
    limit 1
  `));

  const product = products[0];
  if (product) {
    let newStock = Number(product.currentStock || 0);
    if (data.type === "entrada") newStock += Number(data.quantity || 0);
    else if (data.type === "saida") newStock -= Number(data.quantity || 0);
    else if (data.type === "ajuste") newStock = Number(data.quantity || 0);

    await db.execute(sql`
      update inventory_products
      set currentStock = ${newStock}, updatedAt = now()
      where id = ${Number(data.productId)}
    `);
  }

  return { id: unwrapInsertId(result), ...data, createdBy: userId };
}

// --- PHOTOS ------------------------------------------------------------------
export async function getPatientPhotos(patientId: number, category?: string, folderId?: number | null) {
  const db = await getDb();
  if (!db) return [];

  const filters = [sql`p.patientId = ${patientId}`];
  if (category) {
    filters.push(sql`p.category = ${category}`);
  }
  if (folderId === null) {
    filters.push(sql`p.folderId is null`);
  } else if (typeof folderId === "number" && Number.isFinite(folderId)) {
    filters.push(sql`p.folderId = ${folderId}`);
  }

  return unwrapRows<any>(await db.execute(sql`
    select
      p.*,
      f.name as folderName,
      f.description as folderDescription
    from patient_photos p
    left join photo_folders f on f.id = p.folderId
    where ${sql.join(filters, sql` and `)}
    order by coalesce(p.takenAt, p.createdAt) desc, p.id desc
  `)).map(normalizePhotoRow);
}

export async function uploadPatientPhoto(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const sourceFolder = data.mediaSource === "patient" ? "patient-submissions" : "manual";
  const photoColumns = await getTableColumns("patient_photos");
  const categoryType = photoColumns.get("category") ?? "";
  const requestedCategory = String(data.category ?? "evolucao").trim() || "evolucao";
  const normalizedCategory = requestedCategory === "perfil" && !categoryType.includes("'perfil'") ? "outro" : requestedCategory;
  const stored = savePatientMediaToPublicDir(
    Number(data.patientId),
    String(data.base64 ?? ""),
    data.mimeType,
    sourceFolder,
  );

  const result = await db.execute(sql`
    insert into patient_photos
      (patientId, folderId, category, description, photoUrl, thumbnailUrl, photoKey, mimeType, originalFileName, mediaType, mediaSource, takenAt, uploadedBy)
    values
      (${Number(data.patientId)}, ${data.folderId ?? null}, ${normalizedCategory}, ${data.description ?? null}, ${stored.photoUrl}, ${stored.photoUrl}, ${stored.photoKey}, ${stored.mimeType ?? data.mimeType ?? null}, ${data.originalFileName ?? null}, ${stored.mediaType}, ${data.mediaSource === 'patient' ? 'patient' : 'clinic'}, ${data.takenAt ? new Date(data.takenAt) : null}, ${userId})
  `);

  const insertedId = unwrapInsertId(result);
  const rows = unwrapRows<any>(await db.execute(sql`
    select *
    from patient_photos
    where id = ${insertedId}
    limit 1
  `));

  return rows[0] ? normalizePhotoRow(rows[0]) : { success: true };
}

export async function uploadPatientDocument(data: {
  patientId: number;
  type: string;
  name?: string | null;
  description?: string | null;
  folderLabel?: string | null;
  base64: string;
  mimeType?: string | null;
  originalFileName?: string | null;
}, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const stored = savePatientMediaToPublicDir(
    Number(data.patientId),
    String(data.base64 ?? ""),
    data.mimeType,
    "manual",
  );

  const fileName =
    String(data.name ?? "").trim() ||
    String(data.originalFileName ?? "").trim() ||
    `Arquivo ${new Date().toLocaleDateString("pt-BR")}`;

  const result = await db.execute(sql`
    insert into patient_documents (
      patientId,
      doctorId,
      type,
      name,
      description,
      folderLabel,
      fileUrl,
      fileKey,
      fileSize,
      mimeType
    ) values (
      ${data.patientId},
      ${userId},
      ${data.type || "outro"},
      ${fileName},
      ${data.description ?? null},
      ${data.folderLabel ?? null},
      ${stored.photoUrl},
      ${stored.photoKey},
      ${Math.round((String(data.base64 ?? "").length * 3) / 4)},
      ${stored.mimeType ?? data.mimeType ?? null}
    )
  `);

  const insertedId =
    Array.isArray(result) && typeof result[0] === "object"
      ? (result[0] as any)?.insertId ?? (result[0] as any)?.id
      : (result as any)?.insertId;

  const rows = unwrapRows<any>(await db.execute(sql`
    select *
    from patient_documents
    where id = ${insertedId}
    limit 1
  `));

  return rows[0] ? normalizeDocumentRow(rows[0]) : { success: true };
}

export async function createPhotoFolder(patientId: number, name: string, description: string | undefined, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const result = await db.execute(sql`
    insert into photo_folders (patientId, name, description, createdBy)
    values (${patientId}, ${name}, ${description ?? null}, ${userId})
  `);

  const insertedId =
    Array.isArray(result) && typeof result[0] === "object"
      ? (result[0] as any)?.insertId ?? (result[0] as any)?.id
      : (result as any)?.insertId;

  const rows = unwrapRows<any>(await db.execute(sql`
    select *
    from photo_folders
    where id = ${insertedId}
    limit 1
  `));

  return rows[0] ?? { success: true };
}

export async function getPhotoFolders(patientId: number) {
  const db = await getDb();
  if (!db) return [];

  return unwrapRows<any>(await db.execute(sql`
    select
      f.*,
      count(p.id) as mediaCount
    from photo_folders f
    left join patient_photos p on p.folderId = f.id
    where f.patientId = ${patientId}
    group by f.id
    order by f.name asc, f.id asc
  `));
}

export async function updatePhotoFolder(folderId: number, data: { name?: string; description?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const currentRows = unwrapRows<any>(await db.execute(sql`
    select *
    from photo_folders
    where id = ${folderId}
    limit 1
  `));

  const current = currentRows[0];
  if (!current) {
    throw new Error("Pasta não encontrada.");
  }

  await db.execute(sql`
    update photo_folders
    set
      name = ${data.name ?? current.name},
      description = ${data.description ?? current.description},
      updatedAt = current_timestamp
    where id = ${folderId}
  `);

  return { success: true };
}

export async function deletePhotoFolder(folderId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  await db.execute(sql`
    update patient_photos
    set folderId = null
    where folderId = ${folderId}
  `);

  await db.execute(sql`
    delete from photo_folders
    where id = ${folderId}
  `);

  return { success: true };
}

export async function createPhotoComparison(patientId: number, photoIds: number[], userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  if (photoIds.length < 2 || photoIds.length > 4) {
    throw new Error("Selecione entre 2 e 4 mídias para comparar.");
  }

  const comparisonId = `comp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  await db.execute(sql`
    insert into photo_comparisons (patientId, comparisonId, photoIds, createdBy)
    values (${patientId}, ${comparisonId}, ${JSON.stringify(photoIds)}, ${userId})
  `);

  const photos = unwrapRows<any>(await db.execute(sql`
    select
      p.*,
      f.name as folderName,
      f.description as folderDescription
    from patient_photos p
    left join photo_folders f on f.id = p.folderId
    where p.patientId = ${patientId}
      and p.id in (${sql.join(photoIds.map((photoId) => sql`${photoId}`), sql`, `)})
  `)).map(normalizePhotoRow);

  return {
    comparisonId,
    createdAt: new Date().toISOString(),
    photos,
  };
}

export async function createPatientMediaUploadLink(
  data: {
    patientId: number;
    folderId?: number | null;
    title?: string;
    allowVideos?: boolean;
    expiresInDays?: number;
  },
  userId: number,
  baseUrl: string,
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const token = crypto.randomBytes(24).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + Math.max(1, Number(data.expiresInDays || 7)) * 24 * 60 * 60 * 1000);

  const result = await db.execute(sql`
    insert into patient_media_upload_links (patientId, folderId, tokenHash, title, allowVideos, expiresAt, createdBy)
    values (
      ${data.patientId},
      ${data.folderId ?? null},
      ${tokenHash},
      ${data.title ?? "Envio de imagens do paciente"},
      ${data.allowVideos === false ? 0 : 1},
      ${expiresAt},
      ${userId}
    )
  `);

  const insertedId =
    Array.isArray(result) && typeof result[0] === "object"
      ? (result[0] as any)?.insertId ?? (result[0] as any)?.id
      : (result as any)?.insertId;

  const rows = unwrapRows<any>(await db.execute(sql`
    select l.*, p.fullName as patientName, f.name as folderName
    from patient_media_upload_links l
    left join patients p on p.id = l.patientId
    left join photo_folders f on f.id = l.folderId
    where l.id = ${insertedId}
    limit 1
  `));

  const item = rows[0];
  return {
    ...item,
    uploadUrl: `${baseUrl.replace(/\/$/, "")}/envio-midias/${token}`,
  };
}

export async function listPatientMediaUploadLinks(patientId: number) {
  const db = await getDb();
  if (!db) return [];

  return unwrapRows<any>(await db.execute(sql`
    select l.*, p.fullName as patientName, f.name as folderName
    from patient_media_upload_links l
    left join patients p on p.id = l.patientId
    left join photo_folders f on f.id = l.folderId
    where l.patientId = ${patientId}
    order by l.createdAt desc, l.id desc
  `));
}

export async function revokePatientMediaUploadLink(linkId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  await db.execute(sql`
    update patient_media_upload_links
    set isActive = 0
    where id = ${linkId}
  `);

  return { success: true };
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

export async function getPatientMediaUploadLinkByToken(token: string) {
  const db = await getDb();
  if (!db || !token) return null;

  const tokenHash = hashToken(token);
  const rows = unwrapRows<any>(await db.execute(sql`
    select
      l.*,
      p.fullName as patientName,
      f.name as folderName
    from patient_media_upload_links l
    inner join patients p on p.id = l.patientId
    left join photo_folders f on f.id = l.folderId
    where l.tokenHash = ${tokenHash}
      and l.isActive = 1
      and l.expiresAt > now()
    limit 1
  `));

  return rows[0] ?? null;
}

export async function createAnamnesisShareLink(
  data: {
    patientId: number;
    title?: string;
    templateName?: string;
    anamnesisDate?: string;
    questions: Array<Record<string, any>>;
    expiresInDays?: number;
  },
  userId: number,
  baseUrl: string,
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const token = crypto.randomBytes(18).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + Math.max(1, Number(data.expiresInDays || 7)) * 24 * 60 * 60 * 1000);
  const result = await db.execute(sql`
    insert into anamnesis_share_links (patientId, tokenHash, title, templateName, anamnesisDate, questionsJson, expiresAt, createdBy, source)
    values (
      ${data.patientId},
      ${tokenHash},
      ${data.title ?? "Preencher anamnese da Clínica Glutée"},
      ${data.templateName ?? null},
      ${data.anamnesisDate ? new Date(data.anamnesisDate) : new Date()},
      ${JSON.stringify(data.questions ?? [])},
      ${expiresAt},
      ${userId},
      ${"share"}
    )
  `);

  const insertedId =
    Array.isArray(result) && typeof result[0] === "object"
      ? (result[0] as any)?.insertId ?? (result[0] as any)?.id
      : (result as any)?.insertId;

  const rows = unwrapRows<any>(await db.execute(sql`
    select l.*, p.fullName as patientName
    from anamnesis_share_links l
    left join patients p on p.id = l.patientId
    where l.id = ${insertedId}
    limit 1
  `));

  const link = rows[0] ?? null;
  if (!link) {
    throw new Error("Não foi possível gerar o link da anamnese.");
  }

  return {
    ...link,
    shareUrl: `${baseUrl.replace(/\/$/, "")}/anamnese-publica/${token}`,
    fillUrl: `${baseUrl.replace(/\/$/, "")}/anamnese-preencher/${token}`,
  };
}

export async function getAnamnesisShareLinkByToken(token: string) {
  const db = await getDb();
  if (!db || !token) return null;

  const tokenHash = hashToken(token);
  const rows = unwrapRows<any>(await db.execute(sql`
    select l.*, p.fullName as patientName
    from anamnesis_share_links l
    inner join patients p on p.id = l.patientId
    where l.tokenHash = ${tokenHash}
      and l.isActive = 1
      and l.expiresAt > now()
    limit 1
  `));

  const row = rows[0];
  if (!row) return null;

  let questions: Array<{ text: string; type: string; options?: string[] }> = [];
  try {
    questions = JSON.parse(String(row.questionsJson ?? "[]"));
  } catch {
    questions = [];
  }

  let answers: Record<string, string> | null = null;
  try {
    answers = row.submittedAnswers ? JSON.parse(String(row.submittedAnswers)) : null;
  } catch {
    answers = null;
  }

  return {
    ...row,
    questions,
    answers,
  };
}

/**
 * Retorna APENAS anamneses reais (question?rios preenchidos pelo paciente ou
 * pela clínica) a partir de `anamnesis_share_links`.
 *
 * Fichas de atendimento importadas do Prontu?rio Verde / OneDoctor que
 * possuem o campo `anamnesis` preenchido SÃO evoluções, não anamneses, e
 * aparecem em `getClinicalEvolutionsByPatient` (que mescla legacy). Portanto
 * não são mais retornadas aqui (antes eram, o que misturava as duas coisas).
 */
function normalizeAnamnesisForDedupe(value: unknown) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\u00a0/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function anamnesisDateKey(row: Record<string, any>) {
  const value = row?.anamnesisDate || row?.submittedAt || row?.createdAt;
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function dedupeAnamnesisRows<T extends Record<string, any>>(rows: T[]) {
  const bySignature = new Map<string, T>();

  for (const row of rows) {
    const answers = normalizeAnamnesisForDedupe(row.submittedAnswers);
    const questions = normalizeAnamnesisForDedupe(row.questionsJson);
    const signature = [row.patientId, anamnesisDateKey(row), answers || questions, normalizeAnamnesisForDedupe(row.title)].join("|");
    const current = bySignature.get(signature);
    if (!current) {
      bySignature.set(signature, row);
      continue;
    }

    const currentScore = normalizeAnamnesisForDedupe(current.submittedAnswers).length + Number(current.id ?? 0) / 1_000_000;
    const nextScore = answers.length + Number(row.id ?? 0) / 1_000_000;
    if (nextScore > currentScore) {
      bySignature.set(signature, row);
    }
  }

  return Array.from(bySignature.values());
}
export async function listPatientAnamneses(patientId: number, viewerRole?: string | null) {
  const db = await getDb();
  if (!db) return [];
  const allowAnswers = canViewAnamnesisAnswers(viewerRole);

  const rows = unwrapRows<any>(await db.execute(sql`
    select
      l.*,
      p.fullName as patientName
    from anamnesis_share_links l
    inner join patients p on p.id = l.patientId
    where l.patientId = ${patientId}
      and coalesce(l.submittedAnswers, '') <> ''
    order by coalesce(l.anamnesisDate, l.submittedAt, l.createdAt) desc, l.id desc
  `));

  return dedupeAnamnesisRows(rows).map((row) => {
    let questions: Array<Record<string, any>> = [];
    let answers: Record<string, string> | null = null;
    try {
      questions = JSON.parse(String(row.questionsJson ?? "[]"));
    } catch {
      questions = [];
    }
    try {
      answers = row.submittedAnswers ? JSON.parse(String(row.submittedAnswers)) : null;
    } catch {
      answers = null;
    }

    return {
      ...row,
      questions: allowAnswers ? questions : [],
      answers: allowAnswers ? answers : null,
      visibilityRestricted: !allowAnswers,
      sourceLabel: row.source === "share" ? "Paciente" : "Clínica",
    };
  });
}

export async function patientHasAnyAnamnesis(patientId: number) {
  const db = await getDb();
  if (!db) return false;

  // Apenas question?rios reais (anamnesis_share_links). Os registros antigos
  // de `medical_records.anamnesis` eram, em sua maior parte, evolu??es
  // importadas e agora são expostos como evolução clínica legada.
  const submittedRows = unwrapRows<any>(await db.execute(sql`
    select count(*) as count
    from anamnesis_share_links
    where patientId = ${patientId}
      and coalesce(submittedAnswers, '') <> ''
  `));

  return Number(submittedRows[0]?.count ?? 0) > 0;
}

export async function sendPatientAnamnesisRequestViaWhatsApp(
  patientId: number,
  userId: number,
  baseUrl: string,
  options?: { title?: string; expiresInDays?: number },
) {
  const patient = await getPatientById(patientId);
  if (!patient) {
    throw new Error("Paciente não encontrado.");
  }
  if (!patient.phone) {
    throw new Error("O paciente não possui telefone cadastrado para WhatsApp.");
  }

  const template = getDefaultAnamnesisDefinition(patient);
  const link = await createAnamnesisShareLink({
    patientId,
    title: options?.title || `Anamnese de ${patient.fullName}`,
    templateName: template.name,
    anamnesisDate: new Date().toISOString().slice(0, 10),
    questions: template.questions,
    expiresInDays: options?.expiresInDays ?? 14,
  }, userId, baseUrl);

  const result = await sendWhatsAppMessage(patient.phone, buildAnamnesisWhatsappMessage(patient.fullName, link.shareUrl));
  return {
    success: true,
    patientId,
    patientName: patient.fullName,
    phone: patient.phone,
    shareUrl: link.shareUrl,
    ...result,
  };
}

export async function sendAppointmentReminderViaWhatsApp(
  appointmentId: number,
  userId: number,
  baseUrl: string,
  customMessage?: string,
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const rows = unwrapRows<any>(await db.execute(sql`
    select
      a.*,
      p.fullName as patientName,
      p.phone as patientPhone,
      u.name as doctorName
    from appointments a
    inner join patients p on p.id = a.patientId
    left join users u on u.id = a.doctorId
    where a.id = ${appointmentId}
    limit 1
  `));

  const appointment = rows[0];
  if (!appointment) {
    throw new Error("Agendamento não encontrado.");
  }
  if (!appointment.patientPhone) {
    throw new Error("O paciente não possui telefone cadastrado para WhatsApp.");
  }

  let anamnesisLink: string | null = null;
  if (!(await patientHasAnyAnamnesis(Number(appointment.patientId)))) {
    const template = getDefaultAnamnesisDefinition({ biologicalSex: appointment.biologicalSex, gender: appointment.gender });
    const link = await createAnamnesisShareLink({
      patientId: Number(appointment.patientId),
      title: `Anamnese de ${appointment.patientName}`,
      templateName: template.name,
      anamnesisDate: new Date(appointment.scheduledAt).toISOString().slice(0, 10),
      questions: template.questions,
      expiresInDays: 7,
    }, userId, baseUrl);
    anamnesisLink = link.shareUrl;
  }

  const message = customMessage?.trim() || buildAppointmentReminderWhatsappMessage({
    patientName: appointment.patientName,
    scheduledAt: appointment.scheduledAt,
    doctorName: appointment.doctorName,
    room: appointment.room,
    anamnesisLink,
  });

  const result = await sendWhatsAppMessage(appointment.patientPhone, message);
  return {
    success: true,
    appointmentId,
    patientId: Number(appointment.patientId),
    patientName: appointment.patientName,
    anamnesisLink,
    ...result,
  };
}

export async function sendTomorrowAppointmentReminders(userId: number, baseUrl: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const end = new Date(tomorrow);
  end.setHours(23, 59, 59, 999);

  const rows = unwrapRows<any>(await db.execute(sql`
    select a.id
    from appointments a
    inner join patients p on p.id = a.patientId
    where a.scheduledAt >= ${tomorrow}
      and a.scheduledAt <= ${end}
      and a.status not in ('cancelada', 'concluida', 'falta')
      and coalesce(trim(p.phone), '') <> ''
    order by a.scheduledAt asc, a.id asc
  `));

  const results = [];
  for (const row of rows) {
    try {
      results.push(await sendAppointmentReminderViaWhatsApp(Number(row.id), userId, baseUrl));
    } catch (error: any) {
      results.push({ success: false, appointmentId: Number(row.id), error: error?.message || "Falha ao enviar lembrete." });
    }
  }

  return {
    success: true,
    total: results.length,
    sent: results.filter((item: any) => item.success).length,
    failed: results.filter((item: any) => !item.success).length,
    results,
  };
}

export async function createPatientAnamnesis(
  data: {
    patientId: number;
    title: string;
    templateName?: string;
    anamnesisDate?: string;
    respondentName?: string | null;
    questions: Array<Record<string, any>>;
    answers: Record<string, string>;
    profilePhotoBase64?: string | null;
    profilePhotoMimeType?: string | null;
    profilePhotoFileName?: string | null;
    profilePhotoDeclarationAccepted?: boolean;
  },
  userId: number,
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  let profilePhotoUrl: string | null = null;
  let profilePhotoMimeType: string | null = null;

  if (data.profilePhotoBase64) {
    if (!data.profilePhotoDeclarationAccepted) {
      throw new Error("Confirme que a foto enviada é da própria pessoa.");
    }

    const uploaded = await uploadPatientPhoto({
      patientId: data.patientId,
      category: "perfil",
      description: "Foto de perfil enviada na anamnese",
      base64: data.profilePhotoBase64,
      mimeType: data.profilePhotoMimeType ?? "image/jpeg",
      originalFileName: data.profilePhotoFileName ?? "perfil-anamnese.jpg",
      mediaSource: "patient",
      takenAt: data.anamnesisDate ?? new Date().toISOString(),
    }, userId);

    profilePhotoUrl = uploaded.photoUrl ?? null;
    profilePhotoMimeType = uploaded.mimeType ?? null;
  }

  const token = crypto.randomBytes(18).toString("hex");
  const tokenHash = hashToken(token);
  const result = await db.execute(sql`
    insert into anamnesis_share_links (
      patientId,
      tokenHash,
      title,
      templateName,
      anamnesisDate,
      questionsJson,
      submittedAnswers,
      respondentName,
      source,
      profilePhotoUrl,
      profilePhotoMimeType,
      profilePhotoDeclarationAccepted,
      isActive,
      expiresAt,
      submittedAt,
      createdBy
    )
    values (
      ${data.patientId},
      ${tokenHash},
      ${data.title},
      ${data.templateName ?? null},
      ${data.anamnesisDate ? new Date(data.anamnesisDate) : new Date()},
      ${JSON.stringify(data.questions ?? [])},
      ${JSON.stringify(data.answers ?? {})},
      ${data.respondentName ?? null},
      ${"internal"},
      ${profilePhotoUrl},
      ${profilePhotoMimeType},
      ${data.profilePhotoDeclarationAccepted ? 1 : 0},
      1,
      ${new Date("2099-12-31T23:59:59Z")},
      now(),
      ${userId}
    )
  `);

  const insertedId =
    Array.isArray(result) && typeof result[0] === "object"
      ? (result[0] as any)?.insertId ?? (result[0] as any)?.id
      : (result as any)?.insertId ?? null;

  const rows = unwrapRows<any>(await db.execute(sql`
    select *
    from anamnesis_share_links
    where id = ${insertedId}
    limit 1
  `));

  return rows[0] ?? { success: true };
}

export async function submitAnamnesisShareLink(
  token: string,
  answers: Record<string, string>,
  respondentName?: string | null,
  profilePhoto?: {
    base64?: string | null;
    mimeType?: string | null;
    fileName?: string | null;
    declarationAccepted?: boolean;
  },
  signature?: {
    ipAddress?: string | null;
    userAgent?: string | null;
    acceptedAt?: string | null;
    method?: string | null;
  },
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const link = await getAnamnesisShareLinkByToken(token);
  if (!link) {
    throw new Error("Link da anamnese não encontrado ou expirado.");
  }

  let profilePhotoUrl = link.profilePhotoUrl ?? null;
  let profilePhotoMimeType = link.profilePhotoMimeType ?? null;
  let declarationAccepted = Number(link.profilePhotoDeclarationAccepted ?? 0) === 1;

  if (profilePhoto?.base64) {
    if (!profilePhoto.declarationAccepted) {
      throw new Error("Confirme que a foto enviada é da própria pessoa.");
    }

    const uploaded = await uploadPatientPhoto({
      patientId: link.patientId,
      category: "perfil",
      description: "Foto de perfil enviada na anamnese",
      base64: profilePhoto.base64,
      mimeType: profilePhoto.mimeType ?? "image/jpeg",
      originalFileName: profilePhoto.fileName ?? "perfil-anamnese.jpg",
      mediaSource: "patient",
      takenAt: link.anamnesisDate ?? new Date().toISOString(),
    }, Number(link.createdBy ?? 1));

    profilePhotoUrl = uploaded.photoUrl ?? null;
    profilePhotoMimeType = uploaded.mimeType ?? null;
    declarationAccepted = true;
  }

  const signedAt = new Date();
  const signatureEvidence = {
    method: signature?.method || "assinatura_eletronica_simples",
    signedAt: signedAt.toISOString(),
    respondentName: respondentName ?? link.patientName ?? null,
    patientId: Number(link.patientId),
    linkId: Number(link.id),
    ipAddress: signature?.ipAddress ?? null,
    userAgent: signature?.userAgent ?? null,
    acceptedAt: signature?.acceptedAt ?? signedAt.toISOString(),
    declaration: "Paciente declarou que as informações preenchidas na anamnese são verdadeiras ao salvar e enviar o formulário.",
    answerKeys: Object.keys(answers ?? {}).sort(),
  };
  const signatureHash = crypto
    .createHash("sha256")
    .update(JSON.stringify({ evidence: signatureEvidence, answers: answers ?? {} }))
    .digest("hex");

  const linkColumns = await getTableColumns("anamnesis_share_links");
  const assignments = [
    sql`submittedAnswers = ${JSON.stringify(answers ?? {})}`,
    sql`respondentName = ${respondentName ?? null}`,
    sql`profilePhotoUrl = ${profilePhotoUrl}`,
    sql`profilePhotoMimeType = ${profilePhotoMimeType}`,
    sql`profilePhotoDeclarationAccepted = ${declarationAccepted ? 1 : 0}`,
    sql`submittedAt = ${signedAt}`,
  ];

  if (linkColumns.has("signatureEvidenceJson")) assignments.push(sql`signatureEvidenceJson = ${JSON.stringify(signatureEvidence)}`);
  if (linkColumns.has("signatureHash")) assignments.push(sql`signatureHash = ${signatureHash}`);
  if (linkColumns.has("signatureMethod")) assignments.push(sql`signatureMethod = ${signatureEvidence.method}`);
  if (linkColumns.has("signedAt")) assignments.push(sql`signedAt = ${signedAt}`);

  await db.execute(sql`
    update anamnesis_share_links
    set ${sql.join(assignments, sql`, `)}
    where id = ${link.id}
  `);

  return { success: true, signatureHash };
}

export async function deletePatientPhoto(photoId: number) {
  const db = await getDb();
  if (!db) return;

  await db.execute(sql`
    delete from patient_photos
    where id = ${photoId}
  `);
  return { success: true };
}

export async function getPatientDocuments(patientId: number) {
  const db = await getDb();
  if (!db) return [];

  const rows = unwrapRows<any>(await db.execute(sql`
    select *
    from patient_documents
    where patientId = ${patientId}
    order by createdAt desc, id desc
  `));

  return dedupeDocumentsForDisplay(rows.map(normalizeDocumentRow).filter(shouldShowDocumentInPatientLists));
}

export async function listContractDocuments(query?: string, limit: number = 500) {
  const db = await getDb();
  if (!db) return [];

  const normalizedQuery = String(query ?? "").trim();
  const whereClause = normalizedQuery
    ? sql`
        where pd.type in ('contrato', 'termo')
          and (
            pd.name like ${`%${normalizedQuery}%`}
            or pd.description like ${`%${normalizedQuery}%`}
            or p.fullName like ${`%${normalizedQuery}%`}
            or p.cpf like ${`%${normalizedQuery}%`}
          )
      `
    : sql`where pd.type in ('contrato', 'termo')`;

  const rows = unwrapRows<any>(await db.execute(sql`
    select
      pd.*,
      p.fullName as patientName,
      p.cpf as patientCpf,
      p.phone as patientPhone
    from patient_documents pd
    left join patients p on p.id = pd.patientId
    ${whereClause}
    order by pd.createdAt desc, pd.id desc
    limit ${limit}
  `));

  return dedupeDocumentsForDisplay(rows.map(normalizeDocumentRow).filter(hasDownloadableDocumentFile));
}

export async function getPatientHistory(patientId: number) {
  const db = await getDb();
  if (!db) return { appointments: [], evolutions: [], records: [], prescriptions: [], documents: [], photos: [] };

  const appointments = dedupeAppointmentsForDisplay(unwrapRows<any>(await db.execute(sql`
    select a.*, u.name as doctorName
    from appointments a
    left join users u on u.id = a.doctorId
    where a.patientId = ${patientId}
    order by a.scheduledAt desc, a.id desc
  `)));

  const evolutions = unwrapRows<any>(await db.execute(sql`
    select ce.*, u.name as doctorName
    from clinical_evolutions ce
    left join users u on u.id = ce.doctorId
    where ce.patientId = ${patientId}
    order by coalesce(ce.startedAt, ce.createdAt) desc, ce.id desc
  `));

  const records = unwrapRows<any>(await db.execute(sql`
    select mr.*, u.name as doctorName
    from medical_records mr
    left join users u on u.id = mr.doctorId
    where mr.patientId = ${patientId}
    order by coalesce(mr.date, mr.createdAt) desc, mr.id desc
  `));

  const prescriptions = unwrapRows<any>(await db.execute(sql`
    select p.*, u.name as doctorName
    from prescriptions p
    left join users u on u.id = p.doctorId
    where p.patientId = ${patientId}
    order by coalesce(p.date, p.createdAt) desc, p.id desc
  `));

  const documents = await getPatientDocuments(patientId);
  const photos = await getPatientPhotos(patientId);

  return {
    appointments,
    evolutions,
    records,
    prescriptions,
    documents,
    photos,
  };
}

export async function searchTussCatalog(query?: string, limit: number = 60) {
  const catalog = await loadTussCatalog();
  if (!catalog.length) return [];

  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return catalog.slice(0, limit);
  }

  const matches = catalog.filter((entry) => {
    const haystack = normalizeSearchText(`${entry.code} ${entry.name} ${entry.description ?? ""}`);
    return haystack.includes(normalizedQuery);
  });

  return matches.slice(0, limit);
}

// --- CHAT --------------------------------------------------------------------
export async function getChatMessages(channelId: string, limit: number = 100) {
  const db = await getDb();
  if (!db) return [];

  await ensureOptionalModuleTables(db);

  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  return unwrapRows<any>(await db.execute(sql`
    select *
    from chat_messages
    where channelId = ${channelId}
    order by createdAt desc, id desc
    limit ${safeLimit}
  `));
}

export async function createChatMessage(channelId: string, userId: number, content: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  await ensureOptionalModuleTables(db);

  const result = await db.execute(sql`
    insert into chat_messages
      (channelId, senderId, content, messageType)
    values
      (${channelId}, ${userId}, ${content}, 'text')
  `);

  const insertedId = unwrapInsertId(result);
  const rows = insertedId
    ? unwrapRows<any>(await db.execute(sql`select * from chat_messages where id = ${insertedId} limit 1`))
    : [];
  return rows[0] ?? { id: insertedId, channelId, senderId: userId, content, messageType: "text" };
}

// --- CLINIC ------------------------------------------------------------------
export async function getClinicSettings() {
  const db = await getDb();
  if (!db) return null;

  const rows = unwrapRows<any>(await db.execute(sql`SELECT * FROM clinic_settings LIMIT 1`));
  const settings = rows[0] ?? null;
  if (!settings) {
    return {
      structuralSectors: [...DEFAULT_CLINIC_STRUCTURAL_SECTORS],
      patientAttachmentFolders: [...DEFAULT_PATIENT_ATTACHMENT_FOLDERS],
    };
  }

  return {
    ...settings,
    structuralSectors: normalizeClinicStructuralSectors(settings.structuralSectors),
    patientAttachmentFolders: normalizeClinicAttachmentFolders(settings.patientAttachmentFolders),
  };
}

export async function updateClinicSettings(data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const payload = {
    ...data,
    structuralSectors:
      data.structuralSectors === undefined
        ? undefined
        : JSON.stringify(normalizeClinicStructuralSectors(data.structuralSectors)),
    patientAttachmentFolders:
      data.patientAttachmentFolders === undefined
        ? undefined
        : JSON.stringify(normalizeClinicAttachmentFolders(data.patientAttachmentFolders)),
  };

  const existing = await getClinicSettings();

  if (existing) {
    // Build SET clause dynamically using raw SQL for column names (trusted keys only)
    const entries = Object.entries(payload).filter(([_, v]) => v !== undefined);
    if (entries.length === 0) return { success: true };

    const setClauses = entries.map(([key, val]) => sql`${sql.raw(`\`${key}\``)} = ${val}`);
    await db.execute(sql`UPDATE clinic_settings SET ${sql.join(setClauses, sql`, `)} WHERE id = ${existing.id}`);
  } else {
    const entries = Object.entries(payload).filter(([_, v]) => v !== undefined);
    if (entries.length === 0) return { success: true };

    const colNames = entries.map(([key]) => sql.raw(`\`${key}\``));
    const colVals = entries.map(([_, v]) => sql`${v}`);
    await db.execute(sql`INSERT INTO clinic_settings (${sql.join(colNames, sql`, `)}) VALUES (${sql.join(colVals, sql`, `)})`);
  }

  return { success: true };
}

// --- FISCAL ------------------------------------------------------------------
function decimalToCents(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number.parseFloat(String(value ?? 0));
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100);
}

function centsToDecimal(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number.parseFloat(String(value ?? 0));
  if (!Number.isFinite(numeric)) return 0;
  return Number((numeric / 100).toFixed(2));
}

const DEFAULT_FISCAL_SERVICE_DESCRIPTION =
  "REFERENTE A PROCEDIMENTOS MÉDICOS AMBULATORIAIS.";
const DEFAULT_FISCAL_LEGAL_TEXT =
  "NÃO SUJEITO A RETENCAO A SEGURIDADE SOCIAL, CONFORME ART-31 DA LEI-8.212/91, OS/INSS-209/99, IN/INSS-DC-100/03 E IN 971/09 ART.120 INCISO III. OS SERVICOS ACIMA DESCRITOS FORAM PRESTADOS PESSOALMENTE PELO(S) SOCIO(S) E SEM O CONCURSO DE EMPREGADOS OU OUTROS CONTRIBUINTES INDIVIDUAIS.";

const REGIME_TRIBUTARIO_ENUM = ["simples_nacional", "lucro_presumido", "lucro_real", "mei"] as const;
type RegimeTributario = typeof REGIME_TRIBUTARIO_ENUM[number];

function normalizeRegimeTributario(value: unknown): RegimeTributario | null {
  if (!value) return null;
  const s = String(value).trim().toLowerCase();
  // exact match
  if (REGIME_TRIBUTARIO_ENUM.includes(s as RegimeTributario)) return s as RegimeTributario;
  // fuzzy match for human-readable values sent from frontend
  if (s.includes("simples")) return "simples_nacional";
  if (s.includes("presumido")) return "lucro_presumido";
  if (s.includes("real")) return "lucro_real";
  if (s.includes("mei")) return "mei";
  return "simples_nacional"; // safe default
}

function normalizeDecimalInput(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  let s = String(value).trim();
  // Brazilian format "1.234,56": only strip dots when a comma is also present
  // (dots are thousand separators in pt-BR; if no comma, dot is the decimal separator)
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const parsed = Number.parseFloat(s);
  if (!Number.isFinite(parsed)) return null;

  return Number(parsed.toFixed(4));
}

function inferDocumentType(document: string | null | undefined): "cpf" | "cnpj" {
  const digits = String(document ?? "").replace(/\D/g, "");
  return digits.length > 11 ? "cnpj" : "cpf";
}

function buildFiscalServiceDescription(
  fiscal: any,
  overrides: {
    descricaoServico?: string | null;
    complementoDescricao?: string | null;
    formaPagamento?: string | null;
    detalhesPagamento?: string | null;
  },
) {
  const baseDescription = String(
    overrides.descricaoServico ||
      fiscal?.descricaoServicoPadrao ||
      fiscal?.descricaoServico ||
      DEFAULT_FISCAL_SERVICE_DESCRIPTION,
  ).trim();
  const legalText = String(fiscal?.textoLegalFixo || DEFAULT_FISCAL_LEGAL_TEXT).trim();
  const parts = [
    (baseDescription || DEFAULT_FISCAL_SERVICE_DESCRIPTION).toUpperCase(),
    (legalText || DEFAULT_FISCAL_LEGAL_TEXT).toUpperCase(),
  ];

  const complemento = String(overrides.complementoDescricao || "").trim();
  if (complemento) {
    parts.push(`INFORMAÇÕES COMPLEMENTARES: ${complemento.toUpperCase()}`);
  }

  return parts.filter(Boolean).join("\n");
}

function parseBudgetItems(raw: unknown) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;

  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeNfseRow(row: any) {
  return {
    ...row,
    tomadorDocumento: row.tomadorCpfCnpj ?? row.tomadorDocumento ?? "",
    tomadorTipoDocumento: row.tomadorTipoDocumento ?? inferDocumentType(row.tomadorCpfCnpj),
    valorServico: decimalToCents(row.valorServicos ?? row.valorServico),
    valorDeducao: decimalToCents(row.valorDeducoes ?? row.valorDeducao),
    valorDescontoIncondicionado: decimalToCents(row.descontoIncondicionado ?? row.valorDescontoIncondicionado),
    valorLiquido: decimalToCents(row.valorLiquidoNfse ?? row.valorLiquido),
  };
}

async function logNfseEvent(
  nfseId: number,
  event: string,
  params: {
    status?: string | null;
    message?: string | null;
    xmlRequest?: string | null;
    xmlResponse?: string | null;
    userId?: number | null;
  } = {},
) {
  const db = await getDb();
  if (!db) return;

  await db.execute(sql`
    insert into nfse_events (nfseId, event, status, message, xmlRequest, xmlResponse, userId)
    values (
      ${nfseId}, ${event},
      ${params.status ?? null}, ${params.message ?? null},
      ${params.xmlRequest ?? null}, ${params.xmlResponse ?? null},
      ${params.userId ?? null}
    )
  `);
}

export async function getFiscalSettings() {
  const db = await getDb();
  if (!db) return null;

  const rows = unwrapRows<any>(await db.execute(sql`select * from fiscal_config limit 1`));
  const fiscal = rows[0];
  if (!fiscal) return null;

  return {
    ...fiscal,
    optanteSimplesNacional: Boolean(fiscal.optanteSimplesNacional),
    regimeApuracao: fiscal.regimeApuracao ?? fiscal.regimeTributario ?? null,
    descricaoServicoPadrao:
      fiscal.descricaoServicoPadrao ??
      fiscal.descricaoServico ??
      DEFAULT_FISCAL_SERVICE_DESCRIPTION,
    textoLegalFixo: fiscal.textoLegalFixo ?? DEFAULT_FISCAL_LEGAL_TEXT,
    municipioIncidencia: fiscal.municipioIncidencia ?? fiscal.municipio ?? null,
    ufIncidencia: fiscal.ufIncidencia ?? fiscal.uf ?? null,
    provedor: fiscal.provedor ?? "nfse_nacional",
    certificadoConfigurado: Boolean(fiscal.certificadoDigital && fiscal.certificadoSenha),
    certificadoDigital: maskStoredValue(fiscal.certificadoDigital),
    certificadoSenha: maskStoredValue(fiscal.certificadoSenha),
  };
}

export async function upsertFiscalSettings(data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const existing = await getFiscalSettings();
  const payload = {
    cnpj: data.cnpj ?? null,
    razaoSocial: data.razaoSocial ?? null,
    nomeFantasia: data.nomeFantasia ?? null,
    inscricaoMunicipal: data.inscricaoMunicipal ?? null,
    inscricaoEstadual: data.inscricaoEstadual ?? null,
    codigoMunicipio: data.codigoMunicipio ?? null,
    municipio: data.municipio ?? null,
    uf: data.uf ?? null,
    cep: data.cep ?? null,
    logradouro: data.logradouro ?? null,
    numero: data.numero ?? null,
    complemento: data.complemento ?? null,
    bairro: data.bairro ?? null,
    telefone: data.telefone ?? null,
    email: data.email ?? null,
    optanteSimplesNacional: data.optanteSimplesNacional ? 1 : 0,
    regimeTributario: normalizeRegimeTributario(data.regimeTributario ?? data.regimeApuracao),
    regimeApuracao: data.regimeApuracao ?? data.regimeTributario ?? null,
    codigoTributacaoNacional: data.codigoTributacaoNacional ?? data.codigoServico ?? null,
    descricaoTributacao: data.descricaoTributacao ?? null,
    itemNbs: data.itemNbs ?? null,
    descricaoNbs: data.descricaoNbs ?? null,
    aliquotaSimplesNacional: normalizeDecimalInput(data.aliquotaSimplesNacional),
    aliquotaIss: normalizeDecimalInput(data.aliquotaIss),
    descricaoServico:
      data.descricaoServico ??
      data.descricaoServicoPadrao ??
      DEFAULT_FISCAL_SERVICE_DESCRIPTION,
    descricaoServicoPadrao:
      data.descricaoServicoPadrao ??
      data.descricaoServico ??
      DEFAULT_FISCAL_SERVICE_DESCRIPTION,
    textoLegalFixo: data.textoLegalFixo ?? DEFAULT_FISCAL_LEGAL_TEXT,
    municipioIncidencia: data.municipioIncidencia ?? data.municipio ?? null,
    ufIncidencia: data.ufIncidencia ?? data.uf ?? null,
    provedor: data.provedor ?? "nfse_nacional",
    ambiente: data.ambiente ?? existing?.ambiente ?? "homologacao",
    ativo: data.cnpj && data.razaoSocial ? 1 : 0,
    codigoServico: data.codigoServico ?? data.codigoTributacaoNacional ?? null,
    itemListaServico: data.itemListaServico ?? null,
    cnaeServico: data.cnaeServico ?? null,
    webserviceUrl: data.webserviceUrl ?? null,
  };

  if (existing) {
    await db.execute(sql`
      update fiscal_config set
        cnpj = ${payload.cnpj}, razaoSocial = ${payload.razaoSocial}, nomeFantasia = ${payload.nomeFantasia},
        inscricaoMunicipal = ${payload.inscricaoMunicipal}, inscricaoEstadual = ${payload.inscricaoEstadual},
        codigoMunicipio = ${payload.codigoMunicipio}, municipio = ${payload.municipio}, uf = ${payload.uf},
        cep = ${payload.cep}, logradouro = ${payload.logradouro}, numero = ${payload.numero},
        complemento = ${payload.complemento}, bairro = ${payload.bairro},
        telefone = ${payload.telefone}, email = ${payload.email},
        optanteSimplesNacional = ${payload.optanteSimplesNacional},
        regimeTributario = ${payload.regimeTributario}, regimeApuracao = ${payload.regimeApuracao},
        codigoTributacaoNacional = ${payload.codigoTributacaoNacional}, codigoServico = ${payload.codigoServico},
        itemListaServico = ${payload.itemListaServico}, cnaeServico = ${payload.cnaeServico},
        descricaoTributacao = ${payload.descricaoTributacao},
        itemNbs = ${payload.itemNbs}, descricaoNbs = ${payload.descricaoNbs},
        aliquotaSimplesNacional = ${payload.aliquotaSimplesNacional}, aliquotaIss = ${payload.aliquotaIss},
        descricaoServico = ${payload.descricaoServico}, descricaoServicoPadrao = ${payload.descricaoServicoPadrao},
        textoLegalFixo = ${payload.textoLegalFixo},
        municipioIncidencia = ${payload.municipioIncidencia}, ufIncidencia = ${payload.ufIncidencia},
        provedor = ${payload.provedor}, ambiente = ${payload.ambiente}, ativo = ${payload.ativo},
        webserviceUrl = ${payload.webserviceUrl}
      where id = ${existing.id}
    `);
  } else {
    await db.execute(sql`
      insert into fiscal_config (
        cnpj, razaoSocial, nomeFantasia, inscricaoMunicipal, inscricaoEstadual,
        codigoMunicipio, municipio, uf, cep, logradouro, numero, complemento, bairro,
        telefone, email, optanteSimplesNacional,
        regimeTributario, regimeApuracao, codigoTributacaoNacional, codigoServico,
        itemListaServico, cnaeServico, descricaoTributacao,
        itemNbs, descricaoNbs, aliquotaSimplesNacional, aliquotaIss,
        descricaoServico, descricaoServicoPadrao, textoLegalFixo,
        municipioIncidencia, ufIncidencia, provedor, ambiente, ativo, webserviceUrl
      ) values (
        ${payload.cnpj}, ${payload.razaoSocial}, ${payload.nomeFantasia},
        ${payload.inscricaoMunicipal}, ${payload.inscricaoEstadual},
        ${payload.codigoMunicipio}, ${payload.municipio}, ${payload.uf},
        ${payload.cep}, ${payload.logradouro}, ${payload.numero},
        ${payload.complemento}, ${payload.bairro},
        ${payload.telefone}, ${payload.email}, ${payload.optanteSimplesNacional},
        ${payload.regimeTributario}, ${payload.regimeApuracao},
        ${payload.codigoTributacaoNacional}, ${payload.codigoServico},
        ${payload.itemListaServico}, ${payload.cnaeServico}, ${payload.descricaoTributacao},
        ${payload.itemNbs}, ${payload.descricaoNbs},
        ${payload.aliquotaSimplesNacional}, ${payload.aliquotaIss},
        ${payload.descricaoServico}, ${payload.descricaoServicoPadrao}, ${payload.textoLegalFixo},
        ${payload.municipioIncidencia}, ${payload.ufIncidencia},
        ${payload.provedor}, ${payload.ambiente}, ${payload.ativo}, ${payload.webserviceUrl}
      )
    `);
  }

  return { success: true };
}

async function getRawFiscalConfig() {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const rows = unwrapRows<any>(await db.execute(sql`
    select *
    from fiscal_config
    limit 1
  `));

  return rows[0] ?? null;
}

export async function saveFiscalCertificate(data: {
  fileName: string;
  mimeType?: string | null;
  fileBase64: string;
  password: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const existing = await getRawFiscalConfig();
  if (!existing?.id) {
    throw new Error("Salve primeiro os dados fiscais da clínica antes de enviar o certificado A1.");
  }

  const cleanedBase64 = String(data.fileBase64 ?? "").trim();
  if (!cleanedBase64) {
    throw new Error("Arquivo do certificado inválido.");
  }

  await db.execute(sql`
    update fiscal_config set
      certificadoDigital = ${encryptSensitiveValue(cleanedBase64)},
      certificadoSenha = ${encryptSensitiveValue(data.password)},
      certificadoArquivoNome = ${data.fileName},
      certificadoMimeType = ${data.mimeType ?? null},
      certificadoAtualizadoEm = NOW()
    where id = ${existing.id}
  `);

  return {
    success: true,
    certificadoConfigurado: true,
    fileName: data.fileName,
  };
}

export async function testFiscalNationalApi(ambiente?: "homologacao" | "producao") {
  const fiscal = await getRawFiscalConfig();
  if (!fiscal) {
    throw new Error("Configure primeiro os dados fiscais da clínica.");
  }

  return testNationalApiConnection(
    {
      ...fiscal,
      ambiente: ambiente ?? fiscal.ambiente ?? "homologacao",
      optanteSimplesNacional: Boolean(fiscal.optanteSimplesNacional),
    },
    ambiente ?? fiscal.ambiente ?? "homologacao",
  );
}

export async function syncFiscalMunicipalParameters(ambiente?: "homologacao" | "producao") {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const fiscal = await getRawFiscalConfig();
  if (!fiscal?.codigoMunicipio) {
    throw new Error("Informe o código IBGE do município para sincronizar os parâmetros oficiais.");
  }

  const params = await fetchMunicipalParameters(
    fiscal.codigoMunicipio,
    ambiente ?? fiscal.ambiente ?? "homologacao",
  );

  const source = params?.convenio || params?.prestador || params?.parametros || params?.data || params;

  if (source && typeof source === "object") {
    await db.execute(sql`
      update fiscal_config set
        municipio = ${source.municipio ?? fiscal.municipio ?? null},
        uf = ${source.uf ?? fiscal.uf ?? null},
        codigoMunicipio = ${source.codigoMunicipio ?? fiscal.codigoMunicipio ?? null},
        codigoServico = ${source.codigoServico ?? fiscal.codigoServico ?? null},
        itemListaServico = ${source.itemListaServico ?? fiscal.itemListaServico ?? null},
        webserviceUrl = ${source.webserviceUrl ?? fiscal.webserviceUrl ?? null}
      where id = ${fiscal.id}
    `);
  }

  return {
    success: true,
    parametros: params,
  };
}

// --- NFSE --------------------------------------------------------------------
export async function listNfse() {
  const db = await getDb();
  if (!db) return [];

  const rows = unwrapRows<any>(await db.execute(sql`select * from nfse order by createdAt desc`));
  return rows.map(normalizeNfseRow);
}

export async function createNfse(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const fiscal = await getFiscalSettings();
  if (!fiscal) {
    throw new Error("Configure os dados fiscais da clínica antes de criar a NFS-e.");
  }

  const numeroRps = Number(fiscal.numeracaoSequencial || 1);
  const valorServicos = centsToDecimal(data.valorServico);
  const valorDeducoes = centsToDecimal(data.valorDeducao);
  const descontoIncondicionado = centsToDecimal(data.valorDescontoIncondicionado);
  const baseCalculo = Math.max(0, Number((valorServicos - valorDeducoes - descontoIncondicionado).toFixed(2)));
  const aliquotaIssPercent = Number.parseFloat(String(fiscal.aliquotaIss ?? 0));
  const aliquota = Number.isFinite(aliquotaIssPercent) ? Number((aliquotaIssPercent / 100).toFixed(4)) : 0;
  const valorIss = Number((baseCalculo * aliquota).toFixed(2));
  const valorLiquidoNfse = Number(baseCalculo.toFixed(2));
  const dataCompetencia = data.dataCompetencia || new Date().toISOString().slice(0, 10);
  const descricaoServico = buildFiscalServiceDescription(fiscal, data);
  const tomadorEndereco = JSON.stringify({
    cep: data.tomadorCep || null,
    municipio: data.tomadorMunicipio || null,
    uf: data.tomadorUf || null,
    bairro: data.tomadorBairro || null,
    logradouro: data.tomadorLogradouro || null,
    numero: data.tomadorNumero || null,
    complemento: data.tomadorComplemento || null,
  });

  const insertResult: any = await db.execute(sql`
    insert into nfse (
      patientId, budgetId,
      tomadorNome, tomadorCpfCnpj, tomadorTipoDocumento, tomadorEmail, tomadorEndereco,
      numeroRps, dataEmissao, dataCompetencia,
      descricaoServico, codigoServico, itemListaServico, cnaeServico, codigoMunicipioIncidencia,
      valorServicos, valorDeducoes, valorIss, baseCalculo, aliquota, valorLiquidoNfse,
      descontoIncondicionado, formaPagamento, detalhesPagamento,
      ambiente, enviadoPorId, status
    ) values (
      ${data.patientId ?? null}, ${data.budgetId ?? null},
      ${data.tomadorNome}, ${data.tomadorDocumento},
      ${data.tomadorTipoDocumento ?? inferDocumentType(data.tomadorDocumento)},
      ${data.tomadorEmail ?? null}, ${tomadorEndereco},
      ${numeroRps}, NOW(), ${dataCompetencia},
      ${descricaoServico},
      ${fiscal.codigoServico ?? fiscal.codigoTributacaoNacional ?? null},
      ${fiscal.itemListaServico ?? null}, ${fiscal.cnaeServico ?? null},
      ${fiscal.codigoMunicipio ?? null},
      ${valorServicos}, ${valorDeducoes}, ${valorIss}, ${baseCalculo}, ${aliquota}, ${valorLiquidoNfse},
      ${descontoIncondicionado}, ${data.formaPagamento ?? null}, ${data.detalhesPagamento ?? null},
      ${data.ambiente ?? fiscal.ambiente ?? "homologacao"}, ${userId}, ${"rascunho"}
    )
  `);

  const insertedId = insertResult?.insertId ?? insertResult?.[0]?.insertId;
  if (!insertedId) {
    throw new Error("Não foi possível identificar o rascunho da NFS-e criado.");
  }

  await db.execute(sql`
    update fiscal_config set numeracaoSequencial = ${numeroRps + 1} where id = ${fiscal.id}
  `);

  const insertedRows = unwrapRows<any>(await db.execute(sql`
    select * from nfse where id = ${insertedId} limit 1
  `));

  return normalizeNfseRow(insertedRows[0]);
}

export async function emitNfse(nfseId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const current = unwrapRows<any>(await db.execute(sql`select * from nfse where id = ${nfseId} limit 1`));
  if (!current[0]) throw new Error("NFS-e não encontrada.");

  const pendingMessage =
    "A emissão automática no Emissor Nacional ainda não está integrada. O rascunho foi preparado para conferência e emissão manual no portal nfse.gov.br.";

  await db.execute(sql`
    update nfse set
      status = ${'aguardando'},
      erroMensagem = ${pendingMessage},
      tentativas = tentativas + 1
    where id = ${nfseId}
  `);

  return {
    success: true,
    status: 'aguardando',
    message: pendingMessage,
  };
}

export async function cancelNfse(nfseId: number, reason: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  await db.execute(sql`
    update nfse set
      status = ${'cancelada'},
      motivoCancelamento = ${reason},
      dataCancelamento = NOW()
    where id = ${nfseId}
  `);
  return { success: true };
}

export async function emitNfseThroughNationalApi(nfseId: number, userId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const current = unwrapRows<any>(await db.execute(sql`select * from nfse where id = ${nfseId} limit 1`));
  if (!current[0]) throw new Error("NFS-e não encontrada.");

  const fiscal = await getRawFiscalConfig();
  if (!fiscal) {
    throw new Error("Configure os dados fiscais da clínica antes de emitir a NFS-e.");
  }

  try {
    const result = await emitNfseWithNationalApi(
      {
        ...fiscal,
        optanteSimplesNacional: Boolean(fiscal.optanteSimplesNacional),
      },
      current[0] as any,
    );

    await db.execute(sql`
      update nfse set
        status = ${result.status},
        numeroNfse = ${result.numeroNfse ?? null},
        chaveAcesso = ${result.chaveAcesso ?? null},
        protocolo = ${result.protocolo ?? null},
        numeroDps = ${result.numeroDps ?? null},
        codigoVerificacao = ${result.codigoVerificacao ?? null},
        linkNfse = ${result.linkNfse ?? null},
        xmlEnviado = ${result.xmlEnviado},
        xmlRetorno = ${result.xmlRetorno},
        xmlNfse = ${result.xmlNfse},
        erroMensagem = null,
        tentativas = tentativas + 1,
        updatedAt = NOW()
      where id = ${nfseId}
    `);

    await logNfseEvent(nfseId, "emissao", {
      status: result.status,
      message: result.message,
      xmlRequest: result.xmlEnviado,
      xmlResponse: result.xmlRetorno,
      userId,
    });

    return {
      success: true,
      status: result.status,
      message: result.message,
      chaveAcesso: result.chaveAcesso,
      numeroNfse: result.numeroNfse,
      protocolo: result.protocolo,
      linkNfse: result.linkNfse,
    };
  } catch (error: any) {
    const message = error?.message || "Falha ao emitir a NFS-e na API nacional.";

    await db.execute(sql`
      update nfse set
        status = ${'erro'},
        erroMensagem = ${message},
        tentativas = tentativas + 1,
        updatedAt = NOW()
      where id = ${nfseId}
    `);

    await logNfseEvent(nfseId, "erro", {
      status: "erro",
      message,
      userId,
    });

    throw new Error(message);
  }
}

// --- BUDGETS -----------------------------------------------------------------
export async function listBudgets() {
  const db = await getDb();
  if (!db) return [];

  const budgets = unwrapRows<any>(await db.execute(sql`
    select
      b.*,
      p.fullName as patientName,
      p.email as patientEmail,
      p.phone as patientPhone
    from budgets b
    left join patients p on p.id = b.patientId
    order by b.createdAt desc
  `));

  const budgetIds = budgets.map((budget) => Number(budget.id)).filter(Boolean);
  const latestNfseByBudgetId = new Map<number, any>();

  if (budgetIds.length > 0) {
    const nfseRows = unwrapRows<any>(await db.execute(sql`
      select *
      from nfse
      where budgetId in (${sql.join(budgetIds.map((id) => sql`${id}`), sql`, `)})
      order by createdAt desc, id desc
    `));

    for (const nfse of nfseRows) {
      const currentBudgetId = Number(nfse.budgetId || 0);
      if (!currentBudgetId || latestNfseByBudgetId.has(currentBudgetId)) continue;
      latestNfseByBudgetId.set(currentBudgetId, normalizeNfseRow(nfse));
    }
  }

  return budgets.map((budget) => {
    const total = Number.parseFloat(String(budget.total ?? 0));
    const subtotal = Number.parseFloat(String(budget.subtotal ?? total));
    const discount = Number.parseFloat(String(budget.discount ?? 0));

    return {
      ...budget,
      items: parseBudgetItems(budget.items),
      totalInCents: decimalToCents(total),
      subtotalInCents: decimalToCents(subtotal),
      discountInCents: decimalToCents(discount),
      patientName: budget.patientName ?? `Paciente #${budget.patientId}`,
      patientEmail: budget.patientEmail ?? null,
      patientPhone: budget.patientPhone ?? null,
      latestNfse: latestNfseByBudgetId.get(Number(budget.id)) ?? null,
    };
  });
}

export async function listBudgetsByPatient(patientId: number) {
  const budgets = await listBudgets();
  return budgets.filter((budget: any) => Number(budget.patientId) === Number(patientId));
}

export async function getBudgetById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const rows = unwrapRows<any>(await db.execute(sql`
    select b.*, p.fullName as patientName, p.email as patientEmail, p.phone as patientPhone
    from budgets b
    left join patients p on p.id = b.patientId
    where b.id = ${id}
    limit 1
  `));

  if (!rows[0]) return null;
  const b = rows[0];
  const total = Number.parseFloat(String(b.total ?? 0));
  const subtotal = Number.parseFloat(String(b.subtotal ?? total));
  const discount = Number.parseFloat(String(b.discount ?? 0));
  return {
    ...b,
    items: parseBudgetItems(b.items),
    totalInCents: decimalToCents(total),
    subtotalInCents: decimalToCents(subtotal),
    discountInCents: decimalToCents(discount),
    patientName: b.patientName ?? `Paciente #${b.patientId}`,
    patientPhone: b.patientPhone ?? null,
  };
}

export async function getPatientDocumentById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const rows = unwrapRows<any>(await db.execute(sql`
    select pd.*, p.fullName as patientName, p.phone as patientPhone, u.name as doctorName
    from patient_documents pd
    left join patients p on p.id = pd.patientId
    left join users u on u.id = pd.doctorId
    where pd.id = ${id}
    limit 1
  `));

  return rows[0] ? normalizeDocumentRow(rows[0]) : null;
}

export async function getNfseById(id: number) {
  const db = await getDb();
  if (!db) return null;

  const rows = unwrapRows<any>(await db.execute(sql`
    select n.*, p.fullName as patientName, p.phone as patientPhone, p.email as patientEmail
    from nfse n
    left join patients p on p.id = n.patientId
    where n.id = ${id}
    limit 1
  `));

  return rows[0] ? normalizeNfseRow(rows[0]) : null;
}

export async function createBudget(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const resolvedItems: any[] = [];

  for (const [index, item] of (data.items ?? []).entries()) {
    const procedure = await getProcedureById(item.procedureId);
    const price = await getProcedurePrice(item.procedureId, item.areaId, item.complexity);
    const areas = await getProcedureAreas(item.procedureId);
    const area = areas.find((entry: any) => Number(entry.id) === Number(item.areaId));

    if (!procedure || !price || !area) {
      throw new Error(`Não foi possível montar o item ${index + 1} do orçamento.`);
    }

    const quantity = Number(item.quantity || 1);
    const unitPriceInCents = Number(price.priceInCents || 0);

    resolvedItems.push({
      procedureId: item.procedureId,
      procedureName: procedure.name,
      areaId: item.areaId,
      areaName: area.areaName,
      complexity: item.complexity,
      quantity,
      unitPriceInCents,
      subtotalInCents: unitPriceInCents * quantity,
    });
  }

  const subtotalInCents = resolvedItems.reduce((sum, item) => sum + item.subtotalInCents, 0);
  const today = new Date();
  const validUntil = new Date(today);
  validUntil.setDate(validUntil.getDate() + 10);
  const title =
    resolvedItems.length === 1
      ? resolvedItems[0].procedureName
      : `${resolvedItems.length} procedimentos`;

  const result = await db.execute(sql`
    insert into budgets
      (patientId, doctorId, date, validUntil, title, items, subtotal, discount, total, status, notes)
    values
      (${Number(data.patientId)}, ${userId}, ${today.toISOString().slice(0, 10)}, ${validUntil.toISOString().slice(0, 10)}, ${title}, ${JSON.stringify(resolvedItems)}, ${centsToDecimal(subtotalInCents)}, 0, ${centsToDecimal(subtotalInCents)}, 'rascunho', ${data.clinicalNotes ?? null})
  `);

  const insertedId = unwrapInsertId(result);
  const created = insertedId ? await getBudgetById(insertedId) : null;
  return created ?? {
    id: insertedId,
    patientId: data.patientId,
    doctorId: userId,
    title,
    items: resolvedItems,
    totalInCents: subtotalInCents,
    subtotalInCents,
    discountInCents: 0,
  };
}

export async function emitBudget(budgetId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  await db.execute(sql`
    update budgets
    set status = 'enviado', updatedAt = now()
    where id = ${budgetId}
  `);
  return { success: true };
}

export async function approveBudget(budgetId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  await db.execute(sql`
    update budgets
    set status = 'aprovado', updatedAt = now()
    where id = ${budgetId}
  `);
  return { success: true };
}

export async function emitBudgetNfse(
  budgetId: number,
  data: {
    formaPagamento: string;
    detalhesPagamento?: string | null;
    dataCompetencia?: string | null;
    ambiente?: "homologacao" | "producao";
  },
  userId: number,
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const budgets = unwrapRows<any>(await db.execute(sql`
    select *
    from budgets
    where id = ${budgetId}
    limit 1
  `));
  const budget = budgets[0];

  if (!budget) {
    throw new Error("Orçamento não encontrado.");
  }

  if (budget.status !== "aprovado") {
    throw new Error("A NFS-e só pode ser emitida após a aprovação do orçamento.");
  }

  const existingNfseRows = unwrapRows<any>(await db.execute(sql`
    select *
    from nfse
    where budgetId = ${budgetId}
    order by createdAt desc, id desc
    limit 1
  `));
  const existingNfse = existingNfseRows[0];

  if (existingNfse?.status === "autorizada") {
    return {
      success: true,
      reused: true,
      message: "A NFS-e deste orçamento já está autorizada.",
      nfse: normalizeNfseRow(existingNfse),
    };
  }

  if (existingNfse?.status === "rascunho" || existingNfse?.status === "erro") {
    const emission = await emitNfseThroughNationalApi(Number(existingNfse.id), userId);
    const refreshed = unwrapRows<any>(await db.execute(sql`
      select *
      from nfse
      where id = ${existingNfse.id}
      limit 1
    `));

    return {
      ...emission,
      nfse: refreshed[0] ? normalizeNfseRow(refreshed[0]) : null,
    };
  }

  const patient = await getPatientById(Number(budget.patientId));
  if (!patient) {
    throw new Error("Paciente vinculado ao orçamento não foi encontrado.");
  }

  const created = await createNfse(
    {
      budgetId,
      patientId: budget.patientId,
      tomadorDocumento: patient.cpf || "",
      tomadorTipoDocumento: inferDocumentType(patient.cpf || ""),
      tomadorNome: patient.name || patient.fullName || `Paciente #${budget.patientId}`,
      tomadorEmail: patient.email || undefined,
      tomadorTelefone: patient.phone || undefined,
      tomadorCep: patient.zipCode || undefined,
      tomadorMunicipio: patient.city || undefined,
      tomadorUf: patient.state || undefined,
      tomadorBairro: patient.neighborhood || undefined,
      tomadorLogradouro: typeof patient.address === "string" ? patient.address : "",
      tomadorNumero: undefined,
      tomadorComplemento: undefined,
      descricaoServico: undefined,
      complementoDescricao: budget.notes || undefined,
      valorServico: decimalToCents(Number.parseFloat(String(budget.total ?? 0))),
      formaPagamento: data.formaPagamento,
      detalhesPagamento: data.detalhesPagamento || undefined,
      dataCompetencia: data.dataCompetencia || budget.date,
      ambiente: data.ambiente,
    },
    userId,
  );

  const emission = await emitNfseThroughNationalApi(Number(created.id), userId);
  const refreshed = unwrapRows<any>(await db.execute(sql`
    select *
    from nfse
    where id = ${created.id}
    limit 1
  `));

  return {
    ...emission,
    nfse: refreshed[0] ? normalizeNfseRow(refreshed[0]) : normalizeNfseRow(created),
  };
}

// --- CRM ---------------------------------------------------------------------
export async function listCrmIndications(limit: number = 100) {
  const db = await getDb();
  if (!db) return [];

  await ensureOptionalModuleTables(db);

  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  return unwrapRows<any>(await db.execute(sql`
    select *
    from crm_indications
    order by createdAt desc, id desc
    limit ${safeLimit}
  `));
}

export async function createCrmIndication(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  await ensureOptionalModuleTables(db);

  const result = await db.execute(sql`
    insert into crm_indications
      (patientId, procedureName, notes, status, indicatedBy, appointmentId)
    values
      (${Number(data.patientId)}, ${data.procedureName}, ${data.notes ?? null}, 'indicado', ${userId}, ${data.appointmentId ?? null})
  `);

  const insertedId = unwrapInsertId(result);
  const rows = insertedId
    ? unwrapRows<any>(await db.execute(sql`select * from crm_indications where id = ${insertedId} limit 1`))
    : [];
  return rows[0] ?? { id: insertedId, ...data, indicatedBy: userId, status: "indicado" };
}

export async function updateCrmIndication(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  await ensureOptionalModuleTables(db);

  await db.execute(sql`
    update crm_indications
    set status = coalesce(${data.status ?? null}, status),
        notes = coalesce(${data.notes ?? null}, notes),
        updatedAt = now()
    where id = ${id}
  `);
  return { success: true };
}

// --- SIGNATURES ---------------------------------------------------------------
export async function sendForSignature(
  documentId: number,
  documentType: string,
  userId: number,
  extra: {
    d4signDocumentKey?: string;
    d4signSafeKey?: string;
    status?: string;
    signatureType?: string;
    signedDocumentUrl?: string;
    webhookData?: any;
  } = {},
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const result = await db.execute(sql`
    insert into document_signatures
      (resourceId, resourceType, doctorId, d4signDocumentKey, d4signSafeKey, status, signatureType, signedDocumentUrl, webhookData)
    values
      (${documentId}, ${documentType}, ${userId}, ${extra.d4signDocumentKey ?? null}, ${extra.d4signSafeKey ?? null}, ${extra.status || 'enviado'}, ${extra.signatureType || 'eletronica'}, ${extra.signedDocumentUrl ?? null}, ${extra.webhookData ? JSON.stringify(extra.webhookData) : null})
  `);

  const insertedId = unwrapInsertId(result);
  const rows = insertedId
    ? unwrapRows<any>(await db.execute(sql`select * from document_signatures where id = ${insertedId} limit 1`))
    : [];
  return rows[0] ?? { id: insertedId, resourceId: documentId, resourceType: documentType, doctorId: userId };
}

// --- TEMPLATES ----------------------------------------------------------------
export async function listTemplates() {
  const db = await getDb();
  if (!db) return [];

  return unwrapRows<any>(await db.execute(sql`
    select *
    from medical_record_templates
    where active = 1
    order by name asc
  `));
}

export async function createTemplate(data: any, userId: number) {
  return createTemplateNormalized(data, userId);
}

// --- MEDICAL RECORDS ----------------------------------------------------------
export async function listMedicalRecordTemplates() {
  const db = await getDb();
  if (!db) return [];

  return unwrapRows<any>(await db.execute(sql`
    select *
    from medical_record_templates
    where active = 1
    order by name asc
  `));
}

export async function listTemplatesNormalized() {
  const db = await getDb();
  if (!db) return [];

  const rows = unwrapRows<any>(await db.execute(sql`
    select *
    from medical_record_templates
    where active = 1
    order by name asc
  `));
  return rows.map((row: any) => normalizeTemplateRow(row));
}

export async function createTemplateNormalized(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const group = normalizeTemplateGroup(data.group ?? data.specialty ?? data.name);
  const sections = Array.isArray(data.sections) ? data.sections : [];
  const result = await db.execute(sql`
    insert into medical_record_templates
      (name, specialty, description, sections, active, createdBy)
    values
      (${data.name}, ${data.specialty ?? getTemplateGroupLabel(group)}, ${data.description ?? null}, ${JSON.stringify(sections)}, 1, ${userId})
  `);

  const insertedId = unwrapInsertId(result);
  const rows = insertedId
    ? unwrapRows<any>(await db.execute(sql`select * from medical_record_templates where id = ${insertedId} limit 1`))
    : [];
  return rows[0] ? normalizeTemplateRow(rows[0]) : { id: insertedId, ...data, sections, createdBy: userId, active: true };
}

export async function updateTemplateNormalized(id: number, data: any, _userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const group = normalizeTemplateGroup(data.group ?? data.specialty ?? data.name);
  const sections = Array.isArray(data.sections) ? data.sections : [];
  await db.execute(sql`
    UPDATE medical_record_templates
       SET name = ${data.name},
           specialty = ${data.specialty ?? getTemplateGroupLabel(group)},
           description = ${data.description ?? null},
           sections = ${JSON.stringify(sections)},
           updatedAt = NOW()
     WHERE id = ${id}
  `);
  return { ok: true, id };
}

/**
 * Soft delete de modelo (prescri??o / exames / evolu??o / etc.).
 * Usa active=0 para preservar documentos já gerados a partir do modelo.
 */
export async function deleteTemplateNormalized(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.execute(sql`
    UPDATE medical_record_templates
       SET active = 0, updatedAt = NOW()
     WHERE id = ${id}
  `);
  return { ok: true, id };
}

export async function listMedicalRecordTemplatesNormalized() {
  const db = await getDb();
  if (!db) return [];

  const rows = unwrapRows<any>(await db.execute(sql`
    select *
    from medical_record_templates
    where active = 1
    order by name asc
  `));
  return rows.map((row: any) => normalizeTemplateRow(row));
}

export async function listPrescriptionTemplatesNormalized() {
  const db = await getDb();
  if (!db) return [];

  const rows = unwrapRows<any>(await db.execute(sql`
    select *
    from medical_record_templates
    where active = 1
    order by name asc
  `));

  return rows
    .map((row: any) => normalizeTemplateRow(row))
    .filter((row: any) => row.group === "prescricao")
    .map((row: any) => ({
      ...row,
      type: row.description || "simples",
    }));
}

export async function createPrescriptionTemplateNormalized(data: any, userId: number) {
  return createTemplateNormalized({
    name: data.name,
    group: "prescricao",
    specialty: "Prescrição",
    description: data.type || "simples",
    sections: [{ title: data.name, type: "richtext", content: data.content ?? "", fields: [] }],
  }, userId);
}

export async function listExamTemplatesNormalized() {
  const db = await getDb();
  if (!db) return [];

  const rows = unwrapRows<any>(await db.execute(sql`
    select *
    from medical_record_templates
    where active = 1
    order by name asc
  `));

  return rows
    .map((row: any) => normalizeTemplateRow(row))
    .filter((row: any) => row.group === "solicitacao_exames");
}

export async function createExamTemplateNormalized(data: any, userId: number) {
  return createTemplateNormalized({
    name: data.name,
    group: "solicitacao_exames",
    specialty: "Solicitação de exames",
    description: data.specialty ?? null,
    sections: [{ title: data.name, type: "richtext", content: data.content ?? "", fields: [] }],
  }, userId);
}

// --- WHATSAPP -----------------------------------------------------------------
export async function sendWhatsAppMessage(phoneNumber: string, message: string) {
  const service = await createWhatsAppService();
  if (!service) {
    throw new Error("A API oficial do WhatsApp ainda não foi configurada. Informe Token, Phone Number ID e Business Account ID da Meta.");
  }

  const result = await service.sendTextMessage(phoneNumber, message);
  return {
    success: true,
    provider: "meta_cloud_api",
    messageId: result?.messages?.[0]?.id ?? `msg_${Date.now()}`,
    raw: result,
  };
}

// --- AI -----------------------------------------------------------------------
export async function invokeAI(messages: any[]) {
  // Implementa??o com LLM
  return { role: 'assistant', content: 'Resposta da IA' };
}

// --- ADMIN --------------------------------------------------------------------
export async function getDoctors() {
  const db = await getDb();
  if (!db) return [];

  return unwrapRows<any>(await db.execute(sql`
    select *
    from users
    where (role = 'medico' or role = 'admin')
      and status = 'active'
    order by name asc
  `));
}

export async function getDashboardStats() {
  const db = await getDb();
  if (!db) return { totalPatients: 0, todayAppointments: 0, totalAppointments: 0 };

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const patients = unwrapRows<any>(await db.execute(sql`select count(*) as count from patients`));
  const appointments = unwrapRows<any>(await db.execute(sql`select count(*) as count from appointments`));
  const todayAppointments = unwrapRows<any>(await db.execute(sql`
    select count(*) as count
    from appointments
    where scheduledAt >= ${todayStart}
      and scheduledAt <= ${todayEnd}
  `));

  const parseCount = (value: any) => Number(value?.count ?? value?.COUNT ?? value?.total ?? 0);

  return {
    totalPatients: parseCount(patients[0]),
    todayAppointments: parseCount(todayAppointments[0]),
    totalAppointments: parseCount(appointments[0]),
  };
}

export async function getAppointmentStats(from?: string, to?: string) {
  const db = await getDb();
  if (!db) return {};

  let query = db.select({
    status: sql`status`,
    count: sql`COUNT(*) as count`
  }).from(sql`appointments`).groupBy(sql`status`);

  if (from && to) {
    query = query.where(and(
      gte(sql`scheduledAt`, from),
      lte(sql`scheduledAt`, to)
    ));
  }

  return query;
}

export async function getAuditLogs(limit: number = 100) {
  const db = await getDb();
  if (!db) return [];

  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  return unwrapRows<any>(await db.execute(sql`
    select *
    from audit_logs
    order by createdAt desc, id desc
    limit ${safeLimit}
  `));
}

export type AuditLogFilters = {
  userId?: number | null;
  patientId?: number | null;
  action?: string | null;
  dateFrom?: string | null;  // ISO yyyy-mm-dd
  dateTo?: string | null;    // ISO yyyy-mm-dd
  limit?: number | null;
  offset?: number | null;
};

export async function listAuditLogs(filters: AuditLogFilters = {}) {
  const db = await getDb();
  if (!db) return { rows: [], total: 0 };

  const safeLimit = Math.max(1, Math.min(Number(filters.limit) || 100, 500));
  const safeOffset = Math.max(0, Math.min(Number(filters.offset) || 0, 100000));
  const userId = filters.userId ?? null;
  const patientId = filters.patientId ?? null;
  const action = filters.action ? String(filters.action).slice(0, 100) : null;
  const dateFrom = filters.dateFrom ? String(filters.dateFrom).slice(0, 32) : null;
  const dateTo = filters.dateTo ? String(filters.dateTo).slice(0, 32) : null;

  const where = sql`
    where 1=1
      and (${userId} is null or userId = ${userId})
      and (${patientId} is null or patientId = ${patientId})
      and (${action} is null or action = ${action})
      and (${dateFrom} is null or createdAt >= ${dateFrom})
      and (${dateTo} is null or createdAt < date_add(${dateTo}, interval 1 day))
  `;

  const rows = unwrapRows<any>(await db.execute(sql`
    select id, userId, userEmail, userRole, action, resourceType, resourceId, patientId, metadata, ipAddress, createdAt
    from audit_logs
    ${where}
    order by createdAt desc, id desc
    limit ${safeLimit} offset ${safeOffset}
  `));

  const totalRows = unwrapRows<{ total: number }>(await db.execute(sql`
    select count(*) as total
    from audit_logs
    ${where}
  `));
  const total = Number((totalRows?.[0] as any)?.total ?? 0);

  return { rows, total };
}

export async function listAuditLogActions(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = unwrapRows<{ action: string }>(await db.execute(sql`
    select distinct action from audit_logs order by action asc limit 200
  `));
  return rows.map((row) => String((row as any).action)).filter(Boolean);
}

export async function getUserPermissions(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return unwrapRows<any>(await db.execute(sql`
    select *
    from permissions
    where userId = ${userId}
    order by module asc
  `));
}

export async function setUserPermission(userId: number, module: string, permission: any) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const existing = unwrapRows<any>(await db.execute(sql`
    select *
    from permissions
    where userId = ${userId}
      and module = ${module}
    limit 1
  `));

  const canCreate = permission.canCreate === undefined ? false : Boolean(permission.canCreate);
  const canRead = permission.canRead === undefined ? true : Boolean(permission.canRead);
  const canUpdate = permission.canUpdate === undefined ? false : Boolean(permission.canUpdate);
  const canDelete = permission.canDelete === undefined ? false : Boolean(permission.canDelete);

  if (existing[0]) {
    await db.execute(sql`
      update permissions
      set canCreate = ${canCreate},
          canRead = ${canRead},
          canUpdate = ${canUpdate},
          canDelete = ${canDelete}
      where id = ${existing[0].id}
    `);
  } else {
    await db.execute(sql`
      insert into permissions
        (userId, module, canCreate, canRead, canUpdate, canDelete)
      values
        (${userId}, ${module}, ${canCreate}, ${canRead}, ${canUpdate}, ${canDelete})
    `);
  }

  return { success: true };
}

export async function updateUserProfile(userId: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const normalizedEmail = data.email ? String(data.email).trim().toLowerCase() : null;
  if (normalizedEmail) {
    const existingUsers = unwrapRows<any>(await db.execute(sql`
      select id
      from users
      where email = ${normalizedEmail}
        and id <> ${userId}
      limit 1
    `));

    if (existingUsers[0]) {
      throw new Error("Já existe outro usuário com este e-mail.");
    }
  }

  const name = data.name ? String(data.name).trim() : null;
  const specialty = data.specialty ? String(data.specialty).trim() : null;
  const profession = data.profession ? String(data.profession).trim() : null;
  const crm = data.crm ? String(data.crm).trim() : null;
  const professionalLicenseType = data.professionalLicenseType ? String(data.professionalLicenseType).trim().toUpperCase() : null;
  const professionalLicenseState = data.professionalLicenseState ? String(data.professionalLicenseState).trim().toUpperCase() : null;
  const phone = data.phone ? String(data.phone).trim() : null;

  await db.execute(sql`
    update users set
      name = ${name},
      email = ${normalizedEmail},
      specialty = ${specialty},
      profession = ${profession},
      crm = ${crm},
      professionalLicenseType = ${professionalLicenseType},
      professionalLicenseState = ${professionalLicenseState},
      phone = ${phone}
    where id = ${userId}
  `);
  return { success: true };
}

export async function updateUserRole(userId: number, role: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  await db.execute(sql`
    update users set role = ${role} where id = ${userId}
  `);
  return { success: true };
}

// --- CLOUD SIGNATURE (VIDaaS / BirdID) -----------------------------------

async function ensureCloudSignatureUserColumns(db: any) {
  if (!ensureCloudSignatureUserColumnsPromise) {
    ensureCloudSignatureUserColumnsPromise = (async () => {
      const columns = await getTableColumns("users");
      const alterations: string[] = [];

      if (!columns.has("cloudSignatureProvider")) {
        alterations.push("ADD COLUMN `cloudSignatureProvider` VARCHAR(64) NULL");
      }
      if (!columns.has("cloudSignatureCpf")) {
        alterations.push("ADD COLUMN `cloudSignatureCpf` VARCHAR(14) NULL");
      }
      if (!columns.has("cloudSignatureClientId")) {
        alterations.push("ADD COLUMN `cloudSignatureClientId` VARCHAR(255) NULL");
      }
      if (!columns.has("cloudSignatureClientSecret")) {
        alterations.push("ADD COLUMN `cloudSignatureClientSecret` TEXT NULL");
      }
      if (!columns.has("cloudSignatureAmbiente")) {
        alterations.push("ADD COLUMN `cloudSignatureAmbiente` VARCHAR(32) NULL DEFAULT 'homologacao'");
      }

      if (alterations.length > 0) {
        await db.execute(sql.raw(`ALTER TABLE users ${alterations.join(", ")}`));
        clearTableColumnCache("users");
      }
    })();
  }

  try {
    await ensureCloudSignatureUserColumnsPromise;
  } catch (error) {
    ensureCloudSignatureUserColumnsPromise = null;
    throw error;
  }
}
export async function getCloudSignatureConfig(userId: number) {
  const db = await getDb();
  if (!db) return null;

  await ensureCloudSignatureUserColumns(db);

  const rows = unwrapRows<any>(await db.execute(sql`
    select cloudSignatureProvider, cloudSignatureCpf, cloudSignatureClientId,
           cloudSignatureClientSecret, cloudSignatureAmbiente
    from users
    where id = ${userId}
    limit 1
  `));

  const u = rows[0];
  if (!u?.cloudSignatureClientId) return null;

  return {
    provider: (u.cloudSignatureProvider || "vidaas") as "vidaas" | "birdid",
    cpf: String(u.cloudSignatureCpf || "").replace(/\D/g, ""),
    clientId: u.cloudSignatureClientId || "",
    clientSecret: u.cloudSignatureClientSecret || "",
    ambiente: (u.cloudSignatureAmbiente || "homologacao") as "producao" | "homologacao",
  };
}

export async function saveCloudSignatureConfig(
  userId: number,
  data: {
    provider: "vidaas" | "birdid";
    cpf: string;
    clientId: string;
    clientSecret: string;
    ambiente: "producao" | "homologacao";
  },
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  await ensureCloudSignatureUserColumns(db);

  await db.execute(sql`
    update users set
      cloudSignatureProvider = ${data.provider},
      cloudSignatureCpf = ${data.cpf.replace(/\D/g, "")},
      cloudSignatureClientId = ${data.clientId},
      cloudSignatureClientSecret = ${data.clientSecret},
      cloudSignatureAmbiente = ${data.ambiente}
    where id = ${userId}
  `);

  return { success: true };
}

export async function createSignatureSession(data: {
  userId: number;
  provider: "vidaas" | "birdid";
  documentType: string;
  documentId: number;
  documentAlias: string;
  documentHash: string;
  authorizeCode: string;
  codeVerifier: string;
  expiresInSeconds: number;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const expiresAt = new Date(Date.now() + data.expiresInSeconds * 1000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");

  const result: any = await db.execute(sql`
    insert into signature_sessions
      (userId, provider, documentType, documentId, documentAlias, documentHash,
       authorizeCode, codeVerifier, status, expiresAt)
    values
      (${data.userId}, ${data.provider}, ${data.documentType}, ${data.documentId},
       ${data.documentAlias}, ${data.documentHash},
       ${data.authorizeCode}, ${data.codeVerifier}, ${"pendente"}, ${expiresAt})
  `);

  return result?.insertId ?? result?.[0]?.insertId;
}

export async function getSignatureSession(sessionId: number) {
  const db = await getDb();
  if (!db) return null;

  const rows = unwrapRows<any>(await db.execute(sql`
    select * from signature_sessions where id = ${sessionId} limit 1
  `));

  return rows[0] ?? null;
}

export async function updateSignatureSession(
  sessionId: number,
  data: {
    status?: string;
    accessToken?: string;
    signatureCms?: string;
    errorMessage?: string;
    codeVerifier?: string;
    authorizeCode?: string;
  },
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  await db.execute(sql`
    update signature_sessions set
      status = ${data.status ?? sql`status`},
      accessToken = ${data.accessToken ?? sql`accessToken`},
      signatureCms = ${data.signatureCms ?? sql`signatureCms`},
      errorMessage = ${data.errorMessage ?? sql`errorMessage`},
      codeVerifier = ${data.codeVerifier ?? sql`codeVerifier`},
      authorizeCode = ${data.authorizeCode ?? sql`authorizeCode`}
    where id = ${sessionId}
  `);
}

export async function listSignatureSessions(userId: number) {
  const db = await getDb();
  if (!db) return [];

  const rows = unwrapRows<any>(await db.execute(sql`
    select id, provider, documentType, documentId, documentAlias, status,
           errorMessage, expiresAt, createdAt
    from signature_sessions
    where userId = ${userId}
    order by createdAt desc
    limit 50
  `));

  return rows;
}

export async function applyDocumentSignature(data: {
  documentType: string;
  documentId: number;
  sessionId: number;
  provider: string;
  signedByName: string;
  signatureCms: string;
  validationCode: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const now = new Date().toISOString().slice(0, 19).replace("T", " ");

  if (data.documentType === "evolucao") {
    await db.execute(sql`
      update clinical_evolutions set
        signatureProvider = ${data.provider},
        signedByDoctorName = ${data.signedByName},
        signedPdfUrl = null,
        signatureHash = ${data.validationCode},
        signatureValidationCode = ${data.validationCode},
        signatureCertificateLabel = ${data.provider === "vidaas" ? "VIDaaS ICP-Brasil A3" : "BirdID ICP-Brasil A3"},
        signedAt = ${now},
        d4signStatus = ${"assinado"},
        signatureSessionId = ${data.sessionId}
      where id = ${data.documentId}
    `);
  } else if (data.documentType === "atestado") {
    const patientDocumentRows = unwrapRows<any>(await db.execute(sql`
      select *
      from patient_documents
      where id = ${data.documentId}
      limit 1
    `));

    if (patientDocumentRows[0]) {
      const current = patientDocumentRows[0];
      const metadata = parseClinicalDocumentMetadata(current.description) ?? {};
      const content = typeof metadata?.content === "string" && metadata.content.trim()
        ? metadata.content
        : resolveStoredTextDocumentContent(current);
      const summary = metadata?.summary || summarizeClinicalDocumentContent(content) || current.description || "";
      const nextDescription = serializeClinicalDocumentMetadata({
        ...metadata,
        summary,
        content,
        templateGroup: metadata?.templateGroup ?? null,
        signedAt: now,
        signedByName: data.signedByName,
        signatureProvider: data.provider,
        signatureValidationCode: data.validationCode,
        signatureSessionId: data.sessionId,
        signatureCms: data.signatureCms,
      });

      await db.execute(sql`
        update patient_documents set
          description = ${nextDescription}
        where id = ${data.documentId}
      `);
    } else {
      await db.execute(sql`
        update attestations set
          signatureProvider = ${data.provider},
          signedByName = ${data.signedByName},
          signatureCms = ${data.signatureCms},
          signatureValidationCode = ${data.validationCode},
          signedAt = ${now},
          signatureSessionId = ${data.sessionId}
        where id = ${data.documentId}
      `);
    }
  } else if (data.documentType === "prescricao") {
    await db.execute(sql`
      update prescriptions set
        signatureProvider = ${data.provider},
        signedByName = ${data.signedByName},
        signatureCms = ${data.signatureCms},
        signatureValidationCode = ${data.validationCode},
        signedAt = ${now},
        signatureSessionId = ${data.sessionId}
      where id = ${data.documentId}
    `);
  } else if (data.documentType === "exame") {
    await db.execute(sql`
      update exam_requests set
        signatureProvider = ${data.provider},
        signedByName = ${data.signedByName},
        signatureCms = ${data.signatureCms},
        signatureValidationCode = ${data.validationCode},
        signedAt = ${now},
        signatureSessionId = ${data.sessionId}
      where id = ${data.documentId}
    `);
  }

  return { success: true };
}

// --- CERTILLION (agregador VIDaaS / BirdID / CERTILLION_SIGNER) --------------

export async function getCertillionConfig() {
  const db = await getDb();
  if (!db) return null;
  const rows = unwrapRows<any>(
    await db.execute(sql`
      SELECT certillionClientId, certillionClientSecret, certillionRedirectUri,
             certillionBaseUrl, certillionDefaultPsc, certillionEnabled
      FROM clinic_settings LIMIT 1
    `),
  );
  const s = rows[0] || {};
  const clientId = s.certillionClientId || process.env.CERTILLION_CLIENT_ID || "";
  const clientSecret = s.certillionClientSecret
    ? decryptSensitiveValueSafe(s.certillionClientSecret)
    : process.env.CERTILLION_CLIENT_SECRET || "";
  const redirectUri =
    s.certillionRedirectUri || process.env.CERTILLION_REDIRECT_URI || "";
  const baseUrl =
    s.certillionBaseUrl || process.env.CERTILLION_BASE_URL || "https://cloud.certillion.com";
  const defaultPsc = s.certillionDefaultPsc || "VIDAAS";
  const enabled = Boolean(s.certillionEnabled) || Boolean(clientId && clientSecret);

  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri, baseUrl, defaultPsc, enabled };
}

function decryptSensitiveValueSafe(v: string): string {
  try {
    // lazy import to avoid top-level await
    const { decryptSensitiveValue } = require("./lib/secure-storage") as typeof import("./lib/secure-storage");
    return decryptSensitiveValue(v);
  } catch {
    return v;
  }
}

export async function saveCertillionConfig(data: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  baseUrl?: string;
  defaultPsc?: string;
  enabled?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const { encryptSensitiveValue } = await import("./lib/secure-storage");
  const encryptedSecret = encryptSensitiveValue(data.clientSecret);

  const rows = unwrapRows<any>(await db.execute(sql`SELECT id FROM clinic_settings LIMIT 1`));
  if (rows[0]?.id) {
    await db.execute(sql`
      UPDATE clinic_settings SET
        certillionClientId = ${data.clientId},
        certillionClientSecret = ${encryptedSecret},
        certillionRedirectUri = ${data.redirectUri},
        certillionBaseUrl = ${data.baseUrl || "https://cloud.certillion.com"},
        certillionDefaultPsc = ${data.defaultPsc || "VIDAAS"},
        certillionEnabled = ${data.enabled === false ? 0 : 1}
      WHERE id = ${rows[0].id}
    `);
  } else {
    await db.execute(sql`
      INSERT INTO clinic_settings
        (certillionClientId, certillionClientSecret, certillionRedirectUri,
         certillionBaseUrl, certillionDefaultPsc, certillionEnabled)
      VALUES
        (${data.clientId}, ${encryptedSecret}, ${data.redirectUri},
         ${data.baseUrl || "https://cloud.certillion.com"},
         ${data.defaultPsc || "VIDAAS"},
         ${data.enabled === false ? 0 : 1})
    `);
  }
  return { success: true };
}

export async function createCertillionSession(data: {
  userId: number;
  psc: string;
  documentType: string;
  documentId: number;
  documentAlias: string;
  documentHash: string;
  codeVerifier: string;
  stateNonce: string;
  signerCpf: string;
  expiresInSeconds: number;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const expiresAt = new Date(Date.now() + data.expiresInSeconds * 1000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  const result: any = await db.execute(sql`
    INSERT INTO signature_sessions
      (userId, provider, psc, documentType, documentId, documentAlias, documentHash,
       codeVerifier, stateNonce, status, signerCpf, expiresAt)
    VALUES
      (${data.userId}, ${"certillion"}, ${data.psc}, ${data.documentType},
       ${data.documentId}, ${data.documentAlias}, ${data.documentHash},
       ${data.codeVerifier}, ${data.stateNonce}, ${"pendente"},
       ${data.signerCpf.replace(/\D/g, "")}, ${expiresAt})
  `);
  return result?.insertId ?? result?.[0]?.insertId;
}

export async function getSignatureSessionByState(stateNonce: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = unwrapRows<any>(await db.execute(sql`
    SELECT * FROM signature_sessions WHERE stateNonce = ${stateNonce} LIMIT 1
  `));
  return rows[0] ?? null;
}

export async function updateCertillionSession(
  sessionId: number,
  data: { accessToken?: string; clientToken?: string; authorizeCode?: string; status?: string; signatureCms?: string; errorMessage?: string },
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.execute(sql`
    UPDATE signature_sessions SET
      status = ${data.status ?? sql`status`},
      accessToken = ${data.accessToken ?? sql`accessToken`},
      clientToken = ${data.clientToken ?? sql`clientToken`},
      authorizeCode = ${data.authorizeCode ?? sql`authorizeCode`},
      signatureCms = ${data.signatureCms ?? sql`signatureCms`},
      errorMessage = ${data.errorMessage ?? sql`errorMessage`}
    WHERE id = ${sessionId}
  `);
}

// --- CERTIFICADO A1 PF POR USUÁRIO -----------------------------------------

export async function saveUserA1Certificate(
  userId: number,
  data: { fileName: string; fileBase64: string; password: string },
) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const cleanedBase64 = String(data.fileBase64 ?? "").trim();
  if (!cleanedBase64) throw new Error("Arquivo do certificado inválido.");

  await db.execute(sql`
    update users set
      a1PfCertificado = ${encryptSensitiveValue(cleanedBase64)},
      a1PfSenha       = ${encryptSensitiveValue(data.password)},
      a1PfArquivoNome = ${data.fileName},
      a1PfAtualizadoEm = NOW()
    where id = ${userId}
  `);

  return { success: true, fileName: data.fileName };
}

export async function getUserA1CertificateRaw(userId: number) {
  const db = await getDb();
  if (!db) return null;

  const rows = unwrapRows<any>(await db.execute(sql`
    select a1PfCertificado, a1PfSenha, a1PfArquivoNome, a1PfAtualizadoEm
    from users where id = ${userId} limit 1
  `));

  const u = rows[0];
  if (!u?.a1PfCertificado || !u?.a1PfSenha) return null;

  const { decryptSensitiveValue } = await import("./lib/secure-storage");
  return {
    fileBase64: decryptSensitiveValue(u.a1PfCertificado) ?? "",
    password:   decryptSensitiveValue(u.a1PfSenha) ?? "",
    fileName:   u.a1PfArquivoNome ?? "",
    updatedAt:  u.a1PfAtualizadoEm ?? null,
  };
}

export async function getUserA1CertificateStatus(userId: number) {
  const db = await getDb();
  if (!db) return { configured: false };

  const rows = unwrapRows<any>(await db.execute(sql`
    select a1PfArquivoNome, a1PfAtualizadoEm,
           (a1PfCertificado IS NOT NULL AND a1PfSenha IS NOT NULL) as configured
    from users where id = ${userId} limit 1
  `));

  const u = rows[0];
  return {
    configured: Boolean(u?.configured),
    fileName: u?.a1PfArquivoNome ?? null,
    updatedAt: u?.a1PfAtualizadoEm ?? null,
  };
}
