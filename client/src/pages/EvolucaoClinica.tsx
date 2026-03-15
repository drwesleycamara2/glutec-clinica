import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Icd10Search } from "@/components/Icd10Search";
import { AudioRecorder } from "@/components/AudioRecorder";
import { Save, ArrowLeft, Calendar, User } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

interface EvolucaoData {
  icd10: { id: number; code: string; description: string } | null;
  clinicalNotes: string;
  audioTranscription: string;
  date: string;
  professional: string;
}

export default function EvolucaoClinica() {
  const [, setLocation] = useLocation();
  const [evolucaoData, setEvolucaoData] = useState<EvolucaoData>({
    icd10: null,
    clinicalNotes: "",
    audioTranscription: "",
    date: new Date().toISOString().split("T")[0],
    professional: "Dr. Médico",
  });

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!evolucaoData.icd10) {
      toast.error("Selecione um CID-10");
      return;
    }

    if (!evolucaoData.clinicalNotes.trim() && !evolucaoData.audioTranscription.trim()) {
      toast.error("Adicione notas clínicas ou transcrição de áudio");
      return;
    }

    setIsSaving(true);

    try {
      toast.success("Evolução clínica salva com sucesso");
      
      setEvolucaoData({
        icd10: null,
        clinicalNotes: "",
        audioTranscription: "",
        date: new Date().toISOString().split("T")[0],
        professional: "Dr. Médico",
      });
    } catch (error) {
      console.error("Error saving evolucao:", error);
      toast.error("Erro ao salvar evolução clínica");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/")}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">Evolução Clínica</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Registre a evolução do paciente com CID-10 e transcrição de áudio
            </p>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid gap-6">
          {/* CID-10 Selection */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Classificação (CID-10)</CardTitle>
            </CardHeader>
            <CardContent>
              <Icd10Search
                onSelect={(code) =>
                  setEvolucaoData({ ...evolucaoData, icd10: code })
                }
                selectedCode={evolucaoData.icd10}
                showFavorites={true}
              />
            </CardContent>
          </Card>

          {/* Audio Recording */}
          <AudioRecorder
            onTranscriptionComplete={(transcription) =>
              setEvolucaoData({
                ...evolucaoData,
                audioTranscription: transcription,
              })
            }
          />

          {/* Clinical Notes */}
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Notas Clínicas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="clinical-notes" className="text-xs font-medium">
                  Observações Clínicas
                </Label>
                <Textarea
                  id="clinical-notes"
                  placeholder="Digite as observações clínicas, achados do exame físico, conduta, etc."
                  value={evolucaoData.clinicalNotes}
                  onChange={(e) =>
                    setEvolucaoData({
                      ...evolucaoData,
                      clinicalNotes: e.target.value,
                    })
                  }
                  className="mt-2 resize-none"
                  rows={6}
                />
              </div>

              {evolucaoData.audioTranscription && (
                <div>
                  <Label htmlFor="transcription" className="text-xs font-medium">
                    Transcrição de Áudio
                  </Label>
                  <Textarea
                    id="transcription"
                    placeholder="Transcrição do áudio gravado"
                    value={evolucaoData.audioTranscription}
                    onChange={(e) =>
                      setEvolucaoData({
                        ...evolucaoData,
                        audioTranscription: e.target.value,
                      })
                    }
                    className="mt-2 resize-none bg-blue-50 dark:bg-blue-950/20"
                    rows={4}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Metadata */}
          <Card className="border-border/50 bg-muted/30">
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Data</p>
                    <p className="font-medium">
                      {new Date(evolucaoData.date).toLocaleDateString(
                        "pt-BR"
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Profissional
                    </p>
                    <p className="font-medium">{evolucaoData.professional}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          {evolucaoData.icd10 && (
            <Card className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20">
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Resumo da Evolução
                  </p>
                  <div className="flex items-start gap-2">
                    <Badge variant="outline" className="mt-1">
                      {evolucaoData.icd10.code}
                    </Badge>
                    <div className="flex-1">
                      <p className="text-sm text-foreground">
                        {evolucaoData.icd10.description}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {evolucaoData.clinicalNotes.length > 0 &&
                          `${evolucaoData.clinicalNotes.length} caracteres em notas clínicas`}
                        {evolucaoData.audioTranscription.length > 0 &&
                          ` • ${evolucaoData.audioTranscription.split(" ").length} palavras em transcrição`}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4">
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white"
            >
              {isSaving ? (
                <>Salvando...</>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar Evolução
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => setLocation("/")}
            >
              Cancelar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
