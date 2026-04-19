import { useEffect, useMemo, useState } from "react";
import { useParams } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, CheckCircle2, Loader2, Upload, Video } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = [
  { value: "antes", label: "Antes" },
  { value: "depois", label: "Depois" },
  { value: "evolucao", label: "Evolução" },
  { value: "exame", label: "Exame" },
  { value: "documento", label: "Documento" },
  { value: "outro", label: "Outro" },
];

type UploadMeta = {
  patientName: string;
  folderName?: string | null;
  allowVideos: boolean;
  expiresAt: string;
  title?: string | null;
};

type UploadItem = {
  id: string;
  fileName: string;
  status: "pending" | "uploading" | "success" | "error";
  message?: string;
};

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImageElement(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = URL.createObjectURL(file);
  });
}

async function optimizeImage(file: File) {
  const image = await loadImageElement(file);
  const maxWidth = 1920;
  const maxHeight = 1920;

  let width = image.width;
  let height = image.height;
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return file;

  context.drawImage(image, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.84),
  );

  URL.revokeObjectURL(image.src);
  if (!blob) return file;

  const optimizedName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], optimizedName, { type: "image/jpeg" });
}

async function preparePatientFile(file: File) {
  if (file.type.startsWith("image/")) {
    return optimizeImage(file);
  }

  return file;
}

export default function EnvioMidiasPaciente() {
  const params = useParams<{ token: string }>();
  const token = String(params?.token ?? "");
  const [meta, setMeta] = useState<UploadMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState("evolucao");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<UploadItem[]>([]);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    setLoading(true);
    fetch(`/api/public/patient-media/${token}`)
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || "Não foi possível validar o link de envio.");
        }
        return response.json();
      })
      .then((payload) => {
        if (!cancelled) {
          setMeta(payload);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(error.message || "Link inválido ou expirado.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const expiresAtLabel = useMemo(() => {
    if (!meta?.expiresAt) return "";
    return new Date(meta.expiresAt).toLocaleString("pt-BR");
  }, [meta?.expiresAt]);

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || !token) return;

    const selectedFiles = Array.from(fileList);
    if (!selectedFiles.length) return;

    setUploading(true);
    const nextItems = selectedFiles.map((file) => ({
      id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fileName: file.name,
      status: "pending" as const,
    }));
    setItems(nextItems);

    for (const item of nextItems) {
      const originalFile = selectedFiles.find((candidate) => candidate.name === item.fileName && candidate.size >= 0);
      if (!originalFile) continue;

      setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, status: "uploading" } : entry)));

      try {
        if (originalFile.type.startsWith("video/") && originalFile.size > 30 * 1024 * 1024) {
          throw new Error("O vídeo está muito grande. Envie um arquivo de até 30 MB.");
        }

        const preparedFile = await preparePatientFile(originalFile);
        const base64 = await fileToBase64(preparedFile);

        const response = await fetch(`/api/public/patient-media/${token}/upload`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            category,
            description,
            mimeType: preparedFile.type,
            originalFileName: originalFile.name,
            base64,
            takenAt: new Date(originalFile.lastModified || Date.now()).toISOString(),
          }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || "Não foi possível enviar esta mídia.");
        }

        setItems((current) =>
          current.map((entry) =>
            entry.id === item.id ? { ...entry, status: "success", message: "Enviado com sucesso." } : entry,
          ),
        );
      } catch (error: any) {
        setItems((current) =>
          current.map((entry) =>
            entry.id === item.id ? { ...entry, status: "error", message: error?.message || "Falha no envio." } : entry,
          ),
        );
      }
    }

    setUploading(false);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(241,215,145,0.18),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.96),rgba(247,243,236,0.92))] px-4 py-10">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="space-y-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.36em] text-[#8A6526]">Clínica Glutée</p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            {meta?.title || "Envio seguro de imagens e vídeos"}
          </h1>
          <p className="mx-auto max-w-2xl text-sm leading-7 text-muted-foreground">
            Use esta página para enviar fotos e vídeos diretamente ao seu prontuário, com proteção de privacidade e registro no sistema da clínica.
          </p>
        </div>

        <Card className="border-[#C9A55B]/20 bg-background/90 shadow-xl">
          <CardContent className="p-6">
            {loading ? (
              <div className="flex min-h-[240px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#C9A55B]" />
              </div>
            ) : !meta ? (
              <div className="space-y-3 text-center">
                <p className="text-lg font-semibold text-foreground">Link inválido ou expirado</p>
                <p className="text-sm text-muted-foreground">
                  Solicite um novo link diretamente à clínica.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Paciente</p>
                    <p className="mt-2 text-sm font-semibold text-foreground">{meta.patientName}</p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Grupo de destino</p>
                    <p className="mt-2 text-sm font-semibold text-foreground">{meta.folderName || "Galeria geral"}</p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Validade do link</p>
                    <p className="mt-2 text-sm font-semibold text-foreground">{expiresAtLabel}</p>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-[0.7fr_1.3fr]">
                  <div className="space-y-2">
                    <Label>Categoria</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Descrição</Label>
                    <Input
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="Ex.: antes do procedimento, 30 dias, região abdominal"
                    />
                  </div>
                </div>

                <div className="rounded-[1.8rem] border border-dashed border-[#C9A55B]/30 bg-[#C9A55B]/5 p-6 text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[#C9A55B]/25 bg-background">
                    <Upload className="h-7 w-7 text-[#C9A55B]" />
                  </div>
                  <p className="mt-4 text-base font-semibold text-foreground">Selecione fotos e vídeos</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Imagens enviadas por esta página são otimizadas antes do upload. Vídeos são aceitos quando o link permitir.
                  </p>

                  <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                    <Badge className="border-[#C9A55B]/20 bg-[#C9A55B]/10 text-[#8A6526]">
                      <Camera className="mr-1 h-3.5 w-3.5" />
                      Fotos
                    </Badge>
                    {meta.allowVideos ? (
                      <Badge className="border-[#C9A55B]/20 bg-[#C9A55B]/10 text-[#8A6526]">
                        <Video className="mr-1 h-3.5 w-3.5" />
                        Vídeos
                      </Badge>
                    ) : null}
                  </div>

                  <div className="mt-6">
                    <input
                      id="patient-media-upload"
                      type="file"
                      multiple
                      accept={meta.allowVideos ? "image/*,video/*" : "image/*"}
                      className="hidden"
                      onChange={(event) => handleFiles(event.target.files)}
                    />
                    <Button
                      variant="premium"
                      size="lg"
                      disabled={uploading}
                      onClick={() => document.getElementById("patient-media-upload")?.click()}
                    >
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {uploading ? "Enviando..." : "Escolher arquivos"}
                    </Button>
                  </div>
                </div>

                {items.length > 0 ? (
                  <Card className="border-border/70">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold">Arquivos enviados nesta sessão</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/70 p-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{item.fileName}</p>
                            <p className="text-xs text-muted-foreground">{item.message || "Aguardando processamento..."}</p>
                          </div>
                          {item.status === "success" ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                          ) : item.status === "uploading" ? (
                            <Loader2 className="h-5 w-5 animate-spin text-[#C9A55B]" />
                          ) : item.status === "error" ? (
                            <Badge variant="destructive">Erro</Badge>
                          ) : (
                            <Badge variant="outline">Pendente</Badge>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


