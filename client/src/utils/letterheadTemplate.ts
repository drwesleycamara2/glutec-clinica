/**
 * Template de Papel Timbrado - Clínica Glutée
 * Utilizado para todas as impressões do sistema (Prescrições, Exames, Relatórios, etc.)
 */

export interface LetterheadConfig {
  clinicName: string;
  clinicSubtitle: string;
  cnpj: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  website: string;
  logoUrl: string;
  colors: {
    primary: string;
    secondary: string;
    text: string;
    lightBg: string;
  };
}

export const letterheadConfig: LetterheadConfig = {
  clinicName: "Clínica Glutée",
  clinicSubtitle: "Harmonização Corporal e Íntima",
  cnpj: "XX.XXX.XXX/0001-XX",
  address: "Rua/Avenida, Número - Complemento",
  city: "Mogi Guaçu - SP",
  phone: "(19) 3841-XXXX",
  email: "contato@glutee.com.br",
  website: "www.glutee.com.br",
  logoUrl: "/glutec-logo.png",
  colors: {
    primary: "#d4a853", // Dourado metálico
    secondary: "#8b7355", // Marrom/Cinza
    text: "#333333",
    lightBg: "#f9f9f9",
  },
};

export function generateLetterheadHTML(
  config: LetterheadConfig,
  contentHTML: string
): string {
  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Documento - ${config.clinicName}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          color: ${config.colors.text};
          line-height: 1.6;
          background-color: white;
          padding: 0;
        }

        .page {
          width: 210mm;
          height: 297mm;
          margin: 0 auto;
          padding: 20mm;
          background-color: white;
          box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        }

        /* Header - Papel Timbrado */
        .letterhead {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 3px solid ${config.colors.primary};
        }

        .letterhead-logo {
          width: 80px;
          height: 80px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .letterhead-logo img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
        }

        .letterhead-info {
          flex: 1;
          margin-left: 20px;
          text-align: center;
        }

        .letterhead-info h1 {
          font-size: 24px;
          font-weight: 700;
          color: ${config.colors.primary};
          margin-bottom: 2px;
          letter-spacing: 0.5px;
        }

        .letterhead-info .subtitle {
          font-size: 12px;
          color: ${config.colors.secondary};
          font-style: italic;
          margin-bottom: 8px;
        }

        .letterhead-info .contact {
          font-size: 10px;
          color: ${config.colors.text};
          display: flex;
          justify-content: center;
          gap: 15px;
          flex-wrap: wrap;
        }

        .letterhead-info .contact span {
          display: inline-block;
        }

        .letterhead-info .contact span::before {
          content: "•";
          margin-right: 5px;
          color: ${config.colors.primary};
        }

        .letterhead-info .contact span:first-child::before {
          content: "";
          margin-right: 0;
        }

        /* Content Area */
        .content {
          min-height: 150mm;
          margin-bottom: 20px;
        }

        /* Footer */
        .footer {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #ddd;
          font-size: 9px;
          color: #666;
          text-align: center;
        }

        .footer-line {
          display: flex;
          justify-content: space-between;
          margin-bottom: 5px;
        }

        /* Signature Area */
        .signature-area {
          margin-top: 40px;
          display: flex;
          justify-content: space-around;
          gap: 20px;
        }

        .signature-box {
          flex: 1;
          text-align: center;
          border-top: 1px solid ${config.colors.text};
          padding-top: 10px;
          font-size: 10px;
        }

        .signature-box .name {
          font-weight: 600;
          margin-top: 5px;
        }

        .signature-box .title {
          font-size: 9px;
          color: #666;
        }

        /* Print Styles */
        @media print {
          body {
            margin: 0;
            padding: 0;
          }

          .page {
            margin: 0;
            box-shadow: none;
            padding: 15mm;
            page-break-after: always;
          }

          @page {
            margin: 0;
          }
        }

        /* Utility Classes */
        .text-center {
          text-align: center;
        }

        .text-right {
          text-align: right;
        }

        .mt-20 {
          margin-top: 20px;
        }

        .mt-40 {
          margin-top: 40px;
        }

        .mb-10 {
          margin-bottom: 10px;
        }

        .mb-20 {
          margin-bottom: 20px;
        }

        .font-bold {
          font-weight: 700;
        }

        .font-semibold {
          font-weight: 600;
        }

        .text-sm {
          font-size: 12px;
        }

        .text-xs {
          font-size: 10px;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          margin: 15px 0;
        }

        table th {
          background-color: ${config.colors.lightBg};
          border: 1px solid #ddd;
          padding: 8px;
          text-align: left;
          font-weight: 600;
          font-size: 11px;
        }

        table td {
          border: 1px solid #ddd;
          padding: 8px;
          font-size: 11px;
        }

        .highlight {
          background-color: ${config.colors.lightBg};
          padding: 10px;
          border-left: 3px solid ${config.colors.primary};
          margin: 10px 0;
        }
      </style>
    </head>
    <body>
      <div class="page">
        <!-- Letterhead -->
        <div class="letterhead">
          <div class="letterhead-logo">
            <img src="${config.logoUrl}" alt="${config.clinicName}">
          </div>
          <div class="letterhead-info">
            <h1>${config.clinicName}</h1>
            <div class="subtitle">${config.clinicSubtitle}</div>
            <div class="contact">
              <span>${config.cnpj}</span>
              <span>${config.phone}</span>
              <span>${config.email}</span>
            </div>
          </div>
        </div>

        <!-- Content -->
        <div class="content">
          ${contentHTML}
        </div>

        <!-- Footer -->
        <div class="footer">
          <div class="footer-line">
            <span>${config.clinicName} | ${config.address}, ${config.city}</span>
            <span>${config.website}</span>
          </div>
          <div class="footer-line">
            <span>Documento gerado automaticamente em ${new Date().toLocaleString("pt-BR")}</span>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

export function generatePrescriptionHTML(
  patientName: string,
  doctorName: string,
  doctorCRM: string,
  medications: Array<{ name: string; dosage: string; frequency: string }>,
  observations: string
): string {
  const medicationsHTML = medications
    .map(
      (med) => `
    <tr>
      <td>${med.name}</td>
      <td>${med.dosage}</td>
      <td>${med.frequency}</td>
    </tr>
  `
    )
    .join("");

  return `
    <div class="mt-20">
      <h2 class="font-bold mb-20" style="font-size: 16px;">PRESCRIÇÃO MÉDICA</h2>

      <div class="mb-20">
        <p><strong>Paciente:</strong> ${patientName}</p>
        <p><strong>Data:</strong> ${new Date().toLocaleDateString("pt-BR")}</p>
      </div>

      <h3 class="font-semibold mb-10">Medicamentos Prescritos:</h3>
      <table>
        <thead>
          <tr>
            <th>Medicamento</th>
            <th>Dosagem</th>
            <th>Frequência</th>
          </tr>
        </thead>
        <tbody>
          ${medicationsHTML}
        </tbody>
      </table>

      ${observations ? `<div class="highlight"><strong>Observações:</strong> ${observations}</div>` : ""}

      <div class="signature-area mt-40">
        <div class="signature-box">
          <div style="height: 40px;"></div>
          <div class="name">${doctorName}</div>
          <div class="title">CRM: ${doctorCRM}</div>
        </div>
      </div>
    </div>
  `;
}

export function generateExamRequestHTML(
  patientName: string,
  doctorName: string,
  doctorCRM: string,
  exams: Array<{ name: string; indication: string }>,
  observations: string
): string {
  const examsHTML = exams
    .map(
      (exam) => `
    <tr>
      <td>${exam.name}</td>
      <td>${exam.indication}</td>
    </tr>
  `
    )
    .join("");

  return `
    <div class="mt-20">
      <h2 class="font-bold mb-20" style="font-size: 16px;">PEDIDO DE EXAMES</h2>

      <div class="mb-20">
        <p><strong>Paciente:</strong> ${patientName}</p>
        <p><strong>Data:</strong> ${new Date().toLocaleDateString("pt-BR")}</p>
      </div>

      <h3 class="font-semibold mb-10">Exames Solicitados:</h3>
      <table>
        <thead>
          <tr>
            <th>Exame</th>
            <th>Indicação Clínica</th>
          </tr>
        </thead>
        <tbody>
          ${examsHTML}
        </tbody>
      </table>

      ${observations ? `<div class="highlight"><strong>Observações:</strong> ${observations}</div>` : ""}

      <div class="signature-area mt-40">
        <div class="signature-box">
          <div style="height: 40px;"></div>
          <div class="name">${doctorName}</div>
          <div class="title">CRM: ${doctorCRM}</div>
        </div>
      </div>
    </div>
  `;
}

export function generateAttestationHTML(
  patientName: string,
  doctorName: string,
  doctorCRM: string,
  type: "comparecimento" | "afastamento" | "aptidao",
  startDate?: string,
  endDate?: string,
  reason?: string
): string {
  const typeLabel = {
    comparecimento: "ATESTADO DE COMPARECIMENTO",
    afastamento: "ATESTADO DE AFASTAMENTO",
    aptidao: "ATESTADO DE APTIDÃO",
  };

  return `
    <div class="mt-20">
      <h2 class="font-bold mb-20 text-center" style="font-size: 16px;">${typeLabel[type]}</h2>

      <div class="mb-20 text-center">
        <p>Atesto que o(a) Sr(a). <strong>${patientName}</strong></p>
        ${type === "comparecimento" ? `<p>compareceu à consulta médica em <strong>${new Date().toLocaleDateString("pt-BR")}</strong>.</p>` : ""}
        ${type === "afastamento" ? `<p>necessita de afastamento de suas atividades de <strong>${startDate}</strong> a <strong>${endDate}</strong>.</p>` : ""}
        ${type === "aptidao" ? `<p>encontra-se apto(a) para o exercício de suas atividades.</p>` : ""}
        ${reason ? `<p>Motivo: <strong>${reason}</strong></p>` : ""}
      </div>

      <div class="signature-area mt-40">
        <div class="signature-box">
          <div style="height: 40px;"></div>
          <div class="name">${doctorName}</div>
          <div class="title">CRM: ${doctorCRM}</div>
        </div>
      </div>
    </div>
  `;
}
