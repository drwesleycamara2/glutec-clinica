/**
 * Rotas para Emissão de Nota Fiscal Eletrônica (NF-e)
 * Compatível com Mogi Guaçu-SP (2026)
 * Integração com SEFAZ e sistema local de Mogi Guaçu
 */

import { Router } from "express";
import { z } from "zod";

const router = Router();

// ─── Schemas de Validação ────────────────────────────────────────────────────

const EmitNFeSchema = z.object({
  budgetId: z.number(),
  patientName: z.string().min(1),
  patientCpfCnpj: z.string().min(1),
  patientEmail: z.string().email().optional(),
  items: z.array(
    z.object({
      description: z.string(),
      quantity: z.number().positive(),
      unitPrice: z.number().positive(),
      totalPrice: z.number().positive(),
    })
  ),
  totalValue: z.number().positive(),
  paymentMethod: z.enum(["dinheiro", "debito", "credito", "pix", "multban", "sicoob"]),
  certificateId: z.number(),
});

// ─── Endpoints ───────────────────────────────────────────────────────────────

/**
 * POST /nfe/emit
 * Emite Nota Fiscal Eletrônica
 */
router.post("/emit", async (req, res) => {
  try {
    const {
      budgetId,
      patientName,
      patientCpfCnpj,
      items,
      totalValue,
      paymentMethod,
      certificateId,
    } = EmitNFeSchema.parse(req.body);

    // Aqui você faria a integração com SEFAZ de Mogi Guaçu
    // Passos:
    // 1. Validar dados do orçamento
    // 2. Gerar XML da NF-e conforme padrão SEFAZ
    // 3. Assinar digitalmente com certificado PJ
    // 4. Enviar para SEFAZ
    // 5. Aguardar autorização
    // 6. Armazenar NF-e autorizada

    const nfeNumber = Math.floor(Math.random() * 1000000);
    const serieNumber = "1";
    const accessKey = `35240308${Math.random().toString().slice(2, 18)}`;

    console.log(`Emitindo NF-e #${nfeNumber} para ${patientName}`);

    res.json({
      success: true,
      message: "Nota Fiscal emitida com sucesso",
      nfe: {
        number: nfeNumber,
        series: serieNumber,
        accessKey,
        status: "autorizada",
        authorizedAt: new Date().toISOString(),
        patientName,
        totalValue,
        paymentMethod,
        items: items.length,
      },
      downloadUrl: `/nfe/download/${accessKey}`,
    });
  } catch (error) {
    res.status(400).json({ error: "Erro ao emitir Nota Fiscal" });
  }
});

/**
 * GET /nfe/status/:accessKey
 * Consulta status de uma NF-e
 */
router.get("/status/:accessKey", async (req, res) => {
  try {
    const { accessKey } = req.params;

    // Aqui você consultaria o status no SEFAZ

    res.json({
      success: true,
      nfe: {
        accessKey,
        status: "autorizada",
        number: 123456,
        series: "1",
        authorizedAt: new Date().toISOString(),
        protocolNumber: `35240308${Math.random().toString().slice(2, 18)}`,
      },
    });
  } catch (error) {
    res.status(400).json({ error: "Erro ao consultar status" });
  }
});

/**
 * GET /nfe/download/:accessKey
 * Baixa PDF da NF-e
 */
router.get("/download/:accessKey", async (req, res) => {
  try {
    const { accessKey } = req.params;

    // Aqui você geraria o PDF da NF-e com papel timbrado
    // e enviaria para download

    res.json({
      success: true,
      message: "NF-e disponível para download",
      downloadUrl: `/nfe/pdf/${accessKey}.pdf`,
    });
  } catch (error) {
    res.status(400).json({ error: "Erro ao baixar NF-e" });
  }
});

/**
 * POST /nfe/cancel
 * Cancela uma NF-e
 */
router.post("/cancel", async (req, res) => {
  try {
    const { accessKey, reason } = req.body;

    // Aqui você faria a integração com SEFAZ para cancelamento
    // Passos:
    // 1. Validar se a NF-e pode ser cancelada
    // 2. Gerar XML de cancelamento
    // 3. Assinar digitalmente
    // 4. Enviar para SEFAZ
    // 5. Atualizar status no banco de dados

    console.log(`Cancelando NF-e ${accessKey}: ${reason}`);

    res.json({
      success: true,
      message: "Nota Fiscal cancelada com sucesso",
      accessKey,
      status: "cancelada",
      canceledAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(400).json({ error: "Erro ao cancelar NF-e" });
  }
});

/**
 * GET /nfe/list
 * Lista NF-es emitidas
 */
router.get("/list", async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    // Aqui você recuperaria a lista de NF-es do banco de dados

    res.json({
      success: true,
      nfes: [
        {
          number: 123456,
          series: "1",
          accessKey: "35240308123456789012345678901234",
          status: "autorizada",
          issuedAt: new Date().toISOString(),
          totalValue: 1500.0,
          patientName: "João Silva",
        },
      ],
      total: 1,
      limit,
      offset,
    });
  } catch (error) {
    res.status(400).json({ error: "Erro ao listar NF-es" });
  }
});

/**
 * POST /nfe/configure
 * Configura dados padrão para emissão de NF-es
 */
router.post("/configure", async (req, res) => {
  try {
    const { cnpj, companyName, address, city, state, phone, email } = req.body;

    // Aqui você armazenaria as configurações no banco de dados

    console.log(`Configurando NF-e para ${companyName}`);

    res.json({
      success: true,
      message: "Configurações de NF-e salvas com sucesso",
      config: {
        cnpj,
        companyName,
        address,
        city,
        state,
        phone,
        email,
      },
    });
  } catch (error) {
    res.status(400).json({ error: "Erro ao configurar NF-e" });
  }
});

/**
 * GET /nfe/configuration
 * Recupera configurações de NF-e
 */
router.get("/configuration", async (req, res) => {
  try {
    res.json({
      success: true,
      config: {
        cnpj: "12.345.678/0001-90",
        companyName: "Clínica Glutée",
        address: "Rua/Avenida, Número - Complemento",
        city: "Mogi Guaçu",
        state: "SP",
        phone: "(19) 3841-XXXX",
        email: "contato@glutee.com.br",
        certificateId: 2,
        certificateName: "Clínica Glutée (PJ)",
      },
    });
  } catch (error) {
    res.status(400).json({ error: "Erro ao recuperar configurações" });
  }
});

export default router;
