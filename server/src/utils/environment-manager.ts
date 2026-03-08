/**
 * Gerenciador de Ambientes (Homologação e Produção)
 * Controla endpoints, certificados e configurações por ambiente
 */

export type Environment = "homologacao" | "producao";

export interface EnvironmentConfig {
  name: string;
  label: string;
  nfseEndpoint: string;
  nfseTestEndpoint: string;
  vidaasEndpoint: string;
  vidaasTestEndpoint: string;
  certificateRequired: boolean;
  description: string;
  color: string;
  icon: string;
}

export const ENVIRONMENTS: Record<Environment, EnvironmentConfig> = {
  homologacao: {
    name: "homologacao",
    label: "Homologação (Testes)",
    nfseEndpoint: "https://nfse-homolog.gov.br/webservice",
    nfseTestEndpoint: "https://nfse-homolog.gov.br/test",
    vidaasEndpoint: "https://vidaas-homolog.cfm.org.br/api",
    vidaasTestEndpoint: "https://vidaas-homolog.cfm.org.br/test",
    certificateRequired: true,
    description: "Ambiente de testes para validar emissão de NFS-e e assinaturas sem valor fiscal",
    color: "yellow",
    icon: "AlertCircle",
  },
  producao: {
    name: "producao",
    label: "Produção (Real)",
    nfseEndpoint: "https://nfse.gov.br/webservice",
    nfseTestEndpoint: "https://nfse.gov.br/api",
    vidaasEndpoint: "https://vidaas.cfm.org.br/api",
    vidaasTestEndpoint: "https://vidaas.cfm.org.br/api",
    certificateRequired: true,
    description: "Ambiente de produção para emissão de NFS-es com valor fiscal",
    color: "green",
    icon: "CheckCircle",
  },
};

export class EnvironmentManager {
  private currentEnvironment: Environment = "homologacao";
  private environmentConfig: Map<string, any> = new Map();

  constructor() {
    this.loadEnvironmentConfig();
  }

  /**
   * Carrega configuração do ambiente
   */
  private loadEnvironmentConfig() {
    const env = process.env.NFSE_ENVIRONMENT || "homologacao";
    this.setEnvironment(env as Environment);
  }

  /**
   * Define o ambiente atual
   */
  setEnvironment(environment: Environment) {
    if (!ENVIRONMENTS[environment]) {
      throw new Error(`Ambiente inválido: ${environment}`);
    }
    this.currentEnvironment = environment;
    console.log(`Ambiente alterado para: ${ENVIRONMENTS[environment].label}`);
  }

  /**
   * Retorna o ambiente atual
   */
  getCurrentEnvironment(): Environment {
    return this.currentEnvironment;
  }

  /**
   * Retorna a configuração do ambiente atual
   */
  getEnvironmentConfig(): EnvironmentConfig {
    return ENVIRONMENTS[this.currentEnvironment];
  }

  /**
   * Retorna o endpoint NFS-e para o ambiente atual
   */
  getNFSeEndpoint(): string {
    const config = this.getEnvironmentConfig();
    return this.currentEnvironment === "homologacao" ? config.nfseTestEndpoint : config.nfseEndpoint;
  }

  /**
   * Retorna o endpoint VIDAAS para o ambiente atual
   */
  getVidaasEndpoint(): string {
    const config = this.getEnvironmentConfig();
    return this.currentEnvironment === "homologacao"
      ? config.vidaasTestEndpoint
      : config.vidaasEndpoint;
  }

  /**
   * Verifica se está em ambiente de homologação
   */
  isHomologacao(): boolean {
    return this.currentEnvironment === "homologacao";
  }

  /**
   * Verifica se está em ambiente de produção
   */
  isProducao(): boolean {
    return this.currentEnvironment === "producao";
  }

  /**
   * Retorna informações do ambiente para exibição na UI
   */
  getEnvironmentInfo() {
    const config = this.getEnvironmentConfig();
    return {
      environment: this.currentEnvironment,
      label: config.label,
      description: config.description,
      color: config.color,
      icon: config.icon,
      isProduction: this.isProducao(),
      isHomologacao: this.isHomologacao(),
      nfseEndpoint: this.getNFSeEndpoint(),
      vidaasEndpoint: this.getVidaasEndpoint(),
    };
  }

  /**
   * Retorna aviso para homologação
   */
  getHomologacaoWarning(): string | null {
    if (this.isHomologacao()) {
      return "⚠️ MODO HOMOLOGAÇÃO: As NFS-es emitidas neste ambiente NÃO têm valor fiscal. Use apenas para testes.";
    }
    return null;
  }

  /**
   * Retorna aviso para produção
   */
  getProducaoWarning(): string | null {
    if (this.isProducao()) {
      return "🔴 MODO PRODUÇÃO: As NFS-es emitidas neste ambiente têm valor fiscal. Verifique todos os dados antes de emitir.";
    }
    return null;
  }

  /**
   * Valida se pode emitir NFS-e
   */
  canEmitNFSe(certificateId?: number): { canEmit: boolean; reason?: string } {
    const config = this.getEnvironmentConfig();

    if (config.certificateRequired && !certificateId) {
      return {
        canEmit: false,
        reason: "Certificado digital não configurado",
      };
    }

    return { canEmit: true };
  }

  /**
   * Retorna lista de ambientes disponíveis
   */
  getAvailableEnvironments() {
    return Object.entries(ENVIRONMENTS).map(([key, config]) => ({
      value: key,
      label: config.label,
      description: config.description,
      color: config.color,
    }));
  }
}

// Instância global do gerenciador
export const environmentManager = new EnvironmentManager();
