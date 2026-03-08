import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DocumentEditor } from "@/components/DocumentEditor";
import { Plus, Search, FileText, Pill, Stethoscope, Award } from "lucide-react";

type DocumentType = "prescricao" | "exame" | "atestado";

interface Document {
  id: number;
  title: string;
  type: DocumentType;
  status: "rascunho" | "finalizado" | "assinado" | "cancelado";
  createdAt: string;
  patientName?: string;
}

interface Template {
  id: number;
  name: string;
  content: string;
  type: DocumentType;
}

export default function Documentos() {
  const [activeTab, setActiveTab] = useState<DocumentType>("prescricao");
  const [editingDocId, setEditingDocId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("todos");

  // Mock data
  const documents: Document[] = [
    {
      id: 1,
      title: "Prescrição - João Silva",
      type: "prescricao",
      status: "assinado",
      createdAt: "2026-03-08",
      patientName: "João Silva",
    },
    {
      id: 2,
      title: "Prescrição - Maria Santos",
      type: "prescricao",
      status: "rascunho",
      createdAt: "2026-03-08",
      patientName: "Maria Santos",
    },
  ];

  const templates: Template[] = [
    {
      id: 1,
      name: "Prescrição Padrão",
      type: "prescricao",
      content: `PRESCRIÇÃO MÉDICA

Paciente: _______________
Data: _______________

MEDICAMENTOS:
1. _______________
   Dosagem: _______________
   Frequência: _______________

ORIENTAÇÕES:
- Tomar com alimentos
- Não dirigir após uso
- Retornar em 7 dias

Assinatura: _______________
CRM: _______________`,
    },
    {
      id: 2,
      name: "Pedido de Exame Padrão",
      type: "exame",
      content: `PEDIDO DE EXAME

Paciente: _______________
Data: _______________

EXAMES SOLICITADOS:
1. _______________
2. _______________

INDICAÇÃO CLÍNICA:
_______________

OBSERVAÇÕES:
_______________

Assinatura: _______________
CRM: _______________`,
    },
    {
      id: 3,
      name: "Atestado de Comparecimento",
      type: "atestado",
      content: `ATESTADO MÉDICO

Atesto que o(a) Sr(a). _______________
Compareceu à consulta médica em _______________.

Data: _______________
Assinatura: _______________
CRM: _______________`,
    },
  ];

  const filteredDocuments = documents.filter((doc) => {
    const matchesType = doc.type === activeTab;
    const matchesSearch =
      doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (doc.patientName?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
    const matchesStatus = filterStatus === "todos" || doc.status === filterStatus;
    return matchesType && matchesSearch && matchesStatus;
  });

  const filteredTemplates = templates.filter((t) => t.type === activeTab);

  const getTypeIcon = (type: DocumentType) => {
    switch (type) {
      case "prescricao":
        return <Pill className="h-4 w-4" />;
      case "exame":
        return <Stethoscope className="h-4 w-4" />;
      case "atestado":
        return <Award className="h-4 w-4" />;
    }
  };

  const getTypeLabel = (type: DocumentType) => {
    switch (type) {
      case "prescricao":
        return "Prescrição";
      case "exame":
        return "Pedido de Exame";
      case "atestado":
        return "Atestado";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "rascunho":
        return "bg-gray-100 text-gray-700";
      case "finalizado":
        return "bg-blue-100 text-blue-700";
      case "assinado":
        return "bg-green-100 text-green-700";
      case "cancelado":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col gap-4">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DocumentType)} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-3 mb-4">
          <TabsTrigger value="prescricao" className="flex gap-2">
            <Pill className="h-4 w-4" />
            Prescrições
          </TabsTrigger>
          <TabsTrigger value="exame" className="flex gap-2">
            <Stethoscope className="h-4 w-4" />
            Exames
          </TabsTrigger>
          <TabsTrigger value="atestado" className="flex gap-2">
            <Award className="h-4 w-4" />
            Atestados
          </TabsTrigger>
        </TabsList>

        {/* Conteúdo de cada aba */}
        {(["prescricao", "exame", "atestado"] as DocumentType[]).map((docType) => (
          <TabsContent key={docType} value={docType} className="flex-1 flex flex-col gap-4">
            {editingDocId === null ? (
              <>
                {/* Lista de documentos */}
                <div className="flex-1 flex flex-col gap-4">
                  {/* Header com filtros */}
                  <div className="flex gap-3 items-end">
                    <div className="flex-1">
                      <Label className="text-sm font-semibold text-gray-700 mb-1 block">Buscar</Label>
                      <div className="relative">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Buscar por título ou paciente..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-10 border-gray-300"
                        />
                      </div>
                    </div>

                    <div>
                      <Label className="text-sm font-semibold text-gray-700 mb-1 block">Status</Label>
                      <Select value={filterStatus} onValueChange={setFilterStatus}>
                        <SelectTrigger className="border-gray-300 w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">Todos</SelectItem>
                          <SelectItem value="rascunho">Rascunho</SelectItem>
                          <SelectItem value="finalizado">Finalizado</SelectItem>
                          <SelectItem value="assinado">Assinado</SelectItem>
                          <SelectItem value="cancelado">Cancelado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Button onClick={() => setEditingDocId(-1)} className="btn-gold-gradient">
                      <Plus className="h-4 w-4 mr-2" />
                      Novo
                    </Button>
                  </div>

                  {/* Lista de documentos */}
                  <div className="flex-1 overflow-y-auto rounded-lg border border-gray-300 bg-white">
                    {filteredDocuments.length === 0 ? (
                      <div className="flex items-center justify-center h-full text-gray-500">
                        <div className="text-center">
                          <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                          <p>Nenhum documento encontrado</p>
                        </div>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-200">
                        {filteredDocuments.map((doc) => (
                          <div
                            key={doc.id}
                            onClick={() => setEditingDocId(doc.id)}
                            className="p-4 hover:bg-gray-50 cursor-pointer transition-colors flex items-center justify-between"
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                {getTypeIcon(doc.type)}
                                <h3 className="font-semibold text-gray-900">{doc.title}</h3>
                              </div>
                              <p className="text-sm text-gray-600">{doc.patientName}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-gray-500">{doc.createdAt}</span>
                              <Badge className={`text-xs font-medium ${getStatusColor(doc.status)}`}>
                                {doc.status}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Modelos disponíveis */}
                {filteredTemplates.length > 0 && (
                  <div className="bg-white rounded-lg border border-gray-300 p-4">
                    <h3 className="font-semibold text-gray-900 mb-3">Modelos Disponíveis</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {filteredTemplates.map((template) => (
                        <Card
                          key={template.id}
                          className="cursor-pointer hover:shadow-lg transition-shadow border-gray-300"
                          onClick={() => setEditingDocId(-1)}
                        >
                          <CardHeader className="pb-3">
                            <CardTitle className="text-sm flex items-center gap-2">
                              {getTypeIcon(template.type)}
                              {template.name}
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-xs text-gray-600 line-clamp-3">{template.content}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* Editor de documento */
              <div className="flex-1 flex flex-col">
                <div className="mb-4">
                  <Button
                    variant="outline"
                    onClick={() => setEditingDocId(null)}
                    className="border-gray-300"
                  >
                    ← Voltar
                  </Button>
                </div>
                <DocumentEditor
                  type={docType}
                  templates={filteredTemplates}
                  onSave={(content, title) => {
                    console.log("Salvando documento:", { title, content, type: docType });
                    setEditingDocId(null);
                  }}
                />
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
