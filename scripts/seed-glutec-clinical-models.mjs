import "dotenv/config";
import mysql from "mysql2/promise";

const GROUP_LABELS = {
  solicitacao_exames: "Solicitação de exames",
  prescricao: "Prescrição",
  atestado: "Atestado médico",
  declaracao: "Declaração",
};

function section(group, content) {
  return [
    {
      title: GROUP_LABELS[group],
      type: "richtext",
      content,
      fields: [],
    },
  ];
}

function examTemplate(name, cid, exams) {
  const cidLine = cid ? `<p><strong>CID-10:</strong> ${cid}</p>` : `<p><strong>CID-10:</strong> [CID10]</p>`;
  return {
    name,
    group: "solicitacao_exames",
    specialty: GROUP_LABELS.solicitacao_exames,
    description: "Modelo oficial Glutée importado do arquivo MODELOS PARA CADASTRAR GLUTEC.",
    sections: section(
      "solicitacao_exames",
      [
        cidLine,
        "<p>Solicito dosagem sérica de (acompanha código TUSS):</p>",
        "<ul>",
        ...exams.map((exam) => `<li>${exam}</li>`),
        "</ul>",
      ].join(""),
    ),
  };
}

function prescriptionTemplate(name, content, type = "antimicrobiano") {
  return {
    name,
    group: "prescricao",
    specialty: GROUP_LABELS.prescricao,
    description: type,
    sections: section("prescricao", content),
  };
}

function attestationTemplate(name, cid) {
  return {
    name,
    group: "atestado",
    specialty: GROUP_LABELS.atestado,
    description: "Atestado com dados automáticos do paciente e período de afastamento obrigatório.",
    sections: section(
      "atestado",
      [
        "<p><strong>ATESTADO MÉDICO</strong></p>",
        "<p>Declaro, a pedido do interessado abaixo e com sua concordância na divulgação, neste documento, do diagnóstico provável da doença, na forma nominal ou codificada, e com a finalidade de abono de falta ou afastamento do trabalho/estudos, que o(a) senhor(a) <strong>[NOME_PACIENTE]</strong>, portador(a) do CPF: <strong>[CPF_PACIENTE]</strong>, passou por consulta/avaliação médica no dia <strong>[DATA_ATUAL]</strong>, devendo ausentar-se de suas atividades laborais e/ou estudantis pelo período de <strong>[PREENCHER_PERIODO_AFASTAMENTO]</strong>, a contar do dia de hoje.</p>",
        `<p><strong>CID-10:</strong> ${cid}</p>`,
        "<p>Mogi Guaçu - SP, [DATA_ATUAL]</p>",
      ].join(""),
    ),
  };
}

const templates = [
  examTemplate("Minilipo/plastia feminina", "Z01.7", [
    "Beta-HCG qualitativo: 40316327",
    "Glicemia: 40302040",
    "Creatinina: 40301630",
    "ALT/TGP: 40302512",
    "Potássio: 40302318",
    "Hemograma: 40304361",
    "Coagulograma (TAP, TTPA, INR)",
    "TAP (Tempo de Atividade da Protrombina) ou TP (tempo de protrombina), com INR: 40304590",
    "TTPA (Tempo de Tromboplastina Parcial Ativada): 40304639",
    "VDRL: 40307760",
    "Anti-HCV: 40307026",
    "Anti-HIV 1 e 2: 40307182",
    "Anti-HBc IgG: 40306950",
    "Anti-HBc IgM: 40306968",
    "HbsAg: 40307018",
    "TSH: 40316521",
  ]),
  examTemplate("Minilipo/plastia masculina", "Z01.7", [
    "Glicemia: 40302040",
    "Creatinina: 40301630",
    "ALT/TGP: 40302512",
    "Potássio: 40302318",
    "Hemograma: 40304361",
    "Coagulograma (TAP, TTPA, INR)",
    "TAP (Tempo de Atividade da Protrombina) ou TP (tempo de protrombina), com INR: 40304590",
    "TTPA (Tempo de Tromboplastina Parcial Ativada): 40304639",
    "VDRL: 40307760",
    "Anti-HCV: 40307026",
    "Anti-HIV 1 e 2: 40307182",
    "Anti-HBc IgG: 40306950",
    "Anti-HBc IgM: 40306968",
    "HbsAg: 40307018",
    "TSH: 40316521",
  ]),
  examTemplate("PMMA feminino", "Z01.7", [
    "Beta-HCG qualitativo: 40316327",
    "Glicemia: 40302040",
    "Creatinina: 40301630",
    "ALT/TGP: 40302512",
    "Albumina: 40301222",
    "Hemograma: 40304361",
    "Coagulograma (TAP, TTPA, INR)",
    "TAP (Tempo de Atividade da Protrombina) ou TP (tempo de protrombina), com INR: 40304590",
    "TTPA (Tempo de Tromboplastina Parcial Ativada): 40304639",
    "1,25-dihidroxi vitamina D: 40305015",
    "25-hidroxi vitamina D: 40302830",
    "Cálcio iônico (ou ionizado): 40301419",
    "Cálcio total: 40301400",
    "PTH (Paratormônio): 40305465",
  ]),
  examTemplate("PMMA masculino", "Z01.7", [
    "Glicemia: 40302040",
    "Creatinina: 40301630",
    "ALT/TGP: 40302512",
    "Albumina: 40301222",
    "Hemograma: 40304361",
    "Coagulograma (TAP, TTPA, INR)",
    "TAP (Tempo de Atividade da Protrombina) ou TP (tempo de protrombina), com INR: 40304590",
    "TTPA (Tempo de Tromboplastina Parcial Ativada): 40304639",
    "1,25-dihidroxi vitamina D: 40305015",
    "25-hidroxi vitamina D: 40302830",
    "Cálcio iônico (ou ionizado): 40301419",
    "Cálcio total: 40301400",
    "PTH (Paratormônio): 40305465",
  ]),
  attestationTemplate("Atestado para consulta médica - CID Z01.812", "Z01.812"),
  attestationTemplate("Atestado para consulta médica - CID Z54.0", "Z54.0"),
  {
    name: "Declaração de comparecimento",
    group: "declaracao",
    specialty: GROUP_LABELS.declaracao,
    description: "Declaração com nome do paciente e data preenchidos automaticamente.",
    sections: section(
      "declaracao",
      [
        "<p><strong>DECLARAÇÃO</strong></p>",
        "<p>Declaro, para os devidos fins, que <strong>[NOME_PACIENTE]</strong> esteve nesta clínica médica no dia <strong>[DATA_ATUAL]</strong>, das ____:____ às ____:____ horas, em atendimento/tratamento/acompanhamento.</p>",
        "<p>Mogi Guaçu - SP, [DATA_ATUAL]</p>",
      ].join(""),
    ),
  },
  prescriptionTemplate(
    "Endolaser e plastias",
    [
      "<p><strong>USO ORAL</strong></p>",
      "<p><strong>1 - Azitromicina 500 mg</strong> ------------------------------------- 5 comprimidos<br />Tomar 1 comprimido ao dia por 5 dias.</p>",
      "<p><strong>2 - Nimesulida 100 mg</strong> ------------------------------------- 1 caixa<br />Tomar 1 comprimido 12/12 horas por 5 dias.</p>",
      "<p><strong>3 - Montelucaste de Sódio 10 mg</strong> ------------------------------------- 2 caixas<br />Tomar 1 comprimido, à noite, por 60 dias.</p>",
      "<p><strong>4 - Manipular:</strong><br />Polypodium Leucotomos ................. 240 mg<br />Pycnogenol (Pinus Pinaster) ........... 75 mg<br />Vitamina C (revestida) ...................... 300 mg<br />Exsynutriment (Silício Orgânico) .....150 mg<br />Excipiente q.s.p. ...................................... 60 cápsulas<br />Tomar 1 cápsula, pela manhã, após o café, por 60 dias. Iniciar 3 dias após o procedimento.</p>",
    ].join(""),
  ),
  prescriptionTemplate(
    "Minilipo + Lipoenxertia",
    [
      "<p><strong>USO ORAL</strong></p>",
      "<p><strong>1 - Azitromicina 500 mg</strong> ------------------------------------- 5 comprimidos<br />Tomar 1 comprimido ao dia por 5 dias.</p>",
      "<p><strong>2 - Cefadroxila 500 mg</strong> ------------------------------------- 8 comprimidos<br />Tomar 1 comprimido a cada 12 horas por 4 dias.</p>",
      "<p><strong>3 - Montelucaste de Sódio 10 mg</strong> ------------------------------------- 2 caixas<br />Tomar 1 comprimido, à noite, por 60 dias.</p>",
      "<p><strong>4 - Dipirona 1 grama ou Paracetamol 750 mg</strong> ______<br />Tomar 1 comprimido até 4 vezes ao dia se tiver dor.</p>",
      "<p><strong>5 - Manipular:</strong><br />Polypodium Leucotomos ................. 240 mg<br />Pycnogenol (Pinus Pinaster) ........... 75 mg<br />Vitamina C (revestida) ...................... 300 mg<br />Exsynutriment (Silício Orgânico) .....150 mg<br />Excipiente q.s.p. ...................................... 60 cápsulas<br />Tomar 1 cápsula, pela manhã, após o café, por 60 dias. Iniciar 3 dias após o procedimento.</p>",
      "<p><strong>USO TÓPICO</strong></p>",
      "<p><strong>1 - Kelo-Cote® gel de silicone</strong> ______<br />Aplicar fina camada sobre a cicatriz limpa e seca, à tarde e à noite por 3 meses.</p>",
      "<p><strong>2 - Dipropionato de betametasona 0,05% creme</strong><br />Aplicar apenas sobre a cicatriz uma fina camada pela manhã por 4 semanas. Iniciar os dois medicamentos somente após 7 dias do procedimento e nas lesões que estiverem secas. Nunca usar em feridas abertas.</p>",
      "<p>Trocar os curativos sempre que estiverem bem molhados ou se chegar em 8 horas da última troca. Usar:<br />- Gaze estéril (15 pacotes)<br />- Limpar com spray antisséptico ou com clorexidina aquosa em cada troca.<br />- Fixar as gazes com micropore ou fita crepe (não tocar as gazes na parte que terá contato com a pele).</p>",
    ].join(""),
  ),
  prescriptionTemplate(
    "Minilipo sem enxerto",
    [
      "<p><strong>USO ORAL</strong></p>",
      "<p><strong>1 - Cefadroxila 500 mg</strong> ------------------------------------- 8 comprimidos<br />Tomar 1 comprimido a cada 12 horas por 4 dias.</p>",
      "<p><strong>2 - Nimesulida 500 mg</strong> ------------------------------------- 8 comprimidos<br />Tomar 1 comprimido a cada 12 horas por 5 dias.</p>",
      "<p><strong>3 - Montelucaste de Sódio 10 mg</strong> ------------------------------------- 2 caixas<br />Tomar 1 comprimido, à noite, por 60 dias.</p>",
      "<p><strong>4 - Dipirona 1 grama ou Paracetamol 750 mg</strong> ______<br />Tomar 1 comprimido até 4 vezes ao dia se tiver dor.</p>",
      "<p><strong>5 - Manipular:</strong><br />Polypodium Leucotomos ................. 240 mg<br />Pycnogenol (Pinus Pinaster) ........... 75 mg<br />Vitamina C (revestida) ...................... 300 mg<br />Exsynutriment (Silício Orgânico) .....150 mg<br />Excipiente q.s.p. ...................................... 60 cápsulas<br />Tomar 1 cápsula, pela manhã, após o café, por 60 dias. Iniciar 3 dias após o procedimento.</p>",
      "<p><strong>USO TÓPICO</strong></p>",
      "<p><strong>1 - Kelo-Cote® gel de silicone</strong> ______<br />Aplicar fina camada sobre a cicatriz limpa e seca, à tarde e à noite por 3 meses.</p>",
      "<p><strong>2 - Dipropionato de betametasona 0,05% creme</strong><br />Aplicar apenas sobre a cicatriz uma fina camada pela manhã por 4 semanas. Iniciar os dois medicamentos somente após 7 dias do procedimento e nas lesões que estiverem secas. Nunca usar em feridas abertas.</p>",
      "<p>Trocar os curativos sempre que estiverem bem molhados ou se chegar em 8 horas da última troca. Usar:<br />- Gaze estéril (15 pacotes)<br />- Limpar com spray antisséptico ou com clorexidina aquosa em cada troca.<br />- Fixar as gazes com micropore ou fita crepe (não tocar as gazes na parte que terá contato com a pele).</p>",
    ].join(""),
  ),
  prescriptionTemplate(
    "Ninfoplastia",
    [
      "<p><strong>USO ORAL</strong></p>",
      "<p><strong>1 - Azitromicina 500 mg</strong> ____ 5 comprimidos<br />Tomar 1 comprimido ao dia por 5 dias, iniciando 1 dia antes do procedimento. Tomar com estômago cheio.</p>",
      "<p><strong>2 - Nimesulida 100 mg</strong> ____ 1 caixa<br />Tomar 1 comprimido 12/12 horas por 5 dias. Tomar com estômago cheio.</p>",
      "<p><strong>3 - Dipirona 1 g ou Paracetamol 750 mg</strong> ____<br />Tomar 1 comprimido 6/6 horas por 3 dias. Depois desse prazo, somente se continuar com dor.</p>",
      "<p><strong>4 - Ácido tranexâmico 250 mg</strong> ____<br />Tomar 2 comprimidos de uma vez, a cada 8 horas, por 3 dias.</p>",
      "<p><strong>USO TÓPICO</strong></p>",
      "<p><strong>1 - Cloridrato de lidocaína + cloreto de benzetônio</strong> ____ solução antisséptica spray<br />Dar 2 a 3 borrifadas na lesão sempre que tiver dor e 2 a 5 minutos antes de urinar.</p>",
      "<p><strong>2 - Neomicina + Bacitracina</strong> ____ pomada<br />Usar 3 vezes ao dia uma pequena quantidade sobre a lesão por 10 dias.</p>",
    ].join(""),
  ),
];

async function resolveCreatedBy(conn) {
  const [rows] = await conn.execute(
    "select id from users where lower(email) = lower(?) order by id asc limit 1",
    ["contato@drwesleycamara.com.br"],
  );
  return Number(rows?.[0]?.id ?? 1);
}

async function upsertTemplate(conn, template, createdBy) {
  const sections = JSON.stringify(template.sections);
  const [rows] = await conn.execute(
    "select id from medical_record_templates where name = ? and specialty = ? limit 1",
    [template.name, template.specialty],
  );

  if (rows.length) {
    await conn.execute(
      "update medical_record_templates set description = ?, sections = ?, active = 1, updatedAt = now() where id = ?",
      [template.description ?? null, sections, rows[0].id],
    );
    return { action: "updated", id: rows[0].id, name: template.name };
  }

  const [result] = await conn.execute(
    "insert into medical_record_templates (name, specialty, description, sections, active, createdBy) values (?, ?, ?, ?, 1, ?)",
    [template.name, template.specialty, template.description ?? null, sections, createdBy],
  );
  return { action: "inserted", id: result.insertId, name: template.name };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não definida.");
  }

  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const createdBy = await resolveCreatedBy(conn);
    const results = [];
    for (const template of templates) {
      results.push(await upsertTemplate(conn, template, createdBy));
    }

    const inserted = results.filter((item) => item.action === "inserted").length;
    const updated = results.filter((item) => item.action === "updated").length;
    console.log(`Modelos Glutée aplicados: ${inserted} inseridos, ${updated} atualizados.`);
    for (const result of results) {
      console.log(`${result.action}: #${result.id} ${result.name}`);
    }
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
