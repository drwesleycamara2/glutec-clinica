import React, { InputHTMLAttributes, ReactNode } from 'react';

interface PremiumInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
  iconPosition?: 'left' | 'right';
  helperText?: string;
}

/**
 * Componente Input Premium com bordas douradas e efeito de foco
 * Segue o padrão visual das imagens de referência
 */
export function PremiumInput({
  label,
  error,
  icon,
  iconPosition = 'left',
  helperText,
  className = '',
  ...props
}: PremiumInputProps) {
  return (
    <div className="w-full flex flex-col gap-2">
      {label && (
        <label className="text-sm font-medium text-text-primary">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && iconPosition === 'left' && (
          <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-accent pointer-events-none">
            {icon}
          </div>
        )}
        <input
          className={`
            input-premium
            ${icon && iconPosition === 'left' ? 'pl-10' : ''}
            ${icon && iconPosition === 'right' ? 'pr-10' : ''}
            ${error ? 'border-red-500' : ''}
            ${className}
          `}
          {...props}
        />
        {icon && iconPosition === 'right' && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-accent pointer-events-none">
            {icon}
          </div>
        )}
      </div>
      {error && (
        <p className="text-sm text-red-500 font-medium">{error}</p>
      )}
      {helperText && !error && (
        <p className="text-sm text-text-tertiary">{helperText}</p>
      )}
    </div>
  );
}

export default PremiumInput;
