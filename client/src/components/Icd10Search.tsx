import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Star, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Icd10SearchProps {
  onSelect: (code: { id: number; code: string; description: string }) => void;
  selectedCode?: { id: number; code: string; description: string } | null;
  showFavorites?: boolean;
}

export function Icd10Search({ onSelect, selectedCode, showFavorites = true }: Icd10SearchProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: searchResults, isLoading: isSearching } = trpc.icd10.search.useQuery(
    { query, limit: 10 },
    { enabled: query.length > 0 }
  );

  const utils = trpc.useUtils();
  const { data: serverFavorites } = trpc.icd10.getFavorites.useQuery();
  const defaultFavorites = [
    { id: -1, code: "M79", description: "Outros transtornos dos tecidos moles, não classificados em outra parte" },
    { id: -2, code: "M62.5", description: "Atrofia e fadiga muscular, não classificadas em outra parte" },
    { id: -3, code: "M21", description: "Outras deformidades adquiridas dos membros" },
    { id: -4, code: "E88.1", description: "Lipodistrofia, não classificada em outra parte" },
    { id: -5, code: "R23.4", description: "Alterações da textura da pele" },
    { id: -6, code: "M62.8", description: "Outros transtornos musculares especificados" },
    { id: -7, code: "Z76.0", description: "Emissão de prescrição de repetição" },
  ];
  const favorites = serverFavorites && serverFavorites.length > 0 ? serverFavorites : defaultFavorites;
  const addFavoriteMutation = trpc.icd10.addFavorite.useMutation({
    onSuccess: () => {
      utils.icd10.getFavorites.invalidate();
      toast.success("CID adicionado aos seus favoritos.");
    },
    onError: (err) => toast.error(err.message || "Não foi possível favoritar o CID."),
  });
  const removeFavoriteMutation = trpc.icd10.removeFavorite.useMutation({
    onSuccess: () => {
      utils.icd10.getFavorites.invalidate();
      toast.success("CID removido dos seus favoritos.");
    },
    onError: (err) => toast.error(err.message || "Não foi possível remover o CID."),
  });

  const handleToggleFavorite = (item: { id: number; code: string; description: string }) => {
    if (!item || item.id <= 0) return;
    const isFav = (serverFavorites ?? []).some((f) => f.id === item.id);
    if (isFav) {
      const ok = window.confirm(
        `Remover "${item.code} - ${item.description}" dos seus favoritos?`,
      );
      if (!ok) return;
      removeFavoriteMutation.mutate({ icd10CodeId: item.id });
    } else {
      addFavoriteMutation.mutate({ icd10CodeId: item.id });
    }
  };

  const isFavorite =
    selectedCode &&
    selectedCode.id > 0 &&
    (serverFavorites ?? []).some((f) => f.id === selectedCode.id);

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "ArrowDown") {
        setIsOpen(true);
      }
      return;
    }

    const items = query.length > 0 ? searchResults || [] : favorites || [];

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => (prev < items.length - 1 ? prev + 1 : prev));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && items[selectedIndex]) {
          onSelect(items[selectedIndex]);
          setIsOpen(false);
          setQuery("");
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  };

  const handleSelect = (item: any) => {
    onSelect(item);
    setIsOpen(false);
    setQuery("");
    setSelectedIndex(-1);
  };

  const displayItems = query.length > 0 ? searchResults || [] : favorites || [];

  return (
    <div className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={searchInputRef}
          type="text"
          placeholder="Buscar CID-10 por código ou descrição..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setSelectedIndex(-1);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          className="pl-9"
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setIsOpen(false);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {selectedCode && selectedCode.id > 0 && (
        <div className="mt-2 p-3 rounded-lg bg-blue-50 border border-blue-200 dark:bg-blue-950/20 dark:border-blue-900">
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
                disabled={addFavoriteMutation.isPending || removeFavoriteMutation.isPending}
              >
                <Star className="h-4 w-4" fill={isFavorite ? "currentColor" : "none"} />
              </button>
              <button
                onClick={() => {
                  onSelect({ id: 0, code: "", description: "" });
                  setQuery("");
                }}
                className="text-muted-foreground hover:text-foreground mt-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto"
        >
          {isSearching && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isSearching && displayItems.length === 0 && query.length > 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Nenhum CID-10 encontrado para "{query}"
            </div>
          )}

          {!isSearching && displayItems.length === 0 && query.length === 0 && (!favorites || favorites.length === 0) && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Nenhum favorito salvo. Comece a digitar para buscar CID-10.
            </div>
          )}

          {displayItems.map((item, index) => (
            <button
              key={item.id}
              onClick={() => handleSelect(item)}
              className={cn(
                "w-full text-left px-4 py-3 border-b border-border last:border-b-0 transition-colors",
                selectedIndex === index ? "bg-accent text-accent-foreground" : "hover:bg-muted"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <Badge variant="outline" className="mb-1 text-xs">
                    {item.code}
                  </Badge>
                  <p className="text-sm font-medium truncate">{item.description}</p>
                  {item.descriptionAbbrev && (
                    <p className="text-xs text-muted-foreground mt-0.5">{item.descriptionAbbrev}</p>
                  )}
                </div>
                {showFavorites && item.id > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleFavorite(item);
                    }}
                    title={
                      (serverFavorites ?? []).some((f) => f.id === item.id)
                        ? "Remover dos favoritos"
                        : "Favoritar CID"
                    }
                    className={cn(
                      "mt-1 transition-colors shrink-0",
                      (serverFavorites ?? []).some((f) => f.id === item.id)
                        ? "text-amber-500 hover:text-amber-600"
                        : "text-muted-foreground hover:text-amber-500",
                    )}
                    disabled={addFavoriteMutation.isPending || removeFavoriteMutation.isPending}
                  >
                    <Star
                      className="h-4 w-4"
                      fill={(serverFavorites ?? []).some((f) => f.id === item.id) ? "currentColor" : "none"}
                    />
                  </button>
                )}
                {showFavorites && item.id < 0 && (
                  <Star
                    className="h-4 w-4 mt-1 text-amber-500"
                    fill="currentColor"
                  />
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
