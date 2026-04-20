import { ENV } from "../_core/env";

type ChatConfig = {
  apiUrl: string;
  apiKey: string;
  model: string;
};

export type StructuredClinicalTranscript = {
  refinedTranscript: string;
  queixaPrincipal: string;
  historiaAtualPregressa: string;
  exameFisico: string;
  hipoteseDiagnostica: string;
  conduta: string;
  observacoes: string;
};

function resolveChatConfig(): ChatConfig {
  if (ENV.forgeApiUrl?.trim() && ENV.forgeApiKey?.trim()) {
    return {
      apiUrl: `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`,
      apiKey: ENV.forgeApiKey,
      model: process.env.BUILT_IN_FORGE_CHAT_MODEL?.trim() || "gemini-2.5-flash",
    };
  }

  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com").replace(/\/$/, "");
  const apiKey = process.env.OPENAI_API_KEY?.trim() || "";
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY não configurada para tratamento clínico da transcrição.");
  }

  return {
    apiUrl: `${baseUrl}/v1/chat/completions`,
    apiKey,
    model: process.env.OPENAI_MEDICAL_SUMMARY_MODEL?.trim() || process.env.OPENAI_CHAT_MODEL?.trim() || "gpt-4o-mini",
  };
}

function extractJsonObject(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Resposta vazia do modelo de IA.");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("Não foi possível interpretar a resposta do modelo de IA.");
    }
    return JSON.parse(match[0]);
  }
}

async function invokeJsonPrompt(systemPrompt: string, userPrompt: string) {
  const config = resolveChatConfig();

  const response = await fetch(config.apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.1,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Falha ao consultar IA clínica (${response.status} ${response.statusText}). ${errorText}`.trim());
  }

  const data = await response.json();
  const content = String(data?.choices?.[0]?.message?.content ?? "").trim();
  return extractJsonObject(content);
}

export async function refineTranscriptToPtBr(transcript: string) {
  const normalized = String(transcript || "").trim();
  if (!normalized) return "";

  const payload = await invokeJsonPrompt(
    [
      "Você é um assistente de apoio a prontuário médico.",
      "Reescreva a transcrição em português do Brasil correto, sem inventar fatos.",
      "Corrija palavras quebradas, erros óbvios de reconhecimento, pontuação e concordância.",
      "Remova repetições inúteis e ruídos de fala, mas preserve o conteúdo clínico.",
      "Entregue um texto conciso, legível e fiel ao que foi dito.",
      "Responda somente em JSON no formato {\"refinedTranscript\":\"...\"}.",
    ].join(" "),
    normalized,
  );

  return String(payload?.refinedTranscript || normalized).trim();
}

export async function structureTranscriptForClinicalEvolution(transcript: string): Promise<StructuredClinicalTranscript> {
  const normalized = String(transcript || "").trim();
  if (!normalized) {
    throw new Error("Nenhuma transcrição foi informada para incorporar à evolução clínica.");
  }

  const payload = await invokeJsonPrompt(
    [
      "Você é um assistente médico especializado em organizar ditados clínicos para prontuário.",
      "Leia a transcrição e converta o conteúdo em linguagem médica clara, objetiva e segura.",
      "Não invente informações. Se uma seção não estiver presente, devolva string vazia.",
      "A hipótese diagnóstica pode mencionar suspeitas, nunca certezas não ditas.",
      "Corrija o português para o padrão do Brasil.",
      "Responda somente em JSON com as chaves:",
      "refinedTranscript, queixaPrincipal, historiaAtualPregressa, exameFisico, hipoteseDiagnostica, conduta, observacoes.",
    ].join(" "),
    normalized,
  );

  return {
    refinedTranscript: String(payload?.refinedTranscript || normalized).trim(),
    queixaPrincipal: String(payload?.queixaPrincipal || "").trim(),
    historiaAtualPregressa: String(payload?.historiaAtualPregressa || "").trim(),
    exameFisico: String(payload?.exameFisico || "").trim(),
    hipoteseDiagnostica: String(payload?.hipoteseDiagnostica || "").trim(),
    conduta: String(payload?.conduta || "").trim(),
    observacoes: String(payload?.observacoes || "").trim(),
  };
}
