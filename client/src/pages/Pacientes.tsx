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
import { Plus, Search, User, Phone, Calendar, ChevronRight, Loader2 } from "lucide-react";

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "desconhecido"];

function calcAge(birthDate: string | Date | null | undefined): string {
  if (!birthDate) return "-";
  const bd = new Date(birthDate);
  const today = new Date();
  const age = today.getFullYear() - bd.getFullYear();
  return `${age} anos`;
}

const defaultForm = {
  fullName: "", birthDate: "", gender: "nao_informado" as const,
  cpf: "", rg: "", phone: "", email: "",
  address: "", city: "", state: "", zipCode: "",
  insuranceName: "", insuranceNumber: "",
  bloodType: "desconhecido" as const,
  allergies: "", chronicConditions: "",
  emergencyContactName: "", emergencyContactPhone: "",
};

export default function Pacientes() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(defaultForm);

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
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = () => {
    if (!form.fullName.trim()) return toast.error("Nome completo é obrigatório.");
    createMutation.mutate(form);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Pacientes</h1>
          <p className="text-sm text-muted-foreground mt-1">{patients?.length ?? 0} paciente(s) encontrado(s)</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />Novo Paciente
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome, CPF ou telefone..." className="pl-10 h-11" value={search} onChange={(e) => handleSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : !patients || patients.length === 0 ? (
        <Card className="border shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <User className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-base font-medium text-muted-foreground">Nenhum paciente encontrado</p>
            <p className="text-sm text-muted-foreground/70 mt-1">{search ? "Tente uma busca diferente." : "Cadastre o primeiro paciente clicando em 'Novo Paciente'."}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {patients.map((patient) => (
            <Card key={patient.id} className="border shadow-sm hover:shadow-md transition-shadow cursor-pointer group" onClick={() => setLocation(`/pacientes/${patient.id}`)}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="h-12 w-12 shrink-0">
                    {patient.photoUrl && <AvatarImage src={patient.photoUrl} alt={patient.fullName} />}
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                      {patient.fullName.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-sm truncate">{patient.fullName}</p>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 group-hover:text-primary transition-colors" />
                    </div>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {patient.birthDate && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Calendar className="h-3 w-3" />{calcAge(patient.birthDate)}</span>}
                      {patient.phone && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="h-3 w-3" />{patient.phone}</span>}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {patient.insuranceName && <Badge variant="secondary" className="text-xs font-normal">{patient.insuranceName}</Badge>}
                      {patient.bloodType && patient.bloodType !== "desconhecido" && <Badge variant="outline" className="text-xs font-normal">{patient.bloodType}</Badge>}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Cadastrar Novo Paciente</DialogTitle></DialogHeader>
          <div className="space-y-5 py-2">
            <section>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Dados Pessoais</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <Label>Nome Completo *</Label>
                  <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Nome completo" className="mt-1" />
                </div>
                <div>
                  <Label>Data de Nascimento</Label>
                  <Input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>Sexo</Label>
                  <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v as any })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="masculino">Masculino</SelectItem>
                      <SelectItem value="feminino">Feminino</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                      <SelectItem value="nao_informado">Não informado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>CPF</Label><Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} placeholder="000.000.000-00" className="mt-1" /></div>
                <div><Label>Telefone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(00) 00000-0000" className="mt-1" /></div>
                <div className="sm:col-span-2"><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@exemplo.com" className="mt-1" /></div>
              </div>
            </section>
            <section>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Convênio</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>Convênio</Label><Input value={form.insuranceName} onChange={(e) => setForm({ ...form, insuranceName: e.target.value })} placeholder="Nome do convênio" className="mt-1" /></div>
                <div><Label>Número</Label><Input value={form.insuranceNumber} onChange={(e) => setForm({ ...form, insuranceNumber: e.target.value })} className="mt-1" /></div>
              </div>
            </section>
            <section>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Dados Médicos</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Tipo Sanguíneo</Label>
                  <Select value={form.bloodType} onValueChange={(v) => setForm({ ...form, bloodType: v as any })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{BLOOD_TYPES.map((bt) => <SelectItem key={bt} value={bt}>{bt === "desconhecido" ? "Desconhecido" : bt}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Contato de Emergência (tel.)</Label><Input value={form.emergencyContactPhone} onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })} placeholder="(00) 00000-0000" className="mt-1" /></div>
                <div className="sm:col-span-2"><Label>Alergias</Label><Textarea value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} placeholder="Alergias conhecidas" className="mt-1 resize-none" rows={2} /></div>
                <div className="sm:col-span-2"><Label>Condições Crônicas</Label><Textarea value={form.chronicConditions} onChange={(e) => setForm({ ...form, chronicConditions: e.target.value })} placeholder="Diabetes, hipertensão, etc." className="mt-1 resize-none" rows={2} /></div>
              </div>
            </section>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending}>
              {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Cadastrar Paciente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
