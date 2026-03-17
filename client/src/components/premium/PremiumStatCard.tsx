import React, { ReactNode } from 'react';

interface PremiumStatCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  change?: {
    value: number;
    trend: 'up' | 'down';
  };
  description?: string;
  className?: string;
}

/**
 * Componente StatCard Premium para exibir métricas
 * Segue o padrão visual das imagens de referência
 */
export function PremiumStatCard({
  title,
  value,
  icon,
  change,
  description,
  className = '',
}: PremiumStatCardProps) {
  return (
    <div
      className={`
        card-premium
        border-gold
        hover:border-gold-hover
        flex flex-col gap-4
        ${className}
      `}
    >
      {/* Header com Ícone */}
      <div className="flex items-start justify-between">
        <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-accent-hover">
          <div className="text-accent">{icon}</div>
        </div>
        {change && (
          <div
            className={`
              text-xs font-semibold px-2 py-1 rounded-full
              ${
                change.trend === 'up'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                  : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
              }
            `}
          >
            {change.trend === 'up' ? '+' : '-'}{Math.abs(change.value)}%
          </div>
        )}
      </div>

      {/* Conteúdo */}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-text-secondary">{title}</p>
        <p className="text-2xl font-bold text-text-primary">{value}</p>
        {description && (
          <p className="text-xs text-text-tertiary">{description}</p>
        )}
      </div>

      {/* Decoração */}
      <div className="h-1 w-full bg-gradient-gold-subtle rounded-full opacity-50 dark:opacity-40" />
    </div>
  );
}

export default PremiumStatCard;
