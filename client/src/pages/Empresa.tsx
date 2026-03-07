import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Building2, Save, Upload, Clock, MapPin, Phone, Mail, Globe } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const DAYS_OF_WEEK = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

export default function Empresa() {
  const { user } = useAuth();
  const { data: clinic, isLoading, refetch } = trpc.clinic.get.useQuery();
  const updateMutation = trpc.clinic.update.useMutation({
    onSuccess: () => { toast.success("Dados da empresa atualizados com sucesso!"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const [form, setForm] = useState({
    name: "", tradeName: "", cnpj: "", stateRegistration: "",
    phone: "", email: "", website: "",
    address: "", neighborhood: "", city: "", state: "", zipCode: "",
    specialties: [] as string[],
    openingHours: DAYS_OF_WEEK.map(day => ({ day, open: "08:00", close: "18:00" })),
  });

  const [newSpecialty, setNewSpecialty] = useState("");

  useEffect(() => {
    if (clinic) {
      setForm({
        name: clinic.name ?? "",
        tradeName: clinic.tradeName ?? "",
        cnpj: clinic.cnpj ?? "",
        stateRegistration: clinic.stateRegistration ?? "",
        phone: clinic.phone ?? "",
        email: clinic.email ?? "",
        website: clinic.website ?? "",
        address: clinic.address ?? "",
        neighborhood: clinic.neighborhood ?? "",
        city: clinic.city ?? "",
        state: clinic.state ?? "",
        zipCode: clinic.zipCode ?? "",
        specialties: (clinic.specialties as string[]) ?? [],
        openingHours: (clinic.openingHours as any[]) ?? DAYS_OF_WEEK.map(day => ({ day, open: "08:00", close: "18:00" })),
      });
    }
  }, [clinic]);

  const handleSave = () => {
    updateMutation.mutate(form);
  };

  const addSpecialty = () => {
    if (newSpecialty.trim() && !form.specialties.includes(newSpecialty.trim())) {
      setForm({ ...form, specialties: [...form.specialties, newSpecialty.trim()] });
      setNewSpecialty("");
    }
  };

  const removeSpecialty = (s: string) => {
    setForm({ ...form, specialties: form.specialties.filter(x => x !== s) });
  };

  const updateHours = (idx: number, field: "open" | "close", value: string) => {
    const hours = [...form.openingHours];
    hours[idx] = { ...hours[idx], [field]: value };
    setForm({ ...form, openingHours: hours });
  };

  if (isLoading) return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Carregando...</p></div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Gerenciamento da Empresa
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Configure os dados da Clínica Glutée</p>
        </div>
        <Button onClick={handleSave} disabled={updateMutation.isPending}>
          <Save className="h-4 w-4 mr-2" />
          {updateMutation.isPending ? "Salvando..." : "Salvar Alterações"}
        </Button>
      </div>

      {/* Dados Jurídicos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            Dados Jurídicos
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Razão Social *</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Razão social da empresa" />
          </div>
          <div>
            <Label>Nome Fantasia</Label>
            <Input value={form.tradeName} onChange={e => setForm({ ...form, tradeName: e.target.value })} placeholder="Nome fantasia" />
          </div>
          <div>
            <Label>CNPJ</Label>
            <Input value={form.cnpj} onChange={e => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0000-00" />
          </div>
          <div>
            <Label>Inscrição Estadual</Label>
            <Input value={form.stateRegistration} onChange={e => setForm({ ...form, stateRegistration: e.target.value })} placeholder="Inscrição estadual" />
          </div>
        </CardContent>
      </Card>

      {/* Contato */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" />
            Contato
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Telefone</Label>
            <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="(00) 0000-0000" />
          </div>
          <div>
            <Label>E-mail</Label>
            <Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="contato@clinica.com" />
          </div>
          <div>
            <Label>Website</Label>
            <Input value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} placeholder="https://www.clinica.com" />
          </div>
        </CardContent>
      </Card>

      {/* Endereço */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            Endereço
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Label>Endereço</Label>
            <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Rua, número, complemento" />
          </div>
          <div>
            <Label>Bairro</Label>
            <Input value={form.neighborhood} onChange={e => setForm({ ...form, neighborhood: e.target.value })} placeholder="Bairro" />
          </div>
          <div>
            <Label>Cidade</Label>
            <Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} placeholder="Cidade" />
          </div>
          <div>
            <Label>Estado</Label>
            <Input value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} placeholder="UF" maxLength={2} />
          </div>
          <div>
            <Label>CEP</Label>
            <Input value={form.zipCode} onChange={e => setForm({ ...form, zipCode: e.target.value })} placeholder="00000-000" />
          </div>
        </CardContent>
      </Card>

      {/* Especialidades */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Especialidades da Clínica</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-3">
            <Input value={newSpecialty} onChange={e => setNewSpecialty(e.target.value)} placeholder="Nova especialidade..." onKeyDown={e => e.key === "Enter" && addSpecialty()} />
            <Button variant="outline" onClick={addSpecialty}>Adicionar</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {form.specialties.map(s => (
              <Badge key={s} variant="secondary" className="cursor-pointer hover:bg-destructive/10" onClick={() => removeSpecialty(s)}>
                {s} ×
              </Badge>
            ))}
            {form.specialties.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma especialidade cadastrada.</p>}
          </div>
        </CardContent>
      </Card>

      {/* Horário de Funcionamento */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Horário de Funcionamento
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {form.openingHours.map((h, idx) => (
              <div key={h.day} className="flex items-center gap-3">
                <span className="w-24 text-sm font-medium">{h.day}</span>
                <Input type="time" value={h.open} onChange={e => updateHours(idx, "open", e.target.value)} className="w-28" />
                <span className="text-muted-foreground">às</span>
                <Input type="time" value={h.close} onChange={e => updateHours(idx, "close", e.target.value)} className="w-28" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
