import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Mic, Square, Trash2, Volume2 } from "lucide-react";
import { toast } from "sonner";

interface AudioRecorderProps {
  onTranscriptionComplete?: (transcription: string) => void;
  medicalRecordId?: number;
  showTranscriptionEditor?: boolean;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  return typeof candidate === "function" ? candidate : null;
}

export function AudioRecorder({
  onTranscriptionComplete,
  medicalRecordId,
  showTranscriptionEditor = true,
}: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [transcription, setTranscription] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [usingBrowserSpeech, setUsingBrowserSpeech] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const liveTranscriptRef = useRef("");
  const isRecordingRef = useRef(false);

  const { mutate: createTranscription } = trpc.audio.createTranscription.useMutation();
  const { mutate: updateTranscription } = trpc.audio.updateTranscription.useMutation();

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      speechRecognitionRef.current?.abort?.();
    };
  }, [audioUrl]);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }
    if (typeof error === "string" && error.trim()) {
      return error;
    }
    return fallback;
  };

  const blobToBase64 = async (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = String(reader.result ?? "");
        resolve(result.includes(",") ? result.split(",")[1] : result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const startBrowserSpeechRecognition = () => {
    const SpeechRecognition = getSpeechRecognitionCtor();
    if (!SpeechRecognition) {
      setUsingBrowserSpeech(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "pt-BR";
      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result?.[0]?.transcript || "")
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();

        if (transcript) {
          liveTranscriptRef.current = transcript;
          setTranscription(transcript);
        }
      };
      recognition.onerror = () => {
        setUsingBrowserSpeech(false);
      };
      recognition.onend = () => {
        if (isRecordingRef.current) {
          try {
            recognition.start();
          } catch {
            setUsingBrowserSpeech(false);
          }
        }
      };
      recognition.start();
      speechRecognitionRef.current = recognition;
      setUsingBrowserSpeech(true);
    } catch {
      setUsingBrowserSpeech(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      audioChunksRef.current = [];
      liveTranscriptRef.current = "";
      setTranscription("");
      setAudioBlob(null);
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
      }

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      isRecordingRef.current = true;
      setIsRecording(true);
      setRecordingTime(0);

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      startBrowserSpeechRecognition();
      toast.success("Gravação iniciada.");
    } catch (error) {
      console.error("Erro ao acessar microfone:", error);
      toast.error("Erro ao acessar o microfone. Verifique as permissões do navegador.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      speechRecognitionRef.current?.stop();
      isRecordingRef.current = false;
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
      toast.success("Gravação concluída.");
    }
  };

  const finishWithTranscript = (text: string, transcriptionId?: number) => {
    const cleaned = text.replace(/\s+/g, " ").trim();
    setTranscription(cleaned);

    if (transcriptionId) {
      updateTranscription({
        id: transcriptionId,
        transcription: cleaned,
        status: "completed",
      });
    }

    onTranscriptionComplete?.(cleaned);
    toast.success(usingBrowserSpeech ? "Áudio transcrito pelo navegador." : "Áudio transcrito com sucesso.");
  };

  const handleTranscribe = async () => {
    if (!audioBlob) {
      toast.error("Nenhum áudio gravado para transcrever.");
      return;
    }

    if (audioBlob.size > 16 * 1024 * 1024) {
      toast.error("Arquivo muito grande. O limite é de 16 MB.");
      return;
    }

    const localTranscript = liveTranscriptRef.current.trim() || transcription.trim();
    setIsTranscribing(true);

    try {
      const audioKey = `audio/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webm`;
      const fileBase64 = await blobToBase64(audioBlob);

      const uploadResponse = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: audioKey,
          mimeType: audioBlob.type || "audio/webm",
          fileName: "audio.webm",
          fileBase64,
        }),
      });

      if (!uploadResponse.ok) {
        const detail = await uploadResponse.text().catch(() => "");
        throw new Error(detail || "Falha no upload do áudio.");
      }

      const uploadData = await uploadResponse.json();
      const uploadedUrl = uploadData.url;

      createTranscription(
        {
          audioUrl: uploadedUrl,
          audioKey,
          medicalRecordId,
        },
        {
          onSuccess: (result: any) => {
            transcribeWithServer(result?.id, uploadedUrl);
          },
          onError: () => {
            toast.error("Erro ao criar o registro do áudio.");
            setIsTranscribing(false);
          },
        },
      );
    } catch (error) {
      console.error("Erro ao enviar áudio:", error);
      toast.error(getErrorMessage(error, "Erro ao fazer upload do áudio."));
      setIsTranscribing(false);
    }
  };

  const transcribeWithServer = async (transcriptionId: number | undefined, uploadedUrl: string) => {
    try {
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioUrl: uploadedUrl, language: "pt" }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(detail || "Falha ao transcrever o áudio.");
      }

      const data = await response.json();
      finishWithTranscript(data.refinedTranscript || data.text || localTranscript || "", transcriptionId);
    } catch (error) {
      console.error("Erro ao transcrever áudio:", error);
      const message = getErrorMessage(error, "Erro ao transcrever o áudio.");
      toast.error(message);
      if (localTranscript) {
        finishWithTranscript(localTranscript, transcriptionId);
        return;
      }
      if (transcriptionId) {
        updateTranscription({
          id: transcriptionId,
          transcription: "",
          status: "failed",
        });
      }
    } finally {
      setIsTranscribing(false);
    }
  };

  const clearRecording = () => {
    setAudioBlob(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    setAudioUrl(null);
    setTranscription("");
    liveTranscriptRef.current = "";
    setRecordingTime(0);
    setUsingBrowserSpeech(false);
    isRecordingRef.current = false;
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Mic className="h-4 w-4 text-amber-500" />
          Gravação de Áudio
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          {!isRecording && !audioBlob && (
            <Button
              onClick={startRecording}
              size="sm"
              className="bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:from-amber-600 hover:to-amber-700"
            >
              <Mic className="mr-1.5 h-3.5 w-3.5" />
              Iniciar Gravação
            </Button>
          )}

          {isRecording && (
            <>
              <Button onClick={stopRecording} size="sm" variant="destructive">
                <Square className="mr-1.5 h-3.5 w-3.5" />
                Parar Gravação
              </Button>
              <Badge variant="outline" className="animate-pulse border-red-500/30 text-red-500">
                Gravando {formatTime(recordingTime)}
              </Badge>
              {usingBrowserSpeech ? (
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-600">
                  Transcrição local ativa
                </Badge>
              ) : null}
            </>
          )}

          {!isRecording && audioBlob && (
            <>
              <Button onClick={handleTranscribe} size="sm" disabled={isTranscribing}>
                {isTranscribing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Volume2 className="mr-1.5 h-3.5 w-3.5" />}
                Transcrever
              </Button>
              <Button onClick={clearRecording} size="sm" variant="outline">
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Limpar
              </Button>
            </>
          )}
        </div>

        {audioUrl && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Reproduzir Áudio</Label>
            <audio controls src={audioUrl} className="w-full" />
            <p className="text-xs text-muted-foreground">
              Tamanho do arquivo: {(((audioBlob?.size ?? 0) / 1024) / 1024).toFixed(2)} MB
            </p>
          </div>
        )}

        {showTranscriptionEditor && transcription && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">Transcrição</Label>
            <Textarea
              value={transcription}
              onChange={(event) => {
                setTranscription(event.target.value);
                liveTranscriptRef.current = event.target.value;
              }}
              rows={6}
              className="resize-none"
              placeholder="A transcrição aparecerá aqui."
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
