import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";

interface ProductWebhookTabProps {
  productId: string;
}

interface Webhook {
  id: string;
  webhook_url: string;
  is_active: boolean;
  created_at: string;
}

export function ProductWebhookTab({ productId }: ProductWebhookTabProps) {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [formData, setFormData] = useState({
    webhook_url: "",
    is_active: true,
  });

  useEffect(() => {
    fetchWebhooks();
  }, [productId]);

  const fetchWebhooks = async () => {
    try {
      const { data, error } = await supabase
        .from("product_webhooks")
        .select("*")
        .eq("product_id", productId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setWebhooks(data || []);
    } catch (error) {
      console.error("Error fetching webhooks:", error);
      toast.error("Erro ao carregar webhooks");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (editingWebhook) {
        const { error } = await supabase
          .from("product_webhooks")
          .update({
            webhook_url: formData.webhook_url,
            is_active: formData.is_active,
          })
          .eq("id", editingWebhook.id);

        if (error) throw error;
        toast.success("Webhook atualizado com sucesso!");
      } else {
        const { error } = await supabase
          .from("product_webhooks")
          .insert({
            product_id: productId,
            webhook_url: formData.webhook_url,
            is_active: formData.is_active,
          });

        if (error) throw error;
        toast.success("Webhook criado com sucesso!");
      }

      setDialogOpen(false);
      setEditingWebhook(null);
      setFormData({ webhook_url: "", is_active: true });
      fetchWebhooks();
    } catch (error) {
      console.error("Error saving webhook:", error);
      toast.error("Erro ao salvar webhook");
    }
  };

  const handleEdit = (webhook: Webhook) => {
    setEditingWebhook(webhook);
    setFormData({
      webhook_url: webhook.webhook_url,
      is_active: webhook.is_active,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deseja realmente excluir este webhook?")) return;

    try {
      const { error } = await supabase
        .from("product_webhooks")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Webhook excluído com sucesso!");
      fetchWebhooks();
    } catch (error) {
      console.error("Error deleting webhook:", error);
      toast.error("Erro ao excluir webhook");
    }
  };

  const handleToggleActive = async (webhook: Webhook) => {
    try {
      const { error } = await supabase
        .from("product_webhooks")
        .update({ is_active: !webhook.is_active })
        .eq("id", webhook.id);

      if (error) throw error;
      toast.success(`Webhook ${!webhook.is_active ? "ativado" : "desativado"} com sucesso!`);
      fetchWebhooks();
    } catch (error) {
      console.error("Error toggling webhook:", error);
      toast.error("Erro ao alterar status do webhook");
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Webhooks de Venda</CardTitle>
            <CardDescription>
              Configure URLs que receberão notificações quando este produto for vendido
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) {
              setEditingWebhook(null);
              setFormData({ webhook_url: "", is_active: true });
            }
          }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Webhook
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingWebhook ? "Editar Webhook" : "Adicionar Webhook"}
                </DialogTitle>
                <DialogDescription>
                  Insira a URL que receberá os dados da venda via POST
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="webhook_url">URL do Webhook</Label>
                    <Input
                      id="webhook_url"
                      placeholder="https://seu-dominio.com/webhook"
                      value={formData.webhook_url}
                      onChange={(e) =>
                        setFormData({ ...formData, webhook_url: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="is_active"
                      checked={formData.is_active}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, is_active: checked })
                      }
                    />
                    <Label htmlFor="is_active">Webhook ativo</Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit">
                    {editingWebhook ? "Atualizar" : "Criar"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : webhooks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum webhook configurado para este produto
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>URL</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data de Criação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {webhooks.map((webhook) => (
                <TableRow key={webhook.id}>
                  <TableCell className="font-mono text-sm">
                    {webhook.webhook_url}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={webhook.is_active}
                      onCheckedChange={() => handleToggleActive(webhook)}
                    />
                  </TableCell>
                  <TableCell>
                    {new Date(webhook.created_at).toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(webhook)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(webhook.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
