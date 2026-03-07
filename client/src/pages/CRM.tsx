import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Users, Plus, UserPlus, TrendingUp, Phone, CheckCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  novo: { label: "Novo", color: "bg-blue-100 text-blue-700" },
  contatado: { label: "Contatado", color: "bg-yellow-100 text-yellow-700" },
  agendado: { label: "Agendado", color: "bg-purple-100 text-purple-700" },
  convertido: { label: "Convertido", color: "bg-green-100 text-green-700" },
  perdido: { label: "Perdido", color: "bg-red-100 text-red-700" },
};

export default function CRM() {
  const { data: indications, isLoading, refetch } = trpc.crm.list.useQuery({});
  const createMutation = trpc.crm.create.useMutation({
    onSuccess: () => { toast.success("Indicação registrada!"); refetch(); setShowCreate(false); },
    onError: (err) => toast.error(err.message),
  });
  const updateMutation = trpc.crm.update.useMutation({
    onSuccess: () => { toast.success("Status atualizado!"); refetch(); },
  });

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ patientId: "", procedureName: "", notes: "" });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" />
            CRM - Indicações
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Gestão de indicações e acompanhamento de leads</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Nova Indicação</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Registrar Indicação</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>ID do Paciente que Indicou</Label><Input type="number" value={form.patientId} onChange={e => setForm({ ...form, patientId: e.target.value })} /></div>
              <div><Label>Procedimento de Interesse</Label><Input value={form.procedureName} onChange={e => setForm({ ...form, procedureName: e.target.value })} placeholder="Ex: Mini Lipo" /></div>
              <div><Label>Observações</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              <Button onClick={() => createMutation.mutate({ patientId: parseInt(form.patientId), procedureName: form.procedureName, notes: form.notes })} disabled={createMutation.isPending} className="w-full">Registrar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      {indications && indications.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {Object.entries(STATUS_MAP).map(([key, { label, color }]) => {
            const count = indications.filter((i: any) => i.status === key).length;
            return (
              <Card key={key}>
                <CardContent className="py-3 text-center">
                  <p className="text-2xl font-bold">{count}</p>
                  <Badge className={`${color} text-xs`}>{label}</Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Lista */}
      {isLoading ? (
        <p className="text-muted-foreground text-center py-8">Carregando...</p>
      ) : !indications || indications.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <UserPlus className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Nenhuma indicação registrada.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {indications.map((ind: any) => (
            <Card key={ind.id}>
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <UserPlus className="h-6 w-6 text-primary/50" />
                  <div>
                    <p className="font-medium text-sm">Indicação #{ind.id} - {ind.procedureName}</p>
                    <p className="text-xs text-muted-foreground">Paciente #{ind.patientId} | {new Date(ind.createdAt).toLocaleDateString("pt-BR")}</p>
                    {ind.notes && <p className="text-xs text-muted-foreground mt-1">{ind.notes}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={ind.status} onValueChange={v => updateMutation.mutate({ id: ind.id, data: { status: v } })}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_MAP).map(([key, { label }]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
