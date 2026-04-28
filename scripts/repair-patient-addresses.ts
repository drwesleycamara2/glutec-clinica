import { sql } from "drizzle-orm";
import { getDb } from "../server/db";
import {
  isLegacyNumericCityCode,
  normalizeCityNameValue,
  normalizePatientAddressFields,
  normalizeStateCode,
  normalizeZipCodeValue,
  parseStoredPatientAddress,
} from "../server/lib/patient-normalization-safe";

type PatientRow = {
  id: number;
  fullName: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
};

type ViaCepAddress = {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
};

function unwrapRows<T>(result: any): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as T[];
  }
  return (result ?? []) as T[];
}

function onlyDigits(value?: string | null) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizeZip(value?: string | null) {
  const digits = onlyDigits(value);
  return digits.length >= 8 ? digits.slice(0, 8) : "";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs() {
  const args = new Set(process.argv.slice(2));
  const getNumberArg = (name: string, fallback: number) => {
    const prefix = `${name}=`;
    const value = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
    if (!value) return fallback;
    const parsed = Number(value.slice(prefix.length));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };

  return {
    apply: args.has("--apply"),
    limit: getNumberArg("--limit", 0),
    delayMs: getNumberArg("--delay-ms", 90),
  };
}

async function fetchViaCep(zip: string): Promise<ViaCepAddress | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  const response = await fetch(`https://viacep.com.br/ws/${zip}/json/`, {
    headers: { accept: "application/json" },
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
  if (!response.ok) return null;
  const payload = (await response.json()) as ViaCepAddress;
  if (!payload || payload.erro) return null;
  return payload;
}

function shouldRepair(row: PatientRow) {
  const parsedAddress = normalizePatientAddressFields(parseStoredPatientAddress(row.address));
  const rowCity = normalizeCityNameValue(row.city);
  const addressCity = normalizeCityNameValue(parsedAddress.city);
  const zip = normalizeZip(row.zipCode || parsedAddress.zip);

  return {
    parsedAddress,
    zip,
    needsRepair:
      Boolean(zip) &&
      (
        isLegacyNumericCityCode(row.city) ||
        isLegacyNumericCityCode(parsedAddress.city) ||
        !rowCity ||
        !addressCity ||
        !parsedAddress.street ||
        !normalizeStateCode(row.state || parsedAddress.state)
      ),
  };
}

function mergedAddress(row: PatientRow, viaCep: ViaCepAddress) {
  const parsed = normalizePatientAddressFields(parseStoredPatientAddress(row.address));
  const currentCity = normalizeCityNameValue(isLegacyNumericCityCode(row.city) ? parsed.city : row.city) || normalizeCityNameValue(parsed.city);
  const currentState = normalizeStateCode(row.state || parsed.state);
  const city = normalizeCityNameValue(currentCity || viaCep.localidade || "");
  const state = normalizeStateCode(currentState || viaCep.uf || "");
  const zip = normalizeZipCodeValue(normalizeZip(row.zipCode || parsed.zip || viaCep.cep || ""));
  const nextAddress = {
    street: parsed.street || viaCep.logradouro || "",
    number: parsed.number || "",
    complement: (parseStoredPatientAddress(row.address) as any).complement || "",
    neighborhood: parsed.neighborhood || viaCep.bairro || "",
    city,
    state,
    zip,
  };

  return {
    address: JSON.stringify(nextAddress),
    city: city || null,
    state: state || null,
    zipCode: zip || null,
  };
}

async function main() {
  const { apply, limit, delayMs } = parseArgs();
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL não configurado ou banco indisponível.");

  const rows = unwrapRows<PatientRow>(await db.execute(sql`
    select id, fullName, address, city, state, zipCode
    from patients
    where coalesce(active, 1) <> 0
    order by id asc
  `));

  const candidates = rows.filter((row) => shouldRepair(row).needsRepair).slice(0, limit || undefined);
  let updated = 0;
  let resolved = 0;
  let skippedWithoutCep = 0;
  let notFound = 0;
  const examples: Array<{ id: number; fullName: string | null; city: string | null; zipCode: string | null }> = [];

  for (const row of candidates) {
    const { zip } = shouldRepair(row);
    if (!zip) {
      skippedWithoutCep += 1;
      continue;
    }

    const viaCep = await fetchViaCep(zip).catch(() => null);
    if (!viaCep) {
      notFound += 1;
      continue;
    }

    resolved += 1;
    const next = mergedAddress(row, viaCep);
    examples.push({ id: row.id, fullName: row.fullName, city: next.city, zipCode: next.zipCode });

    if (apply) {
      await db.execute(sql`
        update patients
        set
          address = ${next.address},
          city = ${next.city},
          state = ${next.state},
          zipCode = ${next.zipCode},
          updatedAt = now()
        where id = ${row.id}
      `);
      updated += 1;
    }

    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }

  console.log(JSON.stringify({
    ok: true,
    mode: apply ? "apply" : "dry-run",
    totalPatients: rows.length,
    candidates: candidates.length,
    resolved,
    updated,
    skippedWithoutCep,
    notFound,
    examples: examples.slice(0, 20),
  }, null, 2));
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
