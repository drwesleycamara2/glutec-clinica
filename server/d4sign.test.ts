import { describe, expect, it, vi } from "vitest";
import { D4SignService, SAFE_MAP, selectSafe } from "./d4sign";

// ─── Testes do SAFE_MAP ──────────────────────────────────────────────────────

describe("SAFE_MAP", () => {
  it("deve conter todos os 7 cofres mapeados", () => {
    expect(Object.keys(SAFE_MAP)).toHaveLength(7);
  });

  it("deve conter UUIDs válidos (formato UUID v4)", () => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    for (const [key, uuid] of Object.entries(SAFE_MAP)) {
      expect(uuid, `Cofre ${key} deve ter UUID válido`).toMatch(uuidRegex);
    }
  });

  it("deve mapear prontuário corretamente", () => {
    expect(SAFE_MAP.prontuario).toBe("5287ea3b-602f-4434-a577-866f09879e35");
  });

  it("deve mapear termos de consentimento corretamente", () => {
    expect(SAFE_MAP.termo_consentimento).toBe("4f0472f9-fe0c-446b-88c7-5a463b3414b5");
  });

  it("deve mapear contratos padrão corretamente", () => {
    expect(SAFE_MAP.contrato_padrao).toBe("e9a2f92f-6e01-43d7-8830-01979cb21cfd");
  });
});

// ─── Testes do selectSafe ────────────────────────────────────────────────────

describe("selectSafe", () => {
  it("deve selecionar cofre de prontuário para medical_record", () => {
    const result = selectSafe("medical_record");
    expect(result).toBe(SAFE_MAP.prontuario);
  });

  it("deve selecionar cofre de prontuário para 'prontuario'", () => {
    const result = selectSafe("prontuario");
    expect(result).toBe(SAFE_MAP.prontuario);
  });

  it("deve selecionar cofre de termos para prescription", () => {
    const result = selectSafe("prescription");
    expect(result).toBe(SAFE_MAP.termo_consentimento);
  });

  it("deve selecionar cofre de termos para exam_request", () => {
    const result = selectSafe("exam_request");
    expect(result).toBe(SAFE_MAP.termo_consentimento);
  });

  it("deve selecionar cofre de contrato padrão para budget", () => {
    const result = selectSafe("budget");
    expect(result).toBe(SAFE_MAP.contrato_padrao);
  });

  it("deve selecionar cofre de contrato padrão para nfse", () => {
    const result = selectSafe("nfse");
    expect(result).toBe(SAFE_MAP.contrato_padrao);
  });

  it("deve selecionar cofre de distrato para distrato", () => {
    const result = selectSafe("distrato");
    expect(result).toBe(SAFE_MAP.distrato);
  });

  it("deve selecionar cofre de adendo para adendo", () => {
    const result = selectSafe("adendo");
    expect(result).toBe(SAFE_MAP.adendo);
  });

  it("deve usar cofre clínico quando disponível para medical_record", () => {
    const clinicSettings = { d4signSafeKeyClinical: "custom-clinical-uuid" };
    const result = selectSafe("medical_record", clinicSettings);
    expect(result).toBe("custom-clinical-uuid");
  });

  it("deve usar cofre do médico quando disponível para prescription", () => {
    const doctorSettings = { d4signSafeKey: "doctor-custom-uuid" };
    const result = selectSafe("prescription", undefined, doctorSettings);
    expect(result).toBe("doctor-custom-uuid");
  });

  it("deve usar cofre NFe da clínica para nfse quando disponível", () => {
    const clinicSettings = { d4signSafeKeyNfe: "nfe-custom-uuid" };
    const result = selectSafe("nfse", clinicSettings);
    expect(result).toBe("nfe-custom-uuid");
  });

  it("deve usar cofre padrão para tipo desconhecido", () => {
    const result = selectSafe("unknown_type");
    expect(result).toBe(SAFE_MAP.contrato_padrao);
  });

  it("deve usar cofre da clínica para tipo desconhecido quando disponível", () => {
    const clinicSettings = { d4signSafeKey: "clinic-default-uuid" };
    const result = selectSafe("unknown_type", clinicSettings);
    expect(result).toBe("clinic-default-uuid");
  });
});

// ─── Testes do D4SignService ─────────────────────────────────────────────────

describe("D4SignService", () => {
  const config = {
    tokenAPI: "test_token",
    cryptKey: "test_crypt",
    baseUrl: "https://secure.d4sign.com.br/api/v1",
  };

  it("deve criar instância com configuração válida", () => {
    const service = new D4SignService(config);
    expect(service).toBeInstanceOf(D4SignService);
  });

  it("deve armazenar token e crypt key internamente", () => {
    const service = new D4SignService(config);
    // Verificar que a instância foi criada sem erro
    expect(service).toBeDefined();
    // Acessar campos privados via reflexão para teste
    expect((service as any).tokenAPI).toBe("test_token");
    expect((service as any).cryptKey).toBe("test_crypt");
  });
});
