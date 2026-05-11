import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Boxes,
  CalendarClock,
  ClipboardList,
  History,
  Loader2,
  MapPin,
  Package,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Truck,
  Warehouse,
} from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type ProductForm = {
  name: string;
  technicalName: string;
  sku: string;
  barcode: string;
  brand: string;
  manufacturer: string;
  size: string;
  presentation: string;
  category: string;
  description: string;
  unit: string;
  unitPurchase: string;
  conversionFactor: string;
  initialStock: string;
  minimumStock: string;
  reorderPoint: string;
  maximumStock: string;
  costPrice: string;
  supplierId: string;
  supplierName: string;
  supplierContact: string;
  defaultLocationId: string;
  lotNumber: string;
  expirationDate: string;
  anvisaRegistry: string;
  notes: string;
  allowsProcedureUse: boolean;
  controlsLot: boolean;
  controlsExpiration: boolean;
  requiresTemperatureControl: boolean;
  controlledMedication: boolean;
  highCost: boolean;
  criticalCare: boolean;
};

type MovementForm = {
  productId: string;
  type: "entrada" | "saida" | "ajuste" | "transferencia" | "entrada_compra" | "descarte";
  quantity: string;
  reason: string;
  lotId: string;
  lotNumber: string;
  expirationDate: string;
  locationFromId: string;
  locationToId: string;
  unitCost: string;
  invoiceNumber: string;
};

const emptyProductForm: ProductForm = {
  name: "",
  technicalName: "",
  sku: "",
  barcode: "",
  brand: "",
  manufacturer: "",
  size: "",
  presentation: "",
  category: "",
  description: "",
  unit: "unidade",
  unitPurchase: "",
  conversionFactor: "1",
  initialStock: "0",
  minimumStock: "5",
  reorderPoint: "",
  maximumStock: "",
  costPrice: "",
  supplierId: "none",
  supplierName: "",
  supplierContact: "",
  defaultLocationId: "none",
  lotNumber: "",
  expirationDate: "",
  anvisaRegistry: "",
  notes: "",
  allowsProcedureUse: true,
  controlsLot: false,
  controlsExpiration: false,
  requiresTemperatureControl: false,
  controlledMedication: false,
  highCost: false,
  criticalCare: false,
};

const emptyMovementForm: MovementForm = {
  productId: "",
  type: "entrada",
  quantity: "1",
  reason: "",
  lotId: "none",
  lotNumber: "",
  expirationDate: "",
  locationFromId: "none",
  locationToId: "none",
  unitCost: "",
  invoiceNumber: "",
};

const movementLabels: Record<MovementForm["type"], string> = {
  entrada: "Entrada manual",
  entrada_compra: "Entrada por compra",
  saida: "Saída",
  descarte: "Descarte",
  ajuste: "Ajuste auditado",
  transferencia: "Transferência",
};

function money(cents?: number | null) {
  return ((Number(cents) || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function dateText(value?: string | null) {
  if (!value) return "Sem data";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Sem data";
  return parsed.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function dateTimeText(value?: string | null) {
  if (!value) return "Sem data";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Sem data";
  return parsed.toLocaleString("pt-BR");
}

function numberValue(value: string, fallback = 0) {
  const normalized = String(value || "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function centsValue(value: string) {
  return Math.round(numberValue(value, 0) * 100);
}

function nullableNumber(value: string) {
  if (!value || value === "none") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function statusFor(product: any) {
  const available = Number(product.availableStock ?? product.currentStock ?? 0);
  const minimum = Number(product.minimumStock ?? 0);
  const nearestExpiration = product.nearestExpirationDate ? new Date(product.nearestExpirationDate) : null;
  const daysToExpire = nearestExpiration
    ? Math.ceil((nearestExpiration.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 9999;

  if (available <= 0) return { label: "Sem estoque", className: "bg-red-100 text-red-800 border-red-200" };
  if (daysToExpire <= 0) return { label: "Vencido", className: "bg-red-100 text-red-800 border-red-200" };
  if (available <= minimum) return { label: "Repor", className: "bg-amber-100 text-amber-900 border-amber-200" };
  if (daysToExpire <= 90) return { label: "Vencendo", className: "bg-yellow-100 text-yellow-900 border-yellow-200" };
  return { label: "OK", className: "bg-emerald-100 text-emerald-800 border-emerald-200" };
}

function Flag({ children }: { children: React.ReactNode }) {
  return <Badge variant="outline" className="rounded-md border-[#C9A55B]/40 text-[#8A6526]">{children}</Badge>;
}

export default function Estoque() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [productDialog, setProductDialog] = useState(false);
  const [movementDialog, setMovementDialog] = useState(false);
  const [quickDialog, setQuickDialog] = useState<"category" | "location" | "supplier" | null>(null);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [productForm, setProductForm] = useState<ProductForm>(emptyProductForm);
  const [movementForm, setMovementForm] = useState<MovementForm>(emptyMovementForm);
  const [quickForm, setQuickForm] = useState({ name: "", detail: "" });

  const { data: dashboard, isLoading: loadingDashboard } = trpc.inventory.dashboard.useQuery();
  const { data: products = [], isLoading: loadingProducts } = trpc.inventory.listProducts.useQuery({
    search,
    category: categoryFilter,
    status: statusFilter,
  });
  const { data: categories = [] } = trpc.inventory.listCategories.useQuery();
  const { data: locations = [] } = trpc.inventory.listLocations.useQuery();
  const { data: suppliers = [] } = trpc.inventory.listSuppliers.useQuery();
  const { data: lots = [] } = trpc.inventory.listLots.useQuery();
  const { data: movements = [] } = trpc.inventory.listMovements.useQuery({ limit: 250 });

  const refreshInventory = () => {
    void utils.inventory.dashboard.invalidate();
    void utils.inventory.listProducts.invalidate();
    void utils.inventory.listCategories.invalidate();
    void utils.inventory.listLocations.invalidate();
    void utils.inventory.listSuppliers.invalidate();
    void utils.inventory.listLots.invalidate();
    void utils.inventory.listMovements.invalidate();
    void utils.inventory.getLowStock.invalidate();
  };

  const createProduct = trpc.inventory.createProduct.useMutation({
    onSuccess: () => {
      toast.success("Produto criado com rastreabilidade.");
      setProductDialog(false);
      refreshInventory();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const updateProduct = trpc.inventory.updateProduct.useMutation({
    onSuccess: () => {
      toast.success("Dados cadastrais do produto atualizados.");
      setProductDialog(false);
      refreshInventory();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const createMovement = trpc.inventory.createMovement.useMutation({
    onSuccess: () => {
      toast.success("Movimentação registrada no histórico imutável.");
      setMovementDialog(false);
      refreshInventory();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const reverseMovement = trpc.inventory.reverseMovement.useMutation({
    onSuccess: () => {
      toast.success("Estorno registrado como nova movimentação.");
      refreshInventory();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const createCategory = trpc.inventory.createCategory.useMutation({
    onSuccess: () => {
      toast.success("Categoria salva.");
      setQuickDialog(null);
      refreshInventory();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const createLocation = trpc.inventory.createLocation.useMutation({
    onSuccess: () => {
      toast.success("Local salvo.");
      setQuickDialog(null);
      refreshInventory();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const createSupplier = trpc.inventory.createSupplier.useMutation({
    onSuccess: () => {
      toast.success("Fornecedor salvo.");
      setQuickDialog(null);
      refreshInventory();
    },
    onError: (error: any) => toast.error(error.message),
  });

  const activeProduct = useMemo(
    () => products.find((product: any) => String(product.id) === movementForm.productId),
    [movementForm.productId, products],
  );

  const totalValue = Number(dashboard?.summary?.totalValueInCents ?? 0);
  const purchaseSuggestions = dashboard?.purchaseSuggestions ?? [];

  const openNewProduct = () => {
    setEditingProduct(null);
    setProductForm(emptyProductForm);
    setProductDialog(true);
  };

  const openEditProduct = (product: any) => {
    setEditingProduct(product);
    setProductForm({
      ...emptyProductForm,
      name: product.name ?? "",
      technicalName: product.technicalName ?? "",
      sku: product.sku ?? "",
      barcode: product.barcode ?? "",
      brand: product.brand ?? "",
      manufacturer: product.manufacturer ?? "",
      size: product.size ?? "",
      presentation: product.presentation ?? "",
      category: product.category ?? "",
      description: product.description ?? "",
      unit: product.unit ?? "unidade",
      unitPurchase: product.unitPurchase ?? "",
      conversionFactor: String(product.conversionFactor ?? 1),
      minimumStock: String(product.minimumStock ?? 5),
      reorderPoint: product.reorderPoint == null ? "" : String(product.reorderPoint),
      maximumStock: product.maximumStock == null ? "" : String(product.maximumStock),
      costPrice: product.costPriceInCents ? String(Number(product.costPriceInCents) / 100) : "",
      supplierId: product.supplierId ? String(product.supplierId) : "none",
      supplierName: product.supplierName ?? "",
      supplierContact: product.supplierContact ?? "",
      defaultLocationId: product.defaultLocationId ? String(product.defaultLocationId) : "none",
      expirationDate: product.expirationDate ? String(product.expirationDate).slice(0, 10) : "",
      anvisaRegistry: product.anvisaRegistry ?? "",
      notes: product.notes ?? "",
      allowsProcedureUse: product.allowsProcedureUse !== false && product.allowsProcedureUse !== 0,
      controlsLot: Boolean(product.controlsLot),
      controlsExpiration: Boolean(product.controlsExpiration),
      requiresTemperatureControl: Boolean(product.requiresTemperatureControl),
      controlledMedication: Boolean(product.controlledMedication),
      highCost: Boolean(product.highCost),
      criticalCare: Boolean(product.criticalCare),
    });
    setProductDialog(true);
  };

  const openMovement = (product?: any, type: MovementForm["type"] = "entrada") => {
    setMovementForm({
      ...emptyMovementForm,
      productId: product?.id ? String(product.id) : "",
      type,
      locationFromId: product?.defaultLocationId ? String(product.defaultLocationId) : "none",
      locationToId: product?.defaultLocationId ? String(product.defaultLocationId) : "none",
    });
    setMovementDialog(true);
  };

  const submitProduct = () => {
    if (!productForm.name.trim()) {
      toast.error("Informe o nome do produto.");
      return;
    }

    const payload = {
      name: productForm.name.trim(),
      technicalName: productForm.technicalName.trim() || undefined,
      sku: productForm.sku.trim() || undefined,
      barcode: productForm.barcode.trim() || undefined,
      brand: productForm.brand.trim() || undefined,
      manufacturer: productForm.manufacturer.trim() || undefined,
      size: productForm.size.trim() || undefined,
      presentation: productForm.presentation.trim() || undefined,
      category: productForm.category.trim() || undefined,
      description: productForm.description.trim() || undefined,
      unit: productForm.unit.trim() || "unidade",
      unitPurchase: productForm.unitPurchase.trim() || undefined,
      conversionFactor: numberValue(productForm.conversionFactor, 1),
      initialStock: editingProduct ? undefined : numberValue(productForm.initialStock, 0),
      minimumStock: numberValue(productForm.minimumStock, 0),
      reorderPoint: productForm.reorderPoint ? numberValue(productForm.reorderPoint, 0) : null,
      maximumStock: productForm.maximumStock ? numberValue(productForm.maximumStock, 0) : null,
      costPriceInCents: centsValue(productForm.costPrice),
      supplierId: nullableNumber(productForm.supplierId),
      supplierName: productForm.supplierName.trim() || undefined,
      supplierContact: productForm.supplierContact.trim() || undefined,
      defaultLocationId: nullableNumber(productForm.defaultLocationId),
      lotNumber: productForm.lotNumber.trim() || undefined,
      expirationDate: productForm.expirationDate || undefined,
      anvisaRegistry: productForm.anvisaRegistry.trim() || undefined,
      notes: productForm.notes.trim() || undefined,
      allowsProcedureUse: productForm.allowsProcedureUse,
      controlsLot: productForm.controlsLot,
      controlsExpiration: productForm.controlsExpiration,
      requiresTemperatureControl: productForm.requiresTemperatureControl,
      controlledMedication: productForm.controlledMedication,
      highCost: productForm.highCost,
      criticalCare: productForm.criticalCare,
    };

    if (editingProduct?.id) {
      updateProduct.mutate({ id: Number(editingProduct.id), data: payload });
      return;
    }

    createProduct.mutate(payload);
  };

  const submitMovement = () => {
    if (!movementForm.productId) {
      toast.error("Selecione o produto.");
      return;
    }
    if (!movementForm.reason.trim() || movementForm.reason.trim().length < 5) {
      toast.error("Informe uma justificativa clara para a movimentação.");
      return;
    }

    createMovement.mutate({
      productId: Number(movementForm.productId),
      type: movementForm.type,
      quantity: numberValue(movementForm.quantity, 0),
      reason: movementForm.reason.trim(),
      justification: movementForm.reason.trim(),
      lotId: nullableNumber(movementForm.lotId),
      lotNumber: movementForm.lotNumber.trim() || undefined,
      expirationDate: movementForm.expirationDate || undefined,
      locationFromId: nullableNumber(movementForm.locationFromId),
      locationToId: nullableNumber(movementForm.locationToId),
      locationId: movementForm.locationFromId !== "none" ? nullableNumber(movementForm.locationFromId) : nullableNumber(movementForm.locationToId),
      unitCostInCents: movementForm.unitCost ? centsValue(movementForm.unitCost) : null,
      invoiceNumber: movementForm.invoiceNumber.trim() || undefined,
    });
  };

  const submitQuick = () => {
    if (!quickDialog || !quickForm.name.trim()) {
      toast.error("Informe um nome.");
      return;
    }
    if (quickDialog === "category") {
      createCategory.mutate({ name: quickForm.name.trim(), description: quickForm.detail.trim() || undefined });
    } else if (quickDialog === "location") {
      createLocation.mutate({ name: quickForm.name.trim(), type: quickForm.detail.trim() || "estoque" });
    } else {
      createSupplier.mutate({ name: quickForm.name.trim(), contactName: quickForm.detail.trim() || undefined });
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#8A6526]">Gestão operacional</p>
          <h1 className="mt-1 text-2xl font-semibold">Estoque da clínica</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Produtos, lotes, validade, locais, fornecedores e movimentações auditáveis.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => refreshInventory()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
          <Button variant="outline" onClick={() => openMovement()}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Movimentar
          </Button>
          <Button onClick={openNewProduct} className="bg-gradient-to-r from-[#8A6526] via-[#C9A55B] to-[#B8863B] text-white">
            <Plus className="mr-2 h-4 w-4" />
            Novo produto
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Package className="h-4 w-4 text-[#C9A55B]" />
              Produtos ativos
            </div>
            <p className="mt-2 text-3xl font-semibold">{dashboard?.summary?.productCount ?? products.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Abaixo do mínimo
            </div>
            <p className="mt-2 text-3xl font-semibold">{dashboard?.summary?.criticalCount ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarClock className="h-4 w-4 text-[#8A6526]" />
              Lotes vencendo
            </div>
            <p className="mt-2 text-3xl font-semibold">{dashboard?.summary?.expiringCount ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-emerald-700" />
              Valor estimado
            </div>
            <p className="mt-2 text-3xl font-semibold">{money(totalValue)}</p>
          </CardContent>
        </Card>
      </div>

      {(dashboard?.alerts?.length ?? 0) > 0 && (
        <Card className="border-amber-300/70 bg-amber-50/70 text-amber-950">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4" />
              Alertas de estoque
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2">
            {dashboard.alerts.slice(0, 8).map((alert: any, index: number) => (
              <div key={`${alert.type}-${alert.productId}-${index}`} className="rounded-md border border-amber-200 bg-white/70 p-3 text-sm">
                <p className="font-semibold">{alert.title}</p>
                <p className="mt-1 text-amber-900">{alert.message}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="products" className="space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="products"><Boxes className="h-4 w-4" /> Produtos</TabsTrigger>
          <TabsTrigger value="lots"><CalendarClock className="h-4 w-4" /> Lotes</TabsTrigger>
          <TabsTrigger value="movements"><History className="h-4 w-4" /> Movimentações</TabsTrigger>
          <TabsTrigger value="purchase"><ClipboardList className="h-4 w-4" /> Compra</TabsTrigger>
          <TabsTrigger value="settings"><Warehouse className="h-4 w-4" /> Cadastros</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_220px_220px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-10" placeholder="Buscar por nome, marca, SKU, código de barras ou fornecedor" />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as categorias</SelectItem>
                {categories.map((category: any) => (
                  <SelectItem key={category.id} value={category.name}>{category.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="low">Abaixo do mínimo</SelectItem>
                <SelectItem value="expiring">Vencendo em 90 dias</SelectItem>
                <SelectItem value="expired">Vencidos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              {loadingProducts || loadingDashboard ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-[#C9A55B]" />
                </div>
              ) : products.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Package className="mb-4 h-12 w-12 text-muted-foreground/40" />
                  <p className="font-medium">Nenhum produto cadastrado.</p>
                  <p className="text-sm text-muted-foreground">Comece pelo produto, depois registre entradas por lote.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1040px] text-sm">
                    <thead className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 text-left">Produto</th>
                        <th className="px-4 py-3 text-left">Categoria</th>
                        <th className="px-4 py-3 text-left">Local padrão</th>
                        <th className="px-4 py-3 text-right">Disponível</th>
                        <th className="px-4 py-3 text-right">Mín./máx.</th>
                        <th className="px-4 py-3 text-right">Custo</th>
                        <th className="px-4 py-3 text-left">Validade</th>
                        <th className="px-4 py-3 text-center">Status</th>
                        <th className="px-4 py-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((product: any) => {
                        const status = statusFor(product);
                        const available = Number(product.availableStock ?? product.currentStock ?? 0);
                        return (
                          <tr key={product.id} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="px-4 py-3">
                              <div className="font-medium">{product.name}</div>
                              <div className="mt-1 flex flex-wrap gap-1 text-xs text-muted-foreground">
                                {product.sku && <span>SKU {product.sku}</span>}
                                {product.brand && <span>{product.brand}</span>}
                                {product.presentation && <span>{product.presentation}</span>}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-1">
                                {Boolean(product.controlsLot) && <Flag>Lote</Flag>}
                                {Boolean(product.controlsExpiration) && <Flag>Validade</Flag>}
                                {Boolean(product.controlledMedication) && <Flag>Controlado</Flag>}
                                {Boolean(product.criticalCare) && <Flag>Crítico</Flag>}
                              </div>
                            </td>
                            <td className="px-4 py-3">{product.category || "Sem categoria"}</td>
                            <td className="px-4 py-3 text-muted-foreground">{product.defaultLocationName || "Almoxarifado central"}</td>
                            <td className="px-4 py-3 text-right font-semibold">{available.toLocaleString("pt-BR")} {product.unit || "un"}</td>
                            <td className="px-4 py-3 text-right text-muted-foreground">{product.minimumStock ?? 0} / {product.maximumStock ?? "-"}</td>
                            <td className="px-4 py-3 text-right">{money(product.costPriceInCents)}</td>
                            <td className="px-4 py-3 text-muted-foreground">{dateText(product.nearestExpirationDate || product.expirationDate)}</td>
                            <td className="px-4 py-3 text-center">
                              <Badge variant="outline" className={status.className}>{status.label}</Badge>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-2">
                                <Button variant="outline" size="sm" onClick={() => openMovement(product, "entrada")}>
                                  <ArrowDown className="mr-1 h-3.5 w-3.5" /> Entrada
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => openMovement(product, "saida")}>
                                  <ArrowUp className="mr-1 h-3.5 w-3.5" /> Saída
                                </Button>
                                <Button size="sm" onClick={() => openEditProduct(product)}>Editar</Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lots" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Lotes e validade</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Produto</th>
                    <th className="px-4 py-3 text-left">Lote</th>
                    <th className="px-4 py-3 text-right">Saldo</th>
                    <th className="px-4 py-3 text-left">Validade</th>
                    <th className="px-4 py-3 text-left">Fornecedor</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {lots.map((lot: any) => (
                    <tr key={lot.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{lot.productName}</td>
                      <td className="px-4 py-3">{lot.lotNumber}</td>
                      <td className="px-4 py-3 text-right">{Number(lot.availableStock ?? 0).toLocaleString("pt-BR")} {lot.unit || "un"}</td>
                      <td className="px-4 py-3">{dateText(lot.expirationDate)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{lot.supplierName || "-"}</td>
                      <td className="px-4 py-3 text-center"><Badge variant="outline">{lot.status}</Badge></td>
                    </tr>
                  ))}
                  {lots.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">Nenhum lote cadastrado.</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movements" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle className="text-lg">Histórico auditável</CardTitle>
              <Button onClick={() => openMovement()}><Plus className="mr-2 h-4 w-4" /> Nova movimentação</Button>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[1020px] text-sm">
                <thead className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Data</th>
                    <th className="px-4 py-3 text-left">Produto</th>
                    <th className="px-4 py-3 text-left">Tipo</th>
                    <th className="px-4 py-3 text-right">Qtd.</th>
                    <th className="px-4 py-3 text-left">Origem</th>
                    <th className="px-4 py-3 text-left">Destino</th>
                    <th className="px-4 py-3 text-left">Justificativa</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((movement: any) => (
                    <tr key={movement.id} className="border-b last:border-0">
                      <td className="px-4 py-3 text-muted-foreground">{dateTimeText(movement.createdAt)}</td>
                      <td className="px-4 py-3 font-medium">{movement.productName}</td>
                      <td className="px-4 py-3"><Badge variant="outline">{movementLabels[movement.type as MovementForm["type"]] || movement.type}</Badge></td>
                      <td className="px-4 py-3 text-right">{Number(movement.quantity ?? 0).toLocaleString("pt-BR")} {movement.unit || "un"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{movement.locationFromName || "-"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{movement.locationToName || "-"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{movement.reason || movement.justification || "-"}</td>
                      <td className="px-4 py-3 text-right">
                        {!movement.reversedMovementId && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const reason = window.prompt("Motivo do estorno desta movimentação:");
                              if (reason) reverseMovement.mutate({ movementId: Number(movement.id), reason });
                            }}
                          >
                            Estornar
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {movements.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">Nenhuma movimentação registrada.</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="purchase" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Sugestão de compra</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Produto</th>
                    <th className="px-4 py-3 text-right">Disponível</th>
                    <th className="px-4 py-3 text-right">Mínimo</th>
                    <th className="px-4 py-3 text-right">Sugestão</th>
                    <th className="px-4 py-3 text-left">Fornecedor</th>
                    <th className="px-4 py-3 text-right">Custo estimado</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseSuggestions.map((item: any) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{item.name}</td>
                      <td className="px-4 py-3 text-right">{Number(item.availableStock ?? item.currentStock ?? 0).toLocaleString("pt-BR")}</td>
                      <td className="px-4 py-3 text-right">{item.minimumStock ?? 0}</td>
                      <td className="px-4 py-3 text-right font-semibold">{item.suggestedQuantity}</td>
                      <td className="px-4 py-3 text-muted-foreground">{item.supplierDisplayName || item.supplierName || "-"}</td>
                      <td className="px-4 py-3 text-right">{money(Number(item.suggestedQuantity ?? 0) * Number(item.costPriceInCents ?? 0))}</td>
                    </tr>
                  ))}
                  {purchaseSuggestions.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">Nenhum produto exige reposição agora.</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="grid gap-4 lg:grid-cols-3">
          <RegistryCard
            icon={<Boxes className="h-4 w-4" />}
            title="Categorias"
            buttonLabel="Nova categoria"
            onAdd={() => { setQuickForm({ name: "", detail: "" }); setQuickDialog("category"); }}
            items={categories.map((item: any) => item.name)}
          />
          <RegistryCard
            icon={<MapPin className="h-4 w-4" />}
            title="Locais e setores"
            buttonLabel="Novo local"
            onAdd={() => { setQuickForm({ name: "", detail: "estoque" }); setQuickDialog("location"); }}
            items={locations.map((item: any) => `${item.name} (${item.type})`)}
          />
          <RegistryCard
            icon={<Truck className="h-4 w-4" />}
            title="Fornecedores"
            buttonLabel="Novo fornecedor"
            onAdd={() => { setQuickForm({ name: "", detail: "" }); setQuickDialog("supplier"); }}
            items={suppliers.map((item: any) => item.name)}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={productDialog} onOpenChange={setProductDialog}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Editar produto" : "Novo produto controlado"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nome do produto *" value={productForm.name} onChange={(value) => setProductForm({ ...productForm, name: value })} className="md:col-span-2" />
            <Field label="Nome técnico" value={productForm.technicalName} onChange={(value) => setProductForm({ ...productForm, technicalName: value })} />
            <Field label="SKU interno" value={productForm.sku} onChange={(value) => setProductForm({ ...productForm, sku: value })} />
            <Field label="Código de barras" value={productForm.barcode} onChange={(value) => setProductForm({ ...productForm, barcode: value })} />
            <Field label="Registro Anvisa" value={productForm.anvisaRegistry} onChange={(value) => setProductForm({ ...productForm, anvisaRegistry: value })} />
            <Field label="Marca" value={productForm.brand} onChange={(value) => setProductForm({ ...productForm, brand: value })} />
            <Field label="Fabricante" value={productForm.manufacturer} onChange={(value) => setProductForm({ ...productForm, manufacturer: value })} />
            <Field label="Tamanho" value={productForm.size} onChange={(value) => setProductForm({ ...productForm, size: value })} />
            <Field label="Apresentação" value={productForm.presentation} onChange={(value) => setProductForm({ ...productForm, presentation: value })} />
            <div>
              <Label>Categoria</Label>
              <Select value={productForm.category || "none"} onValueChange={(value) => setProductForm({ ...productForm, category: value === "none" ? "" : value })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem categoria</SelectItem>
                  {categories.map((category: any) => <SelectItem key={category.id} value={category.name}>{category.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fornecedor cadastrado</Label>
              <Select value={productForm.supplierId} onValueChange={(value) => setProductForm({ ...productForm, supplierId: value })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem fornecedor</SelectItem>
                  {suppliers.map((supplier: any) => <SelectItem key={supplier.id} value={String(supplier.id)}>{supplier.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Field label="Fornecedor livre" value={productForm.supplierName} onChange={(value) => setProductForm({ ...productForm, supplierName: value })} />
            <Field label="Contato do fornecedor" value={productForm.supplierContact} onChange={(value) => setProductForm({ ...productForm, supplierContact: value })} />
            <div>
              <Label>Local padrão</Label>
              <Select value={productForm.defaultLocationId} onValueChange={(value) => setProductForm({ ...productForm, defaultLocationId: value })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Almoxarifado central</SelectItem>
                  {locations.map((location: any) => <SelectItem key={location.id} value={String(location.id)}>{location.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Field label="Unidade de uso" value={productForm.unit} onChange={(value) => setProductForm({ ...productForm, unit: value })} />
            <Field label="Unidade de compra" value={productForm.unitPurchase} onChange={(value) => setProductForm({ ...productForm, unitPurchase: value })} />
            <Field label="Fator de conversão" type="number" value={productForm.conversionFactor} onChange={(value) => setProductForm({ ...productForm, conversionFactor: value })} />
            <Field label="Custo unitário (R$)" type="number" value={productForm.costPrice} onChange={(value) => setProductForm({ ...productForm, costPrice: value })} />
            {!editingProduct && <Field label="Saldo inicial" type="number" value={productForm.initialStock} onChange={(value) => setProductForm({ ...productForm, initialStock: value })} />}
            <Field label="Estoque mínimo" type="number" value={productForm.minimumStock} onChange={(value) => setProductForm({ ...productForm, minimumStock: value })} />
            <Field label="Ponto de reposição" type="number" value={productForm.reorderPoint} onChange={(value) => setProductForm({ ...productForm, reorderPoint: value })} />
            <Field label="Estoque máximo" type="number" value={productForm.maximumStock} onChange={(value) => setProductForm({ ...productForm, maximumStock: value })} />
            {!editingProduct && (
              <>
                <Field label="Lote inicial" value={productForm.lotNumber} onChange={(value) => setProductForm({ ...productForm, lotNumber: value })} />
                <Field label="Validade inicial" type="date" value={productForm.expirationDate} onChange={(value) => setProductForm({ ...productForm, expirationDate: value })} />
              </>
            )}
            <div className="md:col-span-2">
              <Label>Descrição</Label>
              <Textarea value={productForm.description} onChange={(event) => setProductForm({ ...productForm, description: event.target.value })} className="mt-1" />
            </div>
            <div className="md:col-span-2">
              <Label>Observações internas</Label>
              <Textarea value={productForm.notes} onChange={(event) => setProductForm({ ...productForm, notes: event.target.value })} className="mt-1" />
            </div>
            <div className="grid gap-3 md:col-span-2 md:grid-cols-3">
              <SwitchLine label="Usado em procedimento" checked={productForm.allowsProcedureUse} onCheckedChange={(checked) => setProductForm({ ...productForm, allowsProcedureUse: checked })} />
              <SwitchLine label="Controla lote" checked={productForm.controlsLot} onCheckedChange={(checked) => setProductForm({ ...productForm, controlsLot: checked })} />
              <SwitchLine label="Controla validade" checked={productForm.controlsExpiration} onCheckedChange={(checked) => setProductForm({ ...productForm, controlsExpiration: checked })} />
              <SwitchLine label="Controle de temperatura" checked={productForm.requiresTemperatureControl} onCheckedChange={(checked) => setProductForm({ ...productForm, requiresTemperatureControl: checked })} />
              <SwitchLine label="Medicamento controlado" checked={productForm.controlledMedication} onCheckedChange={(checked) => setProductForm({ ...productForm, controlledMedication: checked })} />
              <SwitchLine label="Item crítico/alto risco" checked={productForm.criticalCare} onCheckedChange={(checked) => setProductForm({ ...productForm, criticalCare: checked })} />
              <SwitchLine label="Alto custo" checked={productForm.highCost} onCheckedChange={(checked) => setProductForm({ ...productForm, highCost: checked })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProductDialog(false)}>Cancelar</Button>
            <Button onClick={submitProduct} disabled={createProduct.isPending || updateProduct.isPending}>
              {(createProduct.isPending || updateProduct.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" />
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={movementDialog} onOpenChange={setMovementDialog}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova movimentação de estoque</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Produto *</Label>
              <Select value={movementForm.productId} onValueChange={(value) => setMovementForm({ ...movementForm, productId: value })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
                <SelectContent>
                  {products.map((product: any) => <SelectItem key={product.id} value={String(product.id)}>{product.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {activeProduct && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Saldo atual: {Number(activeProduct.availableStock ?? activeProduct.currentStock ?? 0).toLocaleString("pt-BR")} {activeProduct.unit || "un"}.
                </p>
              )}
            </div>
            <div>
              <Label>Tipo *</Label>
              <Select value={movementForm.type} onValueChange={(value: MovementForm["type"]) => setMovementForm({ ...movementForm, type: value })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(movementLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Field label={movementForm.type === "ajuste" ? "Saldo final auditado *" : "Quantidade *"} type="number" value={movementForm.quantity} onChange={(value) => setMovementForm({ ...movementForm, quantity: value })} />
            <div>
              <Label>Origem</Label>
              <Select value={movementForm.locationFromId} onValueChange={(value) => setMovementForm({ ...movementForm, locationFromId: value })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Usar local padrão</SelectItem>
                  {locations.map((location: any) => <SelectItem key={location.id} value={String(location.id)}>{location.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Destino</Label>
              <Select value={movementForm.locationToId} onValueChange={(value) => setMovementForm({ ...movementForm, locationToId: value })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Usar local padrão</SelectItem>
                  {locations.map((location: any) => <SelectItem key={location.id} value={String(location.id)}>{location.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Lote existente</Label>
              <Select value={movementForm.lotId} onValueChange={(value) => setMovementForm({ ...movementForm, lotId: value })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem lote existente</SelectItem>
                  {lots
                    .filter((lot: any) => !movementForm.productId || String(lot.productId) === movementForm.productId)
                    .map((lot: any) => <SelectItem key={lot.id} value={String(lot.id)}>{lot.lotNumber} - {dateText(lot.expirationDate)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Field label="Novo lote" value={movementForm.lotNumber} onChange={(value) => setMovementForm({ ...movementForm, lotNumber: value })} />
            <Field label="Validade do novo lote" type="date" value={movementForm.expirationDate} onChange={(value) => setMovementForm({ ...movementForm, expirationDate: value })} />
            <Field label="Custo unitário (R$)" type="number" value={movementForm.unitCost} onChange={(value) => setMovementForm({ ...movementForm, unitCost: value })} />
            <Field label="Nota fiscal / documento" value={movementForm.invoiceNumber} onChange={(value) => setMovementForm({ ...movementForm, invoiceNumber: value })} />
            <div className="md:col-span-2">
              <Label>Justificativa obrigatória *</Label>
              <Textarea value={movementForm.reason} onChange={(event) => setMovementForm({ ...movementForm, reason: event.target.value })} className="mt-1" placeholder="Ex.: Entrada de compra NF 123, saída para procedimento, ajuste após contagem..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovementDialog(false)}>Cancelar</Button>
            <Button onClick={submitMovement} disabled={createMovement.isPending}>
              {createMovement.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={quickDialog !== null} onOpenChange={(open) => !open && setQuickDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {quickDialog === "category" ? "Nova categoria" : quickDialog === "location" ? "Novo local de estoque" : "Novo fornecedor"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label="Nome *" value={quickForm.name} onChange={(value) => setQuickForm({ ...quickForm, name: value })} />
            <Field
              label={quickDialog === "location" ? "Tipo do local" : quickDialog === "supplier" ? "Contato principal" : "Descrição"}
              value={quickForm.detail}
              onChange={(value) => setQuickForm({ ...quickForm, detail: value })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickDialog(null)}>Cancelar</Button>
            <Button onClick={submitQuick} disabled={createCategory.isPending || createLocation.isPending || createSupplier.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1" />
    </div>
  );
}

function SwitchLine({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-12 items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}

function RegistryCard({
  icon,
  title,
  buttonLabel,
  onAdd,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  buttonLabel: string;
  onAdd: () => void;
  items: string[];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-base">{icon}{title}</CardTitle>
        <Button variant="outline" size="sm" onClick={onAdd}><Plus className="mr-1 h-3.5 w-3.5" />{buttonLabel}</Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.slice(0, 18).map((item) => (
          <div key={item} className="rounded-md border bg-muted/20 px-3 py-2 text-sm">{item}</div>
        ))}
        {items.length === 0 && <p className="text-sm text-muted-foreground">Nenhum cadastro ainda.</p>}
      </CardContent>
    </Card>
  );
}
