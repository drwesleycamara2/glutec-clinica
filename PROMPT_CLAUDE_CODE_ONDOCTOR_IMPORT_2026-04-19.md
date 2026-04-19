# Prompt para Claude Code - Migração Manual do OnDoctor para Glutec

Use este prompt no Claude Code para continuar o projeto exatamente deste ponto:

---

Continue o projeto `glutec-clinica` exatamente de onde paramos.

## Repositório e contexto

- Repo: `https://github.com/drwesleycamara2/glutec-clinica`
- Branch: `main`
- Pasta local: `C:\Users\wesle\OneDrive\Documentos\New project\glutec-clinica`
- Produção do Glutec: `https://sistema.drwesleycamara.com.br`

## Leia primeiro

1. `HANDOFF_CODEX_2026-04-18.md`
2. `HANDOFF_CODEX_2026-04-19.md`

## Estado atual importante

- A visão limitada da secretária no prontuário já foi concluída e validada.
- D4Sign já foi validada e está operacional.
- Certillion foi corrigido e já autentica corretamente usando os endpoints oficiais `/css/restful/application/oauth/...`.
- A infraestrutura da NFS-e está pronta, mas a emissão ponta a ponta ainda precisa de validação real.
- Nesta rodada, também foi implementada a ordenação da lista de pacientes no Glutec por:
  - `Nome: A-Z`
  - `Nome: Z-A`
  - `Cadastro: mais recentes`
  - `Cadastro: mais antigos`

Arquivos alterados nessa melhoria da ordenação:
- `client/src/pages/Pacientes.tsx`
- `server/db_complete.ts`
- `server/routers.ts`

## Nova tarefa

Precisamos atualizar manualmente o Glutec com os dados mais recentes do OnDoctor, porque o OnDoctor não oferece exportação sem custo extra.

Fonte atualizada: `https://web.ondoctor.app/`

## Objetivo

Entrar no OnDoctor com navegador real e:

1. Conferir a lista de pacientes do OnDoctor.
2. Identificar pacientes que existem no OnDoctor e ainda não estão atualizados no Glutec.
3. Inserir no Glutec:
   - pacientes novos
   - alterações cadastrais relevantes
4. Conferir a agenda do OnDoctor.
5. Atualizar o Glutec com:
   - agendamentos futuros
   - alterações de agenda
   - novos agendamentos que ainda não estejam no Glutec

## Regra de negócio obrigatória

Quando houver divergência entre OnDoctor e Glutec:

- prevalece o dado do **OnDoctor**, por ser a fonte mais atual;
- se a informação for complementar e não conflitante, manter ambas;
- a agenda do OnDoctor deve prevalecer como referência atual.

## Limites e cuidados

- Não apagar dados históricos do Glutec sem necessidade.
- Não sobrescrever informação útil antiga se ela apenas complementar o cadastro.
- Fazer conferência paciente por paciente com atenção.
- Se houver dúvida em algum conflito relevante, parar e relatar claramente.

## Como trabalhar

1. Primeiro verifique o estado atual da listagem de pacientes do Glutec.
2. Depois entre no OnDoctor com o navegador controlado por você.
3. Navegue pela agenda e pelos cadastros.
4. Faça a migração manual para o Glutec.
5. Ao final, me entregue um resumo claro com:
   - quantos pacientes novos foram inseridos
   - quantos pacientes foram atualizados
   - quantos agendamentos foram incluídos/alterados
   - quais limitações ou dúvidas restaram

## Importante sobre credenciais

As credenciais do OnDoctor não foram colocadas neste arquivo por segurança.
Eu vou fornecê-las diretamente na conversa, separadamente.

## Se precisar mexer no código

Você pode continuar normalmente no `main`, mas não repita trabalho já concluído nos handoffs.

---

Depois de ler tudo isso, confirme o plano curto e comece pela conferência do Glutec e pelo acesso ao OnDoctor.
