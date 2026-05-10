/**
 * PDF Exporter Component
 * Generates premium PDFs with the new visual design (Light/Dark compatible)
 * Includes Glutée clinic logo, watermark, and D4Sign signature support
 */

import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export interface D4SignatureLog {
  uuid: string;
  signerName: string;
  signerEmail: string;
  signedAt: string;
  ipAddress?: string;
  status: "assinado" | "pendente" | "rejeitado";
  signatureMethod?: "eletronica" | "icp_brasil_a1" | "icp_brasil_a3";
  signatureHash?: string;
  certificateInfo?: {
    subject?: string;
    issuer?: string;
    validFrom?: string;
    validUntil?: string;
  };
}

export interface AuditLog {
  id?: string;
  action: string;
  timestamp: string;
  userId?: string;
  userName?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: string;
}

export interface PdfExportOptions {
  filename: string;
  title: string;
  subtitle?: string;
  content: string | HTMLElement;
  orientation?: "portrait" | "landscape";
  format?: "a4" | "letter";
  includeHeader?: boolean;
  includeFooter?: boolean;
  isDarkMode?: boolean;
  logoPath?: string;
  includeWatermark?: boolean;
  d4signSignatures?: D4SignatureLog[];
  auditLogs?: AuditLog[];
  includeAuditReport?: boolean;
}

export type ClinicalPdfDocumentType =
  | "prescricao"
  | "exame"
  | "solicitacao_exames"
  | "atestado"
  | "declaracao"
  | "laudo";

export interface ClinicalPdfPatient {
  id?: number | string;
  name?: string | null;
  fullName?: string | null;
  cpf?: string | null;
  rg?: string | null;
  phone?: string | null;
  address?: string | Record<string, unknown> | null;
  street?: string | null;
  number?: string | number | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
}

interface DesignedPdfOptions {
  filename: string;
  html: string;
  orientation?: "portrait" | "landscape";
  widthPx?: number;
  fitToSinglePage?: boolean;
}

interface ClinicalDocumentPdfOptions {
  filename: string;
  type: ClinicalPdfDocumentType;
  title?: string;
  content: string;
  patient?: ClinicalPdfPatient | string;
  subtitle?: string;
  createdAt?: string | Date;
}

const CLINIC_LOGO_PATH = "/logo-glutee.png";
const CLINIC_STAMP_PATH = "/clinical-print/carimbo-wesley.png";
const CLINIC_ADDRESS = "Av. Marechal Castelo Branco, 282 - Morro do Ouro - Mogi Guaçu - SP";
const CLINIC_PHONE = "(19) 99963-3913";
const CLINIC_EMAIL = "contato@clinicaglutee.com.br";
const CLINIC_INSTAGRAM = "@clinicaglutee";
const DOCTOR_NAME = "Dr. Wésley de Sousa Câmara";
const DOCTOR_CRM = "CRM-SP: 174868";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toPrintableHtml(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "<p>Sem conteúdo registrado.</p>";
  if (/<\/?[a-z][\s\S]*>/i.test(raw)) return raw;
  return raw
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function parseAddress(value: ClinicalPdfPatient["address"]) {
  if (!value) return {};
  if (typeof value === "object") return value as Record<string, unknown>;
  const raw = String(value).trim();
  if (!raw) return {};
  if (raw.startsWith("{")) {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { street: raw };
    }
  }
  return { street: raw };
}

function normalizeClinicalPatient(patient?: ClinicalPdfPatient | string): Required<Pick<ClinicalPdfPatient, "name" | "cpf" | "rg" | "phone" | "city" | "state">> & {
  addressLine: string;
} {
  if (typeof patient === "string") {
    return {
      name: patient,
      cpf: "",
      rg: "",
      phone: "",
      city: "",
      state: "",
      addressLine: "",
    };
  }

  const address = parseAddress(patient?.address);
  const street = String(patient?.street ?? address.street ?? address.logradouro ?? "").trim();
  const number = String(patient?.number ?? address.number ?? address.numero ?? "").trim();
  const neighborhood = String(patient?.neighborhood ?? address.neighborhood ?? address.bairro ?? "").trim();
  const city = String(patient?.city ?? address.city ?? address.localidade ?? "").trim();
  const state = String(patient?.state ?? address.state ?? address.uf ?? "").trim();
  const addressLine = [street, number, neighborhood, [city, state].filter(Boolean).join(" - ")]
    .filter(Boolean)
    .join(", ");

  return {
    name: String(patient?.fullName ?? patient?.name ?? "").trim(),
    cpf: String(patient?.cpf ?? "").trim(),
    rg: String(patient?.rg ?? "").trim(),
    phone: String(patient?.phone ?? "").trim(),
    city,
    state,
    addressLine,
  };
}

function formatClinicalDate(value?: string | Date) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toLocaleDateString("pt-BR");
  return date.toLocaleDateString("pt-BR");
}

function sanitizeClinicalFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim() || "documento-clinico.pdf";
}

function compactClinicalContent(content: string) {
  return toPrintableHtml(content)
    .replace(/<p>\s*<strong>\s*(ATESTADO M[ÉE]DICO|DECLARA[ÇC][ÃA]O|SOLICITA[ÇC][ÃA]O DE EXAMES|PRESCRI[ÇC][ÃA]O M[ÉE]DICA)\s*<\/strong>\s*<\/p>/i, "")
    .trim();
}

const clinicalPrintCss = `
  * { box-sizing: border-box; }
  body { margin: 0; }
  .page {
    position: relative;
    overflow: hidden;
    background: #fff;
    color: #111827;
    font-family: Montserrat, Arial, sans-serif;
  }
  .page.portrait { width: 794px; min-height: 1123px; padding: 64px 58px 116px 82px; }
  .page.landscape { width: 1123px; min-height: 794px; padding: 14px 18px; display: grid; gap: 14px; grid-template-columns: 1fr 1fr; }
  .gold-stripe {
    position: absolute;
    left: 0;
    top: 0;
    width: 32px;
    height: 100%;
    background: linear-gradient(180deg, #8a6526 0%, #f8dfa1 28%, #c79b38 56%, #7a561d 100%);
  }
  .gold-corner {
    position: absolute;
    left: -170px;
    top: -215px;
    width: 920px;
    height: 390px;
    border-radius: 0 0 85% 0;
    border-bottom: 38px solid transparent;
    background:
      radial-gradient(circle at 48% 52%, rgba(255,255,255,0.98) 0 46%, rgba(255,255,255,0) 47%),
      linear-gradient(110deg, #a77920, #f7d875 42%, #b98222 65%, #fff0b6);
    opacity: 0.96;
  }
  .clinic-logo { width: 170px; height: auto; object-fit: contain; }
  .clinic-logo.small { width: 132px; }
  .letterhead-header { position: relative; z-index: 1; display: flex; align-items: flex-start; justify-content: space-between; gap: 32px; }
  .doctor-block { text-align: right; letter-spacing: 0; }
  .doctor-name { font-size: 25px; font-family: Georgia, 'Times New Roman', serif; font-style: italic; margin: 16px 0 8px; }
  .doctor-crm { font-size: 14px; font-weight: 600; letter-spacing: 3px; }
  .document-title { margin: 116px 0 38px; text-align: center; font-size: 30px; font-weight: 800; letter-spacing: 0; text-transform: uppercase; }
  .document-body { position: relative; z-index: 1; font-size: 20px; line-height: 1.55; text-align: justify; }
  .document-body p { margin: 0 0 12px; }
  .document-body ul, .document-body ol { margin: 8px 0 14px 24px; }
  .patient-line { margin: 34px 0 28px; display: grid; grid-template-columns: auto 1fr; gap: 10px; align-items: end; font-size: 22px; }
  .line { min-height: 1.25em; border-bottom: 1.6px solid #111; padding: 0 8px 2px; }
  .signature-area { margin-top: 54px; text-align: center; }
  .signature-line { width: 420px; margin: 0 auto 5px; border-top: 1.5px solid #111; }
  .stamp { width: 5cm; height: auto; display: block; margin: 0 auto -10px; opacity: 0.92; mix-blend-mode: multiply; }
  .footer {
    position: absolute;
    left: 78px;
    right: 44px;
    bottom: 26px;
    display: grid;
    gap: 2px;
    font-size: 15px;
    color: #1f2937;
  }
  .footer .script { font-family: Georgia, 'Times New Roman', serif; font-size: 26px; font-style: italic; margin-bottom: 2px; }
  .via-card {
    position: relative;
    overflow: hidden;
    min-height: 766px;
    padding: 18px 22px 18px 38px;
    border: 1px solid #e1c574;
    background: #fff;
  }
  .via-card .gold-stripe { width: 18px; }
  .via-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 10px; }
  .via-title { font-size: 18px; font-weight: 800; text-transform: uppercase; word-spacing: 4px; letter-spacing: 0; margin: 0 0 4px; }
  .via-subtitle { font-size: 12px; color: #4b5563; }
  .via-field { margin: 4px 0; font-size: 11px; line-height: 1.25; }
  .via-field strong { display: inline-block; min-width: 62px; }
  .rx-content { margin-top: 10px; font-size: 11.2px; line-height: 1.26; }
  .rx-content p { margin: 0 0 4px; }
  .rx-content ul, .rx-content ol { margin: 4px 0 6px 16px; padding-left: 8px; }
  .via-signature { margin: 7px 0 0 auto; width: 210px; text-align: center; font-size: 10px; }
  .via-signature .stamp { width: 5cm; margin-bottom: -13px; }
  .buyer-boxes { margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .buyer-box { border: 1.5px solid #111; min-height: 92px; padding: 8px 10px; font-size: 10px; }
  .buyer-box h4 { margin: -10px -12px 10px; padding: 6px 8px; border-bottom: 1.5px solid #111; text-align: center; font-size: 13px; text-transform: uppercase; }
  .via-footer { margin-top: 6px; border-top: 1px solid #e8dcc4; padding-top: 5px; font-size: 9px; line-height: 1.25; color: #374151; }
  .single-rx { min-height: 1123px; }
  .single-rx .rx-content { margin-top: 56px; font-size: 18px; line-height: 1.65; }
  .single-rx .signature-area { position: absolute; right: 58px; bottom: 138px; width: 300px; }
`;

async function generateDesignedPdf(options: DesignedPdfOptions): Promise<void> {
  const { filename, html, orientation = "portrait", widthPx = orientation === "landscape" ? 1123 : 794, fitToSinglePage = false } = options;
  const previewWindow = window.open("", "_blank");
  if (previewWindow) {
    previewWindow.document.write(`
      <!doctype html>
      <html>
        <head><title>Gerando documento...</title></head>
        <body style="font-family: Montserrat, Arial, sans-serif; padding: 32px;">
          Gerando documento para impressão...
        </body>
      </html>
    `);
    previewWindow.document.close();
  }
  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = `${widthPx}px`;
  container.style.background = "#fff";
  container.innerHTML = `<style>${clinicalPrintCss}</style>${html}`;

  try {
    document.body.appendChild(container);
    const canvas = await html2canvas(container, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
      logging: false,
    });

    const pdf = new jsPDF({ orientation, unit: "mm", format: "a4" });
    const imgData = canvas.toDataURL("image/png");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgHeight = (canvas.height * pageWidth) / canvas.width;

    const openPdfBlob = (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      if (previewWindow && !previewWindow.closed) {
        previewWindow.location.href = url;
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    };

    if (fitToSinglePage && imgHeight > pageHeight) {
      const scaledWidth = pageWidth * (pageHeight / imgHeight);
      const x = (pageWidth - scaledWidth) / 2;
      pdf.addImage(imgData, "PNG", x, 0, scaledWidth, pageHeight);
      openPdfBlob(pdf.output("blob"));
      return;
    }

    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(imgData, "PNG", 0, position, pageWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, pageWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    openPdfBlob(pdf.output("blob"));
  } finally {
    document.body.removeChild(container);
  }
}

function renderFooter() {
  return `
    <div class="footer">
      <div class="script">${DOCTOR_NAME} <span style="font-family: Montserrat, Arial, sans-serif; font-size: 14px; font-style: normal;">- Médico - ${DOCTOR_CRM}</span></div>
      <div>Tel/WhatsApp: ${CLINIC_PHONE}</div>
      <div>E-mail: ${CLINIC_EMAIL}</div>
      <div>Instagram: ${CLINIC_INSTAGRAM}</div>
      <div>${CLINIC_ADDRESS}</div>
    </div>
  `;
}

function renderDocumentPage(options: ClinicalDocumentPdfOptions) {
  const patient = normalizeClinicalPatient(options.patient);
  const date = formatClinicalDate(options.createdAt);
  const label =
    options.type === "declaracao" ? "Declaração" :
    options.type === "exame" || options.type === "solicitacao_exames" ? "Solicitação de exames" :
    options.type === "laudo" ? "Laudo / relatório" :
    "Atestado médico";

  const content = compactClinicalContent(options.content)
    .replace(/\[NOME_PACIENTE\]|\{NOME_PACIENTE\}|\[PACIENTE\]|\{PACIENTE\}/g, escapeHtml(patient.name || ""))
    .replace(/\[CPF_PACIENTE\]|\{CPF_PACIENTE\}/g, escapeHtml(patient.cpf || ""))
    .replace(/\[DATA_ATUAL\]|\{DATA_ATUAL\}|\[DATA_CLINICA\]|\{DATA_CLINICA\}/g, date);

  return `
    <div class="page portrait">
      <div class="gold-stripe"></div>
      <div class="gold-corner"></div>
      <div class="letterhead-header">
        <img class="clinic-logo" src="${CLINIC_LOGO_PATH}" />
        <div class="doctor-block">
          <div class="doctor-name">${DOCTOR_NAME}</div>
          <div class="doctor-crm">MÉDICO - ${DOCTOR_CRM}</div>
        </div>
      </div>
      <div class="document-title">${escapeHtml(options.title || label)}</div>
      <div class="document-body">${content}</div>
      <div class="signature-area">
        <img class="stamp" src="${CLINIC_STAMP_PATH}" />
        <div class="signature-line"></div>
        <div>Assinatura e carimbo do médico</div>
      </div>
      ${renderFooter()}
    </div>
  `;
}

function renderSinglePrescriptionPage(patientInput: ClinicalPdfPatient | string, prescription: any) {
  const patient = normalizeClinicalPatient(patientInput);
  const content = toPrintableHtml(prescription?.content || "");
  return `
    <div class="page portrait single-rx">
      <div class="gold-stripe"></div>
      <div class="letterhead-header">
        <img class="clinic-logo" src="${CLINIC_LOGO_PATH}" />
        <div class="doctor-block">
          <div class="doctor-name">${DOCTOR_NAME}</div>
          <div class="doctor-crm">MÉDICO - ${DOCTOR_CRM}</div>
        </div>
      </div>
      <div class="patient-line">
        <span>Nome:</span>
        <span class="line">${escapeHtml(patient.name || "")}</span>
      </div>
      <div class="rx-content">${content}</div>
      ${prescription?.observations ? `<div style="margin-top: 24px; font-size: 13px;"><strong>Observações:</strong> ${escapeHtml(prescription.observations)}</div>` : ""}
      <div class="signature-area">
        <img class="stamp" src="${CLINIC_STAMP_PATH}" />
        <div class="signature-line"></div>
        <div>Assinatura do médico</div>
      </div>
      ${renderFooter()}
    </div>
  `;
}

function renderCompactPrescriptionVia(patientInput: ClinicalPdfPatient | string, prescription: any, viaLabel: string, controleEspecial = false) {
  const patient = normalizeClinicalPatient(patientInput);
  const content = toPrintableHtml(prescription?.content || "");
  return `
    <div class="via-card ${controleEspecial ? "control-rx" : ""}">
      <div class="gold-stripe"></div>
      <div class="via-head">
        <div>
          <h2 class="via-title">${controleEspecial ? "Receituário de controle especial" : "Receituário médico"}</h2>
          <div class="via-subtitle">${escapeHtml(viaLabel)}</div>
        </div>
        <img class="clinic-logo small" src="${CLINIC_LOGO_PATH}" />
      </div>
      ${controleEspecial ? `
        <div style="border: 1.4px solid #111; padding: 8px 10px; margin-bottom: 14px; font-size: 12px; line-height: 1.35;">
          <strong>IDENTIFICAÇÃO DO EMITENTE</strong><br />
          Nome: Wésley de Sousa Câmara<br />
          Médico - ${DOCTOR_CRM}<br />
          Endereço: ${CLINIC_ADDRESS}<br />
          Telefone/WhatsApp: ${CLINIC_PHONE}<br />
          E-mail: contato@drwesleycamara.com.br
        </div>
      ` : ""}
      <div class="via-field"><strong>Paciente:</strong> ${escapeHtml(patient.name || "")}</div>
      <div class="via-field"><strong>CPF:</strong> ${escapeHtml(patient.cpf || "")}</div>
      <div class="via-field"><strong>Endereço:</strong> ${escapeHtml(patient.addressLine || "")}</div>
      <div class="via-field"><strong>Data:</strong> ${formatClinicalDate(prescription?.createdAt)}</div>
      <div class="rx-content">${content}</div>
      <div class="via-signature">
        <img class="stamp" src="${CLINIC_STAMP_PATH}" />
        <div class="signature-line" style="width: 190px;"></div>
        <div>Assinatura do médico</div>
      </div>
      ${controleEspecial ? `
        <div class="buyer-boxes">
          <div class="buyer-box">
            <h4>Identificação do comprador</h4>
            Nome:<br /><br />
            Documento: __________________ Órg. Emissor: _______<br />
            Endereço:<br />
            Cidade: __________________ UF: ____<br />
            Telefone:
          </div>
          <div class="buyer-box">
            <h4>Identificação do fornecedor</h4>
            <br /><br /><br />
            __________________________ &nbsp;&nbsp; ____/____/____<br />
            Assinatura &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Data
          </div>
        </div>
      ` : ""}
      <div class="via-footer">
        <strong>Clínica Glutée</strong> · Tel/WhatsApp: ${CLINIC_PHONE} · E-mail: ${CLINIC_EMAIL}<br />
        Instagram: ${CLINIC_INSTAGRAM} · ${CLINIC_ADDRESS}
      </div>
    </div>
  `;
}

export async function exportClinicalDocumentPdf(options: ClinicalDocumentPdfOptions): Promise<void> {
  await generateDesignedPdf({
    filename: options.filename,
    orientation: "portrait",
    widthPx: 794,
    fitToSinglePage: true,
    html: renderDocumentPage(options),
  });
}

/**
 * Add watermark to PDF
 */
function addWatermark(pdf: jsPDF, logoPath: string, opacity: number = 0.15): void {
  try {
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // Set opacity for watermark
    pdf.setGState(pdf.GState({ opacity }));

    // Add logo as watermark in center
    const logoWidth = 80;
    const logoHeight = 80;
    const x = (pageWidth - logoWidth) / 2;
    const y = (pageHeight - logoHeight) / 2;

    pdf.addImage(logoPath, "PNG", x, y, logoWidth, logoHeight);

    // Reset opacity
    pdf.setGState(pdf.GState({ opacity: 1 }));
  } catch (error) {
    console.warn("[Watermark Error] Could not add watermark:", error);
  }
}

/**
 * Generate a premium PDF with the Glutec System branding
 */
export async function generatePremiumPdf(options: PdfExportOptions): Promise<void> {
  const {
    filename,
    title,
    subtitle,
    content,
    orientation = "portrait",
    format = "a4",
    includeHeader = true,
    includeFooter = true,
    isDarkMode = false,
    logoPath,
    includeWatermark = true,
    d4signSignatures,
    auditLogs,
    includeAuditReport = true,
  } = options;

  try {
    // Create a temporary container for rendering
    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.left = "-9999px";
    container.style.width = orientation === "landscape" ? "1200px" : "800px";
    container.style.padding = "40px";
    container.style.backgroundColor = isDarkMode ? "#1a1a1a" : "#ffffff";
    container.style.color = isDarkMode ? "#ffffff" : "#000000";
    container.style.fontFamily = "Montserrat, sans-serif";

    // Add header with logo
    if (includeHeader) {
      const header = document.createElement("div");
      header.style.marginBottom = "30px";
      header.style.paddingBottom = "20px";
      header.style.borderBottom = `2px solid ${isDarkMode ? "#d4a853" : "#d4a853"}`;
      header.style.display = "flex";
      header.style.alignItems = "center";
      header.style.gap = "20px";

      // Logo
      if (logoPath) {
        const logoImg = document.createElement("img");
        logoImg.src = logoPath;
        logoImg.style.height = "60px";
        logoImg.style.width = "auto";
        header.appendChild(logoImg);
      }

      // Title and subtitle
      const titleContainer = document.createElement("div");

      const titleEl = document.createElement("h1");
      titleEl.textContent = title;
      titleEl.style.fontSize = "32px";
      titleEl.style.fontWeight = "300";
      titleEl.style.margin = "0 0 10px 0";
      titleEl.style.color = isDarkMode ? "#ffffff" : "#000000";
      titleEl.style.letterSpacing = "0.5px";
      titleContainer.appendChild(titleEl);

      if (subtitle) {
        const subtitleEl = document.createElement("p");
        subtitleEl.textContent = subtitle;
        subtitleEl.style.fontSize = "14px";
        subtitleEl.style.color = isDarkMode ? "#b0b0b0" : "#666666";
        subtitleEl.style.margin = "0";
        subtitleEl.style.fontWeight = "300";
        titleContainer.appendChild(subtitleEl);
      }

      header.appendChild(titleContainer);
      container.appendChild(header);
    }

    // Add content
    const contentEl = document.createElement("div");
    if (typeof content === "string") {
      contentEl.innerHTML = content;
    } else {
      contentEl.appendChild(content.cloneNode(true));
    }
    contentEl.style.fontSize = "12px";
    contentEl.style.lineHeight = "1.6";
    contentEl.style.color = isDarkMode ? "#e0e0e0" : "#333333";
    container.appendChild(contentEl);

    // Add D4Sign signature logs if present
    if (d4signSignatures && d4signSignatures.length > 0) {
      const sigSection = document.createElement("div");
      sigSection.style.marginTop = "30px";
      sigSection.style.paddingTop = "20px";
      sigSection.style.borderTop = `2px solid ${isDarkMode ? "#d4a853" : "#d4a853"}`;

      const sigTitle = document.createElement("h3");
      sigTitle.textContent = "ASSINATURAS DIGITAIS";
      sigTitle.style.fontSize = "12px";
      sigTitle.style.fontWeight = "600";
      sigTitle.style.color = isDarkMode ? "#d4a853" : "#d4a853";
      sigTitle.style.margin = "0 0 15px 0";
      sigSection.appendChild(sigTitle);

      d4signSignatures.forEach((sig, index) => {
        const sigBlock = document.createElement("div");
        sigBlock.style.marginBottom = "12px";
        sigBlock.style.padding = "10px";
        sigBlock.style.backgroundColor = isDarkMode ? "#2a2a2a" : "#f9f9f9";
        sigBlock.style.borderLeft = `3px solid ${isDarkMode ? "#d4a853" : "#d4a853"}`;
        sigBlock.style.fontSize = "10px";

        const statusColor =
          sig.status === "assinado"
            ? "#4caf50"
            : sig.status === "pendente"
              ? "#ff9800"
              : "#f44336";

        let signatureMethodLabel = "Eletrônica";
        if (sig.signatureMethod === "icp_brasil_a1") {
          signatureMethodLabel = "ICP-Brasil A1";
        } else if (sig.signatureMethod === "icp_brasil_a3") {
          signatureMethodLabel = "ICP-Brasil A3";
        }

        let certificateInfo = "";
        if (sig.certificateInfo) {
          certificateInfo = `
            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid ${isDarkMode ? "#444" : "#ddd"}; font-size: 9px;">
              <div style="margin-bottom: 3px;"><strong>Certificado:</strong></div>
              ${sig.certificateInfo.subject ? `<div style="margin-bottom: 2px;">Assunto: ${sig.certificateInfo.subject}</div>` : ""}
              ${sig.certificateInfo.issuer ? `<div style="margin-bottom: 2px;">Emissor: ${sig.certificateInfo.issuer}</div>` : ""}
              ${sig.certificateInfo.validFrom ? `<div style="margin-bottom: 2px;">Válido de: ${sig.certificateInfo.validFrom}</div>` : ""}
              ${sig.certificateInfo.validUntil ? `<div style="margin-bottom: 2px;">Válido até: ${sig.certificateInfo.validUntil}</div>` : ""}
            </div>
          `;
        }

        sigBlock.innerHTML = `
          <div style="margin-bottom: 5px;">
            <strong style="color: ${isDarkMode ? "#ffffff" : "#000000"}">Assinante ${index + 1}:</strong> ${sig.signerName}
          </div>
          <div style="margin-bottom: 5px;">
            <strong style="color: ${isDarkMode ? "#ffffff" : "#000000"}">Email:</strong> ${sig.signerEmail}
          </div>
          <div style="margin-bottom: 5px;">
            <strong style="color: ${isDarkMode ? "#ffffff" : "#000000"}">Data/Hora:</strong> ${sig.signedAt}
          </div>
          <div style="margin-bottom: 5px;">
            <strong style="color: ${isDarkMode ? "#ffffff" : "#000000"}">Status:</strong> 
            <span style="color: ${statusColor}; font-weight: bold;">${sig.status.toUpperCase()}</span>
          </div>
          <div style="margin-bottom: 5px;">
            <strong style="color: ${isDarkMode ? "#ffffff" : "#000000"}">Método:</strong> ${signatureMethodLabel}
          </div>
          ${sig.ipAddress ? `<div style="margin-bottom: 5px;"><strong style="color: ${isDarkMode ? "#ffffff" : "#000000"}">IP:</strong> ${sig.ipAddress}</div>` : ""}
          ${sig.signatureHash ? `<div style="margin-bottom: 5px; word-break: break-all;"><strong style="color: ${isDarkMode ? "#ffffff" : "#000000"}">Hash:</strong> <span style="font-size: 8px; font-family: monospace;">${sig.signatureHash}</span></div>` : ""}
          <div style="font-size: 9px; color: ${isDarkMode ? "#999999" : "#999999"};">
            UUID: ${sig.uuid}
          </div>
          ${certificateInfo}
        `;
        sigSection.appendChild(sigBlock);
      });

      container.appendChild(sigSection);
    }

    // Add audit logs if present
    if (options.includeAuditReport && options.auditLogs && options.auditLogs.length > 0) {
      const auditSection = document.createElement("div");
      auditSection.style.marginTop = "30px";
      auditSection.style.paddingTop = "20px";
      auditSection.style.borderTop = `2px solid ${isDarkMode ? "#d4a853" : "#d4a853"}`;

      const auditTitle = document.createElement("h3");
      auditTitle.textContent = "RELATÓRIO DE AUDITORIA / VALIDAÇÃO";
      auditTitle.style.fontSize = "12px";
      auditTitle.style.fontWeight = "600";
      auditTitle.style.color = isDarkMode ? "#d4a853" : "#d4a853";
      auditTitle.style.margin = "0 0 15px 0";
      auditSection.appendChild(auditTitle);

      const auditIntro = document.createElement("p");
      auditIntro.textContent = "Este documento foi gerado digitalmente e contém registros de segurança que validam sua autenticidade. Abaixo estão os eventos de auditoria registrados:";
      auditIntro.style.fontSize = "10px";
      auditIntro.style.color = isDarkMode ? "#e0e0e0" : "#333333";
      auditIntro.style.marginBottom = "10px";
      auditSection.appendChild(auditIntro);

      options.auditLogs.forEach((log, index) => {
        const auditBlock = document.createElement("div");
        auditBlock.style.marginBottom = "10px";
        auditBlock.style.padding = "8px";
        auditBlock.style.backgroundColor = isDarkMode ? "#2a2a2a" : "#f5f5f5";
        auditBlock.style.borderLeft = `3px solid #4caf50`;
        auditBlock.style.fontSize = "9px";

        auditBlock.innerHTML = `
          <div style="margin-bottom: 3px;">
            <strong style="color: ${isDarkMode ? "#ffffff" : "#000000"}">Evento ${index + 1}:</strong> ${log.action}
          </div>
          <div style="margin-bottom: 3px;">
            <strong style="color: ${isDarkMode ? "#ffffff" : "#000000"}">Timestamp:</strong> ${log.timestamp}
          </div>
          ${log.userName ? `<div style="margin-bottom: 3px;"><strong style="color: ${isDarkMode ? "#ffffff" : "#000000"}">Usuário:</strong> ${log.userName}</div>` : ""}
          ${log.ipAddress ? `<div style="margin-bottom: 3px;"><strong style="color: ${isDarkMode ? "#ffffff" : "#000000"}">IP:</strong> ${log.ipAddress}</div>` : ""}
          ${log.details ? `<div style="margin-bottom: 3px; font-style: italic; color: ${isDarkMode ? "#b0b0b0" : "#666666"}">Detalhes: ${log.details}</div>` : ""}
        `;
        auditSection.appendChild(auditBlock);
      });

      const complianceNote = document.createElement("div");
      complianceNote.style.marginTop = "15px";
      complianceNote.style.padding = "10px";
      complianceNote.style.backgroundColor = isDarkMode ? "rgba(76, 175, 80, 0.1)" : "rgba(76, 175, 80, 0.1)";
      complianceNote.style.borderRadius = "4px";
      complianceNote.style.fontSize = "9px";
      complianceNote.style.color = isDarkMode ? "#4caf50" : "#2e7d32";
      complianceNote.innerHTML = `
        <strong>✓ Conformidade Regulatória:</strong> Este documento atende aos requisitos de:
        <ul style="margin: 5px 0; padding-left: 20px;">
          <li>CFM 1821/2007 - Prontuário Eletrônico</li>
          <li>Lei Geral de Proteção de Dados (LGPD)</li>
          <li>Código de Defesa do Consumidor (CDC)</li>
          <li>Padrões de Segurança de Informação (ISO 27001)</li>
        </ul>
      `;
      auditSection.appendChild(complianceNote);

      container.appendChild(auditSection);
    }

    // Add footer
    if (includeFooter) {
      const footer = document.createElement("div");
      footer.style.marginTop = "40px";
      footer.style.paddingTop = "20px";
      footer.style.borderTop = `1px solid ${isDarkMode ? "#444444" : "#e0e0e0"}`;
      footer.style.fontSize = "10px";
      footer.style.color = isDarkMode ? "#999999" : "#999999";
      footer.style.textAlign = "center";

      const footerText = document.createElement("p");
      footerText.innerHTML = `
        <strong>Clínica Glutée - Harmonização Corporal e Íntima</strong><br>
        Documento gerado em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR")}<br>
        Conformidade: CFM 1821/2007 | LGPD | CDC
      `;
      footerText.style.margin = "0";
      footer.appendChild(footerText);
      container.appendChild(footer);
    }

    document.body.appendChild(container);

    // Convert to canvas
    const canvas = await html2canvas(container, {
      backgroundColor: isDarkMode ? "#1a1a1a" : "#ffffff",
      scale: 2,
      useCORS: true,
      logging: false,
    });

    // Create PDF
    const pdf = new jsPDF({
      orientation,
      unit: "mm",
      format,
    });

    const imgData = canvas.toDataURL("image/png");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth - 20; // 10mm margins
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 10; // 10mm top margin

    // Add watermark to first page
    if (includeWatermark && logoPath) {
      addWatermark(pdf, logoPath, 0.12);
    }

    // Add first page
    pdf.addImage(imgData, "PNG", 10, position, imgWidth, imgHeight);
    heightLeft -= pageHeight - 20;

    // Add additional pages if needed
    while (heightLeft >= 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();

      // Add watermark to additional pages
      if (includeWatermark && logoPath) {
        addWatermark(pdf, logoPath, 0.12);
      }

      pdf.addImage(imgData, "PNG", 10, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    // Save PDF
    pdf.save(filename);

    // Cleanup
    document.body.removeChild(container);
  } catch (error) {
    console.error("[PDF Export Error]", error);
    throw new Error(`Erro ao gerar PDF: ${error}`);
  }
}

/**
 * Export medical record as PDF
 */
export async function exportMedicalRecordPdf(
  patientName: string,
  medicalRecord: any,
  isDarkMode: boolean = false,
  logoPath?: string,
  d4signSignatures?: D4SignatureLog[],
  auditLogs?: AuditLog[]
): Promise<void> {
  const content = `
    <div style="font-family: Montserrat, sans-serif;">
      <div style="margin-bottom: 20px;">
        <h2 style="font-size: 18px; font-weight: 600; margin: 0 0 10px 0;">Prontuário Médico</h2>
        <p style="margin: 0; font-size: 14px;"><strong>Paciente:</strong> ${patientName}</p>
        <p style="margin: 5px 0; font-size: 14px;"><strong>Data:</strong> ${new Date().toLocaleDateString("pt-BR")}</p>
      </div>

      <div style="border-top: 1px solid #e0e0e0; padding-top: 15px;">
        ${medicalRecord.chiefComplaint ? `<p><strong>Queixa Principal:</strong> ${medicalRecord.chiefComplaint}</p>` : ""}
        ${medicalRecord.historyOfPresentIllness ? `<p><strong>História da Doença Atual:</strong> ${medicalRecord.historyOfPresentIllness}</p>` : ""}
        ${medicalRecord.physicalExamination ? `<p><strong>Exame Físico:</strong> ${medicalRecord.physicalExamination}</p>` : ""}
        ${medicalRecord.assessment ? `<p><strong>Avaliação:</strong> ${medicalRecord.assessment}</p>` : ""}
        ${medicalRecord.plan ? `<p><strong>Plano:</strong> ${medicalRecord.plan}</p>` : ""}
      </div>
    </div>
  `;

  await generatePremiumPdf({
    filename: `prontuario_${patientName.replace(/\s+/g, "_")}_${Date.now()}.pdf`,
    title: "Prontuário Médico",
    subtitle: `Paciente: ${patientName}`,
    content,
    isDarkMode,
    logoPath,
    includeWatermark: true,
    d4signSignatures,
    auditLogs,
    includeAuditReport: true,
  });
}

/**
 * Export prescription as PDF
 */
export async function exportPrescriptionPdf(
  patientName: string,
  prescription: any,
  isDarkMode: boolean = false,
  logoPath?: string,
  d4signSignatures?: D4SignatureLog[],
  auditLogs?: AuditLog[]
): Promise<void> {
  const type = prescription.type || "simples";
  const patient = prescription?.patient ?? patientName;

  if (type === "antimicrobiano" || type === "controle_especial") {
    const controleEspecial = type === "controle_especial";
    await generateDesignedPdf({
      filename: `prescricao_${type}_${patientName.replace(/\s+/g, "_")}_${Date.now()}.pdf`,
      orientation: "landscape",
      widthPx: 1123,
      fitToSinglePage: true,
      html: `
        <div class="page landscape">
          ${renderCompactPrescriptionVia(patient, prescription, controleEspecial ? "1ª via: Farmácia" : "1ª via: Retida na farmácia", controleEspecial)}
          ${renderCompactPrescriptionVia(patient, prescription, controleEspecial ? "2ª via: Paciente" : "2ª via: Paciente", controleEspecial)}
        </div>
      `,
    });
    return;
  }

  await generateDesignedPdf({
    filename: `prescricao_${type}_${patientName.replace(/\s+/g, "_")}_${Date.now()}.pdf`,
    orientation: "portrait",
    widthPx: 794,
    fitToSinglePage: true,
    html: renderSinglePrescriptionPage(patient, prescription),
  });
}

/**
 * Export budget as PDF
 */
export async function exportBudgetPdf(
  patientName: string,
  budget: any,
  isDarkMode: boolean = false,
  logoPath?: string,
  d4signSignatures?: D4SignatureLog[],
  auditLogs?: AuditLog[]
): Promise<void> {
  const content = `
    <div style="font-family: Montserrat, sans-serif;">
      <div style="margin-bottom: 20px;">
        <h2 style="font-size: 18px; font-weight: 600; margin: 0 0 10px 0;">Orçamento</h2>
        <p style="margin: 0; font-size: 14px;"><strong>Paciente:</strong> ${patientName}</p>
        <p style="margin: 5px 0; font-size: 14px;"><strong>Data:</strong> ${new Date().toLocaleDateString("pt-BR")}</p>
        <p style="margin: 5px 0; font-size: 14px;"><strong>Validade:</strong> 10 dias</p>
      </div>

      <div style="border-top: 1px solid #e0e0e0; padding-top: 15px;">
        <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 10px 0;">Procedimentos:</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead>
            <tr style="border-bottom: 2px solid #d4a853;">
              <th style="text-align: left; padding: 8px; font-weight: 600;">Procedimento</th>
              <th style="text-align: right; padding: 8px; font-weight: 600;">Valor</th>
            </tr>
          </thead>
          <tbody>
            ${budget.items ? budget.items.map((item: any) => `
              <tr style="border-bottom: 1px solid #e0e0e0;">
                <td style="padding: 8px;">${item.name}</td>
                <td style="text-align: right; padding: 8px;">R$ ${item.price?.toFixed(2) || "0.00"}</td>
              </tr>
            `).join("") : ""}
          </tbody>
        </table>

        <div style="margin-top: 15px; text-align: right;">
          <p style="margin: 5px 0; font-size: 14px;"><strong>Total:</strong> R$ ${budget.total?.toFixed(2) || "0.00"}</p>
        </div>
      </div>
    </div>
  `;

  await generatePremiumPdf({
    filename: `orcamento_${patientName.replace(/\s+/g, "_")}_${Date.now()}.pdf`,
    title: "Orçamento",
    subtitle: `Paciente: ${patientName}`,
    content,
    isDarkMode,
    logoPath,
    includeWatermark: true,
    d4signSignatures,
    auditLogs,
    includeAuditReport: true,
  });
}
