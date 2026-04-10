import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { CalendarDays, Camera, CheckCircle2, Copy, FolderClosed, FolderPlus, ImageIcon, Layers3, Link2, Maximize2, Plus, Search, Trash2, Video } from "lucide-react";
import { type ChangeEvent, type SyntheticEvent, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const CATEGORIES = [
  { value: "antes", label: "Antes" },
  { value: "depois", label: "Depois" },
  { value: "evolucao", label: "Evolução" },
  { value: "exame", label: "Exame" },
  { value: "documento", label: "Documento" },
  { value: "outro", label: "Outro" },
];

function formatPhotoDate(photo: any) {
  const raw = photo?.takenAt ?? photo?.createdAt;
  if (!raw) return "Sem data";
  return new Date(raw).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function formatDateTime(value?: string | null) {
  if (!value) return "Sem validade definida";
  return new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function isVideoMedia(photo: any) {
  if (photo?.mediaType === "video") return true;
  const value = `${photo?.photoUrl || ""} ${photo?.photoKey || ""}`.toLowerCase();
  return value.includes(".mp4") || value.includes(".mov") || value.includes(".webm");
}

function getPhotoPreviewUrl(photo: any) {
  return photo?.thumbnailUrl || photo?.photoUrl || "";
}

function handleBrokenPreview(event: SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.src = "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="100%" height="100%" fill="#f5f1e8"/><text x="50%" y="50%" text-anchor="middle" fill="#8A6526" font-size="28" font-family="Arial">Imagem indisponível</text></svg>`);
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function resolveFolderValue(value: string) {
  if (value === "all") return undefined;
  if (value === "none") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function Fotos() {
  const utils = trpc.useUtils();
  const [patientId, setPatientId] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const [selectedPatientLabel, setSelectedPatientLabel] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedFolderValue, setSelectedFolderValue] = useState("all");
  const [groupMode, setGroupMode] = useState("date");
  const [uploadCategory, setUploadCategory] = useState("antes");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadFolderValue, setUploadFolderValue] = useState("none");
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderDescription, setNewFolderDescription] = useState("");
  const [uploadLinkTitle, setUploadLinkTitle] = useState("");
  const [uploadLinkFolderValue, setUploadLinkFolderValue] = useState("none");
  const [uploadLinkExpiresInDays, setUploadLinkExpiresInDays] = useState("7");
  const [uploadLinkAllowVideos, setUploadLinkAllowVideos] = useState(true);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<number[]>([]);
  const [expandedPhoto, setExpandedPhoto] = useState<any | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsedPatientId = Number(patientId);
  const hasSelectedPatient = Number.isFinite(parsedPatientId) && parsedPatientId > 0;
  const folderFilter = resolveFolderValue(selectedFolderValue);

  const { data: patientMatches } = trpc.patients.list.useQuery({ query: patientSearch || undefined, limit: 12 }, { enabled: patientSearch.trim().length >= 2 });
  const { data: folders = [] } = trpc.photoGallery.getFolders.useQuery({ patientId: parsedPatientId }, { enabled: hasSelectedPatient });
  const { data: uploadLinks = [] } = trpc.photoGallery.listUploadLinks.useQuery({ patientId: parsedPatientId }, { enabled: hasSelectedPatient });
  const { data: photos = [], isLoading } = trpc.photos.getByPatient.useQuery({ patientId: parsedPatientId, category: selectedCategory || undefined, folderId: folderFilter }, { enabled: hasSelectedPatient });

  const invalidateGallery = async () => {
    await Promise.all([utils.photos.getByPatient.invalidate(), utils.photoGallery.getFolders.invalidate(), utils.photoGallery.listUploadLinks.invalidate()]);
  };

  const uploadMutation = trpc.photos.upload.useMutation({ onSuccess: async () => { toast.success("Mídia enviada com sucesso."); setUploadDescription(""); await invalidateGallery(); }, onError: (err) => toast.error(err.message) });
  const deleteMutation = trpc.photos.delete.useMutation({ onSuccess: async () => { toast.success("Mídia removida."); await invalidateGallery(); }, onError: (err) => toast.error(err.message) });
  const createFolderMutation = trpc.photoGallery.createFolder.useMutation({ onSuccess: async () => { toast.success("Pasta criada com sucesso."); setNewFolderName(""); setNewFolderDescription(""); await invalidateGallery(); }, onError: (err) => toast.error(err.message) });
  const createUploadLinkMutation = trpc.photoGallery.createUploadLink.useMutation({ onSuccess: async (result) => { toast.success("Link de envio criado."); if (result?.uploadUrl) { await navigator.clipboard.writeText(result.uploadUrl); toast.success("Link copiado para a área de transferência."); } setUploadLinkTitle(""); await invalidateGallery(); }, onError: (err) => toast.error(err.message) });
  const revokeUploadLinkMutation = trpc.photoGallery.revokeUploadLink.useMutation({ onSuccess: async () => { toast.success("Link revogado com sucesso."); await invalidateGallery(); }, onError: (err) => toast.error(err.message) });

  const photoList = photos as any[];
  const selectedPhotos = useMemo(() => photoList.filter((photo) => selectedPhotoIds.includes(photo.id)), [photoList, selectedPhotoIds]);
  const groupedPhotos = useMemo(() => {
    const sorted = [...photoList].sort((a, b) => new Date(b?.takenAt ?? b?.createdAt ?? 0).getTime() - new Date(a?.takenAt ?? a?.createdAt ?? 0).getTime());
    return sorted.reduce<Record<string, any[]>>((acc, photo) => {
      const key = groupMode === "folder" ? (photo.folderName || "Galeria geral") : groupMode === "category" ? (CATEGORIES.find((item) => item.value === photo.category)?.label || "Sem categoria") : formatPhotoDate(photo);
      if (!acc[key]) acc[key] = [];
      acc[key].push(photo);
      return acc;
    }, {});
  }, [groupMode, photoList]);

  const pickPatient = (patient: any) => {
    setPatientId(String(patient.id));
    setSelectedPatientLabel(patient.fullName ?? patient.name ?? "");
    setPatientSearch("");
    setSelectedFolderValue("all");
    setUploadFolderValue("none");
    setUploadLinkFolderValue("none");
    setSelectedPhotoIds([]);
  };

  const toggleComparison = (photoId: number) => {
    setSelectedPhotoIds((current) => {
      if (current.includes(photoId)) return current.filter((id) => id !== photoId);
      if (current.length >= 4) { toast.error("Selecione no máximo 4 mídias para comparar."); return current; }
      return [...current, photoId];
    });
  };

  const handleClinicUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length || !hasSelectedPatient) return;
    try {
      for (const file of files) {
        const base64 = await fileToBase64(file);
        await uploadMutation.mutateAsync({ patientId: parsedPatientId, folderId: resolveFolderValue(uploadFolderValue) ?? null, category: uploadCategory, description: uploadDescription || undefined, base64, mimeType: file.type || "application/octet-stream", originalFileName: file.name, takenAt: new Date(file.lastModified || Date.now()).toISOString() });
      }
    } finally {
      event.target.value = "";
    }
  };
  const handleCreateFolder = async () => {
    if (!hasSelectedPatient) return toast.error("Selecione um paciente antes de criar uma pasta.");
    if (!newFolderName.trim()) return toast.error("Informe o nome da pasta.");
    await createFolderMutation.mutateAsync({ patientId: parsedPatientId, name: newFolderName.trim(), description: newFolderDescription.trim() || undefined });
  };

  const handleCreateUploadLink = async () => {
    if (!hasSelectedPatient) return toast.error("Selecione um paciente antes de gerar o link.");
    await createUploadLinkMutation.mutateAsync({ patientId: parsedPatientId, folderId: resolveFolderValue(uploadLinkFolderValue) ?? null, title: uploadLinkTitle.trim() || undefined, allowVideos: uploadLinkAllowVideos, expiresInDays: Number(uploadLinkExpiresInDays || 7) });
  };

  const handleCopyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não foi possível copiar o link.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><Camera className="h-6 w-6 text-[#C9A55B]" />Imagens do paciente</h1>
          <p className="max-w-4xl text-sm leading-6 text-muted-foreground">Organize imagens e vídeos por data, tema ou pasta, gere links seguros para o paciente enviar arquivos e compare até quatro registros lado a lado.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className="border-[#C9A55B]/25 bg-[#C9A55B]/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-[#8A6526] dark:text-[#F1D791]">Link seguro para paciente</Badge>
          <Badge className="border-border/60 bg-background/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Comparação de até 4 mídias</Badge>
        </div>
      </div>

      <Card className="card-premium border-border/70">
        <CardContent className="grid gap-4 p-5 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.4fr_0.7fr_0.8fr]">
            <div className="space-y-2">
              <Label>Paciente</Label>
              <div className="relative">
                <Input value={patientSearch} onChange={(event) => setPatientSearch(event.target.value)} placeholder="Busque pelo nome do paciente" />
                <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                {patientSearch.trim().length >= 2 && (patientMatches?.length ?? 0) > 0 && (
                  <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-border/70 bg-background shadow-xl">
                    {patientMatches?.map((patient) => (
                      <button key={patient.id} type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/40" onClick={() => pickPatient(patient)}>
                        <span className="font-medium text-foreground">{patient.fullName ?? patient.name}</span>
                        <span className="text-xs text-muted-foreground">ID {patient.id}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{hasSelectedPatient ? `Paciente selecionado: ${selectedPatientLabel || `ID ${patientId}`}` : "Selecione um paciente pelo nome para abrir a galeria."}</p>
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={selectedCategory || "all"} onValueChange={(value) => setSelectedCategory(value === "all" ? "" : value)}>
                <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {CATEGORIES.map((category) => <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Agrupar por</Label>
              <Select value={groupMode} onValueChange={setGroupMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Data</SelectItem>
                  <SelectItem value="folder">Pasta ou tema</SelectItem>
                  <SelectItem value="category">Categoria</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="rounded-[1.5rem] border border-[#C9A55B]/20 bg-background/55 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-tertiary">Galeria ativa</p>
            <p className="mt-1 text-sm text-muted-foreground">Filtre a mídia geral, sem pasta, ou uma pasta clínica específica.</p>
            <div className="mt-4 space-y-2">
              <Label>Filtro por pasta ou tema</Label>
              <Select value={selectedFolderValue} onValueChange={setSelectedFolderValue}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as mídias</SelectItem>
                  <SelectItem value="none">Sem pasta</SelectItem>
                  {folders.map((folder: any) => <SelectItem key={folder.id} value={String(folder.id)}>{folder.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          {selectedPhotos.length > 0 && (
            <Card className="card-premium border-border/70">
              <CardHeader className="flex flex-col gap-2 pb-3 md:flex-row md:items-center md:justify-between">
                <CardTitle className="text-sm font-semibold">Comparação lado a lado</CardTitle>
                <div className="flex gap-2"><Badge className="border-[#C9A55B]/20 bg-[#C9A55B]/10 text-[#8A6526] dark:text-[#F1D791]">{selectedPhotos.length} selecionadas</Badge><Button variant="outline" size="sm" onClick={() => setSelectedPhotoIds([])}>Limpar seleção</Button></div>
              </CardHeader>
              <CardContent>
                <div className={`grid gap-4 ${selectedPhotos.length >= 4 ? "xl:grid-cols-4" : selectedPhotos.length === 3 ? "lg:grid-cols-3" : selectedPhotos.length === 2 ? "md:grid-cols-2" : "grid-cols-1"}`}>
                  {selectedPhotos.map((photo) => (
                    <div key={photo.id} className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-background/60">
                      <div className="aspect-[4/5] bg-muted">
                        {isVideoMedia(photo) ? <video src={getPhotoPreviewUrl(photo)} className="h-full w-full object-cover" muted playsInline /> : <img src={getPhotoPreviewUrl(photo)} alt={photo.description ?? "Imagem do paciente"} className="h-full w-full object-cover" draggable={false} translate="no" data-no-translate="true" onError={handleBrokenPreview} />}
                      </div>
                      <div className="space-y-2 p-4">
                        <div className="flex items-center justify-between gap-2"><Badge className="border-[#C9A55B]/20 bg-[#C9A55B]/10 text-[#8A6526] dark:text-[#F1D791]">{isVideoMedia(photo) ? "Vídeo" : photo.category}</Badge><span className="text-xs text-muted-foreground">{formatPhotoDate(photo)}</span></div>
                        <p className="text-sm font-medium text-foreground">{photo.description || "Sem descrição clínica"}</p>
                        <Button variant="outline" size="sm" className="w-full" onClick={() => setExpandedPhoto(photo)}><Maximize2 className="h-3.5 w-3.5" />Ampliar</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {!hasSelectedPatient ? (
            <Card className="card-premium border-dashed border-[#C9A55B]/25"><CardContent className="flex min-h-[260px] flex-col items-center justify-center text-center"><ImageIcon className="mb-4 h-12 w-12 text-muted-foreground/35" /><p className="text-sm font-semibold text-foreground">Selecione um paciente para abrir a galeria</p><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Assim que o paciente for selecionado, você poderá organizar a galeria por datas, temas e procedimentos, além de gerar links para envio externo.</p></CardContent></Card>
          ) : isLoading ? (
            <Card className="card-premium border-border/70"><CardContent className="flex min-h-[220px] items-center justify-center text-sm text-muted-foreground">Carregando galeria do paciente...</CardContent></Card>
          ) : photoList.length === 0 ? (
            <Card className="card-premium border-dashed border-[#C9A55B]/25"><CardContent className="flex min-h-[260px] flex-col items-center justify-center text-center"><Camera className="mb-4 h-12 w-12 text-muted-foreground/35" /><p className="text-sm font-semibold text-foreground">Nenhuma mídia encontrada</p><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Envie novas imagens ou vídeos, ou ajuste os filtros de pasta e categoria para revisar a galeria.</p></CardContent></Card>
          ) : (
            Object.entries(groupedPhotos).map(([groupLabel, items]) => (
              <Card key={groupLabel} className="card-premium border-border/70">
                <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm font-semibold">{groupMode === "date" ? <CalendarDays className="h-4 w-4 text-[#C9A55B]" /> : groupMode === "folder" ? <FolderClosed className="h-4 w-4 text-[#C9A55B]" /> : <Layers3 className="h-4 w-4 text-[#C9A55B]" />}{groupLabel}</CardTitle></CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((photo) => {
                    const isSelected = selectedPhotoIds.includes(photo.id);
                    return (
                      <div key={photo.id} className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-background/60">
                        <div className="group relative aspect-[4/5] bg-muted">
                          {isVideoMedia(photo) ? <video src={getPhotoPreviewUrl(photo)} className="h-full w-full cursor-pointer object-cover transition-transform duration-300 group-hover:scale-[1.02]" muted playsInline onClick={() => toggleComparison(photo.id)} /> : <img src={getPhotoPreviewUrl(photo)} alt={photo.description ?? "Imagem"} className="h-full w-full cursor-pointer object-cover transition-transform duration-300 group-hover:scale-[1.02]" draggable={false} translate="no" data-no-translate="true" onClick={() => toggleComparison(photo.id)} onError={handleBrokenPreview} />}
                          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-3">
                            <div className="flex flex-wrap gap-2"><Badge className="border-white/15 bg-white/10 text-white">{isVideoMedia(photo) ? "Vídeo" : photo.category}</Badge>{photo.folderName ? <Badge className="border-white/15 bg-white/10 text-white">{photo.folderName}</Badge> : null}</div>
                            <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setExpandedPhoto(photo)}><Maximize2 className="h-3.5 w-3.5" /></Button><Button variant={isSelected ? "premium" : "outline"} size="sm" onClick={() => toggleComparison(photo.id)}>{isSelected ? "Selecionada" : "Comparar"}</Button><Button variant="destructive" size="sm" onClick={() => deleteMutation.mutate({ photoId: photo.id })}><Trash2 className="h-3.5 w-3.5" /></Button></div>
                          </div>
                        </div>
                        <div className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold text-foreground">{photo.description || photo.originalFileName || "Sem descrição clínica"}</p>{isSelected ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[#C9A55B]" /> : null}</div><div className="space-y-1 text-xs leading-5 text-muted-foreground"><p>Registro: {formatPhotoDate(photo)}</p><p>Origem: {photo.mediaSource === "patient" ? "Paciente" : "Clínica"}</p><p>Pasta: {photo.folderName || "Galeria geral"}</p></div></div>
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
            <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Upload da clínica</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2"><Label>Categoria</Label><Select value={uploadCategory} onValueChange={setUploadCategory}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CATEGORIES.map((category) => <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label>Pasta de destino</Label><Select value={uploadFolderValue} onValueChange={setUploadFolderValue}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Galeria geral</SelectItem>{folders.map((folder: any) => <SelectItem key={folder.id} value={String(folder.id)}>{folder.name}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <div className="space-y-2"><Label>Descrição clínica</Label><Textarea value={uploadDescription} onChange={(event) => setUploadDescription(event.target.value)} rows={3} placeholder="Ex.: pré-operatório, abdome, 30 dias pós-procedimento" /></div>
              <div className="rounded-[1.4rem] border border-[#C9A55B]/20 bg-[#C9A55B]/6 p-4 text-sm leading-6 text-muted-foreground">Arquivos enviados pela clínica permanecem em resolução original. Já os arquivos enviados pelo paciente passam por redução de tamanho quando necessário para proteger espaço em disco e performance.</div>
              <Button variant="premium" className="w-full" onClick={() => fileInputRef.current?.click()} disabled={!hasSelectedPatient || uploadMutation.isPending}><Plus className="h-4 w-4" />{uploadMutation.isPending ? "Enviando..." : "Selecionar imagens ou vídeos"}</Button>
              <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleClinicUpload} />
            </CardContent>
          </Card>

          <Card className="card-premium border-border/70">
            <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Pastas e grupos clínicos</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2"><Label>Nome da pasta</Label><Input value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} placeholder="Ex.: Abdome, glúteo, pré-operatório" /></div>
              <div className="space-y-2"><Label>Descrição ou tema</Label><Textarea value={newFolderDescription} onChange={(event) => setNewFolderDescription(event.target.value)} rows={3} placeholder="Ex.: Antes e depois da lipo HD, com fotos frontais e perfil." /></div>
              <Button variant="outline" className="w-full" onClick={handleCreateFolder} disabled={!hasSelectedPatient || createFolderMutation.isPending}><FolderPlus className="h-4 w-4" />{createFolderMutation.isPending ? "Criando..." : "Criar pasta"}</Button>
              <div className="space-y-2">{folders.length > 0 ? folders.map((folder: any) => <button key={folder.id} type="button" className="flex w-full items-center justify-between gap-3 rounded-[1.2rem] border border-border/70 bg-background/60 px-4 py-3 text-left transition-colors hover:bg-muted/40" onClick={() => setSelectedFolderValue(String(folder.id))}><div className="min-w-0"><p className="truncate text-sm font-semibold text-foreground">{folder.name}</p><p className="truncate text-xs text-muted-foreground">{folder.description || "Sem descrição adicional"}</p></div><Badge variant="outline">{folder.mediaCount || 0}</Badge></button>) : <p className="text-sm text-muted-foreground">Nenhuma pasta criada para este paciente ainda.</p>}</div>
            </CardContent>
          </Card>
          <Card className="card-premium border-border/70">
            <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold">Link para envio do paciente</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2"><Label>Título do link</Label><Input value={uploadLinkTitle} onChange={(event) => setUploadLinkTitle(event.target.value)} placeholder="Ex.: Envio pré-operatório de abdome" /></div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2"><Label>Pasta de destino</Label><Select value={uploadLinkFolderValue} onValueChange={setUploadLinkFolderValue}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Galeria geral</SelectItem>{folders.map((folder: any) => <SelectItem key={folder.id} value={String(folder.id)}>{folder.name}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label>Validade</Label><Select value={uploadLinkExpiresInDays} onValueChange={setUploadLinkExpiresInDays}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="3">3 dias</SelectItem><SelectItem value="7">7 dias</SelectItem><SelectItem value="14">14 dias</SelectItem><SelectItem value="30">30 dias</SelectItem></SelectContent></Select></div>
              </div>
              <div className="flex items-center justify-between rounded-[1.2rem] border border-border/70 bg-background/60 px-4 py-3"><div><p className="text-sm font-medium text-foreground">Permitir vídeos</p><p className="text-xs text-muted-foreground">Imagens sempre são aceitas. Vídeos podem ser comprimidos no envio do paciente.</p></div><Switch checked={uploadLinkAllowVideos} onCheckedChange={setUploadLinkAllowVideos} /></div>
              <Button variant="premium" className="w-full" onClick={handleCreateUploadLink} disabled={!hasSelectedPatient || createUploadLinkMutation.isPending}><Link2 className="h-4 w-4" />{createUploadLinkMutation.isPending ? "Gerando..." : "Gerar link seguro"}</Button>
              <div className="space-y-3">{uploadLinks.length > 0 ? uploadLinks.map((link: any) => { const isActive = Boolean(link.isActive); return <div key={link.id} className="rounded-[1.25rem] border border-border/70 bg-background/60 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-foreground">{link.title || "Link de envio"}</p><p className="truncate text-xs text-muted-foreground">Pasta: {link.folderName || "Galeria geral"} | Expira em {formatDateTime(link.expiresAt)}</p></div><Badge className={isActive ? "bg-emerald-100 text-emerald-700" : ""}>{isActive ? "Ativo" : "Revogado"}</Badge></div><div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => handleCopyLink(`${window.location.origin}/envio-midias/${link.token}`)}><Copy className="h-3.5 w-3.5" />Copiar link</Button>{isActive ? <Button variant="destructive" size="sm" onClick={() => revokeUploadLinkMutation.mutate({ linkId: link.id })}><Trash2 className="h-3.5 w-3.5" />Revogar</Button> : null}</div></div>; }) : <p className="text-sm text-muted-foreground">Nenhum link gerado para este paciente ainda.</p>}</div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!expandedPhoto} onOpenChange={(open) => !open && setExpandedPhoto(null)}>
        <DialogContent className="max-h-[92vh] max-w-6xl overflow-hidden border-[#C9A55B]/25 bg-background/95 p-0">
          <DialogHeader className="border-b border-border/60 px-6 py-4"><DialogTitle className="flex items-center justify-between gap-3 text-left text-base font-semibold"><span>{expandedPhoto?.description || expandedPhoto?.originalFileName || "Imagem do paciente"}</span><span className="text-sm font-normal text-muted-foreground">{expandedPhoto ? formatPhotoDate(expandedPhoto) : ""}</span></DialogTitle></DialogHeader>
          {expandedPhoto ? (
            <div className="grid gap-0 lg:grid-cols-[1.25fr_0.75fr]">
              <div className="flex min-h-[55vh] items-center justify-center bg-black/90 p-4">{isVideoMedia(expandedPhoto) ? <video src={getPhotoPreviewUrl(expandedPhoto)} className="max-h-[78vh] w-auto max-w-full rounded-xl object-contain" controls autoPlay playsInline /> : <img src={getPhotoPreviewUrl(expandedPhoto)} alt={expandedPhoto.description ?? "Imagem ampliada"} className="max-h-[78vh] w-auto max-w-full rounded-xl object-contain" draggable={false} translate="no" data-no-translate="true" onError={handleBrokenPreview} />}</div>
              <div className="space-y-4 p-6"><div className="flex flex-wrap gap-2"><Badge className="border-[#C9A55B]/20 bg-[#C9A55B]/10 text-[#8A6526] dark:text-[#F1D791]">{isVideoMedia(expandedPhoto) ? "Vídeo" : expandedPhoto.category}</Badge><Badge variant="outline">{expandedPhoto.folderName || "Galeria geral"}</Badge><Badge variant="outline">ID {expandedPhoto.id}</Badge></div><div className="space-y-2 text-sm leading-6 text-muted-foreground"><p><span className="font-medium text-foreground">Descrição:</span> {expandedPhoto.description || "Sem descrição clínica."}</p><p><span className="font-medium text-foreground">Data:</span> {formatPhotoDate(expandedPhoto)}</p><p><span className="font-medium text-foreground">Origem:</span> {expandedPhoto.mediaSource === "patient" ? "Paciente" : "Clínica"}</p><p><span className="font-medium text-foreground">Arquivo:</span> {expandedPhoto.originalFileName || expandedPhoto.photoKey || "Não informado"}</p></div><Button variant="premium" className="w-full" onClick={() => window.open(getPhotoPreviewUrl(expandedPhoto), "_blank", "noopener,noreferrer")}><Maximize2 className="h-4 w-4" />Abrir em tela cheia</Button></div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

