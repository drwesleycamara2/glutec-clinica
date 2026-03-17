# Design System Premium - Glutec Clínica

## Visão Geral

O Design System Premium foi criado para oferecer uma experiência visual luxuosa, sofisticada e memorável, seguindo fielmente as referências visuais aprovadas.

## Paleta de Cores

### Dourado Metálico (Obrigatório em Todos os Temas)
- **Gold Deep**: `#8A6526` - Sombra e profundidade
- **Gold Base**: `#C9A55B` - Cor principal (botões, ícones, bordas)
- **Gold Soft**: `#E8D29B` - Destaques suaves
- **Gold Light**: `#F1D791` - Brilhos

### Preto/Branco
- **Black Rich**: `#050505` - Fundo escuro profundo
- **Black Panel**: `#111214` - Painéis em tema escuro
- **Off-White**: `#F7F4EE` - Fundo claro refinado
- **White Soft**: `#FCFBF8` - Painéis em tema claro

### Cinza Premium
- **Gray Dark**: `#2F2F2F` - Texto secundário (claro)
- **Gray Medium**: `#6B6B6B` - Texto terciário
- **Gray Light**: `#D3D3D3` - Bordas (claro)

## Temas

### Tema Claro (Light Mode)
- **Fundo Principal**: Off-white refinado (`#F7F4EE`)
- **Superfícies**: Branco pérola (`#FCFBF8`)
- **Texto Principal**: Preto (`#050505`)
- **Texto Secundário**: Cinza escuro (`#2F2F2F`)
- **Acentos**: Dourado metálico (`#C9A55B`)

### Tema Escuro (Dark Mode)
- **Fundo Principal**: Preto profundo (`#050505`)
- **Superfícies**: Grafite (`#111214`)
- **Texto Principal**: Branco suave (`#FFFFFF`)
- **Texto Secundário**: Cinza claro (`#D3D3D3`)
- **Acentos**: Dourado metálico (`#C9A55B`)

## Componentes Premium

### 1. PremiumCard
Card com bordas douradas e efeito de vidro.

```tsx
import { PremiumCard } from '@/components/premium';

<PremiumCard borderGold glowEffect>
  <h3>Título</h3>
  <p>Conteúdo</p>
</PremiumCard>
```

**Props:**
- `borderGold`: Adiciona borda dourada (padrão: true)
- `glowEffect`: Adiciona efeito de brilho dourado (padrão: false)
- `hover`: Ativa efeito de hover (padrão: true)
- `className`: Classes CSS adicionais

### 2. PremiumButton
Botão com gradiente dourado metálico.

```tsx
import { PremiumButton } from '@/components/premium';

<PremiumButton variant="primary" size="lg" icon={<Plus />}>
  Novo Paciente
</PremiumButton>
```

**Props:**
- `variant`: `'primary'` | `'secondary'` | `'outline'` (padrão: 'primary')
- `size`: `'sm'` | `'md'` | `'lg'` (padrão: 'md')
- `icon`: Ícone a exibir
- `iconPosition`: `'left'` | `'right'` (padrão: 'left')
- `fullWidth`: Ocupar largura total
- `loading`: Estado de carregamento

### 3. PremiumInput
Input com bordas douradas e foco premium.

```tsx
import { PremiumInput } from '@/components/premium';

<PremiumInput
  label="Nome do Paciente"
  placeholder="Digite o nome..."
  icon={<User />}
  error={errors.name}
/>
```

**Props:**
- `label`: Rótulo do campo
- `error`: Mensagem de erro
- `icon`: Ícone a exibir
- `iconPosition`: `'left'` | `'right'` (padrão: 'left')
- `helperText`: Texto de ajuda

### 4. PremiumHeader
Header com navegação e controles.

```tsx
import { PremiumHeader } from '@/components/premium';

<PremiumHeader
  title="Dashboard"
  breadcrumbs={[
    { label: 'Home', path: '/' },
    { label: 'Dashboard' }
  ]}
  actions={<PremiumButton>Ação</PremiumButton>}
/>
```

### 5. PremiumSidebar
Sidebar com menu itens estilizados.

```tsx
import { PremiumSidebar } from '@/components/premium';

<PremiumSidebar
  items={[
    { icon: <Home />, label: 'Dashboard', active: true },
    { icon: <Users />, label: 'Pacientes', badge: 5 }
  ]}
/>
```

### 6. PremiumStatCard
Card de métrica com ícone dourado.

```tsx
import { PremiumStatCard } from '@/components/premium';

<PremiumStatCard
  title="Total de Pacientes"
  value={245}
  icon={<Users />}
  change={{ value: 12, trend: 'up' }}
/>
```

## Variáveis CSS

Todas as cores estão disponíveis como variáveis CSS:

```css
/* Cores */
var(--background)
var(--surface)
var(--text-primary)
var(--text-secondary)
var(--accent)
var(--accent-light)
var(--accent-dark)

/* Sombras */
var(--shadow-sm)
var(--shadow-md)
var(--shadow-lg)
var(--shadow-gold-glow)

/* Transições */
var(--transition-fast)
var(--transition-base)
var(--transition-slow)
```

## Gradientes Metálicos

### Gradiente Principal
```css
background: linear-gradient(135deg, #8A6526 0%, #C9A55B 30%, #F1D791 50%, #B8863B 75%, #8A6526 100%);
```

### Gradiente Suave
```css
background: linear-gradient(135deg, #C9A55B 0%, #E8D29B 50%, #C9A55B 100%);
```

### Gradiente Glow
```css
background: radial-gradient(circle, rgba(249, 215, 145, 0.4) 0%, rgba(201, 165, 91, 0.2) 100%);
```

## Alternador de Tema

O sistema detecta automaticamente a preferência do usuário e permite alternância manual.

```tsx
import { ThemeToggle } from '@/components/ThemeToggle';

<ThemeToggle />
```

A preferência é salva em localStorage e reaplicada automaticamente.

## Microinterações

### Hover
- Bordas mudam para dourado
- Sombra aumenta
- Fundo muda sutilmente

### Focus
- Ring de foco em dourado
- Outline visível para acessibilidade

### Active
- Fundo com cor de ativo
- Borda dourada forte

## Responsividade

Todos os componentes são responsivos e funcionam perfeitamente em:
- Desktop (1920px+)
- Notebook (1024px - 1919px)
- Tablet (768px - 1023px)
- Smartphone (< 768px)

## Boas Práticas

1. **Use PremiumButton para ações principais** - Sempre use o componente premium para botões de destaque
2. **Mantenha a consistência de cores** - Não adicione cores fora da paleta definida
3. **Respeite os espaçamentos** - Use as variáveis de spacing definidas
4. **Teste em ambos os temas** - Verifique que os componentes funcionam bem em claro e escuro
5. **Acessibilidade** - Mantenha bom contraste e foco visível

## Arquivos Principais

- `/client/src/styles/design-tokens.ts` - Tokens de design
- `/client/src/styles/theme.css` - Estilos de tema
- `/client/src/_core/hooks/useTheme.ts` - Hook de tema
- `/client/src/components/premium/` - Componentes premium

## Suporte

Para dúvidas ou sugestões sobre o design system, consulte a documentação dos componentes ou entre em contato com o time de design.
