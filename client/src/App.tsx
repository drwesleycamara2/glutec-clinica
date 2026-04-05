import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Dashboard from "./pages/Dashboard.premium";
import Usuarios from "./pages/Usuarios.premium";
import Agenda from "./pages/Agenda";
import Pacientes from "./pages/Pacientes";
import Prontuarios from "./pages/Prontuarios";
import PacienteDetalhe from "./pages/PacienteDetalhe";
import ProntuarioDetalhe from "./pages/ProntuarioDetalhe";
import Configuracoes from "./pages/Configuracoes";
import Prescricoes from "./pages/Prescricoes";
import Exames from "./pages/Exames";
import Assinaturas from "./pages/Assinaturas";
import Orcamentos from "./pages/Orcamentos";
import Financeiro from "./pages/Financeiro";
import Estoque from "./pages/Estoque";
import NfseEmissao from "./pages/NfseEmissao";
import ConfiguracoesFiscais from "./pages/ConfiguracoesFiscaisPage";
import EvolucaoClinica from "./pages/EvolucaoClinica";
import Documentos from "./pages/Documentos";
import Fotos from "./pages/Fotos";
import CRM from "./pages/CRM";
import Relatorios from "./pages/Relatorios";
import Chat from "./pages/Chat";
import Perfil from "./pages/Perfil";
import DashboardLayout from "./components/DashboardLayoutPremium";

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/usuarios" component={Usuarios} />
        <Route path="/agenda" component={Agenda} />
        <Route path="/pacientes" component={Pacientes} />
        <Route path="/pacientes/:id" component={PacienteDetalhe} />
        <Route path="/prontuarios" component={Prontuarios} />
        <Route path="/prontuarios/:id" component={ProntuarioDetalhe} />
        <Route path="/evolucao" component={EvolucaoClinica} />
        <Route path="/prescricoes" component={Prescricoes} />
        <Route path="/exames" component={Exames} />
        <Route path="/assinaturas" component={Assinaturas} />
        <Route path="/orcamentos" component={Orcamentos} />
        <Route path="/financeiro" component={Financeiro} />
        <Route path="/estoque" component={Estoque} />
        <Route path="/nfse" component={NfseEmissao} />
        <Route path="/fiscal" component={ConfiguracoesFiscais} />
        <Route path="/documentos" component={Documentos} />
        <Route path="/fotos" component={Fotos} />
        <Route path="/crm" component={CRM} />
        <Route path="/relatorios" component={Relatorios} />
        <Route path="/chat" component={Chat} />
        <Route path="/perfil" component={Perfil} />
        <Route path="/configuracoes" component={Configuracoes} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
