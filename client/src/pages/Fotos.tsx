import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Camera, Plus, Trash2, Image, Search } from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";

const CATEGORIES = [
  { value: "antes", label: "Antes" },
  { value: "depois", label: "Depois" },
  { value: "evolucao", label: "Evolução" },
  { value: "exame", label: "Exame" },
  { value: "documento", label: "Documento" },
  { value: "outro", label: "Outro" },
];

export default function Fotos() {
  const [patientId, setPatientId] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");

  const { data: photos, isLoading, refetch } = trpc.photos.getByPatient.useQuery(
    { patientId: parseInt(patientId), category: selectedCategory || undefined },
    { enabled: !!patientId && parseInt(patientId) > 0 }
  );

  const uploadMutation = trpc.photos.upload.useMutation({
    onSuccess: () => { toast.success("Foto enviada com sucesso!"); refetch(); },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.photos.delete.useMutation({
    onSuccess: () => { toast.success("Foto removida!"); refetch(); },
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadCategory, setUploadCategory] = useState<string>("antes");
  const [uploadDescription, setUploadDescription] = useState("");

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !patientId) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadMutation.mutate({
        patientId: parseInt(patientId),
        category: uploadCategory as any,
        description: uploadDescription,
        base64,
        mimeType: file.type,
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Camera className="h-6 w-6 text-primary" />
            Fotos do Paciente
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Registro fotográfico: antes, depois, evolução e exames</p>
        </div>
      </div>

      {/* Busca */}
      <Card>
        <CardContent className="flex items-end gap-4 py-4">
          <div className="flex-1">
            <Label>ID do Paciente</Label>
            <div className="flex gap-2">
              <Input value={patientId} onChange={e => setPatientId(e.target.value)} placeholder="Digite o ID do paciente" type="number" />
              <Button variant="outline"><Search className="h-4 w-4" /></Button>
            </div>
          </div>
          <div>
            <Label>Filtrar por Categoria</Label>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todas</SelectItem>
                {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {patientId && (
            <div className="flex items-end gap-2">
              <div>
                <Label>Categoria</Label>
                <Select value={uploadCategory} onValueChange={setUploadCategory}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
                <Plus className="h-4 w-4 mr-2" />
                {uploadMutation.isPending ? "Enviando..." : "Upload"}
              </Button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Galeria */}
      {!patientId ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Image className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Selecione um paciente para ver as fotos.</p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <p className="text-muted-foreground text-center py-8">Carregando fotos...</p>
      ) : !photos || photos.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Camera className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Nenhuma foto encontrada para este paciente.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {photos.map((photo: any) => (
            <Card key={photo.id} className="overflow-hidden group">
              <div className="aspect-square relative bg-muted">
                <img src={photo.photoUrl} alt={photo.description ?? "Foto"} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button variant="destructive" size="sm" onClick={() => deleteMutation.mutate({ id: photo.id })}>
                    <Trash2 className="h-3 w-3 mr-1" />Remover
                  </Button>
                </div>
                <Badge className="absolute top-2 left-2 text-xs">{photo.category}</Badge>
              </div>
              <CardContent className="py-2">
                <p className="text-xs text-muted-foreground">{photo.description ?? "Sem descrição"}</p>
                <p className="text-xs text-muted-foreground">{new Date(photo.createdAt).toLocaleDateString("pt-BR")}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
