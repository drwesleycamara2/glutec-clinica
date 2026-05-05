/**
 * PatientAutocomplete — campo de busca com sugestões em tempo real.
 *
 * Aceita digitação parcial de nome, número de prontuário ou telefone. As
 * sugestões priorizam quem começa o **primeiro nome** com a query (ex.:
 * digitando "LET", aparece primeiro "Letícia Maria" e depois "Ana Letícia").
 *
 * Usa o procedure `trpc.patientSearch.autocomplete`, que já está implementado
 * no backend e ordena pelo prefixo do fullName.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Loader2, Search, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { patientDisplayName } from "@/lib/patientDisplay";

export type AutocompletePatient = {
  id: number;
  fullName?: string | null;
  recordNumber?: number | null;
  cpf?: string | null;
  phone?: string | null;
  email?: string | null;
};

type Props = {
  value: AutocompletePatient | null;
  onSelect: (patient: AutocompletePatient | null) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Limite de sugestões (default 12) */
  limit?: number;
  /** Renderiza o input cheio (w-full); permite o consumidor controlar o wrapper. */
  className?: string;
  /** Texto exibido quando nenhuma busca tem resultado. */
  emptyLabel?: string;
  disabled?: boolean;
};

function useDebounced<T>(value: T, delay = 220): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function maskPhone(value?: string | null): string {
  if (!value) return "";
  const digits = String(value).replace(/\D+/g, "");
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return String(value);
}

export function PatientAutocomplete({
  value,
  onSelect,
  placeholder = "Digite nome, número de prontuário ou telefone…",
  autoFocus,
  limit = 12,
  className,
  emptyLabel = "Nenhum paciente encontrado.",
  disabled,
}: Props) {
  const [query, setQuery] = useState(value ? patientDisplayName(value as any) : "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debouncedQuery = useDebounced(query, 220);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Mantém o input em sincronia quando o valor é trocado externamente
  useEffect(() => {
    if (value) {
      setQuery(patientDisplayName(value as any));
    } else {
      setQuery("");
    }
  }, [value?.id]);

  const trimmed = debouncedQuery.trim();
  const enabled = trimmed.length >= 2 && !disabled;

  const suggestionsQuery = trpc.patientSearch.autocomplete.useQuery(
    { query: trimmed, limit },
    { enabled, staleTime: 5 * 1000 },
  );

  const suggestions = useMemo(() => {
    return (suggestionsQuery.data ?? []) as AutocompletePatient[];
  }, [suggestionsQuery.data]);

  // Fecha ao clicar fora
  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const handleSelect = (patient: AutocompletePatient) => {
    onSelect(patient);
    setQuery(patientDisplayName(patient as any));
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleClear = () => {
    onSelect(null);
    setQuery("");
    setActiveIndex(-1);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (!suggestions.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(suggestions.length - 1, current + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(0, current - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = activeIndex >= 0 ? suggestions[activeIndex] : suggestions[0];
      if (target) handleSelect(target);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className={`relative ${className ?? ""}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        autoFocus={autoFocus}
        disabled={disabled}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          if (value) onSelect(null);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="pl-9 pr-9"
        autoComplete="off"
      />
      {query && !disabled ? (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground"
          aria-label="Limpar busca"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}

      {open && enabled ? (
        <div
          role="listbox"
          className="absolute left-0 top-full z-50 mt-2 w-full overflow-hidden rounded-xl border border-border bg-background shadow-lg ring-1 ring-black/5"
          style={{ maxHeight: "22rem", overflowY: "auto" }}
        >
          {suggestionsQuery.isFetching && suggestions.length === 0 ? (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Buscando…
            </div>
          ) : null}

          {!suggestionsQuery.isFetching && suggestions.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">{emptyLabel}</div>
          ) : null}

          {suggestions.map((patient, index) => (
            <button
              type="button"
              key={patient.id}
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => handleSelect(patient)}
              className={`flex w-full flex-col items-start gap-0.5 border-b border-border/50 px-4 py-2.5 text-left transition-colors last:border-b-0 ${
                index === activeIndex ? "bg-muted" : "hover:bg-muted/50"
              }`}
            >
              <div className="flex w-full items-center justify-between gap-3">
                <span className="truncate text-sm font-semibold text-foreground">
                  {patientDisplayName(patient as any)}
                </span>
                {patient.recordNumber ? (
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                    Nº {patient.recordNumber}
                  </span>
                ) : null}
              </div>
              <div className="flex w-full flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                {patient.phone ? <span>{maskPhone(patient.phone)}</span> : null}
                {patient.cpf ? <span className="font-mono">{patient.cpf}</span> : null}
                {patient.email ? <span className="truncate">{patient.email}</span> : null}
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
