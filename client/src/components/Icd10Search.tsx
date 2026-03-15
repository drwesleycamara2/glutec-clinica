import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Star, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

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

  const { data: favorites } = trpc.icd10.getFavorites.useQuery();
  const { mutate: toggleFavorite } = trpc.icd10.addFavorite.useMutation();
  const { mutate: removeFavorite } = trpc.icd10.removeFavorite.useMutation();

  const isFavorite = selectedCode && favorites?.some((f) => f.id === selectedCode.id);

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

      {selectedCode && (
        <div className="mt-2 p-3 rounded-lg bg-blue-50 border border-blue-200 dark:bg-blue-950/20 dark:border-blue-900">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <Badge variant="outline" className="mb-1">
                {selectedCode.code}
              </Badge>
              <p className="text-sm text-foreground">{selectedCode.description}</p>
            </div>
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
                {showFavorites && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const isFav = favorites?.some((f) => f.id === item.id);
                      if (isFav) {
                        removeFavorite({ icd10CodeId: item.id });
                      } else {
                        toggleFavorite({ icd10CodeId: item.id });
                      }
                    }}
                    className="mt-1 text-muted-foreground hover:text-amber-500 transition-colors shrink-0"
                  >
                    <Star
                      className="h-4 w-4"
                      fill={favorites?.some((f) => f.id === item.id) ? "currentColor" : "none"}
                    />
                  </button>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
