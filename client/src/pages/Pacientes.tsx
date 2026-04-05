import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Search, User, Phone, Calendar, ChevronRight, Loader2, MapPin, Mail } from "lucide-react";

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "desconhecido"];
const CIVIL_STATES = [
  { value: "nao_informado", label: "Não informado" },
  { value: "solteiro", label: "Solteiro(a)" },
  { value: "casado", label: "Casado(a)" },
  { value: "divorciado", label: "Divorciado(a)" },
  { value: "viuvo", label: "Viúvo(a)" },
  { value: "uniao_estavel", label: "União estável" },
];

function calcAge(birthDate: string | Date | null | undefined): string {
  if (!birthDate) return "-";
  const bd = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - bd.getFullYear();
  const m = today.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
  return `${age} anos`;
}

function formatCPF(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatCEP(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

const defaultForm = {
  // Obrigatórios
  fullName: "", cpf: "", birthDate: "",
  gender: "nao_informado", biologicalSex: "nao_informado",
  zipCode: "", address: "", addressNumber: "", neighborhood: "", city: "", state: "",
  phone: "",
  // Opcionais
  rg: "", email: "", socialName: "", motherName: "",
  bloodType: "desconhecido", civilStatus: "nao_informado", religion: "nao_informada",
  // Médicos
  allergies: "", chronicConditions: "",
  insuranceName: "", insuranceNumber: "",
  emergencyContactName: "", emergencyContactPhone: "",
};

export default function Pacientes() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [loadingCep, setLoadingCep] = useState(false);

  const handleSearch = (val: string) => {
    setSearch(val);
    clearTimeout((window as any)._searchTimeout);
    (window as any)._searchTimeout = setTimeout(() => setDebouncedSearch(val), 400);
  };

  const { data: patients, isLoading, refetch } = trpc.patients.list.useQuery({
    query: debouncedSearch || undefined,
    limit: 50,
  });

  const createMutation = trpc.patients.create.useMutation({
    onSuccess: () => {
      toast.success("Paciente cadastrado com sucesso!");
      setShowCreate(false);
      refetch();
      setForm(defaultForm);
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Buscar endereço pelo CEP via ViaCEP
  const fetchCep = async (cep: string) => {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setLoadingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setForm((prev) => ({
          ...prev,
          address: data.logradouro || prev.address,
          neighborhood: data.bairro || prev.neighborhood,
          city: data.localidade || prev.city,
          state: data.uf || prev.state,
        }));
      }
    } catch { /* ignore */ }
    setLoadingCep(false);
  };

  const handleSubmit = () => {
    if (!form.fullName.trim()) return toast.error("Nome completo é obrigatório.");
    if (!form.cpf.trim() || form.cpf.replace(/\D/g, "").length !== 11) return toast.error("CPF é obrigatório e deve ter 11 dígitos.");
    if (!form.birthDate) return toast.error("Data de nascimento é obrigatória.");
    if (!form.phone.trim()) return toast.error("Telefone (WhatsApp) é obrigatório.");
    if (!form.zipCode.trim()) return toast.error("CEP é obrigatório.");
    createMutation.mutate(form as any);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Pacientes</h1>
          <p className="text-sm text-muted-foreground mt-1">{patients?.length ?? 0} paciente(s) encontrado(s)</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#B8863B] hover:from-[#7A5A22] hover:via-[#B8943F] hover:to-[#A67A33]">
          <Plus className="h-4 w-4 mr-2" />Novo Paciente
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome, CPF ou telefone..." className="pl-10 h-11" value={search} onChange={(e) => handleSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-[#C9A55B]" /></div>
      ) : !patients || patients.length === 0 ? (
        <Card className="border border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <User className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-base font-medium text-muted-foreground">Nenhum paciente encontrado</p>
            <p className="text-sm text-muted-foreground/70 mt-1">{search ? "Tente uma busca diferente." : "Cadastre o primeiro paciente."}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {patients.map((patient) => (
            <Card key={patient.id} className="border border-border/50 hover:border-[#C9A55B]/30 transition-all cursor-pointer group" onClick={() => setLocation(`/pacientes/${patient.id}`)}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="h-11 w-11 shrink-0">
                    {patient.photoUrl && <AvatarImage src={patient.photoUrl} alt={patient.fullName} />}
                    <AvatarFallback className="bg-[#C9A55B]/10 text-[#C9A55B] text-xs font-bold">
                      {patient.fullName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-sm truncate">{patient.fullName}</p>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/30 shrink-0 group-hover:text-[#C9A55B] transition-colors" />
                    </div>
                    <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-muted-foreground">
                      {patient.birthDate && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{calcAge(patient.birthDate)}</span>}
                      {patient.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{patient.phone}</span>}
                      {patient.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{patient.email}</span>}
                    </div>
                    {patient.cpf && <p className="text-[10px] text-muted-foreground/50 mt-1">CPF: {patient.cpf}</p>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal Cadastro */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-[#C9A55B]" />Cadastrar Novo Paciente
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-2">
            {/* Dados Pessoais - Obrigatórios */}
            <section>
              <h3 className="text-xs font-semibold text-[#C9A55B] uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-amber-400" />Dados Pessoais (obrigatórios)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="sm:col-span-2 lg:col-span-3">
                  <Label>Nome Completo <span className="text-[#6B6B6B]">*</span></Label>
                  <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Nome completo do paciente" className="mt-1" />
                </div>
                <div>
                  <Label>CPF <span className="text-[#6B6B6B]">*</span></Label>
                  <Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: formatCPF(e.target.value) })} placeholder="000.000.000-00" className="mt-1" maxLength={14} />
                </div>
                <div>
                  <Label>Data de Nascimento <span className="text-[#6B6B6B]">*</span></Label>
                  <Input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>Gênero <span className="text-[#6B6B6B]">*</span></Label>
                  <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="masculino">Masculino</SelectItem>
                      <SelectItem value="feminino">Feminino</SelectItem>
                      <SelectItem value="nao_binario">Não binário</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                      <SelectItem value="nao_informado">Não informado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Sexo Biológico <span className="text-[#6B6B6B]">*</span></Label>
                  <Select value={form.biologicalSex} onValueChange={(v) => setForm({ ...form, biologicalSex: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="masculino">Masculino</SelectItem>
                      <SelectItem value="feminino">Feminino</SelectItem>
                      <SelectItem value="intersexo">Intersexo</SelectItem>
                      <SelectItem value="nao_informado">Não informado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Telefone (WhatsApp) <span className="text-[#6B6B6B]">*</span></Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })} placeholder="(00) 00000-0000" className="mt-1" maxLength={15} />
                </div>
              </div>
            </section>

            {/* Endereço - Obrigatório */}
            <section>
              <h3 className="text-xs font-semibold text-[#C9A55B] uppercase tracking-wider mb-3 flex items-center gap-2">
                <MapPin className="h-3 w-3" />Endereço (obrigatório)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <Label>CEP <span className="text-[#6B6B6B]">*</span></Label>
                  <Input
                    value={form.zipCode}
                    onChange={(e) => {
                      const v = formatCEP(e.target.value);
                      setForm({ ...form, zipCode: v });
                      if (v.replace(/\D/g, "").length === 8) fetchCep(v);
                    }}
                    placeholder="00000-000"
                    className="mt-1"
                    maxLength={9}
                  />
                  {loadingCep && <p className="text-[10px] text-[#C9A55B] mt-0.5">Buscando endereço...</p>}
                </div>
                <div className="sm:col-span-2">
                  <Label>Logradouro</Label>
                  <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Rua, Avenida..." className="mt-1" />
                </div>
                <div>
                  <Label>Número</Label>
                  <Input value={form.addressNumber} onChange={(e) => setForm({ ...form, addressNumber: e.target.value })} placeholder="Nº" className="mt-1" />
                </div>
                <div>
                  <Label>Bairro</Label>
                  <Input value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} placeholder="Bairro" className="mt-1" />
                </div>
                <div>
                  <Label>Cidade</Label>
                  <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Cidade" className="mt-1" />
                </div>
                <div>
                  <Label>Estado</Label>
                  <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="UF" className="mt-1" maxLength={2} />
                </div>
              </div>
            </section>

            {/* Dados Opcionais */}
            <section>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-muted-foreground" />Dados Complementares (opcionais)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <Label>RG</Label>
                  <Input value={form.rg} onChange={(e) => setForm({ ...form, rg: e.target.value })} placeholder="RG" className="mt-1" />
                </div>
                <div>
                  <Label>E-mail</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@exemplo.com" className="mt-1" />
                </div>
                <div>
                  <Label>Nome Social</Label>
                  <Input value={form.socialName} onChange={(e) => setForm({ ...form, socialName: e.target.value })} placeholder="Nome social" className="mt-1" />
                </div>
                <div>
                  <Label>Nome da Mãe</Label>
                  <Input value={form.motherName} onChange={(e) => setForm({ ...form, motherName: e.target.value })} placeholder="Nome da mãe" className="mt-1" />
                </div>
                <div>
                  <Label>Tipo Sanguíneo</Label>
                  <Select value={form.bloodType} onValueChange={(v) => setForm({ ...form, bloodType: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{BLOOD_TYPES.map((bt) => <SelectItem key={bt} value={bt}>{bt === "desconhecido" ? "Desconhecido" : bt}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Estado Civil</Label>
                  <Select value={form.civilStatus} onValueChange={(v) => setForm({ ...form, civilStatus: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{CIVIL_STATES.map((cs) => <SelectItem key={cs.value} value={cs.value}>{cs.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Religião</Label>
                  <Input value={form.religion === "nao_informada" ? "" : form.religion} onChange={(e) => setForm({ ...form, religion: e.target.value || "nao_informada" })} placeholder="Não informada" className="mt-1" />
                </div>
              </div>
            </section>

            {/* Dados Médicos */}
            <section>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-muted-foreground" />Dados Médicos
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <Label>Alergias</Label>
                  <Textarea value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} placeholder="Alergias conhecidas (medicamentos, alimentos, etc.)" className="mt-1 resize-none" rows={2} />
                </div>
                <div className="sm:col-span-2">
                  <Label>Condições Crônicas</Label>
                  <Textarea value={form.chronicConditions} onChange={(e) => setForm({ ...form, chronicConditions: e.target.value })} placeholder="Diabetes, hipertensão, etc." className="mt-1 resize-none" rows={2} />
                </div>
              </div>
            </section>

            {/* Convênio */}
            <section>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Convênio</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>Convênio</Label><Input value={form.insuranceName} onChange={(e) => setForm({ ...form, insuranceName: e.target.value })} placeholder="Nome do convênio" className="mt-1" /></div>
                <div><Label>Número</Label><Input value={form.insuranceNumber} onChange={(e) => setForm({ ...form, insuranceNumber: e.target.value })} className="mt-1" /></div>
              </div>
            </section>

            {/* Contato de Emergência */}
            <section>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Contato de Emergência</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>Nome</Label><Input value={form.emergencyContactName} onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })} placeholder="Nome do contato" className="mt-1" /></div>
                <div><Label>Telefone</Label><Input value={form.emergencyContactPhone} onChange={(e) => setForm({ ...form, emergencyContactPhone: formatPhone(e.target.value) })} placeholder="(00) 00000-0000" className="mt-1" maxLength={15} /></div>
              </div>
            </section>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending} className="bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#B8863B] hover:from-[#7A5A22] hover:via-[#B8943F] hover:to-[#A67A33]">
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Cadastrar Paciente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
