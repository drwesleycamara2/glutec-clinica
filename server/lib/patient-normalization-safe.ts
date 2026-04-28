const LOWERCASE_PARTICLES = new Set([
  "da",
  "das",
  "de",
  "del",
  "della",
  "di",
  "do",
  "dos",
  "du",
  "e",
  "la",
  "las",
  "le",
  "los",
  "van",
  "von",
  "y",
]);

const ROMAN_NUMERALS = new Set(["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"]);

function normalizeWhitespace(value?: string | null) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function countSuspiciousEncodingSequences(value: string) {
  const matches = value.match(/(?:\u00c3.|[\ufffd]|\u00e2\u20ac)/g);
  return matches ? matches.length : 0;
}

function looksLikeMojibake(value: string) {
  return countSuspiciousEncodingSequences(value) > 0;
}

export function repairMojibakeUtf8(value?: string | null) {
  let current = normalizeWhitespace(value);
  if (!current || !looksLikeMojibake(current)) {
    return current;
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const candidate = Buffer.from(current, "latin1").toString("utf8").replace(/\u0000/g, "").trim();
    if (!candidate) {
      break;
    }

    const currentScore = countSuspiciousEncodingSequences(current);
    const candidateScore = countSuspiciousEncodingSequences(candidate);

    if (candidateScore < currentScore) {
      current = candidate;
      if (!looksLikeMojibake(current)) {
        break;
      }
      continue;
    }

    break;
  }

  return current;
}

function titleCaseWord(word: string, isFirstWord: boolean) {
  const normalizedWord = normalizeWhitespace(word);
  if (!normalizedWord) return "";

  const lower = normalizedWord.toLocaleLowerCase("pt-BR");
  if (!isFirstWord && LOWERCASE_PARTICLES.has(lower)) {
    return lower;
  }

  if (ROMAN_NUMERALS.has(lower)) {
    return lower.toUpperCase();
  }

  return lower.replace(/(^|[-'/])(\p{L})/gu, (_match, prefix: string, letter: string) => {
    return `${prefix}${letter.toLocaleUpperCase("pt-BR")}`;
  });
}

export function normalizePtBrTitleCase(value?: string | null) {
  const repaired = repairMojibakeUtf8(value);
  if (!repaired) return "";

  return repaired
    .split(" ")
    .map((word, index) => titleCaseWord(word, index === 0))
    .join(" ");
}

export function isLegacyNumericCityCode(value?: string | null) {
  return /^\d{2,}$/.test(normalizeWhitespace(repairMojibakeUtf8(value)));
}

export function normalizeCityNameValue(value?: string | null) {
  if (isLegacyNumericCityCode(value)) {
    return "";
  }
  return normalizePtBrTitleCase(value);
}

export function normalizeEmailValue(value?: string | null) {
  const repaired = repairMojibakeUtf8(value);
  return repaired ? repaired.toLocaleLowerCase("pt-BR") : "";
}

export function normalizeStateCode(value?: string | null) {
  const repaired = repairMojibakeUtf8(value);
  return repaired ? repaired.toLocaleUpperCase("pt-BR").slice(0, 2) : "";
}

export function normalizeZipCodeValue(value?: string | null) {
  return normalizeWhitespace(value);
}

export function normalizeAddressNumberValue(value?: string | null) {
  return normalizeWhitespace(repairMojibakeUtf8(value));
}

export type PatientAddressFields = {
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

export function parseStoredPatientAddress(addressValue?: string | null): PatientAddressFields {
  const raw = String(addressValue ?? "").trim();
  if (!raw) return {};

  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    } catch {
      return {
        street: repairMojibakeUtf8(raw),
      };
    }
  }

  return {
    street: repairMojibakeUtf8(raw),
  };
}

export function normalizePatientAddressFields(address: PatientAddressFields) {
  return {
    street: normalizePtBrTitleCase(address.street),
    number: normalizeAddressNumberValue(address.number),
    neighborhood: normalizePtBrTitleCase(address.neighborhood),
    city: normalizeCityNameValue(address.city),
    state: normalizeStateCode(address.state),
    zip: normalizeZipCodeValue(address.zip),
  };
}

export function nullableOrNull(value?: string | null) {
  const normalized = normalizeWhitespace(value);
  return normalized ? normalized : null;
}
