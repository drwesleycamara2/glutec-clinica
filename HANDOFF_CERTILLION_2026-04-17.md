# Handoff — Integração Certillion (ICP-Brasil / VIDaaS / BirdID)

**Data:** 2026-04-17
**Status:** Infraestrutura completa + página de configuração pronta. **Falta deploy no VPS + testes end-to-end** com as credenciais de produção.

---

## O que foi feito nesta leva

### Backend
| Arquivo | Papel |
|---|---|
| `server/lib/certillion.ts` | Cliente OAuth2+PKCE completo: `getClientToken`, `uploadDocument`, `buildAuthorizeUrl`, `exchangeCodeForToken`, `signHashes`, `downloadDocument`, `findPscAccounts`. |
| `drizzle/migrations/0180_certillion_support.sql` | Adiciona `psc`, `clientToken`, `stateNonce` a `signature_sessions`; adiciona 6 colunas `certillion*` em `clinic_settings`; cria `idx_ss_state`. |
| `server/db_complete.ts` | `getCertillionConfig`, `saveCertillionConfig`, `createCertillionSession`, `updateCertillionSession`, `getSignatureSessionByState` — secret criptografado. |
| `server/_core/index.ts` | Rota HTTP `GET /api/certillion/callback` — faz exchange do code, assina o hash e responde com HTML que faz `postMessage` pro opener. |
| `server/routers.ts` | `trpc.certillion.*` — `getConfig`, `saveConfig`, `testConnection`, `findPscAccounts`, `initiate`, `getSessionStatus`. |

### Frontend
| Arquivo | Papel |
|---|---|
| `client/src/components/SignatureCertillionButton.tsx` | Botão plug-and-play: calcula SHA-256 no browser, chama `initiate`, abre popup pro PSC, exibe QR, faz polling + escuta `postMessage`. |
| `client/src/pages/Assinaturas.tsx` | Novo card "Certillion — Assinatura ICP-Brasil (A3)" com form completo (Client ID, Secret, Redirect URI, Base URL, PSC padrão, enabled) + botão "Testar conexão". |

---

## Credenciais recebidas (já para usar)

> **Colar em `Configurações → Assinaturas → Certillion` após o deploy.**

```
CLIENT_ID:     46201011000130
CLIENT_SECRET: K9z2abDkjQ04cLxJ
REDIRECT_URI:  https://sistema.drwesleycamara.com.br/api/certillion/callback
BASE_URL:      https://cloud.certillion.com
DEFAULT_PSC:   VIDAAS
```

Alternativa via env (fallback quando o DB ainda não tem registro):
```
CERTILLION_CLIENT_ID=46201011000130
CERTILLION_CLIENT_SECRET=K9z2abDkjQ04cLxJ
CERTILLION_REDIRECT_URI=https://sistema.drwesleycamara.com.br/api/certillion/callback
CERTILLION_BASE_URL=https://cloud.certillion.com
APP_URL=https://sistema.drwesleycamara.com.br
```

---

## Deploy — passo a passo no VPS

1. **Pull** o código novo: `git pull origin main` dentro de `/app` no VPS.
2. **Migration**:
   ```bash
   docker exec -i glutec-mysql mysql -uroot -p$MYSQL_ROOT_PASSWORD glutec < drizzle/migrations/0180_certillion_support.sql
   ```
3. **Env vars** em `/app/.env` (ou `docker-compose.yml` do backend):
   ```
   CERTILLION_CLIENT_ID=46201011000130
   CERTILLION_CLIENT_SECRET=K9z2abDkjQ04cLxJ
   CERTILLION_REDIRECT_URI=https://sistema.drwesleycamara.com.br/api/certillion/callback
   CERTILLION_BASE_URL=https://cloud.certillion.com
   APP_URL=https://sistema.drwesleycamara.com.br
   ```
4. **Rebuild + restart**:
   ```bash
   docker compose -f /app/docker-compose.yml up -d --build glutec-backend glutec-frontend
   ```
5. **Smoke test**:
   - Abrir `https://sistema.drwesleycamara.com.br/assinaturas`
   - Preencher Certillion → **Salvar** → **Testar conexão** (deve retornar "client_token OK").

---

## Próximos passos (para a próxima IA)

- [ ] Plugar `<SignatureCertillionButton />` dentro de:
  - `client/src/pages/Prescricoes.tsx` (ao emitir receita)
  - `client/src/pages/Exames.tsx` (ao gerar pedido)
  - `client/src/pages/ProntuarioDetalhe.tsx` (evolução clínica, atestados)
  - Passar `documentType`, `documentId`, `documentAlias`, `documentContent` (texto final do doc) e `signerCpf` do usuário logado.
- [ ] Testar fluxo real com um certificado VIDaaS ou BirdID cadastrado no CPF do Dr. Wesley.
- [ ] Implementar `findPscAccounts` na UI (para mostrar quais certificados o CPF tem antes de iniciar).
- [ ] Listar sessões de assinatura históricas por documento (`signature_sessions` já tem tudo).

---

## Fluxo técnico (resumo)

```
Frontend                    Backend                     Certillion              PSC (VIDaaS/BirdID)
   │                           │                            │                         │
   │ sha256(content) ─────────▶│                            │                         │
   │                           │ createSession              │                         │
   │                           │ buildAuthorizeUrl (PKCE) ──▶                         │
   │◀── { authorizeUrl, qr } ──│                            │                         │
   │                           │                            │                         │
   │ window.open(authorizeUrl) ─────────────────────────────▶ redirect ──────────────▶│
   │                           │                            │    usuário autentica    │
   │                           │                            │◀── code ────────────────│
   │                           │◀── /api/certillion/callback?code=...&state=...       │
   │                           │ exchangeCode ──────────────▶                         │
   │                           │ signHashes ────────────────▶                         │
   │                           │◀── CMS base64 ──────────────                         │
   │                           │ applyDocumentSignature()   │                         │
   │◀── postMessage CERTILLION_DONE                                                    │
   │   (+ polling a cada 3s)                                                           │
```

---

## Segurança

- `client_secret` é criptografado com `encryptSensitiveValue` antes de ir pro MySQL.
- `code_verifier` (PKCE) gerado no backend, armazenado na sessão, nunca exposto pro frontend.
- `stateNonce` (24 bytes hex) impede CSRF.
- Sessões expiram em 10 min (`expiresInSeconds: 600`).
- Callback valida `state` e `userId` antes de fazer exchange.

---

## Comandos úteis

```bash
# Ver sessões Certillion pendentes
docker exec -it glutec-mysql mysql -uroot -p$MYSQL_ROOT_PASSWORD glutec -e \
  "SELECT id, userId, psc, status, LEFT(documentAlias,40) alias, expiresAt FROM signature_sessions WHERE provider='certillion' ORDER BY id DESC LIMIT 20;"

# Tail backend logs filtrando Certillion
docker logs -f glutec-backend 2>&1 | grep -i certillion
```
