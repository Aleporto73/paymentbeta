import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RefreshCw, TrendingUp, TrendingDown, Activity, Clock, Filter, X } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface WebhookStats {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  processing: number;
  successRate: number;
}

interface WebhookLog {
  id: string;
  product_id: string;
  webhook_url: string;
  payload: any;
  response_status: number | null;
  response_body: string | null;
  success: boolean;
  created_at: string;
}

interface WebhookQueueItem {
  id: string;
  product_id: string;
  webhook_url: string;
  payload: any;
  status: string;
  attempts: number;
  max_attempts: number;
  error_message: string | null;
  created_at: string;
}

interface Product {
  id: string;
  name: string;
}

interface Filters {
  productId: string;
  status: string;
  webhookUrl: string;
  startDate: string;
  endDate: string;
}

export default function Webhooks() {
  const [stats, setStats] = useState<WebhookStats>({
    total: 0,
    sent: 0,
    failed: 0,
    pending: 0,
    processing: 0,
    successRate: 0,
  });
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [failedQueue, setFailedQueue] = useState<WebhookQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    productId: "",
    status: "",
    webhookUrl: "",
    startDate: "",
    endDate: "",
  });

  useEffect(() => {
    fetchData();
  }, [filters]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get user's products
      const { data: productsData } = await supabase
        .from("products")
        .select("id, name")
        .eq("user_id", user.id);

      if (!productsData || productsData.length === 0) {
        setLoading(false);
        return;
      }

      setProducts(productsData);

      let productIds = productsData.map((p) => p.id);
      
      // Apply product filter
      if (filters.productId) {
        productIds = [filters.productId];
      }

      // Fetch queue stats
      const { data: queueData } = await supabase
        .from("webhook_queue")
        .select("status")
        .in("product_id", productIds);

      if (queueData) {
        const sent = queueData.filter((q) => q.status === "sent").length;
        const failed = queueData.filter((q) => q.status === "failed").length;
        const pending = queueData.filter((q) => q.status === "pending").length;
        const processing = queueData.filter((q) => q.status === "processing").length;
        const total = queueData.length;
        const successRate = total > 0 ? (sent / total) * 100 : 0;

        setStats({
          total,
          sent,
          failed,
          pending,
          processing,
          successRate,
        });
      }

      // Fetch recent logs with filters
      let logsQuery = supabase
        .from("webhook_logs")
        .select("*")
        .in("product_id", productIds);

      // Apply status filter
      if (filters.status === "success") {
        logsQuery = logsQuery.eq("success", true);
      } else if (filters.status === "failed") {
        logsQuery = logsQuery.eq("success", false);
      }

      // Apply webhook URL filter
      if (filters.webhookUrl) {
        logsQuery = logsQuery.ilike("webhook_url", `%${filters.webhookUrl}%`);
      }

      // Apply date filters
      if (filters.startDate) {
        logsQuery = logsQuery.gte("created_at", new Date(filters.startDate).toISOString());
      }
      if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        logsQuery = logsQuery.lte("created_at", endDate.toISOString());
      }

      const { data: logsData } = await logsQuery
        .order("created_at", { ascending: false })
        .limit(50);

      if (logsData) {
        setLogs(logsData);
      }

      // Fetch failed webhooks
      const { data: failedData } = await supabase
        .from("webhook_queue")
        .select("*")
        .in("product_id", productIds)
        .eq("status", "failed")
        .order("created_at", { ascending: false })
        .limit(20);

      if (failedData) {
        setFailedQueue(failedData);
      }
    } catch (error) {
      console.error("Error fetching webhook data:", error);
      toast.error("Erro ao carregar dados dos webhooks");
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async (queueItem: WebhookQueueItem) => {
    setRetrying(queueItem.id);
    try {
      // Reset the queue item to pending with attempts reset
      const { error } = await supabase
        .from("webhook_queue")
        .update({
          status: "pending",
          attempts: 0,
          error_message: null,
          last_attempt_at: null,
        })
        .eq("id", queueItem.id);

      if (error) throw error;

      // Trigger webhook processor
      await supabase.functions.invoke("process-webhook-queue");

      toast.success("Webhook reenviado com sucesso!");
      fetchData();
    } catch (error) {
      console.error("Error retrying webhook:", error);
      toast.error("Erro ao reenviar webhook");
    } finally {
      setRetrying(null);
    }
  };

  const getStatusBadge = (success: boolean) => {
    return success ? (
      <Badge className="bg-green-500/10 text-green-600 hover:bg-green-500/20">
        Sucesso
      </Badge>
    ) : (
      <Badge variant="destructive">Falhou</Badge>
    );
  };

  const getQueueStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; label: string }> = {
      sent: { variant: "default", label: "Enviado" },
      failed: { variant: "destructive", label: "Falhou" },
      pending: { variant: "secondary", label: "Pendente" },
      processing: { variant: "outline", label: "Processando" },
    };

    const config = variants[status] || variants.pending;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const clearFilters = () => {
    setFilters({
      productId: "",
      status: "",
      webhookUrl: "",
      startDate: "",
      endDate: "",
    });
  };

  const hasActiveFilters = Object.values(filters).some(value => value !== "");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Webhooks</h1>
          <p className="text-muted-foreground">
            Monitore o status e histórico de envio dos webhooks
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="w-4 h-4 mr-2" />
            Filtros
            {hasActiveFilters && (
              <Badge variant="secondary" className="ml-2">
                {Object.values(filters).filter(v => v !== "").length}
              </Badge>
            )}
          </Button>
          <Button onClick={fetchData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Filters Card */}
      {showFilters && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Filtros Avançados</CardTitle>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="w-4 h-4 mr-2" />
                  Limpar Filtros
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="product-filter">Produto</Label>
                <Select
                  value={filters.productId}
                  onValueChange={(value) =>
                    setFilters({ ...filters, productId: value })
                  }
                >
                  <SelectTrigger id="product-filter">
                    <SelectValue placeholder="Todos os produtos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos os produtos</SelectItem>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status-filter">Status</Label>
                <Select
                  value={filters.status}
                  onValueChange={(value) =>
                    setFilters({ ...filters, status: value })
                  }
                >
                  <SelectTrigger id="status-filter">
                    <SelectValue placeholder="Todos os status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos os status</SelectItem>
                    <SelectItem value="success">Sucesso</SelectItem>
                    <SelectItem value="failed">Falha</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="url-filter">URL do Webhook</Label>
                <Input
                  id="url-filter"
                  placeholder="Filtrar por URL..."
                  value={filters.webhookUrl}
                  onChange={(e) =>
                    setFilters({ ...filters, webhookUrl: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="start-date">Data Inicial</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={filters.startDate}
                  onChange={(e) =>
                    setFilters({ ...filters, startDate: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end-date">Data Final</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={filters.endDate}
                  onChange={(e) =>
                    setFilters({ ...filters, endDate: e.target.value })
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Webhooks enviados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sucesso</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.sent}</div>
            <p className="text-xs text-muted-foreground">Entregas bem-sucedidas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Falhas</CardTitle>
            <TrendingDown className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.failed}</div>
            <p className="text-xs text-muted-foreground">Entregas falhadas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending + stats.processing}</div>
            <p className="text-xs text-muted-foreground">Aguardando envio</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa de Sucesso</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.successRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">Entregas confirmadas</p>
          </CardContent>
        </Card>
      </div>

      {/* Failed Webhooks - Retry Section */}
      {failedQueue.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Webhooks Falhados</CardTitle>
            <CardDescription>
              Webhooks que falharam após {failedQueue[0]?.max_attempts || 3} tentativas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>URL</TableHead>
                  <TableHead>Tentativas</TableHead>
                  <TableHead>Erro</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {failedQueue.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-sm">
                      {item.webhook_url.length > 40
                        ? `${item.webhook_url.substring(0, 40)}...`
                        : item.webhook_url}
                    </TableCell>
                    <TableCell>
                      {item.attempts}/{item.max_attempts}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                      {item.error_message || "Erro desconhecido"}
                    </TableCell>
                    <TableCell>
                      {formatDistanceToNow(new Date(item.created_at), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        onClick={() => handleRetry(item)}
                        disabled={retrying === item.id}
                      >
                        <RefreshCw
                          className={`w-4 h-4 mr-2 ${
                            retrying === item.id ? "animate-spin" : ""
                          }`}
                        />
                        Reenviar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Webhook Logs */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Entregas</CardTitle>
          <CardDescription>Últimas 50 entregas de webhook</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum webhook foi enviado ainda
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Código HTTP</TableHead>
                  <TableHead>Resposta</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>{getStatusBadge(log.success)}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {log.webhook_url.length > 40
                        ? `${log.webhook_url.substring(0, 40)}...`
                        : log.webhook_url}
                    </TableCell>
                    <TableCell>
                      {log.response_status ? (
                        <Badge variant="outline">{log.response_status}</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                      {log.response_body
                        ? log.response_body.substring(0, 100)
                        : "Sem resposta"}
                    </TableCell>
                    <TableCell>
                      {formatDistanceToNow(new Date(log.created_at), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
