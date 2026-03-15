import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Mic, Square, Trash2, Volume2 } from "lucide-react";
import { toast } from "sonner";


interface AudioRecorderProps {
  onTranscriptionComplete?: (transcription: string) => void;
  medicalRecordId?: number;
}

export function AudioRecorder({ onTranscriptionComplete, medicalRecordId }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [transcription, setTranscription] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { mutate: createTranscription } = trpc.audio.createTranscription.useMutation();
  const { mutate: updateTranscription } = trpc.audio.updateTranscription.useMutation();

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
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
      setIsRecording(true);
      setRecordingTime(0);
      setTranscription("");

      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      toast.success("Gravação iniciada");
    } catch (error) {
      console.error("Error accessing microphone:", error);
      toast.error("Erro ao acessar o microfone. Verifique as permissões.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
      toast.success("Gravação concluída");
    }
  };

  const handleTranscribe = async () => {
    if (!audioBlob) {
      toast.error("Nenhum áudio para transcrever");
      return;
    }

    if (audioBlob.size > 16 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máximo 16MB)");
      return;
    }

    setIsTranscribing(true);

    try {
      const audioKey = `audio/${Date.now()}-${Math.random().toString(36).substring(7)}.webm`;
      
      // Upload audio to storage
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('key', audioKey);
      
      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!uploadResponse.ok) {
        throw new Error('Upload failed');
      }
      
      const uploadData = await uploadResponse.json();
      const url = uploadData.url;

      createTranscription(
        {
          audioUrl: url,
          audioKey,
          medicalRecordId,
        },
        {
          onSuccess: (result: any) => {
            if (result && typeof result === 'object' && 'id' in result) {
              transcribeAudio(result.id, url);
            }
          },
          onError: (error) => {
            toast.error("Erro ao criar registro de áudio");
            setIsTranscribing(false);
          },
        }
      );
    } catch (error) {
      console.error("Error uploading audio:", error);
      toast.error("Erro ao fazer upload do áudio");
      setIsTranscribing(false);
    }
  };

  const transcribeAudio = async (transcriptionId: number | undefined, audioUrl: string) => {
    if (!transcriptionId) return;
    try {
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioUrl, language: "pt" }),
      });

      if (!response.ok) {
        throw new Error("Transcription failed");
      }

      const data = await response.json();
      const transcribedText = data.text || "";

      setTranscription(transcribedText);

      if (transcriptionId) {
        updateTranscription({
          id: transcriptionId,
          transcription: transcribedText,
          status: "completed",
        });
      }

      if (onTranscriptionComplete) {
        onTranscriptionComplete(transcribedText);
      }

      toast.success("Áudio transcrito com sucesso");
    } catch (error) {
      console.error("Error transcribing audio:", error);
      toast.error("Erro ao transcrever áudio");
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
    setAudioUrl(null);
    setTranscription("");
    setRecordingTime(0);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Mic className="h-4 w-4 text-amber-500" />
          Gravação de Áudio
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Recording Controls */}
        <div className="flex items-center gap-2">
          {!isRecording && !audioBlob && (
            <Button
              onClick={startRecording}
              size="sm"
              className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white"
            >
              <Mic className="h-3.5 w-3.5 mr-1.5" />
              Iniciar Gravação
            </Button>
          )}

          {isRecording && (
            <>
              <Button
                onClick={stopRecording}
                size="sm"
                variant="destructive"
              >
                <Square className="h-3.5 w-3.5 mr-1.5" />
                Parar Gravação
              </Button>
              <Badge variant="outline" className="text-amber-500 border-amber-500/30">
                <span className="inline-block w-2 h-2 bg-amber-500 rounded-full mr-2 animate-pulse" />
                {formatTime(recordingTime)}
              </Badge>
            </>
          )}

          {audioBlob && !isRecording && (
            <>
              <Button
                onClick={handleTranscribe}
                disabled={isTranscribing}
                size="sm"
                className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white"
              >
                {isTranscribing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Transcrevendo...
                  </>
                ) : (
                  <>
                    <Volume2 className="h-3.5 w-3.5 mr-1.5" />
                    Transcrever
                  </>
                )}
              </Button>
              <Button
                onClick={clearRecording}
                disabled={isTranscribing}
                size="sm"
                variant="outline"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Limpar
              </Button>
            </>
          )}
        </div>

        {/* Audio Playback */}
        {audioUrl && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Reproduzir Áudio</label>
            <audio
              ref={audioRef}
              src={audioUrl}
              controls
              className="w-full h-8 rounded-md border border-border"
            />
          </div>
        )}

        {/* Transcription Display */}
        {transcription && (
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Transcrição</label>
            <Textarea
              value={transcription}
              onChange={(e) => setTranscription(e.target.value)}
              placeholder="Transcrição do áudio..."
              className="resize-none"
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              {transcription.split(" ").length} palavras
            </p>
          </div>
        )}

        {/* File Size Warning */}
        {audioBlob && (
          <p className="text-xs text-muted-foreground">
            Tamanho do arquivo: {(audioBlob.size / 1024 / 1024).toFixed(2)} MB
          </p>
        )}
      </CardContent>
    </Card>
  );
}
