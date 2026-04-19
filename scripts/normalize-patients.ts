import { sql } from "drizzle-orm";
import { getDb } from "../server/db";
import {
  normalizeEmailValue,
  normalizePatientAddressFields,
  normalizePtBrTitleCase,
  normalizeStateCode,
  parseStoredPatientAddress,
} from "../server/lib/patient-normalization-safe";

type PatientRow = {
  id: number;
  fullName: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  emergencyContactName: string | null;
};

function unwrapRows<T>(result: any): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as T[];
  }

  return (result ?? []) as T[];
}

function stringifyAddress(address: ReturnType<typeof normalizePatientAddressFields>) {
  return JSON.stringify({
    street: address.street,
    number: address.number,
    neighborhood: address.neighborhood,
    city: address.city,
    state: address.state,
    zip: address.zip,
  });
}

function normalizeNullable(value?: string | null) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

async function main() {
  const db = await getDb();
  if (!db) {
    throw new Error("Database unavailable");
  }

  const rows = unwrapRows<PatientRow>(await db.execute(sql`
    select id, fullName, email, address, city, state, zipCode, emergencyContactName
    from patients
    order by id asc
  `));

  let updated = 0;

  for (const row of rows) {
    const normalizedAddress = normalizePatientAddressFields(
      parseStoredPatientAddress(row.address),
    );
    const next = {
      fullName: normalizeNullable(normalizePtBrTitleCase(row.fullName)),
      email: normalizeNullable(normalizeEmailValue(row.email)),
      address: stringifyAddress(normalizedAddress),
      city: normalizeNullable(normalizePtBrTitleCase(row.city ?? normalizedAddress.city)),
      state: normalizeNullable(normalizeStateCode(row.state ?? normalizedAddress.state)),
      zipCode: normalizeNullable(String(row.zipCode ?? normalizedAddress.zip ?? "").trim()),
      emergencyContactName: normalizeNullable(normalizePtBrTitleCase(row.emergencyContactName)),
    };

    const currentAddress = (() => {
      const raw = String(row.address ?? "").trim();
      if (!raw) return "";
      if (raw.startsWith("{")) {
        try {
          return JSON.stringify(JSON.parse(raw));
        } catch {
          return raw;
        }
      }
      return raw;
    })();

    const hasChanges =
      (row.fullName ?? null) !== next.fullName ||
      (row.email ?? null) !== next.email ||
      currentAddress !== next.address ||
      (row.city ?? null) !== next.city ||
      (row.state ?? null) !== next.state ||
      (row.zipCode ?? null) !== next.zipCode ||
      (row.emergencyContactName ?? null) !== next.emergencyContactName;

    if (!hasChanges) {
      continue;
    }

    await db.execute(sql`
      update patients
      set
        fullName = ${next.fullName},
        email = ${next.email},
        address = ${next.address},
        city = ${next.city},
        state = ${next.state},
        zipCode = ${next.zipCode},
        emergencyContactName = ${next.emergencyContactName},
        updatedAt = now()
      where id = ${row.id}
    `);

    updated += 1;
  }

  console.log(JSON.stringify({ ok: true, total: rows.length, updated }, null, 2));
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
