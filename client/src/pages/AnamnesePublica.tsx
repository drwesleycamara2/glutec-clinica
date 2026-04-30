import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "wouter";
import { Loader2, Send, ShieldCheck, UserRound } from "lucide-react";
import {
  type AnamnesisQuestion,
  getMissingAnamnesisQuestions,
  shouldShowFollowUp,
  shouldShowQuestion,
} from "@/lib/anamnesis";

const PRIVACY_NOTICE = "Seus dados são protegidos por sigilo médico-paciente. As respostas são usadas para seu atendimento e não ficam expostas a toda a equipe da clínica.";

const PROFILE_PHOTO_MAX_SIDE = 900;
const PROFILE_PHOTO_QUALITY = 0.82;
const PROFILE_PHOTO_MAX_INPUT_MB = 20;

async function resizeProfilePhoto(file: File) {
  if (file.size > PROFILE_PHOTO_MAX_INPUT_MB * 1024 * 1024) {
    throw new Error("A foto selecionada está muito grande. Envie uma imagem de até 20 MB.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Não foi possível carregar a foto selecionada."));
      img.src = objectUrl;
    });

    const scale = Math.min(1, PROFILE_PHOTO_MAX_SIDE / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
    const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
    const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a foto para envio.");
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error("Não foi possível redimensionar a foto."));
      }, "image/jpeg", PROFILE_PHOTO_QUALITY);
    });

    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result ?? "");
        resolve(result.includes(",") ? result.split(",")[1] : result);
      };
      reader.onerror = () => reject(new Error("Não foi possível ler a foto redimensionada."));
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
  const [missingQuestionIds, setMissingQuestionIds] = useState<Set<string>>(new Set());
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
        setRespondentName(payload.patientName || "");
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

  const visibleQuestions = useMemo(
    () => questions.filter((question) => shouldShowQuestion(question, questions)),
    [questions],
  );
  const questionCount = visibleQuestions.length;
  const patientDisplayName = anamnesis?.patientName || respondentName || "Paciente";

  const updateQuestion = (id: string, updates: Partial<AnamnesisQuestion>) => {
    setError("");
    setMissingQuestionIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setQuestions((current) => current.map((question) => (question.id === id ? { ...question, ...updates } : question)));
  };

  const handleProfilePhotoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Envie apenas uma foto real da própria pessoa, em formato de imagem.");
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
      setError(err?.message || "Não foi possível preparar a foto selecionada.");
      event.target.value = "";
    }
  };

  const handleSubmit = async () => {
    if (!anamnesis) return;

    const missing = getMissingAnamnesisQuestions(questions);
    if (missing.length > 0) {
      setMissingQuestionIds(new Set(missing.map((item) => item.id)));
      const labels = missing
        .slice(0, 6)
        .map((item) => item.followUp ? `${item.text} (complemento)` : item.text)
        .join("; ");
      setError(`Falta responder ${missing.length} pergunta(s): ${labels}${missing.length > 6 ? "; ..." : ""}.`);
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
        visibleQuestions.flatMap((question) => {
          const answer = String(question.answer ?? "");
          const entries: Array<[string, string]> = [[question.id, answer], [question.text, answer]];
          if (question.followUp && shouldShowFollowUp(question)) {
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
          respondentName: patientDisplayName.trim() || undefined,
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

      setMissingQuestionIds(new Set());
      setSuccess("Anamnese enviada com sucesso. A Clínica Glutée já recebeu suas respostas.");
    } catch (err: any) {
      setError(err?.message || "Não foi possível enviar a anamnese.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F7F1E6] text-[#1F1A14] flex items-center justify-center px-6">
        <div className="flex items-center gap-3 rounded-full border border-[#C9A55B]/35 bg-white px-5 py-3 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-[#B8863B]" />
          <span>Carregando anamnese...</span>
        </div>
      </div>
    );
  }

  if (error && !anamnesis) {
    return (
      <div className="min-h-screen bg-[#F7F1E6] text-[#1F1A14] flex items-center justify-center px-6">
        <div className="w-full max-w-xl rounded-[28px] border border-[#C9A55B]/30 bg-white p-8 text-center shadow-[0_24px_70px_rgba(65,45,20,0.16)]">
          <img src="/glutee-logo.png" alt="Clínica Glutée" className="mx-auto mb-6 w-44 max-w-[70%]" />
          <h1 className="text-3xl font-semibold">Link indisponível</h1>
          <p className="mt-4 text-base text-[#5F574A]">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F1E6] px-4 py-8 text-[#1F1A14]">
      <div className="mx-auto w-full max-w-4xl overflow-hidden rounded-[28px] border border-[#D6C29B] bg-[#FFFCF6] shadow-[0_24px_80px_rgba(80,56,23,0.14)]">
        <div className="border-b border-[#E6D9BD] bg-[#F0E3CC] px-6 py-8 md:px-10">
          <img src="/glutee-logo.png" alt="Clínica Glutée" className="mx-auto mb-6 w-48 max-w-[72%]" />
          <p className="text-center text-xs uppercase tracking-[0.36em] text-[#8A6526]">Clínica Glutée</p>
          <h1 className="mt-3 text-center text-3xl font-semibold md:text-4xl">{anamnesis?.title || "Preenchimento de anamnese"}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-center text-sm text-[#5F574A] md:text-base">
            Preencha todas as informações para adiantar o atendimento.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-xs text-[#5F574A] md:text-sm">
            <span className="rounded-full border border-[#D8C496] bg-white px-3 py-1.5">Paciente: {patientDisplayName}</span>
            <span className="rounded-full border border-[#D8C496] bg-white px-3 py-1.5">Perguntas: {questionCount}</span>
            {anamnesis?.anamnesisDate ? <span className="rounded-full border border-[#D8C496] bg-white px-3 py-1.5">Data clínica: {new Date(anamnesis.anamnesisDate).toLocaleDateString("pt-BR")}</span> : null}
          </div>
        </div>

        <div className="px-6 py-6 md:px-10 md:py-8">
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-[#D8C496] bg-white p-4 text-sm text-[#5F574A]">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#B8863B]" />
            <div>
              <p className="font-medium text-[#1F1A14]">Canal seguro da Clínica Glutée</p>
              <p className="mt-1">{PRIVACY_NOTICE}</p>
              <p className="mt-2">Todas as perguntas são obrigatórias. Se uma resposta exigir complemento, o sistema abrirá o campo correspondente na mesma caixa.</p>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-[#2B241A]">Paciente</label>
              <div className="min-h-12 rounded-xl border border-[#D8C496] bg-[#F6EFE1] px-4 py-3 text-[#2B241A]">
                {patientDisplayName}
              </div>
              <p className="mt-1 text-xs text-[#776A58]">Nome vinculado ao link enviado pela clínica.</p>
            </div>

            <div className="rounded-2xl border border-[#D8C496] bg-white p-4 md:p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[#2B241A]">
                <UserRound className="h-4 w-4 text-[#B8863B]" />
                Foto opcional do paciente
              </div>
              <p className="mb-4 text-sm text-[#5F574A]">Se desejar, envie uma foto de perfil real da própria pessoa. A imagem será redimensionada antes de ser salva.</p>
              <input type="file" accept="image/*" onChange={handleProfilePhotoChange} className="block w-full text-sm text-[#5F574A] file:mr-4 file:rounded-full file:border-0 file:bg-[#C9A55B] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-black" />
              {profilePhotoPreview ? <img src={profilePhotoPreview} alt="Prévia da foto de perfil" className="mt-4 h-36 w-36 rounded-2xl object-cover ring-1 ring-[#C9A55B]/45" /> : null}
              <label className="mt-4 flex items-start gap-3 text-sm text-[#5F574A]">
                <input type="checkbox" checked={profilePhotoDeclarationAccepted} onChange={(event) => setProfilePhotoDeclarationAccepted(event.target.checked)} className="mt-1 rounded border-[#C9A55B]/40" />
                <span>Confirmo que, se eu enviar uma foto, ela será da própria pessoa paciente.</span>
              </label>
            </div>

            {visibleQuestions.map((question) => {
              const isMissing = missingQuestionIds.has(question.id);
              return (
                <div key={question.id} className={`rounded-2xl border p-4 md:p-5 ${isMissing ? "border-red-400 bg-red-50" : "border-[#D8C496] bg-white"}`}>
                  <label className="mb-3 block text-sm font-medium text-[#2B241A]">{question.text}</label>
                  {isMissing ? <p className="mb-3 text-sm font-medium text-red-700">Resposta obrigatória pendente.</p> : null}

                  {question.type === "text" ? (
                    <textarea
                      rows={3}
                      value={question.answer || ""}
                      onChange={(event) => updateQuestion(question.id, { answer: event.target.value })}
                      className="w-full rounded-xl border border-[#D8C496] bg-white px-4 py-3 text-[#1F1A14] outline-none transition focus:border-[#B8863B]"
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
                            className={`rounded-full border px-4 py-2 text-sm transition ${active ? "border-[#D6B160] bg-[#C9A55B] text-black" : "border-[#D8C496] bg-white text-[#2B241A] hover:border-[#B8863B]"}`}
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
                            className={`rounded-full border px-4 py-2 text-sm transition ${selected ? "border-[#D6B160] bg-[#C9A55B] text-black" : "border-[#D8C496] bg-white text-[#2B241A] hover:border-[#B8863B]"}`}
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
                      className="h-12 w-full rounded-xl border border-[#D8C496] bg-white px-4 text-[#1F1A14] outline-none transition focus:border-[#B8863B]"
                    >
                      <option value="">Selecione uma opção</option>
                      {(question.options || []).map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  ) : null}

                  {shouldShowFollowUp(question) && question.followUp ? (
                    <div className="mt-4 rounded-xl border border-[#D8C496] bg-[#F8F2E7] p-4">
                      <label className="mb-2 block text-sm font-medium text-[#2B241A]">{question.followUp.prompt}</label>
                      <input
                        value={question.followUpAnswer || ""}
                        onChange={(event) => updateQuestion(question.id, { followUpAnswer: event.target.value })}
                        placeholder={question.followUp.placeholder || "Escreva aqui"}
                        className="h-11 w-full rounded-xl border border-[#D8C496] bg-white px-4 text-[#1F1A14] outline-none transition focus:border-[#B8863B]"
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {error ? <div className="mt-6 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}
          {success ? <div className="mt-6 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div> : null}

          <div className="mt-8 flex flex-col items-stretch gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-[#5F574A]">
              Ao clicar em Salvar e enviar, declaro que as informações preenchidas acima são verdadeiras.
            </p>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || loading}
              className="inline-flex h-12 items-center justify-center rounded-xl bg-[linear-gradient(90deg,#8A6526,#D7B56B,#B8863B)] px-6 text-sm font-semibold text-black shadow-[0_14px_35px_rgba(201,165,91,0.26)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Salvar e enviar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
