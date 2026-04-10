export type AnamnesisQuestionType = "text" | "radio" | "checkbox" | "select";

export interface AnamnesisFollowUp {
  prompt: string;
  triggerValues: string[];
  required?: boolean;
  placeholder?: string;
}

export interface AnamnesisQuestion {
  id: string;
  text: string;
  type: AnamnesisQuestionType;
  options: string[];
  required?: boolean;
  placeholder?: string;
  answer?: string;
  followUp?: AnamnesisFollowUp;
  followUpAnswer?: string;
}

export interface AnamnesisTemplate {
  id: string;
  name: string;
  description?: string;
  questions: AnamnesisQuestion[];
}

function createQuestion(
  id: string,
  text: string,
  type: AnamnesisQuestionType,
  options: string[] = [],
  extras: Partial<AnamnesisQuestion> = {},
): AnamnesisQuestion {
  return {
    id,
    text,
    type,
    options,
    required: true,
    answer: "",
    followUpAnswer: "",
    ...extras,
  };
}

const femaleQuestions: AnamnesisQuestion[] = [
  createQuestion("estado-civil", "Estado civil", "text", [], { placeholder: "Informe o estado civil" }),
  createQuestion("profissao", "Profissão", "text", [], { placeholder: "Informe a profissão" }),
  createQuestion("cidade-estado", "Cidade e estado em que mora", "text", [], { placeholder: "Ex: Mogi Guaçu - SP" }),
  createQuestion("peso", "Peso atual aproximado em kg", "text", [], { placeholder: "Ex: 62" }),
  createQuestion("altura", "Sua estatura aproximada (em metros)", "text", [], { placeholder: "Ex: 1,67" }),
  createQuestion("alergia", "Tem alergia a algum medicamento, alimento ou substância?", "radio", ["Sim", "Não"], {
    followUp: {
      prompt: "Qual alergia é essa?",
      triggerValues: ["Sim"],
      required: true,
      placeholder: "Descreva a alergia",
    },
  }),
  createQuestion("fumante", "É fumante?", "radio", ["Sim", "Não"]),
  createQuestion("alcool", "Consome bebida alcoólica?", "radio", ["Sim, muito e com frequência", "Bebo pouco, socialmente", "Não bebo"]),
  createQuestion("droga", "Usa alguma droga ilícita?", "radio", ["Sim", "Não"], {
    followUp: {
      prompt: "Qual droga?",
      triggerValues: ["Sim"],
      required: true,
      placeholder: "Informe qual droga",
    },
  }),
  createQuestion("hormonio", "Usa algum tipo de hormônio?", "radio", ["Sim", "Não"], {
    followUp: {
      prompt: "Quais hormônios?",
      triggerValues: ["Sim"],
      required: true,
      placeholder: "Informe quais hormônios",
    },
  }),
  createQuestion("anticoagulante", "Faz uso de anticoagulante? (ou AAS?)", "radio", ["Sim", "Não"]),
  createQuestion("vitamina-d", "Toma vitamina D? Qual a dose e em que frequência?", "text", [], { placeholder: "Descreva a dose e frequência" }),
  createQuestion("medicamentos", "Faz uso de medicamentos regularmente?", "radio", ["Sim", "Não"], {
    followUp: {
      prompt: "Liste todos os medicamentos de uso regular",
      triggerValues: ["Sim"],
      required: true,
      placeholder: "Informe os medicamentos",
    },
  }),
  createQuestion("problemas-saude", "Selecione os problemas de saúde que tem atualmente", "checkbox", [
    "Nenhum problema de saúde",
    "Diabetes",
    "Pressão alta",
    "Problemas no coração ou arritmias",
    "Problema nos rins ou no fígado",
    "Tumores",
    "Alterações psiquiátricas",
    "Outros problemas de saúde",
  ], {
    followUp: {
      prompt: "Se marcou outros problemas de saúde, escreva quais",
      triggerValues: ["Outros problemas de saúde"],
      required: true,
      placeholder: "Descreva os outros problemas",
    },
  }),
  createQuestion("gestacoes", "Teve gestações? Se sim, quando foi o último parto?", "text", [], { placeholder: "Descreva" }),
  createQuestion("gravida", "Está grávida ou amamentando?", "radio", ["Sim", "Não"]),
  createQuestion("anticoncepcional", "Usa método anticoncepcional? Qual?", "text", [], { placeholder: "Descreva o método" }),
  createQuestion("cicatrizacao", "Já teve problemas de cicatrização, como queloides?", "radio", ["Sim", "Não"]),
  createQuestion("anestesia", "Já teve alguma reação ruim com anestesia?", "radio", ["Sim", "Não"]),
  createQuestion("hemorragia", "Já teve alguma hemorragia? (como evacuar ou vomitar sangue?)", "radio", ["Sim", "Não"]),
  createQuestion("atividade-fisica", "Realiza atividade física regular?", "radio", ["Sim, três ou mais vezes por semana", "Não realizo com frequência"], {
    followUp: {
      prompt: "Se sim, diga qual atividade física realiza",
      triggerValues: ["Sim, três ou mais vezes por semana"],
      required: true,
      placeholder: "Descreva a atividade física",
    },
  }),
  createQuestion("dor", "Você é muito sensível à dor (sente dor com facilidade ou frequentemente)?", "radio", ["Sim", "Não"]),
  createQuestion("trombose", "Já teve trombose, embolia ou AVC?", "radio", ["Sim", "Não"]),
  createQuestion("arritmia", "Já teve ou trata arritmia cardíaca?", "radio", ["Sim", "Não"]),
  createQuestion("pedras-rins", "Tem ou já teve pedras nos rins?", "radio", ["Sim", "Não"]),
  createQuestion("cirurgia", "Já realizou alguma cirurgia?", "radio", ["Sim", "Não"], {
    followUp: {
      prompt: "Quais cirurgias realizou?",
      triggerValues: ["Sim"],
      required: true,
      placeholder: "Descreva as cirurgias",
    },
  }),
  createQuestion("informar-medico", "Há algo que gostaria de informar ao médico?", "text", [], { placeholder: "Escreva aqui" }),
];

export const SYSTEM_ANAMNESIS_TEMPLATES: AnamnesisTemplate[] = [
  {
    id: "anamnesis-feminina-padrao",
    name: "Anamnese feminina padrão",
    description: "Modelo padrão completo para atendimento feminino.",
    questions: femaleQuestions,
  },
  {
    id: "anamnesis-masculina-padrao",
    name: "Anamnese masculina padrão",
    description: "Cópia do modelo feminino, sem perguntas de anticoncepcional, gestações e gestação/amamentação.",
    questions: femaleQuestions.filter((question) => !["gestacoes", "gravida", "anticoncepcional"].includes(question.id)),
  },
];

export function cloneAnamnesisQuestions(questions: AnamnesisQuestion[]): AnamnesisQuestion[] {
  return questions.map((question) => ({
    ...question,
    options: [...question.options],
    answer: question.answer ?? "",
    followUp: question.followUp ? { ...question.followUp, triggerValues: [...question.followUp.triggerValues] } : undefined,
    followUpAnswer: question.followUpAnswer ?? "",
  }));
}

export function mapTemplateSectionsToQuestions(template: any): AnamnesisQuestion[] {
  const sections = Array.isArray(template?.sections) ? template.sections : [];
  const questions: AnamnesisQuestion[] = [];

  sections.forEach((section: any, sectionIndex: number) => {
    const fields = Array.isArray(section?.fields) ? section.fields : [];
    fields.forEach((field: any, fieldIndex: number) => {
      const rawType = String(field?.type || "text");
      const type: AnamnesisQuestionType =
        rawType === "radio" || rawType === "checkbox" || rawType === "select"
          ? rawType
          : "text";

      questions.push({
        id: `template-${template?.id ?? sectionIndex}-${fieldIndex}`,
        text: field?.label || `Pergunta ${fieldIndex + 1}`,
        type,
        options: Array.isArray(field?.options) ? field.options : [],
        required: field?.required !== false,
        placeholder: field?.placeholder || "",
        answer: field?.defaultValue || "",
        followUpAnswer: "",
      });
    });
  });

  return questions;
}

export function shouldShowFollowUp(question: AnamnesisQuestion): boolean {
  if (!question.followUp) return false;
  const answer = String(question.answer ?? "");
  const selected = question.type === "checkbox" ? answer.split(";").filter(Boolean) : [answer];
  return question.followUp.triggerValues.some((value) => selected.includes(value));
}

export function validateAnamnesisQuestions(questions: AnamnesisQuestion[]): string | null {
  for (const question of questions) {
    const answer = String(question.answer ?? "").trim();
    if (question.required !== false && !answer) {
      return `Preencha a pergunta "${question.text}".`;
    }
    if (shouldShowFollowUp(question) && question.followUp?.required && !String(question.followUpAnswer ?? "").trim()) {
      return `Complete a informação complementar em "${question.text}".`;
    }
  }
  return null;
}

export function serializeAnamnesisQuestions(questions: AnamnesisQuestion[]) {
  return questions.map((question) => ({
    text: question.text,
    type: question.type,
    options: question.options,
    required: question.required !== false,
    placeholder: question.placeholder,
    followUp: question.followUp,
  }));
}

export function buildAnamnesisAnswersMap(questions: AnamnesisQuestion[]) {
  return Object.fromEntries(
    questions.flatMap((question) => {
      const entries: Array<[string, string]> = [[question.text, String(question.answer ?? "")]];
      if (question.followUp) {
        entries.push([`${question.text}::__complemento`, String(question.followUpAnswer ?? "")]);
      }
      return entries;
    }),
  );
}