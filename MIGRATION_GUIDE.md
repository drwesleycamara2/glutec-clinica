# Guia de Migração - Design Premium

Este guia explica como migrar as páginas existentes para usar o novo Design System Premium com componentes estilizados.

## Visão Geral

O projeto agora possui um **Design System Premium** completo com:
- Componentes reutilizáveis (`PremiumButton`, `PremiumCard`, `PremiumInput`, etc.)
- Variáveis CSS para tema claro/escuro
- Suporte a alternância de tema com persistência
- Efeitos metálicos dourados em todos os componentes

## Passos para Migração

### 1. Importar Componentes Premium

Substitua os imports dos componentes UI padrão pelos componentes premium:

```tsx
// ❌ Antes
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// ✅ Depois
import { PremiumButton, PremiumCard, PremiumInput } from "@/components/premium";
```

### 2. Atualizar Botões

```tsx
// ❌ Antes
<Button variant="outline" size="sm">
  Ação
</Button>

// ✅ Depois
<PremiumButton variant="outline" size="sm">
  Ação
</PremiumButton>
```

**Variantes disponíveis:**
- `primary` - Dourado metálico (padrão)
- `secondary` - Fundo claro/escuro
- `outline` - Apenas borda

**Tamanhos:**
- `sm` - Pequeno
- `md` - Médio (padrão)
- `lg` - Grande

**Props úteis:**
- `icon` - Adicionar ícone
- `iconPosition` - `'left'` ou `'right'`
- `fullWidth` - Ocupar largura total
- `loading` - Estado de carregamento

### 3. Atualizar Cards

```tsx
// ❌ Antes
<Card className="border shadow-sm">
  <CardHeader>
    <CardTitle>Título</CardTitle>
  </CardHeader>
  <CardContent>
    Conteúdo
  </CardContent>
</Card>

// ✅ Depois
<PremiumCard borderGold glowEffect>
  <h2 className="text-lg font-semibold">Título</h2>
  <p>Conteúdo</p>
</PremiumCard>
```

**Props:**
- `borderGold` - Adicionar borda dourada (padrão: true)
- `glowEffect` - Adicionar efeito de brilho (padrão: false)
- `hover` - Ativar efeito hover (padrão: true)

### 4. Atualizar Inputs

```tsx
// ❌ Antes
<Input
  type="text"
  placeholder="Digite..."
/>

// ✅ Depois
<PremiumInput
  label="Campo"
  placeholder="Digite..."
  icon={<Search />}
  error={errors.field}
  helperText="Texto de ajuda"
/>
```

### 5. Usar Classes CSS Diretas

Para elementos que não possuem componentes premium, use as classes CSS:

```tsx
// Cards com efeito premium
<div className="card-premium border-gold hover:border-gold-hover">
  Conteúdo
</div>

// Botões com gradiente dourado
<button className="btn-primary">Ação</button>

// Inputs com bordas douradas
<input className="input-premium" />

// Sidebar items
<button className="sidebar-item active">Menu</button>

// Badges
<span className="badge-premium">Badge</span>
```

### 6. Usar Variáveis CSS

Para cores e espaçamentos, use as variáveis CSS:

```tsx
<div style={{
  backgroundColor: 'var(--background)',
  color: 'var(--text-primary)',
  padding: 'var(--spacing-lg)',
  borderColor: 'var(--border)',
}}>
  Conteúdo
</div>
```

**Variáveis principais:**
- `--background` - Fundo principal
- `--surface` - Superfícies (cards)
- `--text-primary` - Texto principal
- `--text-secondary` - Texto secundário
- `--accent` - Dourado base
- `--accent-light` - Dourado suave
- `--border` - Bordas
- `--shadow-md` - Sombra média
- `--transition-base` - Transição padrão

### 7. Atualizar Textos

Use classes de texto que respeitam o tema:

```tsx
// ❌ Antes
<h1 className="text-foreground">Título</h1>
<p className="text-muted-foreground">Subtítulo</p>

// ✅ Depois
<h1 className="text-text-primary">Título</h1>
<p className="text-text-secondary">Subtítulo</p>
```

**Classes de texto:**
- `text-text-primary` - Texto principal
- `text-text-secondary` - Texto secundário
- `text-text-tertiary` - Texto terciário
- `text-text-muted` - Texto muted

### 8. Adicionar Tema Toggle

Adicione o alternador de tema em um local visível (ex: header):

```tsx
import { ThemeToggle } from '@/components/ThemeToggle';

<header>
  {/* ... outros elementos ... */}
  <ThemeToggle />
</header>
```

## Exemplo Completo de Migração

### Antes (Página Padrão)
```tsx
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function Exemplo() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-foreground">Título</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>Card</CardTitle>
        </CardHeader>
        <CardContent>
          <Input placeholder="Digite..." />
          <Button>Enviar</Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

### Depois (Página Premium)
```tsx
import { PremiumButton, PremiumCard, PremiumInput } from "@/components/premium";

export default function Exemplo() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold text-text-primary">Título</h1>
      
      <PremiumCard borderGold>
        <h2 className="text-lg font-semibold text-text-primary mb-4">Card</h2>
        <PremiumInput placeholder="Digite..." />
        <PremiumButton className="mt-4">Enviar</PremiumButton>
      </PremiumCard>
    </div>
  );
}
```

## Checklist de Migração

Para cada página, verifique:

- [ ] Botões migrados para `PremiumButton`
- [ ] Cards migrados para `PremiumCard`
- [ ] Inputs migrados para `PremiumInput`
- [ ] Cores usando variáveis CSS
- [ ] Textos usando classes `text-text-*`
- [ ] Testado em tema claro
- [ ] Testado em tema escuro
- [ ] Testado em mobile
- [ ] Sem erros de console

## Ordem Recomendada de Migração

1. **Dashboard** ✅ (já migrado em `Dashboard.premium.tsx`)
2. **Pacientes** - Página crítica
3. **Agenda** - Página crítica
4. **Prontuários** - Página crítica
5. **Assinaturas** - Página importante
6. **Financeiro** - Página importante
7. Demais páginas

## Dicas Importantes

### 1. Preserve a Funcionalidade
Não altere a lógica, apenas o visual. Todos os dados e comportamentos devem permanecer iguais.

### 2. Teste Completamente
Teste cada página em:
- Tema claro
- Tema escuro
- Desktop (1920px)
- Tablet (768px)
- Mobile (375px)

### 3. Mantenha Consistência
Use sempre os mesmos componentes e classes CSS. Não crie variações personalizadas.

### 4. Respeite Espaçamentos
Use as variáveis de spacing definidas (`var(--spacing-sm)`, `var(--spacing-md)`, etc.)

### 5. Acessibilidade
Mantenha:
- Bom contraste de cores
- Foco visível
- Texto descritivo em botões
- Labels em inputs

## Troubleshooting

### Cores não aparecem corretamente
- Verifique se o tema está sendo aplicado (classe `dark` no `<html>`)
- Confirme que as variáveis CSS estão definidas em `theme.css`

### Componentes parecem diferentes em claro/escuro
- Verifique os valores das variáveis CSS para ambos os temas
- Teste com `ThemeToggle` para alternar

### Build falha
- Verifique imports dos componentes
- Confirme que os arquivos estão no diretório correto
- Execute `pnpm install` se necessário

## Suporte

Para dúvidas ou problemas:
1. Consulte `DESIGN_SYSTEM.md` para detalhes dos componentes
2. Verifique `Dashboard.premium.tsx` como exemplo
3. Revise as variáveis CSS em `theme.css`

---

**Última atualização:** 17 de março de 2026
