import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Star, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Icd10SearchProps {
  onSelect: (code: { id: number; code: string; description: string }) => void;
  selectedCode?: { id: number; code: string; description: string } | null;
  showFavorites?: boolean;
}

type Icd10Item = {
  id: number;
  code: string;
  description: string;
  descriptionAbbrev?: string | null;
};

function dedupeIcd10Items(items: Icd10Item[] = []) {
  const byCode = new Map<string, Icd10Item>();

  for (const item of items) {
    const codeKey = String(item?.code ?? "").trim().toUpperCase();
    const descriptionKey = String(item?.description ?? "").trim().toLocaleLowerCase("pt-BR");
    const key = codeKey || `${item?.id ?? ""}-${descriptionKey}`;
    if (!key) continue;

    const current = byCode.get(key);
    if (!current) {
      byCode.set(key, item);
      continue;
    }

    const currentDescription = String(current.description ?? "");
    const nextDescription = String(item.description ?? "");
    if (nextDescription.length > currentDescription.length || (current.id < 0 && item.id > 0)) {
      byCode.set(key, item);
    }
  }

  return Array.from(byCode.values());
}

export function Icd10Search({ onSelect, selectedCode, showFavorites = true }: Icd10SearchProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const normalizedQuery = query.trim();

  const { data: searchResults, isLoading: isSearching } = trpc.icd10.search.useQuery(
    { query: normalizedQuery, limit: 80 },
    { enabled: isOpen && normalizedQuery.length > 0 },
  );

  const { data: catalogItems, isLoading: isLoadingCatalog } = trpc.icd10.list.useQuery(
    { limit: 100 },
    { enabled: isOpen && normalizedQuery.length === 0 },
  );

  const utils = trpc.useUtils();
  const { data: serverFavorites } = trpc.icd10.getFavorites.useQuery();
  const defaultFavorites: Icd10Item[] = [
    { id: -1, code: "M79", description: "Outros transtornos dos tecidos moles, não classificados em outra parte" },
    { id: -2, code: "M62.5", description: "Atrofia e fadiga muscular, não classificadas em outra parte" },
    { id: -3, code: "M21", description: "Outras deformidades adquiridas dos membros" },
    { id: -4, code: "E88.1", description: "Lipodistrofia, não classificada em outra parte" },
    { id: -5, code: "R23.4", description: "Alterações da textura da pele" },
    { id: -6, code: "M62.8", description: "Outros transtornos musculares especificados" },
    { id: -7, code: "Z76.0", description: "Emissão de prescrição de repetição" },
  ];
  const favorites = dedupeIcd10Items(serverFavorites && serverFavorites.length > 0 ? serverFavorites : defaultFavorites);

  const addFavoriteMutation = trpc.icd10.addFavorite.useMutation({
    onSuccess: () => {
      void utils.icd10.getFavorites.invalidate();
      toast.success("CID adicionado aos seus favoritos.");
    },
    onError: (err) => toast.error(err.message || "Não foi possível favoritar o CID."),
  });
  const removeFavoriteMutation = trpc.icd10.removeFavorite.useMutation({
    onSuccess: () => {
      void utils.icd10.getFavorites.invalidate();
      toast.success("CID removido dos seus favoritos.");
    },
    onError: (err) => toast.error(err.message || "Não foi possível remover o CID."),
  });

  const catalogDisplayItems = dedupeIcd10Items(normalizedQuery.length > 0 ? searchResults || [] : catalogItems || []);
  const favoriteCodes = new Set(favorites.map((item) => String(item.code ?? "").trim().toUpperCase()).filter(Boolean));
  const nonFavoriteCatalogItems = catalogDisplayItems.filter((item) => !favoriteCodes.has(String(item.code ?? "").trim().toUpperCase()));
  const displayItems = dedupeIcd10Items(showFavorites ? [...favorites, ...nonFavoriteCatalogItems] : catalogDisplayItems);
  const favoriteCount = showFavorites ? favorites.length : 0;
  const loadingItems = isSearching || isLoadingCatalog;

  const handleToggleFavorite = (item: { id: number; code: string; description: string }) => {
    if (!item || item.id <= 0) return;
    const isFav = (serverFavorites ?? []).some((favorite) => favorite.id === item.id);
    if (isFav) {
      const ok = window.confirm(`Remover "${item.code} - ${item.description}" dos seus favoritos?`);
      if (!ok) return;
      removeFavoriteMutation.mutate({ icd10CodeId: item.id });
    } else {
      addFavoriteMutation.mutate({ icd10CodeId: item.id });
    }
  };

  const isFavorite = Boolean(
    selectedCode && selectedCode.id > 0 && (serverFavorites ?? []).some((favorite) => favorite.id === selectedCode.id),
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const updateDropdownPosition = () => {
      const rect = searchInputRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportPadding = 12;
      const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - viewportPadding);
      const spaceAbove = Math.max(0, rect.top - viewportPadding);
      const openAbove = spaceBelow < 260 && spaceAbove > spaceBelow;
      const maxHeight = Math.min(420, Math.max(180, (openAbove ? spaceAbove : spaceBelow) - 8));
      const width = Math.min(rect.width, window.innerWidth - viewportPadding * 2);
      setDropdownStyle({
        position: "fixed",
        left: Math.max(viewportPadding, rect.left),
        top: openAbove
          ? Math.max(viewportPadding, rect.top - maxHeight - 8)
          : Math.min(rect.bottom + 8, window.innerHeight - viewportPadding - maxHeight),
        width,
        maxHeight,
        zIndex: 2147483647,
      });
    };

    updateDropdownPosition();
    window.addEventListener("resize", updateDropdownPosition);
    window.addEventListener("scroll", updateDropdownPosition, true);
    return () => {
      window.removeEventListener("resize", updateDropdownPosition);
      window.removeEventListener("scroll", updateDropdownPosition, true);
    };
  }, [isOpen]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!isOpen) {
      if (event.key === "ArrowDown") {
        setIsOpen(true);
      }
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setSelectedIndex((current) => (current < displayItems.length - 1 ? current + 1 : current));
        break;
      case "ArrowUp":
        event.preventDefault();
        setSelectedIndex((current) => (current > 0 ? current - 1 : -1));
        break;
      case "Enter":
        event.preventDefault();
        if (selectedIndex >= 0 && displayItems[selectedIndex]) {
          handleSelect(displayItems[selectedIndex]);
        }
        break;
      case "Escape":
        event.preventDefault();
        setIsOpen(false);
        break;
    }
  };

  const handleSelect = (item: Icd10Item) => {
    onSelect(item);
    setIsOpen(false);
    setQuery("");
    setSelectedIndex(-1);
  };

  const renderDropdown = () => (
    <div
      ref={dropdownRef}
      style={dropdownStyle}
      className="overflow-y-auto overscroll-contain rounded-xl border border-border bg-background pr-1 shadow-2xl ring-1 ring-black/5"
    >
      {loadingItems ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : null}

      {!loadingItems && displayItems.length === 0 && normalizedQuery.length > 0 ? (
        <div className="p-4 text-center text-sm text-muted-foreground">Nenhum CID-10 encontrado para "{query}"</div>
      ) : null}

      {!loadingItems && displayItems.length === 0 && normalizedQuery.length === 0 ? (
        <div className="p-4 text-center text-sm text-muted-foreground">
          Nenhum CID-10 disponível. Comece a digitar para pesquisar por código ou descrição.
        </div>
      ) : null}

      {displayItems.map((item, index) => {
        const serverFavorite = (serverFavorites ?? []).some((favorite) => favorite.id === item.id);
        return (
          <div key={`${item.code}-${item.id}-${index}`}>
            {index === 0 && favoriteCount > 0 ? (
              <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                Favoritos
              </div>
            ) : null}
            {index === favoriteCount && displayItems.length > favoriteCount ? (
              <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                {normalizedQuery ? "Resultados da busca" : "Catálogo CID-10"}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => handleSelect(item)}
              className={cn(
                "w-full border-b border-border px-4 py-3 text-left transition-colors last:border-b-0",
                selectedIndex === index ? "bg-accent text-accent-foreground" : "hover:bg-muted",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <Badge variant="outline" className="mb-1 text-xs">
                    {item.code}
                  </Badge>
                  <p className="whitespace-normal text-sm font-medium leading-snug">{item.description}</p>
                  {item.descriptionAbbrev ? <p className="mt-0.5 text-xs text-muted-foreground">{item.descriptionAbbrev}</p> : null}
                </div>
                {showFavorites && item.id > 0 ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleToggleFavorite(item);
                    }}
                    title={serverFavorite ? "Remover dos favoritos" : "Favoritar CID"}
                    className={cn(
                      "mt-1 shrink-0 transition-colors",
                      serverFavorite ? "text-amber-500 hover:text-amber-600" : "text-muted-foreground hover:text-amber-500",
                    )}
                    disabled={addFavoriteMutation.isPending || removeFavoriteMutation.isPending}
                  >
                    <Star className="h-4 w-4" fill={serverFavorite ? "currentColor" : "none"} />
                  </button>
                ) : null}
                {showFavorites && item.id < 0 ? <Star className="mt-1 h-4 w-4 text-amber-500" fill="currentColor" /> : null}
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchInputRef}
          type="text"
          placeholder="Buscar CID-10 por código ou descrição..."
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
            setSelectedIndex(-1);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          className="pl-9"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setIsOpen(true);
              setSelectedIndex(-1);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {selectedCode && selectedCode.code ? (
        <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/20">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <Badge variant="outline" className="mb-1">
                {selectedCode.code}
              </Badge>
              <p className="text-sm text-foreground">{selectedCode.description}</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                title={isFavorite ? "Remover dos favoritos" : "Adicionar aos meus favoritos"}
                onClick={() => handleToggleFavorite(selectedCode)}
                className={cn(
                  "mt-1 transition-colors",
                  isFavorite ? "text-amber-500 hover:text-amber-600" : "text-muted-foreground hover:text-amber-500",
                )}
                disabled={selectedCode.id <= 0 || addFavoriteMutation.isPending || removeFavoriteMutation.isPending}
              >
                <Star className="h-4 w-4" fill={isFavorite ? "currentColor" : "none"} />
              </button>
              <button
                type="button"
                onClick={() => {
                  onSelect({ id: 0, code: "", description: "" });
                  setQuery("");
                }}
                className="mt-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isOpen && typeof document !== "undefined" ? createPortal(renderDropdown(), document.body) : null}
    </div>
  );
}
