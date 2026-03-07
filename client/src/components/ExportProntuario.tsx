import { FileDown, Loader2 } from "lucide-react";
import { useState } from "react";

interface ExportProntuarioProps {
  patientId: number;
  patientName: string;
  recordId?: number;
}

/**
 * Componente de Exportação de Prontuário (Fase 17)
 * Gera PDF completo com todos os dados do prontuário.
 * Conformidade: CFM 1.821/2007 - Exportação de prontuário médico.
 */
export function ExportProntuarioButton({ patientId, patientName, recordId }: ExportProntuarioProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      // Build export URL with query params
      const params = new URLSearchParams({
        patientId: patientId.toString(),
        patientName,
      });
      if (recordId) params.set("recordId", recordId.toString());

      // Trigger download via API
      const response = await fetch(`/api/export/prontuario?${params.toString()}`);
      if (!response.ok) throw new Error("Falha na exportação");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `prontuario_${patientName.replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Erro ao exportar prontuário:", error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
    >
      {exporting ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <FileDown className="h-4 w-4" />
      )}
      {exporting ? "Exportando..." : "Exportar PDF"}
    </button>
  );
}

/**
 * Componente de opções de exportação com múltiplos formatos
 */
export function ExportOptions({
  patientId,
  patientName,
  onExport,
}: {
  patientId: number;
  patientName: string;
  onExport?: (format: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const formats = [
    { id: "pdf", label: "PDF Completo", description: "Prontuário com fotos, prescrições e exames", icon: "📄" },
    { id: "pdf_summary", label: "PDF Resumido", description: "Apenas dados clínicos essenciais", icon: "📋" },
    { id: "html", label: "HTML", description: "Formato web para visualização", icon: "🌐" },
  ];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-sm font-medium transition-colors"
      >
        <FileDown className="h-4 w-4" />
        Exportar Prontuário
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-72 bg-popover border rounded-xl shadow-xl z-50 overflow-hidden">
            <div className="px-4 py-3 border-b">
              <p className="text-sm font-semibold">Formato de Exportação</p>
              <p className="text-xs text-muted-foreground">Paciente: {patientName}</p>
            </div>
            <div className="p-2">
              {formats.map((format) => (
                <button
                  key={format.id}
                  onClick={() => {
                    onExport?.(format.id);
                    setOpen(false);
                  }}
                  className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-accent rounded-lg transition-colors text-left"
                >
                  <span className="text-lg mt-0.5">{format.icon}</span>
                  <div>
                    <p className="text-sm font-medium">{format.label}</p>
                    <p className="text-xs text-muted-foreground">{format.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
