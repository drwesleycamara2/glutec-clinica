# Guia de Continuidade - Sistema Glutec (Clínica Glutée)

Este documento contém as instruções necessárias para retomar o desenvolvimento do sistema em uma nova conta Manus ou ambiente local.

## 🚀 Como Iniciar

1. **Clonar o Repositório:**
   ```bash
   gh repo clone drwesleycamara2/glutec-clinica
   cd glutec-clinica
   pnpm install
   ```

2. **Configurar Variáveis de Ambiente:**
   Crie um arquivo `.env` na raiz do projeto com as seguintes chaves:
   ```env
   # Credenciais D4Sign (Já fornecidas pelo usuário)
   D4SIGN_TOKEN_API=live_7d0a13cc11af0765b3100c9bdca360c862b57ae63bf9f5836d41cb67394dd790
   D4SIGN_CRYPT_KEY=live_crypt_hShAdQ3il2jfdGWF7U1wybozsqGGouPC
   D4SIGN_BASE_URL=https://secure.d4sign.com.br/api/v1

   # Banco de Dados (Necessário para modo real)
   DATABASE_URL=mysql://usuario:senha@host:porta/banco

   # Outras Configurações
   VITE_APP_TITLE="Glutec - Clínica Glutée"
   ```

3. **Rodar em Desenvolvimento:**
   ```bash
   pnpm dev
   ```

## 🛠️ O que foi implementado recentemente

- **Identidade Visual Premium:** Paleta Cinza + Dourado Metálico (#d4a853) com botões estilo "Glossy" (alto brilho).
- **Logotipo Oficial:** Integrado na tela de login e cabeçalho.
- **Modelos Dinâmicos:** Sistema de "Salvar como Modelo" para Prescrições, Exames e Atendimentos (PEP).
- **Auditoria Jurídica:** Bloqueio de prontuários encerrados e registro de histórico de alterações.
- **Papel Timbrado:** Geração de documentos com logo e marca d'água centralizada.

## 📋 Próximos Passos Sugeridos

1. **Conexão com TiDB:** Configurar a `DATABASE_URL` real para persistência de dados.
2. **Deploy em Produção:** Configurar Vercel ou VPS para acesso externo dos profissionais.
3. **Refinamento da Agenda:** Aplicar as cores de status (Verde, Amarelo, Vermelho, Preto) conforme as preferências de design.
4. **Módulo Financeiro:** Integrar com gateway de pagamento ou emissão de NF-e via D4Sign.

---
*Desenvolvido com foco em exclusividade e segurança para a Clínica Glutée.*
