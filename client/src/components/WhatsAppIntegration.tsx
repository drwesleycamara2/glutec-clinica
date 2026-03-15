import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { MessageCircle, Send, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface WhatsAppMessage {
  id: number;
  patientPhone: string;
  patientName: string;
  appointmentDate: string;
  messageType: "lembrete" | "confirmacao_pendente" | "confirmado" | "cancelado";
  status: "enviado" | "lido" | "respondido" | "erro";
  sentAt: string;
  response?: string;
  responseAt?: string;
}

export function WhatsAppIntegration() {
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [showSendReminder, setShowSendReminder] = useState(false);
  const [reminderForm, setReminderForm] = useState({
    patientPhone: "",
    patientName: "",
    appointmentDate: "",
    appointmentTime: "",
    customMessage: "",
  });

  const sendMessageMutation = trpc.whatsapp.sendMessage.useMutation({
    onSuccess: (data) => {
      if (data.simulated) {
        toast.info("Simulação: " + data.message);
      } else {
        toast.success("Mensagem enviada com sucesso!");
      }
    },
    onError: (error) => {
      toast.error("Erro ao enviar mensagem: " + error.message);
    },
  });

  const handleSendReminder = async () => {
    if (!reminderForm.patientPhone || !reminderForm.appointmentDate) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    const messageText = reminderForm.customMessage || 
      `Olá ${reminderForm.patientName}, confirmamos seu agendamento para o dia ${new Date(reminderForm.appointmentDate).toLocaleDateString("pt-BR")} às ${reminderForm.appointmentTime}.`;

    try {
      await sendMessageMutation.mutateAsync({
        to: reminderForm.patientPhone,
        text: messageText,
      });

      const message: WhatsAppMessage = {
        id: messages.length + 1,
        patientPhone: reminderForm.patientPhone,
        patientName: reminderForm.patientName,
        appointmentDate: reminderForm.appointmentDate,
        messageType: "lembrete",
        status: "enviado",
        sentAt: new Date().toLocaleString("pt-BR"),
      };

      setMessages([...messages, message]);
      setReminderForm({
        patientPhone: "",
        patientName: "",
        appointmentDate: "",
        appointmentTime: "",
        customMessage: "",
      });
      setShowSendReminder(false);
    } catch (error) {
      // Erro já tratado no onError da mutation
    }
  };

  const handleSendBulkReminders = () => {
    toast.success("Lembretes em massa agendados para envio!");
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "enviado":
        return <Send className="h-4 w-4 text-blue-600" />;
      case "lido":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "respondido":
        return <MessageCircle className="h-4 w-4 text-emerald-600" />;
      case "erro":
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "enviado":
        return "Enviado";
      case "lido":
        return "Lido";
      case "respondido":
        return "Respondido";
      case "erro":
        return "Erro";
      default:
        return "Pendente";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "enviado":
        return "bg-blue-100 text-blue-700";
      case "lido":
        return "bg-green-100 text-green-700";
      case "respondido":
        return "bg-emerald-100 text-emerald-700";
      case "erro":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Actions */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MessageCircle className="h-6 w-6 text-green-600" />
            Integração WhatsApp
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Gerencie lembretes e confirmações de agendamentos via WhatsApp
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowSendReminder(true)} className="btn-gold-gradient">
            <Send className="h-4 w-4 mr-2" />
            Enviar Lembrete
          </Button>
          <Button variant="outline" onClick={handleSendBulkReminders} className="border-gray-300">
            <MessageCircle className="h-4 w-4 mr-2" />
            Lembretes em Massa
          </Button>
        </div>
      </div>

      {/* Messages List */}
      <Card className="border-gray-300">
        <CardHeader>
          <CardTitle className="text-lg text-gray-900">Histórico de Mensagens</CardTitle>
        </CardHeader>
        <CardContent>
          {messages.length === 0 ? (
            <div className="text-center py-8">
              <MessageCircle className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p className="text-gray-500">Nenhuma mensagem enviada ainda</p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className="p-4 bg-gray-50 rounded-lg border border-gray-200 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900">{msg.patientName}</h3>
                        <Badge className="bg-green-100 text-green-700 text-xs">WhatsApp</Badge>
                      </div>
                      <p className="text-sm text-gray-600">{msg.patientPhone}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(msg.status)}
                      <Badge className={`text-xs font-medium ${getStatusColor(msg.status)}`}>
                        {getStatusLabel(msg.status)}
                      </Badge>
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded border border-gray-200 mb-3">
                    <p className="text-sm text-gray-700">
                      <strong>Agendamento:</strong> {msg.appointmentDate}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      <strong>Enviado:</strong> {msg.sentAt}
                    </p>
                  </div>

                  {msg.response && (
                    <div className="bg-green-50 p-3 rounded border border-green-200">
                      <p className="text-xs font-semibold text-green-700 mb-1">Resposta do Paciente:</p>
                      <p className="text-sm text-green-900">{msg.response}</p>
                      <p className="text-xs text-green-600 mt-1">
                        <strong>Recebido:</strong> {msg.responseAt}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog: Send Reminder */}
      <Dialog open={showSendReminder} onOpenChange={setShowSendReminder}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar Lembrete via WhatsApp</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-sm font-semibold">Nome do Paciente</Label>
              <Input
                value={reminderForm.patientName}
                onChange={(e) =>
                  setReminderForm({ ...reminderForm, patientName: e.target.value })
                }
                placeholder="Ex: João Silva"
                className="border-gray-300 mt-1"
              />
            </div>

            <div>
              <Label className="text-sm font-semibold">Telefone WhatsApp (com DDD)</Label>
              <Input
                value={reminderForm.patientPhone}
                onChange={(e) =>
                  setReminderForm({ ...reminderForm, patientPhone: e.target.value })
                }
                placeholder="Ex: 11987654321"
                className="border-gray-300 mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-semibold">Data do Agendamento</Label>
                <Input
                  type="date"
                  value={reminderForm.appointmentDate}
                  onChange={(e) =>
                    setReminderForm({ ...reminderForm, appointmentDate: e.target.value })
                  }
                  className="border-gray-300 mt-1"
                />
              </div>
              <div>
                <Label className="text-sm font-semibold">Horário</Label>
                <Input
                  type="time"
                  value={reminderForm.appointmentTime}
                  onChange={(e) =>
                    setReminderForm({ ...reminderForm, appointmentTime: e.target.value })
                  }
                  className="border-gray-300 mt-1"
                />
              </div>
            </div>

            <div>
              <Label className="text-sm font-semibold">Mensagem Personalizada (Opcional)</Label>
              <Textarea
                value={reminderForm.customMessage}
                onChange={(e) =>
                  setReminderForm({ ...reminderForm, customMessage: e.target.value })
                }
                placeholder="Deixe em branco para usar o modelo padrão..."
                className="border-gray-300 mt-1 resize-none"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSendReminder(false)}
              className="border-gray-300"
            >
              Cancelar
            </Button>
            <Button onClick={handleSendReminder} className="btn-gold-gradient">
              <Send className="h-4 w-4 mr-2" />
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
