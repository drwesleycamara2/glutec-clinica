import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  CalendarDays,
  Camera,
  CheckCircle2,
  Folder,
  Image,
  Link2,
  Plus,
  Search,
  Trash2,
  Video,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const CATEGORIES = [
  { value: "antes", label: "Antes" },
  { value: "depois", label: "Depois" },
  { value: "evolucao", label: "Evolucao" },
  { value: "exame", label: "Exame" },
  { value: "documento", label: "Documento" },
  { value: "outro", label: "Outro" },
];

const ROADMAP_CARDS = [
  {
    title: "Link para envio do paciente",
    description:
      "A interface pode orientar esse fluxo, mas o backend ainda nao tem o canal seguro completo para link publico com upload autenticado.",
    icon: Link2,
  },
  {
    title: "Pastas e grupos clinicos",
    description:
      "Ja existem funcoes experimentais no codigo para pastas e comparacoes, mas elas ainda nao foram ligadas ao schema e ao router principal.",
    icon: Folder,
  },
  {
    title: "Video e midia rica",
    description:
      "Hoje o upload ativo esta focado em imagem. Video e trilha de armazenamento dedicada ainda precisam de implementacao real.",
    icon: Video,
  },
];

function formatPhotoDate(photo: any) {
  const raw = photo?.takenAt ?? photo?.createdAt;
  if (!raw) return "Sem data";
  return new Date(raw).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function getPhotoPreviewUrl(photo: any) {
  return photo?.thumbnailUrl || photo?.photoUrl || "";
}

function handleBrokenPreview(event: React.SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.src =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="100%" height="100%" fill="#f5f1e8"/><text x="50%" y="50%" text-anchor="middle" fill="#8A6526" font-size="28" font-family="Arial">Imagem indisponível</text></svg>`
    );
}

export default function Fotos() {
  const [patientId, setPatientId] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const [selectedPatientLabel, setSelectedPatientLabel] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadCategory, setUploadCategory] = useState<string>("antes");
  const [uploadDescription, setUploadDescription] = useState("");
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<number[]>([]);

  const { data: patientMatches } = trpc.patients.list.useQuery(
    { query: patientSearch || undefined, limit: 12 },
    { enabled: patientSearch.trim().length >= 2 }
  );

  const { data: photos, isLoading, refetch } = trpc.photos.getByPatient.useQuery(
    { patientId: parseInt(patientId), category: selectedCategory || undefined },
    { enabled: !!patientId && parseInt(patientId) > 0 }
  );

  const uploadMutation = trpc.photos.upload.useMutation({
    onSuccess: () => {
      toast.success("Foto enviada com sucesso!");
      refetch();
    },
    onError: err => toast.error(err.message),
  });

  const deleteMutation = trpc.photos.delete.useMutation({
    onSuccess: () => {
      toast.success("Foto removida!");
      refetch();
    },
  });

  const photoList = (photos ?? []) as any[];

  const groupedPhotos = useMemo(() => {
    return photoList.reduce<Record<string, any[]>>((acc, photo) => {
      const key = formatPhotoDate(photo);
      if (!acc[key]) acc[key] = [];
      acc[key].push(photo);
      return acc;
    }, {});
  }, [photoList]);

  const selectedPhotos = useMemo(
    () => photoList.filter(photo => selectedPhotoIds.includes(photo.id)),
    [photoList, selectedPhotoIds]
  );

  const categoryStats = useMemo(() => {
    return CATEGORIES.map(category => ({
      ...category,
      count: photoList.filter(photo => photo.category === category.value).length,
    })).filter(item => item.count > 0);
  }, [photoList]);

  const toggleComparison = (photoId: number) => {
    setSelectedPhotoIds(current => {
      if (current.includes(photoId)) {
        return current.filter(id => id !== photoId);
      }

      if (current.length >= 4) {
        toast.error("Selecione no maximo 4 fotos para comparar.");
        return current;
      }

      return [...current, photoId];
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !patientId) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadMutation.mutate({
        patientId: parseInt(patientId),
        category: uploadCategory,
        description: uploadDescription,
        base64,
        mimeType: file.type,
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Camera className="h-6 w-6 text-[#C9A55B]" />
            Imagens do paciente
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Esta tela agora prioriza leitura profissional, comparacao visual e organizacao por data.
            O que ja esta funcional fica utilizavel aqui; o que ainda depende de backend proprio aparece sinalizado.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className="border-[#C9A55B]/25 bg-[#C9A55B]/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-[#8A6526] dark:text-[#F1D791]">
            Comparacao de ate 4 fotos
          </Badge>
          <Badge className="border-border/60 bg-background/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Layout premium
          </Badge>
        </div>
      </div>

      <Card className="card-premium border-border/70">
        <CardContent className="grid gap-4 p-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-2">
              <Label>Paciente</Label>
              <div className="relative">
                <Input
                  value={patientSearch}
                  onChange={e => setPatientSearch(e.target.value)}
                  placeholder="Busque pelo nome do paciente"
                />
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                {patientSearch.trim().length >= 2 && (patientMatches?.length ?? 0) > 0 && (
                  <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-border/70 bg-background shadow-xl">
                    {patientMatches?.map(patient => (
                      <button
                        key={patient.id}
                        type="button"
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/40"
                        onClick={() => {
                          setPatientId(String(patient.id));
                          setSelectedPatientLabel(patient.fullName ?? patient.name ?? "");
                          setPatientSearch("");
                        }}
                      >
                        <span className="font-medium text-foreground">{patient.fullName ?? patient.name}</span>
                        <span className="text-xs text-muted-foreground">ID {patient.id}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {patientId ? (
                <p className="text-xs text-muted-foreground">
                  Paciente selecionado: <span className="font-medium text-foreground">{selectedPatientLabel || `ID ${patientId}`}</span>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Selecione um paciente pelo nome para abrir a galeria.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Filtrar por categoria</Label>
              <Select
                value={selectedCategory || "all"}
                onValueChange={value => setSelectedCategory(value === "all" ? "" : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {CATEGORIES.map(category => (
                    <SelectItem key={category.value} value={category.value}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-[#C9A55B]/20 bg-background/55 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-tertiary">
              Upload rapido
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-[0.75fr_1.25fr_auto]">
              <Select value={uploadCategory} onValueChange={setUploadCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(category => (
                    <SelectItem key={category.value} value={category.value}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={uploadDescription}
                onChange={e => setUploadDescription(e.target.value)}
                placeholder="Descricao da imagem, procedimento ou angulo"
              />
              <Button
                variant="premium"
                onClick={() => fileInputRef.current?.click()}
                disabled={!patientId || uploadMutation.isPending}
                className="min-w-[140px]"
              >
                <Plus className="h-4 w-4" />
                {uploadMutation.isPending ? "Enviando" : "Enviar"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {patientId && photoList.length > 0 && (
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="card-premium border-border/70">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Resumo visual</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <div className="rounded-[1.4rem] border border-border/70 bg-background/55 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-text-tertiary">Total</p>
                <p className="mt-2 text-3xl font-semibold text-foreground">{photoList.length}</p>
                <p className="mt-1 text-sm text-muted-foreground">imagens disponiveis</p>
              </div>
              <div className="rounded-[1.4rem] border border-border/70 bg-background/55 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-text-tertiary">Datas</p>
                <p className="mt-2 text-3xl font-semibold text-foreground">{Object.keys(groupedPhotos).length}</p>
                <p className="mt-1 text-sm text-muted-foreground">grupos cronologicos</p>
              </div>
              <div className="rounded-[1.4rem] border border-border/70 bg-background/55 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-text-tertiary">Comparacao</p>
                <p className="mt-2 text-3xl font-semibold text-foreground">{selectedPhotoIds.length}</p>
                <p className="mt-1 text-sm text-muted-foreground">selecionadas agora</p>
              </div>
            </CardContent>
          </Card>

          <Card className="card-premium border-border/70">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Categorias encontradas</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {categoryStats.map(item => (
                <Badge
                  key={item.value}
                  className="border-[#C9A55B]/20 bg-[#C9A55B]/10 px-3 py-1.5 text-xs font-medium text-[#8A6526] dark:text-[#F1D791]"
                >
                  {item.label}: {item.count}
                </Badge>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {selectedPhotos.length > 0 && (
        <Card className="card-premium border-border/70">
          <CardHeader className="flex flex-col gap-2 pb-3 md:flex-row md:items-center md:justify-between">
            <CardTitle className="text-sm font-semibold">Comparacao lado a lado</CardTitle>
            <div className="flex gap-2">
              <Badge className="border-[#C9A55B]/20 bg-[#C9A55B]/10 text-[#8A6526] dark:text-[#F1D791]">
                {selectedPhotos.length} selecionadas
              </Badge>
              <Button variant="outline" size="sm" onClick={() => setSelectedPhotoIds([])}>
                Limpar selecao
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div
              className={`grid gap-4 ${selectedPhotos.length >= 4 ? "xl:grid-cols-4" : selectedPhotos.length === 3 ? "lg:grid-cols-3" : selectedPhotos.length === 2 ? "md:grid-cols-2" : "grid-cols-1"}`}
            >
              {selectedPhotos.map(photo => (
                <div key={photo.id} className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-background/60">
                  <div className="aspect-[4/5] bg-muted">
                    <img
                      src={getPhotoPreviewUrl(photo)}
                      alt={photo.description ?? "Foto do paciente"}
                      className="h-full w-full object-cover"
                      onError={handleBrokenPreview}
                    />
                  </div>
                  <div className="space-y-2 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <Badge className="border-[#C9A55B]/20 bg-[#C9A55B]/10 text-[#8A6526] dark:text-[#F1D791]">
                        {photo.category}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{formatPhotoDate(photo)}</span>
                    </div>
                    <p className="text-sm font-medium text-foreground">{photo.description || "Sem descricao clinica"}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          {!patientId ? (
            <Card className="card-premium border-dashed border-[#C9A55B]/25">
              <CardContent className="flex min-h-[260px] flex-col items-center justify-center text-center">
                <Image className="mb-4 h-12 w-12 text-muted-foreground/35" />
                <p className="text-sm font-semibold text-foreground">Selecione um paciente para abrir a galeria</p>
                <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                  Assim que um ID valido for informado, a tela lista as imagens importadas e permite comparar ate quatro registros.
                </p>
              </CardContent>
            </Card>
          ) : isLoading ? (
            <Card className="card-premium border-border/70">
              <CardContent className="flex min-h-[220px] items-center justify-center text-sm text-muted-foreground">
                Carregando galeria do paciente...
              </CardContent>
            </Card>
          ) : photoList.length === 0 ? (
            <Card className="card-premium border-dashed border-[#C9A55B]/25">
              <CardContent className="flex min-h-[260px] flex-col items-center justify-center text-center">
                <Camera className="mb-4 h-12 w-12 text-muted-foreground/35" />
                <p className="text-sm font-semibold text-foreground">Nenhuma imagem encontrada</p>
                <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                  O paciente ainda nao possui imagens nessa consulta de filtro, ou as midias importadas precisam ser revisadas por categoria.
                </p>
              </CardContent>
            </Card>
          ) : (
            Object.entries(groupedPhotos).map(([dateLabel, items]) => (
              <Card key={dateLabel} className="card-premium border-border/70">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                    <CalendarDays className="h-4 w-4 text-[#C9A55B]" />
                    {dateLabel}
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {items.map(photo => {
                    const isSelected = selectedPhotoIds.includes(photo.id);

                    return (
                      <div key={photo.id} className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-background/60">
                        <div className="group relative aspect-[4/5] bg-muted">
                    <img
                      src={getPhotoPreviewUrl(photo)}
                      alt={photo.description ?? "Foto"}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      onError={handleBrokenPreview}
                    />
                          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/75 via-black/20 to-transparent p-3">
                            <Badge className="border-white/15 bg-white/10 text-white">{photo.category}</Badge>
                            <div className="flex gap-2">
                              <Button
                                variant={isSelected ? "premium" : "outline"}
                                size="sm"
                                onClick={() => toggleComparison(photo.id)}
                              >
                                {isSelected ? "Selecionada" : "Comparar"}
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => deleteMutation.mutate({ photoId: photo.id })}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-3 p-4">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-foreground">{photo.description || "Sem descricao clinica"}</p>
                            {isSelected && <CheckCircle2 className="h-4 w-4 text-[#C9A55B]" />}
                          </div>
                          <p className="text-xs leading-5 text-muted-foreground">
                            Categoria: {photo.category} | Registro: {formatPhotoDate(photo)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <div className="space-y-4">
          <Card className="card-premium border-border/70">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Proximas evolucoes da galeria</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {ROADMAP_CARDS.map(item => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="rounded-[1.4rem] border border-border/70 bg-background/55 p-4">
                    <div className="flex items-start gap-3">
                      <div className="rounded-2xl border border-[#C9A55B]/20 bg-[#C9A55B]/10 p-2.5">
                        <Icon className="h-4 w-4 text-[#C9A55B]" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-foreground">{item.title}</p>
                        <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="card-premium border-border/70">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Padrao visual para estetica e plastica</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
              <p>
                A galeria foi reorganizada para leitura mais editorial, com destaque para selecao de comparacao,
                separacao por data e cards mais limpos para antes e depois.
              </p>
              <p>
                O proximo passo natural aqui e conectar pastas clinicas, procedimento, angulo, area corporal e link seguro para envio do paciente.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
