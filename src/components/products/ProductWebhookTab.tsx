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
import { Plus, Trash2, Pencil, Play, Loader2, CheckCircle2, XCircle } from "lucide-react";

interface ProductWebhookTabProps {
  productId: string;
}

interface Webhook {
  id: string;
  webhook_url: string;
  is_active: boolean;
  created_at: string;
}

interface TestResult {
  success: boolean;
  status_code?: number;
  response_body?: string;
  error?: string;
  payload_sent?: unknown;
}

export function ProductWebhookTab({ productId }: ProductWebhookTabProps) {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [testingWebhook, setTestingWebhook] = useState<Webhook | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);
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

  const handleTestWebhook = async (webhook: Webhook) => {
    setTestingWebhook(webhook);
    setTestResult(null);
    setTestDialogOpen(true);
    setIsTesting(true);

    try {
      const { data, error } = await supabase.functions.invoke("test-webhook", {
        body: {
          webhook_url: webhook.webhook_url,
          product_id: productId,
        },
      });

      if (error) throw error;
      setTestResult(data);
    } catch (error) {
      console.error("Error testing webhook:", error);
      setTestResult({
        success: false,
        error: error instanceof Error ? error.message : "Erro ao testar webhook",
      });
    } finally {
      setIsTesting(false);
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
                  <TableCell className="font-mono text-sm max-w-[300px] truncate">
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
                        variant="outline"
                        size="sm"
                        onClick={() => handleTestWebhook(webhook)}
                        title="Testar webhook"
                      >
                        <Play className="w-4 h-4" />
                      </Button>
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

      {/* Test Webhook Dialog */}
      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Teste de Webhook
              {testResult && (
                testResult.success ? (
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                ) : (
                  <XCircle className="w-5 h-5 text-destructive" />
                )
              )}
            </DialogTitle>
            <DialogDescription className="font-mono text-xs break-all">
              {testingWebhook?.webhook_url}
            </DialogDescription>
          </DialogHeader>

          {isTesting ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Enviando webhook de teste...</p>
            </div>
          ) : testResult ? (
            <div className="space-y-4">
              {/* Result Status */}
              <div className={`p-4 rounded-lg ${testResult.success ? "bg-green-500/10 border border-green-500/20" : "bg-destructive/10 border border-destructive/20"}`}>
                <p className={`font-medium ${testResult.success ? "text-green-600" : "text-destructive"}`}>
                  {testResult.success ? "✓ Webhook enviado com sucesso!" : "✗ Falha ao enviar webhook"}
                </p>
                {testResult.status_code && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Código HTTP: {testResult.status_code}
                  </p>
                )}
                {testResult.error && (
                  <p className="text-sm text-destructive mt-1">{testResult.error}</p>
                )}
              </div>

              {/* Response */}
              {testResult.response_body && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Resposta do servidor:</Label>
                  <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto max-h-32">
                    {testResult.response_body}
                  </pre>
                </div>
              )}

              {/* Payload Sent */}
              {testResult.payload_sent && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Payload enviado:</Label>
                  <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto max-h-64">
                    {JSON.stringify(testResult.payload_sent, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setTestDialogOpen(false)}>
              Fechar
            </Button>
            {testResult && (
              <Button onClick={() => testingWebhook && handleTestWebhook(testingWebhook)}>
                Testar Novamente
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
