import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Shield, Save, Check, X } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

const MODULES = [
  { key: "patients", label: "Pacientes" },
  { key: "appointments", label: "Agenda" },
  { key: "medical_records", label: "Prontuários" },
  { key: "prescriptions", label: "Prescrições" },
  { key: "exam_requests", label: "Exames" },
  { key: "templates", label: "Templates" },
  { key: "photos", label: "Fotos" },
  { key: "budgets", label: "Orçamentos" },
  { key: "inventory", label: "Estoque" },
  { key: "crm", label: "CRM" },
  { key: "financial", label: "Financeiro" },
  { key: "chat", label: "Chat" },
  { key: "clinic", label: "Empresa" },
  { key: "audit", label: "Auditoria" },
  { key: "users", label: "Usuários" },
];

const ACTIONS = ["canCreate", "canRead", "canUpdate", "canDelete"] as const;
const ACTION_LABELS: Record<string, string> = {
  canCreate: "Criar",
  canRead: "Ler",
  canUpdate: "Editar",
  canDelete: "Excluir",
};

export default function Permissoes() {
  const { data: users, isLoading } = trpc.admin.listUsers.useQuery();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const { data: userPermissions, refetch } = trpc.admin.getUserPermissions.useQuery(
    { userId: selectedUserId! },
    { enabled: !!selectedUserId }
  );

  const setPermMutation = trpc.admin.setUserPermission.useMutation({
    onSuccess: () => { toast.success("Permissão atualizada!"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const [permMatrix, setPermMatrix] = useState<Record<string, Record<string, boolean>>>({});

  useEffect(() => {
    if (userPermissions) {
      const matrix: Record<string, Record<string, boolean>> = {};
      for (const perm of userPermissions as any[]) {
        matrix[perm.module] = {
          canCreate: perm.canCreate ?? false,
          canRead: perm.canRead ?? false,
          canUpdate: perm.canUpdate ?? false,
          canDelete: perm.canDelete ?? false,
        };
      }
      setPermMatrix(matrix);
    }
  }, [userPermissions]);

  const togglePerm = (module: string, action: string) => {
    const current = permMatrix[module]?.[action] ?? false;
    const newMatrix = { ...permMatrix };
    if (!newMatrix[module]) newMatrix[module] = { canCreate: false, canRead: false, canUpdate: false, canDelete: false };
    newMatrix[module][action] = !current;
    setPermMatrix(newMatrix);
  };

  const savePerm = (module: string) => {
    if (!selectedUserId) return;
    const perms = permMatrix[module] ?? { canCreate: false, canRead: false, canUpdate: false, canDelete: false };
    setPermMutation.mutate({ userId: selectedUserId, module, permission: perms });
  };

  const selectedUser = users?.find((u: any) => u.id === selectedUserId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          Permissões Granulares
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Controle fino de acesso por módulo e ação (CRUD) para cada usuário</p>
      </div>

      {/* Seleção de Usuário */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Selecione o Usuário</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-sm">Carregando...</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {users?.map((u: any) => (
                <Button
                  key={u.id}
                  variant={selectedUserId === u.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedUserId(u.id)}
                >
                  {u.name ?? u.email ?? `Usuário #${u.id}`}
                  <Badge variant="secondary" className="ml-2 text-xs">{u.role}</Badge>
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Matriz de Permissões */}
      {selectedUserId && selectedUser && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Permissões de: {selectedUser.name ?? selectedUser.email}
              <Badge variant="secondary" className="ml-2">{selectedUser.role}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="p-2 text-left">Módulo</th>
                  {ACTIONS.map(a => <th key={a} className="p-2 text-center">{ACTION_LABELS[a]}</th>)}
                  <th className="p-2 text-center">Salvar</th>
                </tr>
              </thead>
              <tbody>
                {MODULES.map(mod => (
                  <tr key={mod.key} className="border-b hover:bg-muted/10">
                    <td className="p-2 font-medium">{mod.label}</td>
                    {ACTIONS.map(action => {
                      const enabled = permMatrix[mod.key]?.[action] ?? false;
                      return (
                        <td key={action} className="p-2 text-center">
                          <button
                            onClick={() => togglePerm(mod.key, action)}
                            className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
                              enabled ? "bg-[#C9A55B]/15 text-[#6B5B2A] hover:bg-[#C9A55B]/15" : "bg-[#6B6B6B]/5 text-[#8B8B8B] hover:bg-[#6B6B6B]/10"
                            }`}
                          >
                            {enabled ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                          </button>
                        </td>
                      );
                    })}
                    <td className="p-2 text-center">
                      <Button variant="ghost" size="sm" onClick={() => savePerm(mod.key)}>
                        <Save className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
