import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "wouter";
import { Loader2, Send, ShieldCheck, UserRound } from "lucide-react";
import {
  type AnamnesisQuestion,
  shouldShowFollowUp,
  validateAnamnesisQuestions,
} from "@/lib/anamnesis";

const PRIVACY_NOTICE = "Seus dados são protegidos por sigilo médico-paciente. As respostas são usadas para seu atendimento e não ficam expostas a toda a equipe da clínica.";

const PROFILE_PHOTO_MAX_SIDE = 900;
const PROFILE_PHOTO_QUALITY = 0.82;
const PROFILE_PHOTO_MAX_INPUT_MB = 20;

async function resizeProfilePhoto(file: File) {
  if (file.size > PROFILE_PHOTO_MAX_INPUT_MB * 1024 * 1024) {
    throw new Error("A foto selecionada est\u00e1 muito grande. Envie uma imagem de at\u00e9 20 MB.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("N\u00e3o foi poss\u00edvel carregar a foto selecionada."));
      img.src = objectUrl;
    });

    const scale = Math.min(1, PROFILE_PHOTO_MAX_SIDE / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
    const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
    const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("N\u00e3o foi poss\u00edvel preparar a foto para envio.");
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error("N\u00e3o foi poss\u00edvel redimensionar a foto."));
      }, "image/jpeg", PROFILE_PHOTO_QUALITY);
    });

    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result ?? "");
        resolve(result.includes(",") ? result.split(",")[1] : result);
      };
      reader.onerror = () => reject(new Error("N\u00e3o foi poss\u00edvel ler a foto redimensionada."));
      reader.readAsDataURL(blob);
    });

    const safeName = (file.name || "perfil-anamnese").replace(/\.[^.]+$/, "") || "perfil-anamnese";
    return {
      base64,
      mimeType: "image/jpeg",
      fileName: `${safeName}.jpg`,
      previewUrl: URL.createObjectURL(blob),
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}


type PublicAnamnesisResponse = {
  patientName?: string;
  title?: string;
  templateName?: string | null;
  anamnesisDate?: string | null;
  expiresAt?: string;
  submittedAt?: string | null;
  questions: Array<AnamnesisQuestion>;
  answers?: Record<string, string>;
  profilePhotoUrl?: string | null;
};

function makeUniqueQuestionId(question: AnamnesisQuestion, index: number, usedIds: Set<string>) {
  const rawBase = String(question.id || question.text || `pergunta-${index + 1}`).trim();
  const safeBase = rawBase || `pergunta-${index + 1}`;
  let candidate = safeBase;
  let suffix = 2;

  while (usedIds.has(candidate)) {
    candidate = `${safeBase}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(candidate);
  return candidate;
}

export default function AnamnesePublica() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [anamnesis, setAnamnesis] = useState<PublicAnamnesisResponse | null>(null);
  const [respondentName, setRespondentName] = useState("");
  const [questions, setQuestions] = useState<Array<AnamnesisQuestion>>([]);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState("");
  const [profilePhotoBase64, setProfilePhotoBase64] = useState("");
  const [profilePhotoMimeType, setProfilePhotoMimeType] = useState("");
  const [profilePhotoFileName, setProfilePhotoFileName] = useState("");
  const [profilePhotoDeclarationAccepted, setProfilePhotoDeclarationAccepted] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError("");
        const response = await fetch(`/api/public/anamnese/${token}`);
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || "Não foi possível carregar a anamnese.");
        }

        const payload = (await response.json()) as PublicAnamnesisResponse;
        if (cancelled) return;

        const usedQuestionIds = new Set<string>();
        const hydratedQuestions = (payload.questions || []).map((question, index) => ({
          ...question,
          id: makeUniqueQuestionId(question, index, usedQuestionIds),
          answer: payload.answers?.[question.id] || payload.answers?.[question.text] || "",
          followUpAnswer: payload.answers?.[`${question.id}::__complemento`] || payload.answers?.[`${question.text}::__complemento`] || "",
          options: Array.isArray(question.options) ? question.options : [],
        }));

        setAnamnesis(payload);
        setQuestions(hydratedQuestions);
        setProfilePhotoPreview(payload.profilePhotoUrl || "");
        setSuccess(payload.submittedAt ? "Esta anamnese já foi enviada anteriormente e pode ser atualizada, se necessário." : "");
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Não foi possível carregar a anamnese.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const questionCount = useMemo(() => questions.length, [questions.length]);

  const updateQuestion = (id: string, updates: Partial<AnamnesisQuestion>) => {
    setError("");
    setQuestions((current) => current.map((question) => (question.id === id ? { ...question, ...updates } : question)));
  };

  const handleProfilePhotoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Envie apenas uma foto real da pr\u00f3pria pessoa, em formato de imagem.");
      event.target.value = "";
      return;
    }

    try {
      const resized = await resizeProfilePhoto(file);
      setProfilePhotoBase64(resized.base64);
      setProfilePhotoMimeType(resized.mimeType);
      setProfilePhotoFileName(resized.fileName);
      setProfilePhotoPreview(resized.previewUrl);
      setError("");
    } catch (err: any) {
      setProfilePhotoBase64("");
      setProfilePhotoMimeType("");
      setProfilePhotoFileName("");
      setProfilePhotoPreview("");
      setError(err?.message || "N\u00e3o foi poss\u00edvel preparar a foto selecionada.");
      event.target.value = "";
    }
  };

  const handleSubmit = async () => {
    if (!anamnesis) return;

    const validationError = validateAnamnesisQuestions(questions);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (profilePhotoBase64 && !profilePhotoDeclarationAccepted) {
      setError("Confirme que a foto enviada é da própria pessoa para concluir a anamnese.");
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      setSuccess("");

      const answers = Object.fromEntries(
        questions.flatMap((question) => {
          const answer = String(question.answer ?? "");
          const entries: Array<[string, string]> = [[question.id, answer], [question.text, answer]];
          if (question.followUp) {
            const followUpAnswer = String(question.followUpAnswer ?? "");
            entries.push([`${question.id}::__complemento`, followUpAnswer], [`${question.text}::__complemento`, followUpAnswer]);
          }
          return entries;
        }),
      );

      const response = await fetch(`/api/public/anamnese/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          respondentName: respondentName.trim() || undefined,
          answers,
          profilePhotoBase64: profilePhotoBase64 || undefined,
          profilePhotoMimeType: profilePhotoMimeType || undefined,
          profilePhotoFileName: profilePhotoFileName || undefined,
          profilePhotoDeclarationAccepted,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Não foi possível enviar a anamnese.");
      }

      setSuccess("Anamnese enviada com sucesso. A Clínica Glutée já recebeu suas respostas.");
    } catch (err: any) {
      setError(err?.message || "Não foi possível enviar a anamnese.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#090909] text-white flex items-center justify-center px-6">
        <div className="flex items-center gap-3 rounded-full border border-[#C9A55B]/30 bg-white/5 px-5 py-3">
          <Loader2 className="h-5 w-5 animate-spin text-[#C9A55B]" />
          <span>Carregando anamnese...</span>
        </div>
      </div>
    );
  }

  if (error && !anamnesis) {
    return (
      <div className="min-h-screen bg-[#090909] text-white flex items-center justify-center px-6">
        <div className="w-full max-w-xl rounded-[28px] border border-[#C9A55B]/30 bg-[#121212] p-8 text-center shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
          <img src="/glutee-logo.png" alt="Clínica Glutée" className="mx-auto mb-6 w-44 max-w-[70%]" />
          <h1 className="text-3xl font-semibold">Link indisponível</h1>
          <p className="mt-4 text-base text-white/70">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(201,165,91,0.18),transparent_22%),linear-gradient(135deg,#050505,#131313_42%,#080808)] px-4 py-8 text-white">
      <div className="mx-auto w-full max-w-4xl overflow-hidden rounded-[32px] border border-[#C9A55B]/25 bg-[linear-gradient(180deg,rgba(17,17,17,0.96),rgba(9,9,9,0.96))] shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
        <div className="border-b border-[#C9A55B]/15 bg-[linear-gradient(135deg,rgba(201,165,91,0.18),rgba(201,165,91,0.02))] px-6 py-8 md:px-10">
          <img src="/glutee-logo.png" alt="Clínica Glutée" className="mx-auto mb-6 w-48 max-w-[72%]" />
          <p className="text-center text-xs uppercase tracking-[0.45em] text-[#E8D3A1]">Clínica Glutée</p>
          <h1 className="mt-3 text-center text-3xl font-semibold md:text-4xl">{anamnesis?.title || "Preenchimento de anamnese"}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-center text-sm text-white/72 md:text-base">
            Preencha todas as informações para adiantar o atendimento. {PRIVACY_NOTICE}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-xs text-white/70 md:text-sm">
            <span className="rounded-full border border-[#C9A55B]/20 bg-white/5 px-3 py-1.5">Paciente: {anamnesis?.patientName || "Identificação protegida"}</span>
            <span className="rounded-full border border-[#C9A55B]/20 bg-white/5 px-3 py-1.5">Perguntas: {questionCount}</span>
            {anamnesis?.anamnesisDate ? <span className="rounded-full border border-[#C9A55B]/20 bg-white/5 px-3 py-1.5">Data clínica: {new Date(anamnesis.anamnesisDate).toLocaleDateString("pt-BR")}</span> : null}
          </div>
        </div>

        <div className="px-6 py-6 md:px-10 md:py-8">
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-[#C9A55B]/20 bg-white/[0.03] p-4 text-sm text-white/72">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#C9A55B]" />
            <div>
              <p className="font-medium text-white">Canal seguro da Clínica Glutée</p>
              <p className="mt-1">{PRIVACY_NOTICE}</p>
              <p className="mt-2">Todas as perguntas são obrigatórias. Se uma resposta exigir complemento, o sistema abrirá o campo correspondente na mesma caixa.</p>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-white/90">Seu nome</label>
              <input
                value={respondentName}
                onChange={(event) => setRespondentName(event.target.value)}
                placeholder="Digite seu nome completo"
                className="h-12 w-full rounded-xl border border-[#C9A55B]/20 bg-black/25 px-4 text-white outline-none transition focus:border-[#C9A55B]/55"
              />
            </div>

            <div className="rounded-2xl border border-[#C9A55B]/15 bg-white/[0.03] p-4 md:p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-white/95">
                <UserRound className="h-4 w-4 text-[#C9A55B]" />
                Foto opcional do paciente
              </div>
              <p className="mb-4 text-sm text-white/68">Se desejar, envie uma foto de perfil real da própria pessoa. Não envie desenhos, animais, paisagens ou imagens aleatórias.</p>
              <input type="file" accept="image/*" onChange={handleProfilePhotoChange} className="block w-full text-sm text-white/75 file:mr-4 file:rounded-full file:border-0 file:bg-[#C9A55B] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-black" />
              {profilePhotoPreview ? <img src={profilePhotoPreview} alt="Prévia da foto de perfil" className="mt-4 h-36 w-36 rounded-2xl object-cover ring-1 ring-[#C9A55B]/30" /> : null}
              <label className="mt-4 flex items-start gap-3 text-sm text-white/75">
                <input type="checkbox" checked={profilePhotoDeclarationAccepted} onChange={(event) => setProfilePhotoDeclarationAccepted(event.target.checked)} className="mt-1 rounded border-[#C9A55B]/40" />
                <span>Confirmo que, se eu enviar uma foto, ela será da própria pessoa paciente.</span>
              </label>
            </div>

            {questions.map((question) => (
              <div key={question.id} className="rounded-2xl border border-[#C9A55B]/15 bg-white/[0.03] p-4 md:p-5">
                <label className="mb-3 block text-sm font-medium text-white/95">{question.text}</label>

                {question.type === "text" ? (
                  <textarea
                    rows={3}
                    value={question.answer || ""}
                    onChange={(event) => updateQuestion(question.id, { answer: event.target.value })}
                    className="w-full rounded-xl border border-[#C9A55B]/20 bg-black/25 px-4 py-3 text-white outline-none transition focus:border-[#C9A55B]/55"
                    placeholder={question.placeholder || "Digite sua resposta"}
                  />
                ) : null}

                {question.type === "radio" ? (
                  <div className="flex flex-wrap gap-2">
                    {(question.options || []).map((option) => {
                      const active = (question.answer || "") === option;
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => updateQuestion(question.id, { answer: option, followUpAnswer: active ? question.followUpAnswer : "" })}
                          className={`rounded-full border px-4 py-2 text-sm transition ${active ? "border-[#D6B160] bg-[#C9A55B] text-black" : "border-[#C9A55B]/20 bg-black/20 text-white/85 hover:border-[#C9A55B]/45"}`}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {question.type === "checkbox" ? (
                  <div className="flex flex-wrap gap-2">
                    {(question.options || []).map((option) => {
                      const selected = (question.answer || "").split(";").includes(option);
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => {
                            const current = (question.answer || "").split(";").filter(Boolean);
                            const next = selected ? current.filter((item) => item !== option) : [...current, option];
                            updateQuestion(question.id, { answer: next.join(";") });
                          }}
                          className={`rounded-full border px-4 py-2 text-sm transition ${selected ? "border-[#D6B160] bg-[#C9A55B] text-black" : "border-[#C9A55B]/20 bg-black/20 text-white/85 hover:border-[#C9A55B]/45"}`}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {question.type === "select" ? (
                  <select
                    value={question.answer || ""}
                    onChange={(event) => updateQuestion(question.id, { answer: event.target.value })}
                    className="h-12 w-full rounded-xl border border-[#C9A55B]/20 bg-black/25 px-4 text-white outline-none transition focus:border-[#C9A55B]/55"
                  >
                    <option value="">Selecione uma opção</option>
                    {(question.options || []).map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                ) : null}

                {shouldShowFollowUp(question) && question.followUp ? (
                  <div className="mt-4 rounded-xl border border-[#C9A55B]/15 bg-black/20 p-4">
                    <label className="mb-2 block text-sm font-medium text-white/85">{question.followUp.prompt}</label>
                    <input
                      value={question.followUpAnswer || ""}
                      onChange={(event) => updateQuestion(question.id, { followUpAnswer: event.target.value })}
                      placeholder={question.followUp.placeholder || "Escreva aqui"}
                      className="h-11 w-full rounded-xl border border-[#C9A55B]/20 bg-black/25 px-4 text-white outline-none transition focus:border-[#C9A55B]/55"
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          {error ? <div className="mt-6 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div> : null}
          {success ? <div className="mt-6 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{success}</div> : null}

          <div className="mt-8 flex flex-col items-stretch gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-white/60">Ao enviar, suas respostas ficam protegidas no prontuário e acessíveis apenas aos perfis autorizados.</p>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || loading}
              className="inline-flex h-12 items-center justify-center rounded-xl bg-[linear-gradient(90deg,#8A6526,#D7B56B,#B8863B)] px-6 text-sm font-semibold text-black shadow-[0_18px_45px_rgba(201,165,91,0.24)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Enviar anamnese
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
