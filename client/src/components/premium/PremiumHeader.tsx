import React, { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { ThemeToggle } from '../ThemeToggle';

interface PremiumHeaderProps {
  title?: string;
  breadcrumbs?: Array<{ label: string; path?: string }>;
  actions?: ReactNode;
  logo?: ReactNode;
}

/**
 * Componente Header Premium com navegação e controles
 * Segue o padrão visual das imagens de referência
 */
export function PremiumHeader({
  title,
  breadcrumbs,
  actions,
  logo,
}: PremiumHeaderProps) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-gold bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/60">
      <div className="flex h-16 items-center justify-between px-6 gap-4">
        {/* Logo e Breadcrumbs */}
        <div className="flex items-center gap-4 flex-1 min-w-0">
          {logo && <div className="flex items-center">{logo}</div>}
          
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav className="flex items-center gap-2 text-sm">
              {breadcrumbs.map((crumb, index) => (
                <React.Fragment key={index}>
                  {index > 0 && (
                    <ChevronRight
                      size={16}
                      className="text-text-tertiary flex-shrink-0"
                    />
                  )}
                  <span
                    className={`
                      ${
                        index === breadcrumbs.length - 1
                          ? 'text-text-primary font-medium'
                          : 'text-text-secondary hover:text-accent cursor-pointer transition-colors'
                      }
                    `}
                  >
                    {crumb.label}
                  </span>
                </React.Fragment>
              ))}
            </nav>
          )}

          {title && !breadcrumbs && (
            <h1 className="text-lg font-semibold text-text-primary truncate">
              {title}
            </h1>
          )}
        </div>

        {/* Ações e Controles */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {actions}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

export default PremiumHeader;
