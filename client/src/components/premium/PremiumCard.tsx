import React, { ReactNode } from 'react';

interface PremiumCardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  glowEffect?: boolean;
  borderGold?: boolean;
}

/**
 * Componente Card Premium com efeitos de vidro e dourado metálico
 * Segue o padrão visual das imagens de referência
 */
export function PremiumCard({
  children,
  className = '',
  hover = true,
  glowEffect = false,
  borderGold = true,
}: PremiumCardProps) {
  return (
    <div
      className={`
        card-premium
        ${borderGold ? 'border-gold' : ''}
        ${hover ? 'hover:border-gold-hover' : ''}
        ${glowEffect ? 'glow-gold' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
}

export default PremiumCard;
