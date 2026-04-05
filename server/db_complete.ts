import { getDb } from "./db";
import { eq, like, and, gte, lte, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";

// ─── PATIENTS ────────────────────────────────────────────────────────────────
export async function listPatients(query?: string, limit: number = 100) {
  const db = await getDb();
  if (!db) return [];
  
  let query_obj = db.select().from(sql`patients`);
  if (query) {
    query_obj = query_obj.where(like(sql`fullName`, `%${query}%`));
  }
  const rows = await query_obj.limit(limit);
  return rows.map((row: any) => {
    let addressData: Record<string, string> = {};
    if (typeof row.address === "string" && row.address.trim().startsWith("{")) {
      try {
        addressData = JSON.parse(row.address);
      } catch {
        addressData = {};
      }
    }

    return {
      ...row,
      name: row.fullName ?? "",
      zipCode: addressData.zip ?? "",
      city: addressData.city ?? "",
      state: addressData.state ?? "",
      neighborhood: addressData.neighborhood ?? "",
      address: addressData.street ?? row.address ?? "",
    };
  });
}

export async function createPatient(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`patients`).values({
    ...data,
    createdBy: userId,
    active: true,
  });
  return result[0];
}

export async function getPatientById(id: number) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(sql`patients`).where(eq(sql`id`, id)).limit(1);
  return result[0];
}

// ─── APPOINTMENTS ────────────────────────────────────────────────────────────
export async function createAppointment(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`appointments`).values({
    ...data,
    createdBy: userId,
  });
  return result[0];
}

export async function getAppointmentsByDateRange(from: string, to: string) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sql`appointments`)
    .where(and(
      gte(sql`scheduledAt`, from),
      lte(sql`scheduledAt`, to)
    ));
}

export async function updateAppointmentStatus(appointmentId: number, status: string) {
  const db = await getDb();
  if (!db) return;
  
  await db.update(sql`appointments`).set({ status }).where(eq(sql`id`, appointmentId));
  return { success: true };
}

// ─── PRESCRIPTIONS ───────────────────────────────────────────────────────────
export async function createPrescription(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`prescriptions`).values({
    ...data,
    doctorId: userId,
  });
  return result[0];
}

export async function getPrescriptionsByPatient(patientId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sql`prescriptions`).where(eq(sql`patientId`, patientId));
}

export async function listPrescriptionTemplates() {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sql`medical_record_templates`).where(eq(sql`specialty`, 'Prescrição'));
}

export async function createPrescriptionTemplate(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`medical_record_templates`).values({
    ...data,
    specialty: 'Prescrição',
    createdBy: userId,
  });
  return result[0];
}

// ─── EXAM REQUESTS ───────────────────────────────────────────────────────────
export async function createExamRequest(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`exam_requests`).values({
    ...data,
    doctorId: userId,
  });
  return result[0];
}

export async function getExamRequestsByPatient(patientId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sql`exam_requests`).where(eq(sql`patientId`, patientId));
}

export async function listExamTemplates() {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sql`medical_record_templates`).where(eq(sql`specialty`, 'Exame'));
}

export async function createExamTemplate(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`medical_record_templates`).values({
    ...data,
    specialty: 'Exame',
    createdBy: userId,
  });
  return result[0];
}

// ─── FINANCIAL ───────────────────────────────────────────────────────────────
export async function createFinancialTransaction(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`financial_transactions`).values({
    ...data,
    createdBy: userId,
  });
  return result[0];
}

export async function listFinancialTransactions() {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sql`financial_transactions`).orderBy(desc(sql`createdAt`));
}

export async function getFinancialSummary(from?: string, to?: string) {
  const db = await getDb();
  if (!db) return { totalReceita: 0, totalDespesa: 0, saldo: 0 };
  
  let query = db.select({
    type: sql`type`,
    total: sql`SUM(amountInCents) as total`
  }).from(sql`financial_transactions`).groupBy(sql`type`);
  
  if (from && to) {
    query = query.where(and(
      gte(sql`createdAt`, from),
      lte(sql`createdAt`, to)
    ));
  }
  
  const results = await query;
  const summary = { totalReceita: 0, totalDespesa: 0, saldo: 0 };
  
  for (const row of results) {
    if (row.type === 'receita') summary.totalReceita = row.total || 0;
    if (row.type === 'despesa') summary.totalDespesa = row.total || 0;
  }
  
  summary.saldo = summary.totalReceita - summary.totalDespesa;
  return summary;
}

// ─── CATALOG ─────────────────────────────────────────────────────────────────
export async function listProcedures() {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sql`budget_procedure_catalog`).where(eq(sql`active`, true));
}

export async function createProcedure(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`budget_procedure_catalog`).values({
    ...data,
    createdBy: userId,
    active: true,
  });
  return result[0];
}

export async function createProcedureArea(data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`budget_procedure_areas`).values({
    ...data,
    active: true,
  });
  return result[0];
}

export async function getProcedureAreas(procedureId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sql`budget_procedure_areas`).where(eq(sql`procedureId`, procedureId));
}

export async function getProcedureById(id: number) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(sql`budget_procedure_catalog`).where(eq(sql`id`, id)).limit(1);
  return result[0];
}

export async function getProcedurePrice(procedureId: number, areaId: number, complexity: string) {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(sql`budget_procedure_pricing`)
    .where(and(
      eq(sql`procedureId`, procedureId),
      eq(sql`areaId`, areaId),
      eq(sql`complexity`, complexity)
    )).limit(1);
  
  return result[0];
}

export async function listPaymentPlans() {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sql`budget_payment_plans`).where(eq(sql`active`, true));
}

export async function createPaymentPlan(data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`budget_payment_plans`).values({
    ...data,
    active: true,
  });
  return result[0];
}

export async function upsertProcedurePrice(data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const existing = await getProcedurePrice(data.procedureId, data.areaId, data.complexity);
  
  if (existing) {
    await db.update(sql`budget_procedure_pricing`)
      .set({ priceInCents: data.priceInCents })
      .where(eq(sql`id`, existing.id));
  } else {
    await db.insert(sql`budget_procedure_pricing`).values(data);
  }
  
  return { success: true };
}

// ─── INVENTORY ───────────────────────────────────────────────────────────────
export async function listInventoryProducts() {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sql`inventory_products`).where(eq(sql`active`, true));
}

export async function createInventoryProduct(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`inventory_products`).values({
    ...data,
    createdBy: userId,
    active: true,
  });
  return result[0];
}

export async function getLowStockItems() {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sql`inventory_products`)
    .where(sql`currentStock <= minimumStock AND active = true`);
}

export async function createInventoryMovement(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`inventory_movements`).values({
    ...data,
    createdBy: userId,
  });
  
  // Atualizar estoque do produto
  const product = await db.select().from(sql`inventory_products`).where(eq(sql`id`, data.productId)).limit(1);
  if (product) {
    let newStock = product[0].currentStock;
    if (data.type === 'entrada') newStock += data.quantity;
    else if (data.type === 'saida') newStock -= data.quantity;
    
    await db.update(sql`inventory_products`)
      .set({ currentStock: newStock })
      .where(eq(sql`id`, data.productId));
  }
  
  return result[0];
}

// ─── PHOTOS ──────────────────────────────────────────────────────────────────
export async function getPatientPhotos(patientId: number, category?: string) {
  const db = await getDb();
  if (!db) return [];
  
  let query = db.select().from(sql`patient_photos`).where(eq(sql`patientId`, patientId));
  
  if (category) {
    query = query.where(eq(sql`category`, category));
  }
  
  return query.orderBy(desc(sql`createdAt`));
}

export async function uploadPatientPhoto(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`patient_photos`).values({
    ...data,
    uploadedBy: userId,
  });
  return result[0];
}

export async function deletePatientPhoto(photoId: number) {
  const db = await getDb();
  if (!db) return;
  
  await db.delete(sql`patient_photos`).where(eq(sql`id`, photoId));
  return { success: true };
}

// ─── CHAT ────────────────────────────────────────────────────────────────────
export async function getChatMessages(channelId: string, limit: number = 100) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sql`chat_messages`)
    .where(eq(sql`channelId`, channelId))
    .orderBy(desc(sql`createdAt`))
    .limit(limit);
}

export async function createChatMessage(channelId: string, userId: number, content: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`chat_messages`).values({
    channelId,
    senderId: userId,
    content,
    messageType: 'text',
  });
  return result[0];
}

// ─── CLINIC ──────────────────────────────────────────────────────────────────
export async function getClinicSettings() {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(sql`clinic_settings`).limit(1);
  return result[0];
}

export async function updateClinicSettings(data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const existing = await getClinicSettings();
  
  if (existing) {
    await db.update(sql`clinic_settings`).set(data).where(eq(sql`id`, existing.id));
  } else {
    await db.insert(sql`clinic_settings`).values(data);
  }
  
  return { success: true };
}

// ─── FISCAL ──────────────────────────────────────────────────────────────────
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

function inferDocumentType(document: string | null | undefined): "cpf" | "cnpj" {
  const digits = String(document ?? "").replace(/\D/g, "");
  return digits.length > 11 ? "cnpj" : "cpf";
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

export async function getFiscalSettings() {
  const db = await getDb();
  if (!db) return null;
  
  const result = await db.select().from(sql`fiscal_config`).limit(1);
  const fiscal = result[0];
  if (!fiscal) return null;

  return {
    ...fiscal,
    optanteSimplesNacional: Boolean(fiscal.optanteSimplesNacional),
    regimeApuracao: fiscal.regimeApuracao ?? fiscal.regimeTributario ?? null,
    descricaoServicoPadrao: fiscal.descricaoServicoPadrao ?? fiscal.descricaoServico ?? null,
    municipioIncidencia: fiscal.municipioIncidencia ?? fiscal.municipio ?? null,
    ufIncidencia: fiscal.ufIncidencia ?? fiscal.uf ?? null,
    provedor: fiscal.provedor ?? "nfse_nacional",
  };
}

export async function upsertFiscalSettings(data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const existing = await getFiscalSettings();
  const payload = {
    ...data,
    optanteSimplesNacional: data.optanteSimplesNacional ? 1 : 0,
    regimeTributario: data.regimeTributario ?? data.regimeApuracao ?? null,
    regimeApuracao: data.regimeApuracao ?? data.regimeTributario ?? null,
    descricaoServico: data.descricaoServico ?? data.descricaoServicoPadrao ?? null,
    descricaoServicoPadrao: data.descricaoServicoPadrao ?? data.descricaoServico ?? null,
    municipioIncidencia: data.municipioIncidencia ?? data.municipio ?? null,
    ufIncidencia: data.ufIncidencia ?? data.uf ?? null,
    provedor: data.provedor ?? "nfse_nacional",
    ativo: data.cnpj && data.razaoSocial ? 1 : 0,
  };
  
  if (existing) {
    await db.update(sql`fiscal_config`).set(payload).where(eq(sql`id`, existing.id));
  } else {
    await db.insert(sql`fiscal_config`).values(payload);
  }
  
  return { success: true };
}

// ─── NFSE ────────────────────────────────────────────────────────────────────
export async function listNfse() {
  const db = await getDb();
  if (!db) return [];
  
  const rows = await db.select().from(sql`nfse`).orderBy(desc(sql`createdAt`));
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
  const valorLiquidoNfse = Number((baseCalculo - valorIss).toFixed(2));
  const dataCompetencia = data.dataCompetencia || new Date().toISOString().slice(0, 10);
  const descricaoServico = data.complementoDescricao
    ? `${data.descricaoServico}\n\n${data.complementoDescricao}`
    : data.descricaoServico;
  const tomadorEndereco = JSON.stringify({
    cep: data.tomadorCep || null,
    municipio: data.tomadorMunicipio || null,
    uf: data.tomadorUf || null,
    bairro: data.tomadorBairro || null,
    logradouro: data.tomadorLogradouro || null,
    numero: data.tomadorNumero || null,
    complemento: data.tomadorComplemento || null,
  });
  
  const result = await db.insert(sql`nfse`).values({
    patientId: data.patientId ?? null,
    tomadorNome: data.tomadorNome,
    tomadorCpfCnpj: data.tomadorDocumento,
    tomadorTipoDocumento: data.tomadorTipoDocumento ?? inferDocumentType(data.tomadorDocumento),
    tomadorEmail: data.tomadorEmail ?? null,
    tomadorEndereco,
    numeroRps,
    dataEmissao: new Date(),
    dataCompetencia,
    descricaoServico,
    codigoServico: fiscal.codigoServico ?? fiscal.codigoTributacaoNacional ?? null,
    itemListaServico: fiscal.itemListaServico ?? null,
    cnaeServico: fiscal.cnaeServico ?? null,
    codigoMunicipioIncidencia: fiscal.codigoMunicipio ?? null,
    valorServicos,
    valorDeducoes,
    valorIss,
    baseCalculo,
    aliquota,
    valorLiquidoNfse,
    descontoIncondicionado,
    formaPagamento: data.formaPagamento ?? null,
    detalhesPagamento: data.detalhesPagamento ?? null,
    ambiente: data.ambiente ?? fiscal.ambiente ?? "homologacao",
    enviadoPorId: userId,
    status: 'rascunho',
  });

  await db
    .update(sql`fiscal_config`)
    .set({ numeracaoSequencial: numeroRps + 1 })
    .where(eq(sql`id`, fiscal.id));

  const insertedId =
    typeof result[0] === "number"
      ? result[0]
      : result[0]?.insertId ?? result[0]?.id;
  if (!insertedId) {
    throw new Error("Não foi possível identificar o rascunho da NFS-e criado.");
  }

  const inserted = await db
    .select()
    .from(sql`nfse`)
    .where(eq(sql`id`, insertedId))
    .limit(1);

  return normalizeNfseRow(inserted[0]);
}

export async function emitNfse(nfseId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const current = await db.select().from(sql`nfse`).where(eq(sql`id`, nfseId)).limit(1);
  if (!current[0]) throw new Error("NFS-e não encontrada.");
  
  const pendingMessage =
    "A emissão automática no Emissor Nacional ainda não está integrada. O rascunho foi preparado para conferência e emissão manual no portal nfse.gov.br.";

  await db.update(sql`nfse`).set({
    status: 'aguardando',
    erroMensagem: pendingMessage,
    tentativas: sql`tentativas + 1`,
  }).where(eq(sql`id`, nfseId));

  return {
    success: true,
    status: 'aguardando',
    message: pendingMessage,
  };
}

export async function cancelNfse(nfseId: number, reason: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  await db.update(sql`nfse`).set({
    status: 'cancelada',
    motivoCancelamento: reason,
    dataCancelamento: new Date(),
  }).where(eq(sql`id`, nfseId));
  return { success: true };
}

// ─── BUDGETS ─────────────────────────────────────────────────────────────────
export async function listBudgets() {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sql`budgets`).orderBy(desc(sql`createdAt`));
}

export async function createBudget(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`budgets`).values({
    ...data,
    createdBy: userId,
    status: 'rascunho',
  });
  return result[0];
}

export async function emitBudget(budgetId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  await db.update(sql`budgets`).set({ status: 'emitido' }).where(eq(sql`id`, budgetId));
  return { success: true };
}

export async function approveBudget(budgetId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  await db.update(sql`budgets`).set({ status: 'aprovado' }).where(eq(sql`id`, budgetId));
  return { success: true };
}

// ─── CRM ─────────────────────────────────────────────────────────────────────
export async function listCrmIndications(limit: number = 100) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sql`crm_indications`).orderBy(desc(sql`createdAt`)).limit(limit);
}

export async function createCrmIndication(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`crm_indications`).values({
    ...data,
    indicatedBy: userId,
    status: 'indicado',
  });
  return result[0];
}

export async function updateCrmIndication(id: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  await db.update(sql`crm_indications`).set(data).where(eq(sql`id`, id));
  return { success: true };
}

// ─── SIGNATURES ───────────────────────────────────────────────────────────────
export async function sendForSignature(documentId: number, documentType: string, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`document_signatures`).values({
    resourceId: documentId,
    resourceType: documentType,
    doctorId: userId,
    status: 'enviado',
  });
  return result[0];
}

// ─── TEMPLATES ────────────────────────────────────────────────────────────────
export async function listTemplates() {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sql`medical_record_templates`).where(eq(sql`active`, true));
}

export async function createTemplate(data: any, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const result = await db.insert(sql`medical_record_templates`).values({
    ...data,
    createdBy: userId,
    active: true,
  });
  return result[0];
}

// ─── MEDICAL RECORDS ──────────────────────────────────────────────────────────
export async function listMedicalRecordTemplates() {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sql`medical_record_templates`).where(eq(sql`active`, true));
}

// ─── WHATSAPP ─────────────────────────────────────────────────────────────────
export async function sendWhatsAppMessage(phoneNumber: string, message: string) {
  // Implementação com WhatsApp API
  return { success: true, messageId: `msg_${Date.now()}` };
}

// ─── AI ───────────────────────────────────────────────────────────────────────
export async function invokeAI(messages: any[]) {
  // Implementação com LLM
  return { role: 'assistant', content: 'Resposta da IA' };
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────
export async function getDoctors() {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sql`users`).where(eq(sql`role`, 'medico'));
}

export async function getDashboardStats() {
  const db = await getDb();
  if (!db) return { totalPatients: 0, todayAppointments: 0, totalAppointments: 0 };
  
  const patients = await db.select(sql`COUNT(*) as count`).from(sql`patients`);
  const appointments = await db.select(sql`COUNT(*) as count`).from(sql`appointments`);
  
  return {
    totalPatients: patients[0]?.count || 0,
    todayAppointments: 0,
    totalAppointments: appointments[0]?.count || 0,
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
  
  return db.select().from(sql`audit_logs`).orderBy(desc(sql`createdAt`)).limit(limit);
}

export async function getUserPermissions(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return db.select().from(sql`permissions`).where(eq(sql`userId`, userId));
}

export async function setUserPermission(userId: number, module: string, permission: any) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  const existing = await db.select().from(sql`permissions`)
    .where(and(eq(sql`userId`, userId), eq(sql`module`, module)))
    .limit(1);
  
  if (existing && existing[0]) {
    await db.update(sql`permissions`)
      .set(permission)
      .where(eq(sql`id`, existing[0].id));
  } else {
    await db.insert(sql`permissions`).values({
      userId,
      module,
      ...permission,
    });
  }
  
  return { success: true };
}

export async function updateUserProfile(userId: number, data: any) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  await db.update(sql`users`).set(data).where(eq(sql`id`, userId));
  return { success: true };
}

export async function updateUserRole(userId: number, role: string) {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  
  await db.update(sql`users`).set({ role }).where(eq(sql`id`, userId));
  return { success: true };
}
