import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  AlertTriangle,
  BriefcaseBusiness,
  CheckCircle2,
  Download,
  FileArchive,
  FileCheck2,
  FileText,
  Fingerprint,
  History,
  Loader2,
  LockKeyhole,
  PenLine,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";

type EmployeeRecord = {
  id: number;
  userId?: number | null;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  birthDate?: string | null;
  cpf?: string | null;
  rg?: string | null;
  zipCode?: string | null;
  address?: string | null;
  addressNumber?: string | null;
  addressComplement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  role?: string | null;
  position?: string | null;
  department?: string | null;
  professionalLicenseType?: string | null;
  professionalLicenseNumber?: string | null;
  professionalLicenseState?: string | null;
  employmentStatus?: string | null;
  admissionDate?: string | null;
  terminationDate?: string | null;
  internalNotes?: string | null;
  digitalCertificateStatus?: "not_registered" | "registered" | "expired" | "revoked" | null;
  digitalCertificateType?: string | null;
  digitalCertificateSubject?: string | null;
  digitalCertificateIssuer?: string | null;
  digitalCertificateSerial?: string | null;
  digitalCertificateValidUntil?: string | null;
  digitalCertificateFingerprint?: string | null;
  digitalCertificateNotes?: string | null;
  digitalCertificateUpdatedAt?: string | null;
  documentCount?: number;
  noteCount?: number;
  signedNoteCount?: number;
};

type EmployeeDocument = {
  id: number;
  title: string;
  documentType: string;
  originalFileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  sha256: string;
  uploadedByName?: string | null;
  createdAt?: string | null;
  downloadUrl: string;
};

type EmployeeNote = {
  id: number;
  kind: "anotacao" | "advertencia" | "ocorrencia" | "avaliacao";
  title: string;
  content: string;
  status: "rascunho" | "assinado";
  createdByName?: string | null;
  signedAt?: string | null;
  signedByName?: string | null;
  signatureHash?: string | null;
  signatureSnapshot?: any;
  createdAt?: string | null;
};

const EMPTY_RECORD_FORM = {
  fullName: "",
  email: "",
  phone: "",
  birthDate: "",
  cpf: "",
  rg: "",
  zipCode: "",
  address: "",
  addressNumber: "",
  addressComplement: "",
  neighborhood: "",
  city: "",
  state: "",
  role: "",
  position: "",
  department: "",
  professionalLicenseType: "",
  professionalLicenseNumber: "",
  professionalLicenseState: "",
  employmentStatus: "ativo",
  admissionDate: "",
  terminationDate: "",
  internalNotes: "",
  digitalCertificateStatus: "not_registered",
  digitalCertificateType: "",
  digitalCertificateSubject: "",
  digitalCertificateIssuer: "",
  digitalCertificateSerial: "",
  digitalCertificateValidUntil: "",
  digitalCertificateFingerprint: "",
  digitalCertificateNotes: "",
};

const EMPTY_NOTE_FORM = {
  kind: "anotacao" as const,
  title: "",
  content: "",
};

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatBytes(value?: number | null) {
  const size = Number(value || 0);
  if (!size) return "-";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function normalizeRecordForm(record?: EmployeeRecord | null) {
  if (!record) return EMPTY_RECORD_FORM;
  return {
    fullName: record.fullName ?? "",
    email: record.email ?? "",
    phone: record.phone ?? "",
    birthDate: record.birthDate ? String(record.birthDate).slice(0, 10) : "",
    cpf: record.cpf ?? "",
    rg: record.rg ?? "",
    zipCode: record.zipCode ?? "",
    address: record.address ?? "",
    addressNumber: record.addressNumber ?? "",
    addressComplement: record.addressComplement ?? "",
    neighborhood: record.neighborhood ?? "",
    city: record.city ?? "",
    state: record.state ?? "",
    role: record.role ?? "",
    position: record.position ?? "",
    department: record.department ?? "",
    professionalLicenseType: record.professionalLicenseType ?? "",
    professionalLicenseNumber: record.professionalLicenseNumber ?? "",
    professionalLicenseState: record.professionalLicenseState ?? "",
    employmentStatus: record.employmentStatus ?? "ativo",
    admissionDate: record.admissionDate ? String(record.admissionDate).slice(0, 10) : "",
    terminationDate: record.terminationDate ? String(record.terminationDate).slice(0, 10) : "",
    internalNotes: record.internalNotes ?? "",
    digitalCertificateStatus: record.digitalCertificateStatus ?? "not_registered",
    digitalCertificateType: record.digitalCertificateType ?? "",
    digitalCertificateSubject: record.digitalCertificateSubject ?? "",
    digitalCertificateIssuer: record.digitalCertificateIssuer ?? "",
    digitalCertificateSerial: record.digitalCertificateSerial ?? "",
    digitalCertificateValidUntil: record.digitalCertificateValidUntil ? String(record.digitalCertificateValidUntil).slice(0, 10) : "",
    digitalCertificateFingerprint: record.digitalCertificateFingerprint ?? "",
    digitalCertificateNotes: record.digitalCertificateNotes ?? "",
  };
}

function statusLabel(status?: string | null) {
  switch (status) {
    case "afastado": return "Afastado";
    case "desligado": return "Desligado";
    case "arquivado": return "Arquivado";
    default: return "Ativo";
  }
}

function kindLabel(kind?: string | null) {
  switch (kind) {
    case "advertencia": return "Advertência";
    case "ocorrencia": return "Ocorrência";
    case "avaliacao": return "Avaliação";
    default: return "Anotação";
  }
}

function certificateStatusLabel(status?: string | null) {
  switch (status) {
    case "registered": return "Certificado cadastrado";
    case "expired": return "Certificado vencido";
    case "revoked": return "Certificado revogado";
    default: return "Sem certificado cadastrado";
  }
}

function isNursingRole(record?: EmployeeRecord | null) {
  const value = `${record?.role ?? ""} ${record?.position ?? ""} ${record?.department ?? ""}`.toLowerCase();
  return value.includes("enferm") || value.includes("tecnic") || value.includes("técnic");
}

export default function Funcionarios() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [recordForm, setRecordForm] = useState(EMPTY_RECORD_FORM);
  const [newRecordForm, setNewRecordForm] = useState(EMPTY_RECORD_FORM);
  const [noteForm, setNoteForm] = useState(EMPTY_NOTE_FORM);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadType, setUploadType] = useState("documento");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [deleteReason, setDeleteReason] = useState("");

  const isSeniorAdmin = user?.role === "admin" && String(user?.email ?? "").trim().toLowerCase() === "contato@drwesleycamara.com.br";
  const recordsQuery = trpc.employeeRecords.list.useQuery({ query }, { refetchOnWindowFocus: false });
  const records = (recordsQuery.data ?? []) as EmployeeRecord[];
  const selectedRecord = useMemo(() => records.find((record) => record.id === selectedId) ?? records[0] ?? null, [records, selectedId]);
  const selectedRecordId = selectedRecord?.id ?? null;
  const detailQuery = trpc.employeeRecords.get.useQuery(
    { id: selectedRecordId || 0 },
    { enabled: Boolean(selectedRecordId), refetchOnWindowFocus: false },
  );
  const detail = detailQuery.data as any;
  const documents = (detail?.documents ?? []) as EmployeeDocument[];
  const notes = (detail?.notes ?? []) as EmployeeNote[];
  const audit = (detail?.audit ?? []) as any[];
  const currentUserEmployeeRecord = useMemo(
    () => records.find((record) => Number(record.userId) === Number(user?.id)) ?? null,
    [records, user?.id],
  );
  const currentSignerUsesDigitalCertificate =
    currentUserEmployeeRecord?.digitalCertificateStatus === "registered" &&
    Boolean(currentUserEmployeeRecord?.digitalCertificateFingerprint);
  const selectedCanHaveDigitalCertificate =
    isSeniorAdmin ||
    selectedRecord?.role === "gerente" ||
    selectedRecord?.role === "admin" ||
    isNursingRole(selectedRecord);

  useEffect(() => {
    if (!selectedId && records[0]) setSelectedId(records[0].id);
  }, [records, selectedId]);

  useEffect(() => {
    setRecordForm(normalizeRecordForm(detail?.record ?? selectedRecord));
  }, [detail?.record, selectedRecord?.id]);

  const refresh = async () => {
    await utils.employeeRecords.list.invalidate();
    if (selectedRecordId) await utils.employeeRecords.get.invalidate({ id: selectedRecordId });
  };

  const createRecord = trpc.employeeRecords.create.useMutation({
    onSuccess: async (data: any) => {
      toast.success("Registro funcional criado.");
      setNewRecordForm(EMPTY_RECORD_FORM);
      await refresh();
      if (data?.record?.id) setSelectedId(data.record.id);
    },
    onError: (error) => toast.error(error.message),
  });

  const updateRecord = trpc.employeeRecords.update.useMutation({
    onSuccess: async () => {
      toast.success("Registro funcional atualizado.");
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const uploadDocument = trpc.employeeRecords.uploadDocument.useMutation({
    onSuccess: async () => {
      toast.success("Documento anexado com auditoria.");
      setUploadTitle("");
      setUploadType("documento");
      setUploadFile(null);
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteDocument = trpc.employeeRecords.deleteDocument.useMutation({
    onSuccess: async () => {
      toast.success("Documento removido do prontuário funcional.");
      setDeleteReason("");
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const createNote = trpc.employeeRecords.createNote.useMutation({
    onSuccess: async () => {
      toast.success("Anotação salva como rascunho.");
      setNoteForm(EMPTY_NOTE_FORM);
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const signNote = trpc.employeeRecords.signNote.useMutation({
    onSuccess: async () => {
      toast.success("Anotação assinada e registrada na auditoria.");
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteNote = trpc.employeeRecords.deleteNote.useMutation({
    onSuccess: async () => {
      toast.success("Anotação removida do prontuário funcional.");
      setDeleteReason("");
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  if (user?.role !== "admin" && user?.role !== "gerente") {
    return (
      <div className="p-8">
        <Card className="border-destructive/30">
          <CardContent className="flex items-center gap-3 p-6 text-destructive">
            <LockKeyhole className="h-5 w-5" />
            Acesso restrito ao administrador sênior e à gerência.
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSaveRecord = () => {
    if (!selectedRecordId) return;
    updateRecord.mutate({ id: selectedRecordId, ...recordForm } as any);
  };

  const handleUpload = async () => {
    if (!selectedRecordId || !uploadFile) return toast.warning("Selecione um arquivo.");
    const base64 = await fileToBase64(uploadFile);
    uploadDocument.mutate({
      employeeRecordId: selectedRecordId,
      title: uploadTitle.trim() || uploadFile.name,
      documentType: uploadType,
      originalFileName: uploadFile.name,
      mimeType: uploadFile.type || "application/octet-stream",
      base64,
    });
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <section className="rounded-2xl border border-gold/20 bg-surface/80 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.24em] text-text-tertiary">
              <BriefcaseBusiness className="h-4 w-4 text-accent" />
              Gestão de funcionários
            </div>
            <h1 className="text-2xl font-semibold text-text-primary">Prontuário funcional da equipe</h1>
            <p className="max-w-3xl text-sm leading-6 text-text-secondary">
              Área administrativa separada do prontuário médico. Documentos, advertências, anotações assinadas e trilha de auditoria ficam restritos à gerência e ao administrador sênior.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
              <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Acesso restrito
            </Badge>
            <Badge className="border-gold/30 bg-gold/10 text-accent">
              <Fingerprint className="mr-1 h-3.5 w-3.5" /> Assinatura auditável
            </Badge>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Search className="h-4 w-4" /> Funcionários</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <Input placeholder="Buscar por nome, e-mail ou cargo" value={query} onChange={(event) => setQuery(event.target.value)} />
              <div className="max-h-[58vh] space-y-2 overflow-y-auto pr-1">
                {recordsQuery.isLoading ? (
                  <div className="flex items-center gap-2 py-8 text-sm text-text-secondary"><Loader2 className="h-4 w-4 animate-spin" /> Carregando equipe...</div>
                ) : records.length === 0 ? (
                  <p className="py-8 text-sm text-text-secondary">Nenhum funcionário encontrado.</p>
                ) : records.map((record) => (
                  <button
                    key={record.id}
                    onClick={() => setSelectedId(record.id)}
                    className={`w-full rounded-xl border p-3 text-left transition ${selectedRecordId === record.id ? "border-gold bg-gold/10" : "border-border bg-background/60 hover:border-gold/40"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-text-primary">{record.fullName}</p>
                        <p className="truncate text-xs text-text-secondary">{record.position || record.role || "Cargo não informado"}</p>
                      </div>
                      <Badge variant="outline" className="shrink-0">{statusLabel(record.employmentStatus)}</Badge>
                    </div>
                    <div className="mt-3 flex gap-2 text-[11px] text-text-tertiary">
                      <span>{record.documentCount || 0} docs</span>
                      <span>{record.noteCount || 0} notas</span>
                      <span>{record.signedNoteCount || 0} assinadas</span>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Plus className="h-4 w-4" /> Registro manual</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Nome completo" value={newRecordForm.fullName} onChange={(event) => setNewRecordForm({ ...newRecordForm, fullName: event.target.value })} />
              <Input placeholder="E-mail institucional" value={newRecordForm.email} onChange={(event) => setNewRecordForm({ ...newRecordForm, email: event.target.value.toLowerCase() })} />
              <Input placeholder="Telefone" value={newRecordForm.phone} onChange={(event) => setNewRecordForm({ ...newRecordForm, phone: event.target.value })} />
              <Input type="date" title="Data de nascimento" value={newRecordForm.birthDate} onChange={(event) => setNewRecordForm({ ...newRecordForm, birthDate: event.target.value })} />
              <Input placeholder="CPF" value={newRecordForm.cpf} onChange={(event) => setNewRecordForm({ ...newRecordForm, cpf: event.target.value })} />
              <Input placeholder="RG" value={newRecordForm.rg} onChange={(event) => setNewRecordForm({ ...newRecordForm, rg: event.target.value })} />
              <Input placeholder="Cargo/função" value={newRecordForm.position} onChange={(event) => setNewRecordForm({ ...newRecordForm, position: event.target.value })} />
              <Input placeholder="Setor" value={newRecordForm.department} onChange={(event) => setNewRecordForm({ ...newRecordForm, department: event.target.value })} />
              <Input placeholder="CEP" value={newRecordForm.zipCode} onChange={(event) => setNewRecordForm({ ...newRecordForm, zipCode: event.target.value })} />
              <Input placeholder="Endereço" value={newRecordForm.address} onChange={(event) => setNewRecordForm({ ...newRecordForm, address: event.target.value })} />
              <Input placeholder="Número" value={newRecordForm.addressNumber} onChange={(event) => setNewRecordForm({ ...newRecordForm, addressNumber: event.target.value })} />
              <Input placeholder="Complemento" value={newRecordForm.addressComplement} onChange={(event) => setNewRecordForm({ ...newRecordForm, addressComplement: event.target.value })} />
              <Input placeholder="Bairro" value={newRecordForm.neighborhood} onChange={(event) => setNewRecordForm({ ...newRecordForm, neighborhood: event.target.value })} />
              <Input placeholder="Cidade" value={newRecordForm.city} onChange={(event) => setNewRecordForm({ ...newRecordForm, city: event.target.value })} />
              <Input placeholder="UF" maxLength={2} value={newRecordForm.state} onChange={(event) => setNewRecordForm({ ...newRecordForm, state: event.target.value.toUpperCase() })} />
              <Button
                className="w-full sm:col-span-2 xl:col-span-1"
                disabled={createRecord.isPending || newRecordForm.fullName.trim().length < 2}
                onClick={() => createRecord.mutate(newRecordForm as any)}
              >
                {createRecord.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Criar prontuário funcional
              </Button>
            </CardContent>
          </Card>
        </aside>

        <main className="min-w-0">
          {!selectedRecordId ? (
            <Card><CardContent className="p-10 text-center text-text-secondary">Selecione um funcionário para abrir o prontuário funcional.</CardContent></Card>
          ) : (
            <Tabs defaultValue="dados" className="space-y-4">
              <TabsList className="flex flex-wrap justify-start">
                <TabsTrigger value="dados"><UserRound className="mr-2 h-4 w-4" />Dados</TabsTrigger>
                <TabsTrigger value="documentos"><FileArchive className="mr-2 h-4 w-4" />Documentos</TabsTrigger>
                <TabsTrigger value="anotacoes"><PenLine className="mr-2 h-4 w-4" />Anotações</TabsTrigger>
                <TabsTrigger value="certificado"><Fingerprint className="mr-2 h-4 w-4" />Certificado</TabsTrigger>
                <TabsTrigger value="auditoria"><History className="mr-2 h-4 w-4" />Auditoria</TabsTrigger>
              </TabsList>

              <TabsContent value="dados">
                <Card>
                  <CardHeader><CardTitle>Cadastro funcional</CardTitle></CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2 md:col-span-2"><Label>Nome</Label><Input value={recordForm.fullName} onChange={(event) => setRecordForm({ ...recordForm, fullName: event.target.value })} /></div>
                    <div className="space-y-2"><Label>E-mail</Label><Input value={recordForm.email} onChange={(event) => setRecordForm({ ...recordForm, email: event.target.value.toLowerCase() })} /></div>
                    <div className="space-y-2"><Label>Telefone</Label><Input value={recordForm.phone} onChange={(event) => setRecordForm({ ...recordForm, phone: event.target.value })} /></div>
                    <div className="space-y-2"><Label>Data de nascimento</Label><Input type="date" value={recordForm.birthDate} onChange={(event) => setRecordForm({ ...recordForm, birthDate: event.target.value })} /></div>
                    <div className="space-y-2"><Label>CPF</Label><Input value={recordForm.cpf} onChange={(event) => setRecordForm({ ...recordForm, cpf: event.target.value })} /></div>
                    <div className="space-y-2"><Label>RG</Label><Input value={recordForm.rg} onChange={(event) => setRecordForm({ ...recordForm, rg: event.target.value })} /></div>
                    <div className="space-y-2"><Label>Cargo/função</Label><Input value={recordForm.position} onChange={(event) => setRecordForm({ ...recordForm, position: event.target.value })} /></div>
                    <div className="space-y-2"><Label>Setor</Label><Input value={recordForm.department} onChange={(event) => setRecordForm({ ...recordForm, department: event.target.value })} /></div>
                    <div className="space-y-2"><Label>Tipo de registro profissional</Label><Input value={recordForm.professionalLicenseType} placeholder="CRM, COREN, etc." onChange={(event) => setRecordForm({ ...recordForm, professionalLicenseType: event.target.value })} /></div>
                    <div className="space-y-2"><Label>Número do registro</Label><Input value={recordForm.professionalLicenseNumber} onChange={(event) => setRecordForm({ ...recordForm, professionalLicenseNumber: event.target.value })} /></div>
                    <div className="space-y-2"><Label>UF do registro</Label><Input maxLength={2} value={recordForm.professionalLicenseState} onChange={(event) => setRecordForm({ ...recordForm, professionalLicenseState: event.target.value.toUpperCase() })} /></div>
                    <div className="space-y-2"><Label>Status</Label><Select value={recordForm.employmentStatus} onValueChange={(value) => setRecordForm({ ...recordForm, employmentStatus: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ativo">Ativo</SelectItem><SelectItem value="afastado">Afastado</SelectItem><SelectItem value="desligado">Desligado</SelectItem><SelectItem value="arquivado">Arquivado</SelectItem></SelectContent></Select></div>
                    <div className="space-y-2"><Label>Admissão</Label><Input type="date" value={recordForm.admissionDate} onChange={(event) => setRecordForm({ ...recordForm, admissionDate: event.target.value })} /></div>
                    <div className="space-y-2"><Label>Desligamento</Label><Input type="date" value={recordForm.terminationDate} onChange={(event) => setRecordForm({ ...recordForm, terminationDate: event.target.value })} /></div>
                    <div className="space-y-2"><Label>CEP</Label><Input value={recordForm.zipCode} onChange={(event) => setRecordForm({ ...recordForm, zipCode: event.target.value })} /></div>
                    <div className="space-y-2"><Label>Endereço</Label><Input value={recordForm.address} onChange={(event) => setRecordForm({ ...recordForm, address: event.target.value })} /></div>
                    <div className="space-y-2"><Label>Número</Label><Input value={recordForm.addressNumber} onChange={(event) => setRecordForm({ ...recordForm, addressNumber: event.target.value })} /></div>
                    <div className="space-y-2"><Label>Complemento</Label><Input value={recordForm.addressComplement} onChange={(event) => setRecordForm({ ...recordForm, addressComplement: event.target.value })} /></div>
                    <div className="space-y-2"><Label>Bairro</Label><Input value={recordForm.neighborhood} onChange={(event) => setRecordForm({ ...recordForm, neighborhood: event.target.value })} /></div>
                    <div className="space-y-2"><Label>Cidade</Label><Input value={recordForm.city} onChange={(event) => setRecordForm({ ...recordForm, city: event.target.value })} /></div>
                    <div className="space-y-2"><Label>UF</Label><Input maxLength={2} value={recordForm.state} onChange={(event) => setRecordForm({ ...recordForm, state: event.target.value.toUpperCase() })} /></div>
                    <div className="space-y-2 md:col-span-2"><Label>Observações internas</Label><Textarea rows={5} value={recordForm.internalNotes} onChange={(event) => setRecordForm({ ...recordForm, internalNotes: event.target.value })} /></div>
                    <div className="md:col-span-2"><Button onClick={handleSaveRecord} disabled={updateRecord.isPending}>{updateRecord.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salvar alterações</Button></div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="documentos">
                <div className="space-y-4">
                  <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><Upload className="h-4 w-4" /> Anexar documento escaneado</CardTitle></CardHeader>
                    <CardContent className="grid gap-3 md:grid-cols-[1fr_180px]">
                      <Input placeholder="Título do documento" value={uploadTitle} onChange={(event) => setUploadTitle(event.target.value)} />
                      <Select value={uploadType} onValueChange={setUploadType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="documento">Documento</SelectItem><SelectItem value="contrato_trabalho">Contrato</SelectItem><SelectItem value="certificado">Certificado</SelectItem><SelectItem value="advertencia_assinada">Advertência</SelectItem><SelectItem value="identificacao">Identificação</SelectItem></SelectContent></Select>
                      <Input type="file" className="md:col-span-2" onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)} />
                      <Button className="md:col-span-2" onClick={handleUpload} disabled={uploadDocument.isPending || !uploadFile}>{uploadDocument.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}Anexar com auditoria</Button>
                    </CardContent>
                  </Card>

                  <div className="space-y-3">
                    {documents.map((document) => (
                      <Card key={document.id}>
                        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                          <div className="min-w-0 space-y-1">
                            <p className="font-semibold text-text-primary"><FileText className="mr-2 inline h-4 w-4 text-accent" />{document.title}</p>
                            <p className="text-xs text-text-secondary">{document.documentType} • {formatBytes(document.fileSize)} • enviado por {document.uploadedByName || "-"} em {formatDateTime(document.createdAt)}</p>
                            <p className="break-all text-[11px] text-text-tertiary">SHA-256: {document.sha256}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button asChild variant="outline"><a href={document.downloadUrl} target="_blank" rel="noreferrer"><Download className="mr-2 h-4 w-4" />Baixar</a></Button>
                            {isSeniorAdmin ? <Button variant="destructive" onClick={() => deleteDocument.mutate({ id: document.id, reason: deleteReason || "Remoção autorizada pelo administrador sênior" })}><Trash2 className="mr-2 h-4 w-4" />Remover</Button> : null}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    {documents.length === 0 ? <Card><CardContent className="p-6 text-sm text-text-secondary">Nenhum documento funcional anexado.</CardContent></Card> : null}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="anotacoes">
                <div className="space-y-4">
                  <Card>
                    <CardHeader><CardTitle>Nova anotação funcional</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid gap-3 md:grid-cols-[180px_1fr]"><Select value={noteForm.kind} onValueChange={(value: any) => setNoteForm({ ...noteForm, kind: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="anotacao">Anotação</SelectItem><SelectItem value="advertencia">Advertência</SelectItem><SelectItem value="ocorrencia">Ocorrência</SelectItem><SelectItem value="avaliacao">Avaliação</SelectItem></SelectContent></Select><Input placeholder="Título" value={noteForm.title} onChange={(event) => setNoteForm({ ...noteForm, title: event.target.value })} /></div>
                      <Textarea rows={6} placeholder="Digite a anotação, advertência ou ocorrência funcional..." value={noteForm.content} onChange={(event) => setNoteForm({ ...noteForm, content: event.target.value })} />
                      <Button onClick={() => createNote.mutate({ employeeRecordId: selectedRecordId!, ...noteForm })} disabled={createNote.isPending || noteForm.title.trim().length < 2 || noteForm.content.trim().length < 3}>{createNote.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salvar rascunho</Button>
                    </CardContent>
                  </Card>

                  {isSeniorAdmin ? (
                    <Card>
                      <CardContent className="space-y-2 p-4">
                        <Label>Motivo para remover anotações</Label>
                        <Input value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} placeholder="Informe o motivo que ficará registrado na auditoria" />
                      </CardContent>
                    </Card>
                  ) : null}

                  {notes.map((note) => (
                    <Card key={note.id} className={note.status === "assinado" ? "border-emerald-300/50" : ""}>
                      <CardContent className="space-y-3 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div><p className="font-semibold text-text-primary">{note.title}</p><p className="text-xs text-text-secondary">{kindLabel(note.kind)} • criado por {note.createdByName || "-"} em {formatDateTime(note.createdAt)}</p></div>
                          <Badge className={note.status === "assinado" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>{note.status === "assinado" ? "Assinado" : "Rascunho"}</Badge>
                        </div>
                        <div className="whitespace-pre-wrap rounded-xl border bg-background/60 p-3 text-sm leading-6 text-text-primary">{note.content}</div>
                        {note.status === "assinado" ? (
                          <div className="rounded-xl border border-emerald-300/50 bg-emerald-50/80 p-3 text-xs leading-5 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
                            <p className="font-semibold"><FileCheck2 className="mr-1 inline h-4 w-4" />Detalhes da assinatura eletrônica</p>
                            <p>Assinado por: {note.signedByName || "-"}</p>
                            <p>Data/hora: {formatDateTime(note.signedAt)}</p>
                            <p className="break-all">Hash de validação: {note.signatureHash}</p>
                            <p>Método: {note.signatureSnapshot?.method || "Assinatura eletrônica interna do Glutec System"}</p>
                            {note.signatureSnapshot?.certificate ? (
                              <>
                                <p>Certificado: {note.signatureSnapshot.certificate.type || "-"}</p>
                                <p>Titular: {note.signatureSnapshot.certificate.subject || "-"}</p>
                                <p>Emissor: {note.signatureSnapshot.certificate.issuer || "-"}</p>
                                <p className="break-all">Fingerprint: {note.signatureSnapshot.certificate.fingerprint || "-"}</p>
                              </>
                            ) : null}
                          </div>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          {note.status !== "assinado" ? <Button onClick={() => signNote.mutate({ id: note.id })} disabled={signNote.isPending}><CheckCircle2 className="mr-2 h-4 w-4" />{currentSignerUsesDigitalCertificate ? "Assinar com certificado cadastrado" : "Assinar anotação"}</Button> : null}
                          {isSeniorAdmin ? <Button variant="destructive" onClick={() => deleteNote.mutate({ id: note.id, reason: deleteReason || "Remoção autorizada pelo administrador sênior" })}><Trash2 className="mr-2 h-4 w-4" />Remover</Button> : null}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {notes.length === 0 ? <Card><CardContent className="p-6 text-sm text-text-secondary">Nenhuma anotação funcional registrada.</CardContent></Card> : null}
                </div>
              </TabsContent>

              <TabsContent value="certificado">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Fingerprint className="h-4 w-4 text-accent" />
                      Certificado digital e assinatura
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-xl border border-gold/30 bg-gold/10 p-3 text-sm leading-6 text-text-secondary">
                      O certificado registrado aqui passa a aparecer nos detalhes das assinaturas feitas por este usuário em anotações funcionais. Enquanto não houver certificado cadastrado, a gerente usa assinatura eletrônica interna com autenticação do sistema.
                    </div>

                    {!selectedCanHaveDigitalCertificate ? (
                      <div className="rounded-xl border border-border bg-background/60 p-3 text-sm text-text-secondary">
                        Certificado digital é recomendado para administrador, gerência e profissionais de enfermagem quando houver necessidade de assinatura qualificada.
                      </div>
                    ) : null}

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Status do certificado</Label>
                        <Select value={recordForm.digitalCertificateStatus} onValueChange={(value: any) => setRecordForm({ ...recordForm, digitalCertificateStatus: value })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="not_registered">Não cadastrado</SelectItem>
                            <SelectItem value="registered">Cadastrado e válido</SelectItem>
                            <SelectItem value="expired">Vencido</SelectItem>
                            <SelectItem value="revoked">Revogado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2"><Label>Tipo</Label><Input placeholder="A1, A3, e-CPF..." value={recordForm.digitalCertificateType} onChange={(event) => setRecordForm({ ...recordForm, digitalCertificateType: event.target.value })} /></div>
                      <div className="space-y-2 md:col-span-2"><Label>Titular/Subject</Label><Input value={recordForm.digitalCertificateSubject} onChange={(event) => setRecordForm({ ...recordForm, digitalCertificateSubject: event.target.value })} /></div>
                      <div className="space-y-2"><Label>Emissor</Label><Input value={recordForm.digitalCertificateIssuer} onChange={(event) => setRecordForm({ ...recordForm, digitalCertificateIssuer: event.target.value })} /></div>
                      <div className="space-y-2"><Label>Número de série</Label><Input value={recordForm.digitalCertificateSerial} onChange={(event) => setRecordForm({ ...recordForm, digitalCertificateSerial: event.target.value })} /></div>
                      <div className="space-y-2"><Label>Validade</Label><Input type="date" value={recordForm.digitalCertificateValidUntil} onChange={(event) => setRecordForm({ ...recordForm, digitalCertificateValidUntil: event.target.value })} /></div>
                      <div className="space-y-2"><Label>Fingerprint/Hash público</Label><Input value={recordForm.digitalCertificateFingerprint} onChange={(event) => setRecordForm({ ...recordForm, digitalCertificateFingerprint: event.target.value })} /></div>
                      <div className="space-y-2 md:col-span-2"><Label>Observações do certificado</Label><Textarea rows={4} value={recordForm.digitalCertificateNotes} onChange={(event) => setRecordForm({ ...recordForm, digitalCertificateNotes: event.target.value })} /></div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{certificateStatusLabel(recordForm.digitalCertificateStatus)}</Badge>
                      {detail?.record?.digitalCertificateUpdatedAt ? <Badge variant="outline">Atualizado em {formatDateTime(detail.record.digitalCertificateUpdatedAt)}</Badge> : null}
                    </div>

                    <Button onClick={handleSaveRecord} disabled={updateRecord.isPending}>
                      {updateRecord.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Salvar certificado
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="auditoria">
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><History className="h-4 w-4" /> Trilha de auditoria</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded-xl border border-amber-300/50 bg-amber-50/80 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100"><AlertTriangle className="mr-2 inline h-4 w-4" />Todos os eventos críticos ficam registrados com usuário, data, IP e detalhes técnicos.</div>
                    {audit.map((item) => (
                      <div key={item.id} className="rounded-xl border p-3 text-sm">
                        <div className="flex flex-wrap justify-between gap-2"><p className="font-semibold text-text-primary">{item.action}</p><span className="text-xs text-text-tertiary">{formatDateTime(item.createdAt)}</span></div>
                        <p className="text-xs text-text-secondary">Por {item.actorName || "-"} ({item.actorRole || "-"}) • IP {item.ipAddress || "-"}</p>
                      </div>
                    ))}
                    {audit.length === 0 ? <p className="text-sm text-text-secondary">Nenhum evento de auditoria ainda.</p> : null}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </main>
      </div>
    </div>
  );
}
