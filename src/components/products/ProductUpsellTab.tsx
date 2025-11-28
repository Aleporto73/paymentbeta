import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Trash2, Code, Edit } from "lucide-react";
import { toast } from "sonner";
import { CreateUpsellDialog } from "./CreateUpsellDialog";
import type { Product, ProductUpsell } from "@/types/product";

interface ProductUpsellTabProps {
  productId: string;
}

export function ProductUpsellTab({ productId }: ProductUpsellTabProps) {
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingUpsell, setEditingUpsell] = useState<(ProductUpsell & {
    preview_background_color?: string;
    preview_text_color?: string;
    preview_button_color?: string;
  }) | null>(null);
  const [deleteUpsellId, setDeleteUpsellId] = useState<string | null>(null);

  const { data: upsells = [], isLoading: upsellsLoading } = useQuery({
    queryKey: ["product-upsells", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_upsells")
        .select("*")
        .eq("product_id", productId)
        .order("display_order", { ascending: true });

      if (error) throw error;
      return data as (ProductUpsell & {
        preview_background_color?: string;
        preview_text_color?: string;
        preview_button_color?: string;
      })[];
    },
  });

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ["products-active"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { data, error } = await supabase
        .from("products")
        .select("id, name, price, image_url")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return data as Product[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("product_upsells")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-upsells", productId] });
      toast.success("Upsell excluído com sucesso");
      setDeleteUpsellId(null);
    },
    onError: (error) => {
      toast.error("Erro ao excluir Upsell");
      console.error(error);
    },
  });

  const getProductName = (productId: string) => {
    const product = products.find(p => p.id === productId);
    return product?.name || "Produto não encontrado";
  };

  const getWidgetCode = (upsellCode: string) => {
    return `<!-- Widget de Upsell Modal -->
<script>
(function() {
  const script = document.createElement('script');
  script.src = '${window.location.origin}/upsell-widget.js';
  script.dataset.upsellId = '${upsellCode}';
  document.body.appendChild(script);
})();
</script>

<!-- Adicione este código no seu botão CTA -->
<button onclick="openUpsellModal()">🎁 Ver Oferta Especial!</button>`;
  };

  const handleEdit = (upsell: ProductUpsell & {
    preview_background_color?: string;
    preview_text_color?: string;
    preview_button_color?: string;
  }) => {
    setEditingUpsell(upsell);
    setIsCreateDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsCreateDialogOpen(false);
    setEditingUpsell(null);
  };

  if (upsellsLoading || productsLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">Carregando...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Upsell One-Click</CardTitle>
          <CardDescription>
            Configure ofertas de upsell que aparecerão na página de obrigado com pagamento One-Click
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex justify-end">
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Upsell
            </Button>
          </div>

          {upsells.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Nenhum upsell configurado ainda. Crie seu primeiro upsell!
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ordem</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Preço</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upsells.map((upsell) => (
                  <TableRow key={upsell.id}>
                    <TableCell>{upsell.display_order}</TableCell>
                    <TableCell>{getProductName(upsell.upsell_product_id)}</TableCell>
                    <TableCell>{upsell.title}</TableCell>
                    <TableCell>
                      {new Intl.NumberFormat("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      }).format(upsell.price)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          upsell.is_active
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {upsell.is_active ? "Ativo" : "Inativo"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Code className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Código do Widget</DialogTitle>
                            <DialogDescription>
                              Cole este código na sua página de obrigado (precisa ter
                              transaction_token na URL)
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div>
                              <h4 className="font-semibold mb-2">Como usar:</h4>
                              <ol className="text-sm space-y-1 list-decimal list-inside text-muted-foreground">
                                <li>Cole o código do script na sua página de obrigado</li>
                                <li>
                                  Adicione um botão CTA que chama{" "}
                                  <code className="bg-muted px-1 rounded">openUpsellModal()</code>
                                </li>
                                <li>
                                  O cliente verá um modal com a oferta e poderá comprar com
                                  One-Click
                                </li>
                              </ol>
                            </div>
                            <div className="bg-muted p-4 rounded-lg">
                              <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
                                {getWidgetCode(upsell.unique_code)}
                              </pre>
                            </div>
                          </div>
                          <Button
                            onClick={() => {
                              navigator.clipboard.writeText(
                                getWidgetCode(upsell.unique_code)
                              );
                              toast.success("Código copiado!");
                            }}
                          >
                            Copiar Código
                          </Button>
                        </DialogContent>
                      </Dialog>

                      <Button variant="outline" size="sm" onClick={() => handleEdit(upsell)}>
                        <Edit className="h-4 w-4" />
                      </Button>

                      <AlertDialog
                        open={deleteUpsellId === upsell.id}
                        onOpenChange={(open) => !open && setDeleteUpsellId(null)}
                      >
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDeleteUpsellId(upsell.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir Upsell</AlertDialogTitle>
                            <AlertDialogDescription>
                              Tem certeza que deseja excluir este upsell? Esta ação não pode ser
                              desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMutation.mutate(upsell.id)}
                            >
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreateUpsellDialog
        productId={productId}
        products={products}
        isOpen={isCreateDialogOpen}
        onClose={handleCloseDialog}
        editingUpsell={editingUpsell}
      />
    </>
  );
}
