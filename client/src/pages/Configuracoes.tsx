import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTheme } from "@/contexts/ThemeContext";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Moon, Sun, Palette, Bell, Shield, User, FileStack } from "lucide-react";

export default function Configuracoes() {
  const { theme, toggleTheme, switchable } = useTheme();

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-primary">Configurações Gerais</h1>
        <p className="text-muted-foreground">Gerencie as preferências do sistema e sua experiência visual.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Aparência */}
        <Card className="border-primary/10 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-primary" />
              <CardTitle>Aparência</CardTitle>
            </div>
            <CardDescription>Escolha o tema visual do sistema.</CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              defaultValue={theme}
              onValueChange={() => toggleTheme?.()}
              className="grid grid-cols-2 gap-4"
            >
              <div>
                <RadioGroupItem
                  value="light"
                  id="light"
                  className="peer sr-only"
                />
                <Label
                  htmlFor="light"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-all"
                >
                  <Sun className="mb-3 h-6 w-6" />
                  <span className="text-sm font-medium">Modo Claro</span>
                </Label>
              </div>
              <div>
                <RadioGroupItem
                  value="dark"
                  id="dark"
                  className="peer sr-only"
                />
                <Label
                  htmlFor="dark"
                  className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-all"
                >
                  <Moon className="mb-3 h-6 w-6" />
                  <span className="text-sm font-medium">Modo Escuro</span>
                </Label>
              </div>
            </RadioGroup>
            
            <div className="mt-6 p-4 rounded-lg bg-primary/5 border border-primary/10">
              <p className="text-xs text-primary/70 font-medium">
                Nota: O modo escuro foi otimizado com detalhes em dourado premium para uma experiência luxuosa.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Notificações (Placeholder) */}
        <Card className="border-primary/10 bg-card/50 backdrop-blur-sm opacity-60">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              <CardTitle>Notificações</CardTitle>
            </div>
            <CardDescription>Configure como você recebe alertas.</CardDescription>
          </CardHeader>
          <CardContent className="h-[140px] flex items-center justify-center italic text-sm text-muted-foreground">
            Em breve: Alertas via WhatsApp e E-mail.
          </CardContent>
        </Card>

        {/* Segurança (Placeholder) */}
        <Card className="border-primary/10 bg-card/50 backdrop-blur-sm opacity-60">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle>Segurança</CardTitle>
            </div>
            <CardDescription>Autenticação em duas etapas e logs.</CardDescription>
          </CardHeader>
          <CardContent className="h-[140px] flex items-center justify-center italic text-sm text-muted-foreground">
            Configurações de segurança avançada.
          </CardContent>
        </Card>

        {/* Perfil (Link) */}
        <Card className="border-primary/10 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              <CardTitle>Perfil</CardTitle>
            </div>
            <CardDescription>Gerencie seus dados pessoais.</CardDescription>
          </CardHeader>
          <CardContent className="h-[140px] flex items-center justify-center">
            <button 
              onClick={() => window.location.href = '/perfil'}
              className="btn-glossy-gold px-6 py-2 text-sm"
            >
              Acessar Meu Perfil
            </button>
          </CardContent>
        </Card>

        <Card className="border-primary/10 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileStack className="h-5 w-5 text-primary" />
              <CardTitle>Modelos</CardTitle>
            </div>
            <CardDescription>Prescrições, exames, anamneses, atestados e evolução.</CardDescription>
          </CardHeader>
          <CardContent className="h-[140px] flex items-center justify-center">
            <button
              onClick={() => window.location.href = "/templates"}
              className="btn-glossy-gold px-6 py-2 text-sm"
            >
              Gerenciar modelos
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
