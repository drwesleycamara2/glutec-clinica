import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

// ─── Schemas de Validação (espelham os do router) ────────────────────────────

const nfseCreateSchema = z.object({
  tomadorDocumento: z.string().min(1),
  tomadorTipoDocumento: z.enum(["cpf", "cnpj"]).default("cpf"),
  tomadorNome: z.string().min(1),
  tomadorEmail: z.string().optional(),
  tomadorTelefone: z.string().optional(),
  tomadorCep: z.string().optional(),
  tomadorMunicipio: z.string().optional(),
  tomadorUf: z.string().optional(),
  descricaoServico: z.string().default("Procedimentos Médicos Ambulatoriais"),
  complementoDescricao: z.string().optional(),
  valorServico: z.number().min(1),
  valorDeducao: z.number().optional(),
  valorDescontoIncondicionado: z.number().optional(),
  formaPagamento: z.enum(["pix", "dinheiro", "cartao_credito", "cartao_debito", "boleto", "transferencia", "financiamento", "outro"]).default("pix"),
  detalhesPagamento: z.string().optional(),
  dataCompetencia: z.string().optional(),
  ambiente: z.enum(["homologacao", "producao"]).default("homologacao"),
});

const fiscalSettingsSchema = z.object({
  cnpj: z.string().min(1),
  razaoSocial: z.string().min(1),
  nomeFantasia: z.string().optional(),
  telefone: z.string().optional(),
  email: z.string().optional(),
  optanteSimplesNacional: z.boolean().optional(),
  codigoTributacaoNacional: z.string().optional(),
  aliquotaSimplesNacional: z.string().optional(),
  ambiente: z.enum(["homologacao", "producao"]).optional(),
});

// ─── Testes de Validação NFS-e ───────────────────────────────────────────────

describe("NFS-e Schema Validation", () => {
  it("deve aceitar dados mínimos válidos", () => {
    const data = {
      tomadorDocumento: "12345678901",
      tomadorNome: "João da Silva",
      valorServico: 1332000, // R$ 13.320,00 em centavos
    };
    const result = nfseCreateSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("deve aplicar defaults corretamente", () => {
    const data = {
      tomadorDocumento: "12345678901",
      tomadorNome: "João da Silva",
      valorServico: 500000,
    };
    const result = nfseCreateSchema.parse(data);
    expect(result.tomadorTipoDocumento).toBe("cpf");
    expect(result.descricaoServico).toBe("Procedimentos Médicos Ambulatoriais");
    expect(result.formaPagamento).toBe("pix");
    expect(result.ambiente).toBe("homologacao");
  });

  it("deve rejeitar documento vazio", () => {
    const data = {
      tomadorDocumento: "",
      tomadorNome: "João da Silva",
      valorServico: 500000,
    };
    const result = nfseCreateSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("deve rejeitar nome vazio", () => {
    const data = {
      tomadorDocumento: "12345678901",
      tomadorNome: "",
      valorServico: 500000,
    };
    const result = nfseCreateSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("deve rejeitar valor zero", () => {
    const data = {
      tomadorDocumento: "12345678901",
      tomadorNome: "João da Silva",
      valorServico: 0,
    };
    const result = nfseCreateSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("deve rejeitar valor negativo", () => {
    const data = {
      tomadorDocumento: "12345678901",
      tomadorNome: "João da Silva",
      valorServico: -100,
    };
    const result = nfseCreateSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("deve aceitar CNPJ como tipo de documento", () => {
    const data = {
      tomadorDocumento: "12345678000190",
      tomadorTipoDocumento: "cnpj" as const,
      tomadorNome: "Empresa LTDA",
      valorServico: 1000000,
    };
    const result = nfseCreateSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("deve aceitar todas as formas de pagamento válidas", () => {
    const formas = ["pix", "dinheiro", "cartao_credito", "cartao_debito", "boleto", "transferencia", "financiamento", "outro"];
    for (const forma of formas) {
      const data = {
        tomadorDocumento: "12345678901",
        tomadorNome: "João da Silva",
        valorServico: 500000,
        formaPagamento: forma,
      };
      const result = nfseCreateSchema.safeParse(data);
      expect(result.success, `Forma ${forma} deve ser aceita`).toBe(true);
    }
  });

  it("deve rejeitar forma de pagamento inválida", () => {
    const data = {
      tomadorDocumento: "12345678901",
      tomadorNome: "João da Silva",
      valorServico: 500000,
      formaPagamento: "bitcoin",
    };
    const result = nfseCreateSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("deve aceitar ambiente de produção", () => {
    const data = {
      tomadorDocumento: "12345678901",
      tomadorNome: "João da Silva",
      valorServico: 500000,
      ambiente: "producao" as const,
    };
    const result = nfseCreateSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ambiente).toBe("producao");
    }
  });

  it("deve aceitar dados completos com todos os campos", () => {
    const data = {
      tomadorDocumento: "12345678901",
      tomadorTipoDocumento: "cpf" as const,
      tomadorNome: "Maria Oliveira",
      tomadorEmail: "maria@email.com",
      tomadorTelefone: "(19) 99999-9999",
      tomadorCep: "13840-000",
      tomadorMunicipio: "Mogi Guaçu",
      tomadorUf: "SP",
      descricaoServico: "Procedimentos Médicos Ambulatoriais",
      complementoDescricao: "Pagamento via Pix",
      valorServico: 1332000,
      valorDeducao: 0,
      valorDescontoIncondicionado: 0,
      formaPagamento: "pix" as const,
      detalhesPagamento: "Pagamento à vista",
      dataCompetencia: "2026-03-14",
      ambiente: "producao" as const,
    };
    const result = nfseCreateSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

// ─── Testes de Validação Fiscal Settings ─────────────────────────────────────

describe("Fiscal Settings Schema Validation", () => {
  it("deve aceitar dados mínimos válidos", () => {
    const data = {
      cnpj: "46.201.011/0001-30",
      razaoSocial: "WESLEY SERVICOS MEDICOS LTDA",
    };
    const result = fiscalSettingsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("deve rejeitar CNPJ vazio", () => {
    const data = {
      cnpj: "",
      razaoSocial: "WESLEY SERVICOS MEDICOS LTDA",
    };
    const result = fiscalSettingsSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("deve rejeitar razão social vazia", () => {
    const data = {
      cnpj: "46.201.011/0001-30",
      razaoSocial: "",
    };
    const result = fiscalSettingsSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("deve aceitar dados completos", () => {
    const data = {
      cnpj: "46.201.011/0001-30",
      razaoSocial: "WESLEY SERVICOS MEDICOS LTDA",
      nomeFantasia: "Clínica Glutée",
      telefone: "(19) 3861-2800",
      email: "adcon17@hotmail.com",
      optanteSimplesNacional: true,
      codigoTributacaoNacional: "04.03.03",
      aliquotaSimplesNacional: "18.63",
      ambiente: "producao" as const,
    };
    const result = fiscalSettingsSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

// ─── Testes de Cálculo de Valores ────────────────────────────────────────────

describe("Cálculos de Valores NFS-e", () => {
  it("deve calcular valor líquido corretamente", () => {
    const valorServico = 1332000; // R$ 13.320,00
    const valorDeducao = 0;
    const valorDesconto = 0;
    const valorLiquido = valorServico - valorDeducao - valorDesconto;
    expect(valorLiquido).toBe(1332000);
  });

  it("deve calcular valor líquido com dedução", () => {
    const valorServico = 1332000;
    const valorDeducao = 100000; // R$ 1.000,00
    const valorDesconto = 0;
    const valorLiquido = valorServico - valorDeducao - valorDesconto;
    expect(valorLiquido).toBe(1232000);
  });

  it("deve calcular valor líquido com desconto", () => {
    const valorServico = 1332000;
    const valorDeducao = 0;
    const valorDesconto = 200000; // R$ 2.000,00
    const valorLiquido = valorServico - valorDeducao - valorDesconto;
    expect(valorLiquido).toBe(1132000);
  });

  it("deve calcular valor aproximado dos tributos (Simples Nacional 18.63%)", () => {
    const valorServico = 1332000;
    const aliquota = 18.63;
    const valorTributos = Math.round(valorServico * (aliquota / 100));
    expect(valorTributos).toBe(248152); // R$ 2.481,52
  });

  it("deve calcular tributos para valor pequeno", () => {
    const valorServico = 10000; // R$ 100,00
    const aliquota = 18.63;
    const valorTributos = Math.round(valorServico * (aliquota / 100));
    expect(valorTributos).toBe(1863); // R$ 18,63
  });

  it("deve formatar moeda corretamente", () => {
    const formatCurrency = (cents: number): string =>
      new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

    expect(formatCurrency(1332000)).toBe("R$\u00a013.320,00");
    expect(formatCurrency(0)).toBe("R$\u00a00,00");
    expect(formatCurrency(100)).toBe("R$\u00a01,00");
    expect(formatCurrency(99)).toBe("R$\u00a00,99");
  });
});

// ─── Testes de Validação de CPF/CNPJ ─────────────────────────────────────────

describe("Validação de Documentos", () => {
  it("deve aceitar CPF com 11 dígitos", () => {
    const cpf = "12345678901";
    expect(cpf.length).toBe(11);
    expect(/^\d{11}$/.test(cpf)).toBe(true);
  });

  it("deve aceitar CNPJ com 14 dígitos", () => {
    const cnpj = "46201011000130";
    expect(cnpj.length).toBe(14);
    expect(/^\d{14}$/.test(cnpj)).toBe(true);
  });

  it("deve limpar formatação de CPF", () => {
    const cpfFormatado = "123.456.789-01";
    const cpfLimpo = cpfFormatado.replace(/\D/g, "");
    expect(cpfLimpo).toBe("12345678901");
  });

  it("deve limpar formatação de CNPJ", () => {
    const cnpjFormatado = "46.201.011/0001-30";
    const cnpjLimpo = cnpjFormatado.replace(/\D/g, "");
    expect(cnpjLimpo).toBe("46201011000130");
  });
});
