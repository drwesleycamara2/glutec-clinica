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
 * Generate a premium PDF with the Glutec branding
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
          <div style="font-size: 9px; color: ${isDarkMode ? "#999999" : "#999999"};">
            UUID: ${sig.uuid}
          </div>
        `;
        sigSection.appendChild(sigBlock);
      });

      container.appendChild(sigSection);
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
  d4signSignatures?: D4SignatureLog[]
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
  d4signSignatures?: D4SignatureLog[]
): Promise<void> {
  const type = prescription.type || "simples";
  const numVias = (type === "antimicrobiano" || type === "controle_especial") ? 2 : 1;
  const isControleEspecial = type === "controle_especial";

  const renderVia = (viaNum: number) => `
    <div style="font-family: Montserrat, sans-serif; ${viaNum > 1 ? 'margin-top: 50px; border-top: 2px dashed #d4a853; padding-top: 50px;' : ''}">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
        <div>
          <h2 style="font-size: 18px; font-weight: 600; margin: 0 0 5px 0; color: #d4a853;">
            ${isControleEspecial ? "RECEITUÁRIO DE CONTROLE ESPECIAL" : "PRESCRIÇÃO MÉDICA"}
          </h2>
          <p style="margin: 0; font-size: 12px; color: #666;">${numVias > 1 ? `${viaNum}ª Via` : "Via Única"}</p>
        </div>
      </div>

      <div style="margin-bottom: 20px; padding: 15px; border: 1px solid #d4a853; border-radius: 8px; background-color: ${isDarkMode ? 'rgba(212,168,83,0.05)' : '#fcf9f2'};">
        <p style="margin: 0; font-size: 14px;"><strong>Paciente:</strong> ${patientName}</p>
        <p style="margin: 5px 0 0 0; font-size: 14px;"><strong>Data:</strong> ${new Date().toLocaleDateString("pt-BR")}</p>
      </div>

      <div style="border-top: 1px solid #d4a853; padding-top: 15px;">
        <h3 style="font-size: 14px; font-weight: 600; margin: 0 0 15px 0; text-transform: uppercase; letter-spacing: 1px;">Uso Interno / Prescrição:</h3>
        <div style="font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${prescription.content || "Sem conteúdo registrado."}</div>
      </div>

      ${isControleEspecial ? `
        <div style="margin-top: 30px; padding: 15px; border: 1px solid #d4a853; border-radius: 8px; font-size: 11px; color: #444;">
          <p style="margin: 0 0 10px 0; font-weight: bold; text-align: center; text-transform: uppercase;">Identificação do Comprador / Fornecedor (Preenchimento Obrigatório pela Farmácia)</p>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div style="border-bottom: 1px solid #eee; padding-bottom: 5px;">Nome: ________________________________________________</div>
            <div style="border-bottom: 1px solid #eee; padding-bottom: 5px;">RG: __________________ Órgão Emissor: _________</div>
            <div style="border-bottom: 1px solid #eee; padding-bottom: 5px;">Endereço: ____________________________________________</div>
            <div style="border-bottom: 1px solid #eee; padding-bottom: 5px;">Cidade: _______________________ UF: ____ Tel: ________</div>
          </div>
        </div>
      ` : ""}

      ${prescription.observations ? `
        <div style="margin-top: 20px; font-size: 12px; color: #666; font-style: italic;">
          <strong>Observações:</strong> ${prescription.observations}
        </div>
      ` : ""}
    </div>
  `;

  let fullContent = renderVia(1);
  if (numVias > 1) {
    fullContent += renderVia(2);
  }

  await generatePremiumPdf({
    filename: `prescricao_${type}_${patientName.replace(/\s+/g, "_")}_${Date.now()}.pdf`,
    title: isControleEspecial ? "Controle Especial" : "Prescrição Médica",
    subtitle: `Paciente: ${patientName}`,
    content: fullContent,
    isDarkMode,
    logoPath,
    includeWatermark: true,
    d4signSignatures,
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
  d4signSignatures?: D4SignatureLog[]
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
  });
}
