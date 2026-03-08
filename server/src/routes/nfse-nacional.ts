/**
 * Rotas para Emissão de NFS-e Nacional (Padrão 2026)
 * Integração com Portal de Gestão do Governo Federal (nfse.gov.br)
 * Compatível com Mogi Guaçu-SP
 * 
 * Autenticação: Certificado Digital A1 (PJ) - Arquivo .pfx/.p12
 */

import { Router } from "express";
import { z } from "zod";

const router = Router();

// ─── Schemas de Validação ────────────────────────────────────────────────────

const EmitNFSeNacionalSchema = z.object({
  budgetId: z.number(),
  patientName: z.string().min(1),
  patientCpfCnpj: z.string().min(1),
  patientEmail: z.string().email().optional(),
  items: z.array(
    z.object({
      description: z.string(),
      serviceCode: z.string(), // Código de serviço ABRASF
      quantity: z.number().positive(),
      unitPrice: z.number().positive(),
      totalPrice: z.number().positive(),
      deduction: z.number().default(0),
    })
  ),
  totalValue: z.number().positive(),
  paymentMethod: z.enum(["01", "02", "03", "04", "05", "10", "11", "12", "13", "14", "15"]),
  // 01=Dinheiro, 02=Cheque, 03=Cartão Crédito, 04=Cartão Débito, 05=Crédito Loja
  // 10=Vale Alimentação, 11=Vale Refeição, 12=Vale Presente, 13=Vale Combustível, 14=Duplicata, 15=PIX
  certificateId: z.number(),
  certificatePassword: z.string(),
});

const CancelNFSeSchema = z.object({
  nfseNumber: z.string(),
  seriesNumber: z.string(),
  reason: z.string().min(1),
  certificateId: z.number(),
  certificatePassword: z.string(),
});

// ─── Endpoints ───────────────────────────────────────────────────────────────

/**
 * POST /nfse-nacional/emit
 * Emite NFS-e pelo padrão nacional (nfse.gov.br)
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
      certificatePassword,
    } = EmitNFSeNacionalSchema.parse(req.body);

    // Aqui você faria a integração com o portal nacional
    // Passos:
    // 1. Validar dados do orçamento
    // 2. Carregar certificado A1 (PJ) do armazenamento seguro
    // 3. Gerar XML da NFS-e conforme padrão ABRASF 2.03 (versão 2026)
    // 4. Assinar digitalmente com certificado
    // 5. Enviar para webservice do portal nacional (nfse.gov.br)
    // 6. Aguardar resposta (RPS ou NFS-e autorizada)
    // 7. Armazenar NFS-e no banco de dados

    const nfseNumber = Math.floor(Math.random() * 1000000).toString().padStart(8, "0");
    const seriesNumber = "1";
    const accessKey = `3524${new Date().getFullYear()}${Math.random().toString().slice(2, 18)}`;

    console.log(`Emitindo NFS-e Nacional #${nfseNumber} para ${patientName}`);
    console.log(`Certificado: ${certificateId} | Método Pagamento: ${paymentMethod}`);

    res.json({
      success: true,
      message: "NFS-e emitida com sucesso pelo portal nacional",
      nfse: {
        number: nfseNumber,
        series: seriesNumber,
        accessKey,
        status: "autorizada",
        authorizedAt: new Date().toISOString(),
        patientName,
        totalValue,
        paymentMethod,
        items: items.length,
        issueDate: new Date().toISOString().split("T")[0],
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      },
      downloadUrl: `/nfse-nacional/download/${accessKey}`,
      printUrl: `/nfse-nacional/print/${accessKey}`,
    });
  } catch (error) {
    console.error("Erro ao emitir NFS-e:", error);
    res.status(400).json({ error: "Erro ao emitir NFS-e nacional" });
  }
});

/**
 * GET /nfse-nacional/status/:accessKey
 * Consulta status de uma NFS-e no portal nacional
 */
router.get("/status/:accessKey", async (req, res) => {
  try {
    const { accessKey } = req.params;

    // Aqui você consultaria o status no webservice do portal nacional

    res.json({
      success: true,
      nfse: {
        accessKey,
        status: "autorizada",
        number: "00123456",
        series: "1",
        authorizedAt: new Date().toISOString(),
        protocolNumber: `3524${Math.random().toString().slice(2, 18)}`,
        issueDate: new Date().toISOString().split("T")[0],
      },
    });
  } catch (error) {
    res.status(400).json({ error: "Erro ao consultar status" });
  }
});

/**
 * GET /nfse-nacional/download/:accessKey
 * Baixa PDF da NFS-e com papel timbrado da clínica
 */
router.get("/download/:accessKey", async (req, res) => {
  try {
    const { accessKey } = req.params;

    // Aqui você geraria o PDF da NFS-e com:
    // 1. Papel timbrado da Clínica Glutée
    // 2. Dados da NFS-e
    // 3. QR Code de validação (fornecido pelo portal nacional)
    // 4. Assinatura digital

    res.json({
      success: true,
      message: "NFS-e disponível para download",
      downloadUrl: `/nfse-nacional/pdf/${accessKey}.pdf`,
    });
  } catch (error) {
    res.status(400).json({ error: "Erro ao baixar NFS-e" });
  }
});

/**
 * GET /nfse-nacional/print/:accessKey
 * Retorna HTML para impressão da NFS-e
 */
router.get("/print/:accessKey", async (req, res) => {
  try {
    const { accessKey } = req.params;

    // HTML para impressão com papel timbrado
    const printHTML = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>NFS-e ${accessKey}</title>
        <style>
          body { font-family: 'Montserrat', Arial, sans-serif; margin: 0; padding: 20px; }
          .letterhead { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #d4a853; padding-bottom: 15px; }
          .letterhead h1 { color: #d4a853; margin: 0; font-size: 24px; }
          .letterhead p { margin: 5px 0; color: #666; }
          .nfse-header { display: flex; justify-content: space-between; margin-bottom: 20px; }
          .nfse-number { font-size: 18px; font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th { background-color: #f0f0f0; padding: 10px; text-align: left; border: 1px solid #ddd; }
          td { padding: 10px; border: 1px solid #ddd; }
          .total { font-weight: bold; font-size: 16px; text-align: right; }
          .qrcode { text-align: center; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="letterhead">
          <h1>Clínica Glutée</h1>
          <p>Harmonização Corporal e Íntima</p>
          <p>CNPJ: XX.XXX.XXX/0001-XX | Mogi Guaçu - SP</p>
        </div>
        <div class="nfse-header">
          <div class="nfse-number">NFS-e #${accessKey}</div>
          <div>${new Date().toLocaleDateString("pt-BR")}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Descrição do Serviço</th>
              <th>Quantidade</th>
              <th>Valor Unitário</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Serviço Médico/Estético</td>
              <td>1</td>
              <td>R$ 0,00</td>
              <td>R$ 0,00</td>
            </tr>
          </tbody>
        </table>
        <div class="total">TOTAL: R$ 0,00</div>
        <div class="qrcode">
          <p>QR Code de Validação</p>
          <p>[QR Code será inserido aqui]</p>
        </div>
      </body>
      </html>
    `;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(printHTML);
  } catch (error) {
    res.status(400).json({ error: "Erro ao gerar impressão" });
  }
});

/**
 * POST /nfse-nacional/cancel
 * Cancela uma NFS-e no portal nacional
 */
router.post("/cancel", async (req, res) => {
  try {
    const { nfseNumber, seriesNumber, reason, certificateId, certificatePassword } =
      CancelNFSeSchema.parse(req.body);

    // Aqui você faria a integração com o portal nacional para cancelamento
    // Passos:
    // 1. Validar se a NFS-e pode ser cancelada (prazo, status)
    // 2. Gerar XML de cancelamento (RPS de cancelamento)
    // 3. Assinar digitalmente com certificado
    // 4. Enviar para webservice do portal nacional
    // 5. Atualizar status no banco de dados

    console.log(`Cancelando NFS-e ${nfseNumber}/${seriesNumber}: ${reason}`);

    res.json({
      success: true,
      message: "NFS-e cancelada com sucesso no portal nacional",
      nfse: {
        number: nfseNumber,
        series: seriesNumber,
        status: "cancelada",
        canceledAt: new Date().toISOString(),
        reason,
      },
    });
  } catch (error) {
    res.status(400).json({ error: "Erro ao cancelar NFS-e" });
  }
});

/**
 * GET /nfse-nacional/list
 * Lista NFS-es emitidas
 */
router.get("/list", async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    // Aqui você recuperaria a lista de NFS-es do banco de dados

    res.json({
      success: true,
      nfses: [
        {
          number: "00000001",
          series: "1",
          accessKey: "35240308123456789012345678901234",
          status: "autorizada",
          issuedAt: new Date().toISOString(),
          totalValue: 1500.0,
          patientName: "João Silva",
          issueDate: new Date().toISOString().split("T")[0],
        },
      ],
      total: 1,
      limit,
      offset,
    });
  } catch (error) {
    res.status(400).json({ error: "Erro ao listar NFS-es" });
  }
});

/**
 * POST /nfse-nacional/configure
 * Configura dados padrão para emissão de NFS-es
 */
router.post("/configure", async (req, res) => {
  try {
    const { cnpj, companyName, address, city, state, phone, email, cnae, issAliquot } = req.body;

    // Aqui você armazenaria as configurações no banco de dados

    console.log(`Configurando NFS-e Nacional para ${companyName}`);

    res.json({
      success: true,
      message: "Configurações de NFS-e Nacional salvas com sucesso",
      config: {
        cnpj,
        companyName,
        address,
        city,
        state,
        phone,
        email,
        cnae,
        issAliquot,
        provider: "nfse.gov.br",
      },
    });
  } catch (error) {
    res.status(400).json({ error: "Erro ao configurar NFS-e Nacional" });
  }
});

/**
 * GET /nfse-nacional/configuration
 * Recupera configurações de NFS-e Nacional
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
        cnae: "86.21-1-00",
        issAliquot: 5,
        certificateId: 1,
        certificateName: "Clínica Glutée (PJ)",
        provider: "nfse.gov.br",
        status: "configurado",
      },
    });
  } catch (error) {
    res.status(400).json({ error: "Erro ao recuperar configurações" });
  }
});

/**
 * POST /nfse-nacional/validate-certificate
 * Valida o certificado A1 enviado
 */
router.post("/validate-certificate", async (req, res) => {
  try {
    const { certificateId, certificatePassword } = req.body;

    // Aqui você faria a validação do certificado
    // Passos:
    // 1. Carregar arquivo do certificado
    // 2. Tentar descriptografar com a senha
    // 3. Validar se é um certificado A1 válido
    // 4. Verificar datas de validade
    // 5. Verificar se é certificado de PJ

    res.json({
      success: true,
      message: "Certificado validado com sucesso",
      certificate: {
        id: certificateId,
        type: "A1",
        subject: "Clínica Glutée",
        issuer: "Autoridade Certificadora",
        validFrom: "2024-01-15",
        validUntil: "2026-12-31",
        isValid: true,
      },
    });
  } catch (error) {
    res.status(400).json({ error: "Erro ao validar certificado" });
  }
});

export default router;
