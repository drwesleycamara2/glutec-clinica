/**
 * Dialog reutilizável para EDITAR cadastro de paciente.
 *
 * Uso:
 *   const [editId, setEditId] = useState<number|null>(null);
 *   <PatientEditDialog patientId={editId} onClose={() => setEditId(null)} onSaved={refetch} />
 *   <Button onClick={() => setEditId(patient.id)}>Editar</Button>
 */
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, User } from "lucide-react";
import { toast } from "sonner";

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "desconhecido"];

function formatCPF(value: string) {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
function formatPhone(value: string) {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
function formatCEP(value: string) {
  const d = value.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}
function isoToDisplay(iso?: string | null) {
  if (!iso) return "";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}
function displayToIso(display: string): string {
  const d = display.replace(/\D/g, "").slice(0, 8);
  if (d.length !== 8) return "";
  const dd = d.slice(0, 2), mm = d.slice(2, 4), yyyy = d.slice(4, 8);
  return `${yyyy}-${mm}-${dd}`;
}
function handleBirthDateTyping(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length > 4) return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
  if (d.length > 2) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return d;
}

type Form = {
  fullName: string;
  cpf: string;
  birthDate: string;
  gender: string;
  zipCode: string;
  address: string;
  addressNumber: string;
  neighborhood: string;
  city: string;
  state: string;
  phone: string;
  rg: string;
  email: string;
  bloodType: string;
  allergies: string;
  chronicConditions: string;
  insuranceName: string;
  insuranceNumber: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
};

const EMPTY: Form = {
  fullName: "", cpf: "", birthDate: "", gender: "nao_informado",
  zipCode: "", address: "", addressNumber: "", neighborhood: "", city: "", state: "",
  phone: "", rg: "", email: "",
  bloodType: "desconhecido", allergies: "", chronicConditions: "",
  insuranceName: "", insuranceNumber: "", emergencyContactName: "", emergencyContactPhone: "",
};

interface Props {
  patientId: number | null;
  onClose: () => void;
  onSaved?: () => void;
}

export function PatientEditDialog({ patientId, onClose, onSaved }: Props) {
  const open = patientId !== null && patientId > 0;
  const [form, setForm] = useState<Form>(EMPTY);
  const [birthDisplay, setBirthDisplay] = useState("");
  const [loadingCep, setLoadingCep] = useState(false);

  const { data: patient, isLoading } = trpc.patients.getById.useQuery(
    { id: patientId || 0 },
    { enabled: open },
  );

  const utils = trpc.useUtils();
  const updateMutation = trpc.patients.update.useMutation({
    onSuccess: () => {
      toast.success("Cadastro atualizado com sucesso!");
      utils.patients.list.invalidate();
      if (patientId) utils.patients.getById.invalidate({ id: patientId });
      onSaved?.();
      onClose();
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao atualizar."),
  });

  useEffect(() => {
    if (!patient) return;
    setForm({
      fullName: patient.fullName || "",
      cpf: patient.cpf ? formatCPF(patient.cpf) : "",
      birthDate: (patient.birthDate ? String(patient.birthDate).slice(0, 10) : "") || "",
      gender: patient.gender || "nao_informado",
      zipCode: patient.zipCode ? formatCEP(patient.zipCode) : "",
      address: patient.address || "",
      addressNumber: (patient as any).addressNumber || "",
      neighborhood: patient.neighborhood || "",
      city: patient.city || "",
      state: patient.state || "",
      phone: patient.phone ? formatPhone(patient.phone) : "",
      rg: patient.rg || "",
      email: patient.email || "",
      bloodType: patient.bloodType || "desconhecido",
      allergies: patient.allergies || "",
      chronicConditions: patient.chronicConditions || "",
      insuranceName: patient.insuranceName || "",
      insuranceNumber: patient.insuranceNumber || "",
      emergencyContactName: patient.emergencyContactName || "",
      emergencyContactPhone: patient.emergencyContactPhone ? formatPhone(patient.emergencyContactPhone) : "",
    });
    setBirthDisplay(isoToDisplay(patient.birthDate));
  }, [patient]);

  const fetchCep = async (cep: string) => {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setLoadingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setForm((p) => ({
          ...p,
          address: data.logradouro || p.address,
          neighborhood: data.bairro || p.neighborhood,
          city: data.localidade || p.city,
          state: data.uf || p.state,
        }));
      }
    } catch { /* noop */ }
    setLoadingCep(false);
  };

  const handleSubmit = () => {
    if (!patientId) return;
    if (!form.fullName.trim()) return toast.error("Nome completo é obrigatório.");
    if (form.cpf && form.cpf.replace(/\D/g, "").length !== 11) return toast.error("CPF deve ter 11 dígitos.");

    updateMutation.mutate({
      id: patientId,
      fullName: form.fullName.trim(),
      cpf: form.cpf.replace(/\D/g, "") || undefined,
      birthDate: form.birthDate || undefined,
      gender: form.gender,
      phone: form.phone.replace(/\D/g, "") || undefined,
      email: form.email || undefined,
      zipCode: form.zipCode.replace(/\D/g, "") || undefined,
      address: form.address || undefined,
      addressNumber: form.addressNumber || undefined,
      neighborhood: form.neighborhood || undefined,
      city: form.city || undefined,
      state: form.state || undefined,
      rg: form.rg || undefined,
      bloodType: form.bloodType,
      allergies: form.allergies || undefined,
      chronicConditions: form.chronicConditions || undefined,
      insuranceName: form.insuranceName || undefined,
      insuranceNumber: form.insuranceNumber || undefined,
      emergencyContactName: form.emergencyContactName || undefined,
      emergencyContactPhone: form.emergencyContactPhone.replace(/\D/g, "") || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-[#C9A55B]" />
            Editar cadastro do paciente
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-[#C9A55B]" />
          </div>
        ) : (
          <div className="space-y-6 py-2">
            {/* Dados pessoais */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-[#8A6526]">Dados pessoais</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <Label>Nome completo *</Label>
                  <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>CPF</Label>
                  <Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: formatCPF(e.target.value) })} className="mt-1" maxLength={14} />
                </div>
                <div>
                  <Label>Nascimento (DD/MM/AAAA)</Label>
                  <Input
                    value={birthDisplay}
                    onChange={(e) => {
                      const disp = handleBirthDateTyping(e.target.value);
                      setBirthDisplay(disp);
                      const iso = displayToIso(disp);
                      if (iso) setForm((p) => ({ ...p, birthDate: iso }));
                    }}
                    placeholder="00/00/0000"
                    className="mt-1"
                    maxLength={10}
                  />
                </div>
                <div>
                  <Label>Sexo</Label>
                  <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nao_informado">Não informado</SelectItem>
                      <SelectItem value="masculino">Masculino</SelectItem>
                      <SelectItem value="feminino">Feminino</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>RG</Label>
                  <Input value={form.rg} onChange={(e) => setForm({ ...form, rg: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>Telefone (WhatsApp)</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: formatPhone(e.target.value) })} className="mt-1" maxLength={15} />
                </div>
                <div>
                  <Label>E-mail</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" />
                </div>
              </div>
            </section>

            {/* Endereço */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-[#8A6526]">Endereço</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>CEP</Label>
                  <div className="relative mt-1">
                    <Input
                      value={form.zipCode}
                      onChange={(e) => {
                        const v = formatCEP(e.target.value);
                        setForm({ ...form, zipCode: v });
                        if (v.replace(/\D/g, "").length === 8) fetchCep(v);
                      }}
                      placeholder="00000-000"
                      maxLength={9}
                    />
                    {loadingCep && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
                  </div>
                </div>
                <div>
                  <Label>Endereço</Label>
                  <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="mt-1" placeholder="Rua, Avenida..." />
                </div>
                <div>
                  <Label>Número</Label>
                  <Input value={form.addressNumber} onChange={(e) => setForm({ ...form, addressNumber: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>Bairro</Label>
                  <Input value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>Cidade</Label>
                  <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>UF</Label>
                  <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase().slice(0, 2) })} className="mt-1" maxLength={2} />
                </div>
              </div>
            </section>

            {/* Dados médicos */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-[#8A6526]">Dados médicos</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Tipo sanguíneo</Label>
                  <Select value={form.bloodType} onValueChange={(v) => setForm({ ...form, bloodType: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BLOOD_TYPES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div />
                <div className="md:col-span-2">
                  <Label>Alergias</Label>
                  <Textarea value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} className="mt-1" rows={2} />
                </div>
                <div className="md:col-span-2">
                  <Label>Condições crônicas</Label>
                  <Textarea value={form.chronicConditions} onChange={(e) => setForm({ ...form, chronicConditions: e.target.value })} className="mt-1" rows={2} />
                </div>
              </div>
            </section>

            {/* Convênio */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-[#8A6526]">Convênio</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Nome do convênio</Label>
                  <Input value={form.insuranceName} onChange={(e) => setForm({ ...form, insuranceName: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>Número</Label>
                  <Input value={form.insuranceNumber} onChange={(e) => setForm({ ...form, insuranceNumber: e.target.value })} className="mt-1" />
                </div>
              </div>
            </section>

            {/* Contato de emergência */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-[#8A6526]">Contato de emergência</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Nome</Label>
                  <Input value={form.emergencyContactName} onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input value={form.emergencyContactPhone} onChange={(e) => setForm({ ...form, emergencyContactPhone: formatPhone(e.target.value) })} className="mt-1" maxLength={15} />
                </div>
              </div>
            </section>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={handleSubmit}
            disabled={updateMutation.isPending || isLoading}
            className="bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#B8863B] text-white"
          >
            {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
