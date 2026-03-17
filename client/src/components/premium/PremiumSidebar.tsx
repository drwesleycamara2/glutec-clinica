import React, { ReactNode } from 'react';

interface SidebarItemProps {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
  badge?: string | number;
}

interface PremiumSidebarProps {
  items: SidebarItemProps[];
  header?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/**
 * Componente Sidebar Premium com itens estilizados
 * Segue o padrão visual das imagens de referência
 */
export function PremiumSidebar({
  items,
  header,
  footer,
  className = '',
}: PremiumSidebarProps) {
  return (
    <aside
      className={`
        sidebar-premium
        flex flex-col h-full
        ${className}
      `}
    >
      {/* Header */}
      {header && (
        <div className="border-b border-gold p-4">
          {header}
        </div>
      )}

      {/* Menu Items */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {items.map((item, index) => (
          <div key={index} className="relative">
            <button
              onClick={item.onClick}
              className={`
                sidebar-item
                w-full
                ${item.active ? 'active' : ''}
              `}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              <span className="flex-1 text-left truncate">{item.label}</span>
              {item.badge && (
                <span className="badge-premium flex-shrink-0">
                  {item.badge}
                </span>
              )}
            </button>
          </div>
        ))}
      </nav>

      {/* Footer */}
      {footer && (
        <div className="border-t border-gold p-4">
          {footer}
        </div>
      )}
    </aside>
  );
}

export default PremiumSidebar;
