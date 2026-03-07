import { Camera, RotateCcw, Check, X } from "lucide-react";
import { useRef, useState, useCallback } from "react";

interface MobilePhotoCaptureProps {
  onCapture: (base64: string, mimeType: string) => void;
  onCancel?: () => void;
  label?: string;
}

/**
 * Componente de Captura de Foto Mobile (Fase 18)
 * Permite captura direta da câmera do dispositivo ou seleção de arquivo.
 * Otimizado para dispositivos móveis com compressão automática.
 */
export function MobilePhotoCapture({ onCapture, onCancel, label = "Tirar Foto" }: MobilePhotoCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  const compressImage = useCallback(async (file: File, maxWidth = 1920, quality = 0.85): Promise<{ base64: string; mimeType: string }> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let { width, height } = img;

          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL("image/jpeg", quality);
            const base64 = dataUrl.split(",")[1];
            resolve({ base64, mimeType: "image/jpeg" });
          }
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCapturing(true);
    try {
      const { base64, mimeType } = await compressImage(file);
      const previewUrl = `data:${mimeType};base64,${base64}`;
      setPreview(previewUrl);
      // Store for confirmation
      (window as any).__pendingCapture = { base64, mimeType };
    } catch (err) {
      console.error("Erro ao processar imagem:", err);
    } finally {
      setCapturing(false);
    }
  };

  const handleConfirm = () => {
    const pending = (window as any).__pendingCapture;
    if (pending) {
      onCapture(pending.base64, pending.mimeType);
      delete (window as any).__pendingCapture;
    }
    setPreview(null);
  };

  const handleRetake = () => {
    setPreview(null);
    delete (window as any).__pendingCapture;
    fileInputRef.current?.click();
  };

  const handleCancel = () => {
    setPreview(null);
    delete (window as any).__pendingCapture;
    onCancel?.();
  };

  if (preview) {
    return (
      <div className="flex flex-col items-center gap-4 p-4">
        <div className="relative w-full max-w-sm aspect-[4/3] rounded-xl overflow-hidden border-2 border-primary/30">
          <img src={preview} alt="Preview" className="w-full h-full object-cover" />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRetake}
            className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 rounded-lg text-sm font-medium transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            Refazer
          </button>
          <button
            onClick={handleCancel}
            className="flex items-center gap-2 px-4 py-2 bg-destructive/10 hover:bg-destructive/20 text-destructive rounded-lg text-sm font-medium transition-colors"
          >
            <X className="h-4 w-4" />
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-medium transition-colors"
          >
            <Check className="h-4 w-4" />
            Confirmar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={capturing}
        className="flex flex-col items-center gap-2 px-8 py-6 border-2 border-dashed border-primary/30 hover:border-primary/60 rounded-xl transition-colors w-full max-w-sm"
      >
        <Camera className="h-8 w-8 text-primary" />
        <span className="text-sm font-medium text-primary">{capturing ? "Processando..." : label}</span>
        <span className="text-xs text-muted-foreground">Toque para abrir a câmera ou selecionar foto</span>
      </button>
    </div>
  );
}

/**
 * Componente de upload de arquivo genérico com drag & drop
 */
export function FileDropZone({
  onFile,
  accept = "image/*",
  label = "Arraste ou clique para enviar",
  maxSizeMB = 10,
}: {
  onFile: (base64: string, mimeType: string, fileName: string) => void;
  accept?: string;
  label?: string;
  maxSizeMB?: number;
}) {
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    if (file.size > maxSizeMB * 1024 * 1024) {
      alert(`Arquivo muito grande. Máximo: ${maxSizeMB}MB`);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      const base64 = result.split(",")[1];
      onFile(base64, file.type, file.name);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) processFile(file);
      }}
      onClick={() => fileInputRef.current?.click()}
      className={`flex flex-col items-center gap-2 px-6 py-8 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
        dragging ? "border-primary bg-primary/5" : "border-muted-foreground/20 hover:border-primary/40"
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) processFile(file);
        }}
        className="hidden"
      />
      <Camera className="h-6 w-6 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-xs text-muted-foreground/60">Máx. {maxSizeMB}MB</span>
    </div>
  );
}
