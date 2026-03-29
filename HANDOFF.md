# HANDOFF – Glutec Clínica – Continuação do Projeto

> **Gerado em:** 2026-03-29
> **Para:** IA que irá continuar o trabalho
> **Repositório:** https://github.com/drwesleycamara2/glutec-clinica

---

## 1. VISÃO GERAL DO PROJETO

Sistema clínico chamado **"Clinica Glutee"** (antes "Glutec Sistema") rodando num VPS Hostgator Ubuntu 22.04.5, IP `129.121.52.61`, acessível em:

**https://sistema.drwesleycamara.com.br**

Stack: React + Vite + Tailwind CSS + shadcn/ui, com Docker multi-stage build (`node:22-alpine` → `pnpm build` → `nginx:alpine`). O VPS roda 4 containers Docker. O código-fonte está em `/app/glutec-clinica-repo/` no VPS.

---

## 2. ACESSO AO VPS

O acesso ao VPS é feito **exclusivamente via noVNC** (browser automation), pois o ambiente de trabalho da IA não tem acesso SSH direto. A URL de noVNC expira e precisa de um novo token a cada sessão.

- **IP do VPS:** `129.121.52.61`
- **Painel Hostgator:** Acesse para gerar novo token noVNC
- **Usuário root** no terminal bash

### PROBLEMA CRÍTICO – CapsLock travado ON

No QEMU/kernel do VPS, o CapsLock está permanentemente ativado e **não pode ser desligado** (tentativas com `setleds -caps`, RFB keysym CapsLock, Chrome key – todas falharam).

**Workaround para digitar via RFB:**
- Letras minúsculas: enviar keysym maiúsculo (a→A, ks -= 32)
- Letras maiúsculas: enviar keysym minúsculo (A→a, ks += 32)
- Chars especiais shiftados (`{`, `}`, `"`, `@`, `#`, etc.) são **INDISPONÍVEIS**
- Usar `eval echo ... \`printf '\76'\` /file` para gerar `>` (redirect)
- Usar `\76\76` para `>>` e `\174` para `|`

### Função send() para noVNC (JavaScript no console do browser):

```javascript
// Passo 1 – capturar o WebSocket:
const origSend = WebSocket.prototype.send;
WebSocket.prototype.send = function(data) {
  if (data instanceof ArrayBuffer && data.byteLength > 0) window._vncWS = this;
  return origSend.call(this, data);
};
// Clicar na tela noVNC para ativar a captura, depois:

window.send = function(str) {
  const ws = window._vncWS;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    let ks = ch.charCodeAt(0);
    if (ch === '\n') ks = 0xff0d;
    else if (ch >= 'a' && ch <= 'z') ks -= 32;
    else if (ch >= 'A' && ch <= 'Z') ks += 32;
    const b = new ArrayBuffer(8), v = new DataView(b);
    v.setUint8(0,4); v.setUint8(1,1); v.setUint16(2,0); v.setUint32(4,ks);
    ws.send(b);
    const b2 = new ArrayBuffer(8), v2 = new DataView(b2);
    v2.setUint8(0,4); v2.setUint8(1,0); v2.setUint16(2,0); v2.setUint32(4,ks);
    ws.send(b2);
  }
  return str.length;
};
```

### Técnica para enviar scripts Python (hex encoding):

```javascript
// 1. Codificar o script em hex:
const script = `...código python...`;
let hex = '';
for (let i = 0; i < script.length; i++)
  hex += script.charCodeAt(i).toString(16).padStart(2,'0');
const chunks = [];
for (let i = 0; i < hex.length; i += 60)
  chunks.push(hex.substring(i, i + 60));
window._hexChunks = chunks;

// 2. Enviar chunks com delay de 800ms entre eles:
// Chunk 0:  eval echo HEX \`printf '\76'\` /tmp/h.txt
// Chunks 1+: eval echo HEX \`printf '\76\76'\` /tmp/h.txt

// 3. Converter e executar:
// eval xxd -r -p /tmp/h.txt \`printf '\76'\` /tmp/fix.py
// python3 /tmp/fix.py
```

**IMPORTANTE:** Delay mínimo de **800ms** entre chunks (300ms causa concatenação).

---

## 3. O QUE JÁ FOI FEITO ✅

### Arquivos criados no VPS

| Arquivo | Status |
|---------|--------|
| `/app/glutec-clinica-repo/client/public/logo-glutee.svg` | ✅ Logo SVG dourado |
| `/app/glutec-clinica-repo/client/public/logo-glutee-dark.svg` | ✅ Variante escura |
| `/app/glutec-clinica-repo/client/public/watermark-light.svg` | ✅ Marca d'água clara |
| `/app/glutec-clinica-repo/client/public/watermark-dark.svg` | ✅ Marca d'água escura |
| `/app/glutec-clinica-repo/client/src/contexts/ThemeContext.tsx` | ✅ Sistema de tema (localStorage: `glutee-theme`) |
| `/app/glutec-clinica-repo/client/src/components/ThemeProvider.tsx` | ✅ Provider |
| `/app/glutec-clinica-repo/client/src/components/ThemeToggle.tsx` | ✅ Botão toggle (gradiente dourado) |
| `/app/glutec-clinica-repo/client/src/App.tsx` | ✅ Envolvido com ThemeProvider |
| `/app/glutec-clinica-repo/client/src/index.css` | ✅ Variáveis CSS dark mode |

### DashboardLayout.tsx – parcialmente feito

- ✅ Import adicionado: `import { ThemeToggle } from "@/components/ThemeToggle";`
- ❌ JSX do ThemeToggle **NÃO adicionado ainda**

---

## 4. O QUE FALTA FAZER

### PASSO 1 – Adicionar ThemeToggle JSX no DashboardLayout.tsx

Rodar este script Python no VPS via técnica hex:

```python
p='/app/glutec-clinica-repo/client/src/components/DashboardLayout.tsx'
t=open(p).read()
old='<main className="flex-1 p-4">{children}</main>'
new='<div className="flex items-center justify-end p-2 border-b"><ThemeToggle /></div>\n            <main className="flex-1 p-4">{children}</main>'
t=t.replace(old,new)
open(p,'w').write(t)
print('done2')
```

Verificar: `grep -c 'ThemeToggle' /app/.../DashboardLayout.tsx` → deve retornar `2`

### PASSO 2 – Rebuild Docker frontend

```bash
cd /app/glutec-clinica-repo
docker compose build glutec-frontend && docker compose up -d glutec-frontend
```

### PASSO 3 – Verificar o site em https://sistema.drwesleycamara.com.br

- [ ] Logo SVG aparece (não quebrado)
- [ ] Botão dark/light visível no header (gradiente dourado)
- [ ] Tema persiste via localStorage
- [ ] Login sempre em modo claro
- [ ] Ícones dos inputs não sobrepõem

### PASSO 4 (Opcional)

Verificar outros lugares com branding "Glutec Sistema" e substituir por "Clinica Glutee".

---

## 5. ESTRUTURA DO PROJETO NO VPS

```
/app/glutec-clinica-repo/
├── client/
│   ├── public/
│   │   ├── logo-glutee.svg          ✅
│   │   ├── logo-glutee-dark.svg     ✅
│   │   ├── watermark-light.svg      ✅
│   │   └── watermark-dark.svg       ✅
│   └── src/
│       ├── App.tsx                  ✅ ThemeProvider adicionado
│       ├── index.css                ✅ vars dark mode
│       ├── contexts/
│       │   └── ThemeContext.tsx     ✅
│       └── components/
│           ├── ThemeProvider.tsx    ✅
│           ├── ThemeToggle.tsx      ✅
│           └── DashboardLayout.tsx  ⚠️ import OK, JSX pendente
└── docker-compose.yml
```

---

## 6. NOTAS TÉCNICAS

- **Docker container frontend:** `glutec-frontend`
- **localStorage key do tema:** `glutee-theme` (valores: `'dark'` | `'light'`)
- **Login:** sempre light mode (não usa ThemeProvider)
- **O send() funciona** – foi testado e confirmado com `echo ok` retornando "ok"
- **Delay mínimo entre chunks:** 800ms (300ms causa falha)

---

*Handoff gerado em 2026-03-29 para continuação por outra IA.*