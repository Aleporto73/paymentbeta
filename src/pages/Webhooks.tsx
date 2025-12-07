import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RefreshCw, TrendingUp, TrendingDown, Activity, Clock, Filter, X, ChevronLeft, ChevronRight, Send, CheckCircle, AlertCircle } from "lucide-react";
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

interface SaleWebhookStatus {
  transactionId: string;
  productId: string;
  productName: string;
  customerName: string;
  customerEmail: string;
  value: number;
  status: string;
  webhookSent: boolean;
  webhookStatus: 'sent' | 'pending' | 'failed' | 'no_webhook';
  createdAt: string;
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
  const [salesWebhooks, setSalesWebhooks] = useState<SaleWebhookStatus[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [salesTotalCount, setSalesTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [sendingWebhook, setSendingWebhook] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [salesCurrentPage, setSalesCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [salesItemsPerPage, setSalesItemsPerPage] = useState(10);
  const [activeTab, setActiveTab] = useState("sales");
  
  // Send result dialog
  const [sendResultDialog, setSendResultDialog] = useState(false);
  const [sendResult, setSendResult] = useState<any>(null);

  const [tempFilters, setTempFilters] = useState<Filters>({
    productId: "all",
    status: "all",
    webhookUrl: "",
    startDate: "",
    endDate: "",
  });
  
  const [appliedFilters, setAppliedFilters] = useState<Filters>({
    productId: "all",
    status: "all",
    webhookUrl: "",
    startDate: "",
    endDate: "",
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
    setSalesCurrentPage(1);
    fetchData();
  }, [appliedFilters]);

  useEffect(() => {
    fetchData();
  }, [currentPage, itemsPerPage, salesCurrentPage, salesItemsPerPage, activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get user's products
      const { data: productsData } = await supabase
        .from("products")
        .select("id, name");

      if (!productsData || productsData.length === 0) {
        setLoading(false);
        return;
      }

      setProducts(productsData);

      let productIds = productsData.map((p) => p.id);
      
      // Apply product filter
      if (appliedFilters.productId && appliedFilters.productId !== "all") {
        productIds = [appliedFilters.productId];
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

      // Fetch sales with webhook status
      if (activeTab === "sales") {
        await fetchSalesWithWebhookStatus(productIds, productsData);
      }

      // Fetch recent logs with filters
      if (activeTab === "history") {
        let logsQuery = supabase
          .from("webhook_logs")
          .select("*")
          .in("product_id", productIds);

        // Apply status filter
        if (appliedFilters.status === "success") {
          logsQuery = logsQuery.eq("success", true);
        } else if (appliedFilters.status === "failed") {
          logsQuery = logsQuery.eq("success", false);
        }

        // Apply webhook URL filter
        if (appliedFilters.webhookUrl) {
          logsQuery = logsQuery.ilike("webhook_url", `%${appliedFilters.webhookUrl}%`);
        }

        // Apply date filters
        if (appliedFilters.startDate) {
          logsQuery = logsQuery.gte("created_at", new Date(appliedFilters.startDate).toISOString());
        }
        if (appliedFilters.endDate) {
          const endDate = new Date(appliedFilters.endDate);
          endDate.setHours(23, 59, 59, 999);
          logsQuery = logsQuery.lte("created_at", endDate.toISOString());
        }

        // Get total count for pagination
        let countQuery = supabase
          .from("webhook_logs")
          .select("*", { count: "exact", head: true })
          .in("product_id", productIds);

        if (appliedFilters.status === "success") {
          countQuery = countQuery.eq("success", true);
        } else if (appliedFilters.status === "failed") {
          countQuery = countQuery.eq("success", false);
        }

        if (appliedFilters.webhookUrl) {
          countQuery = countQuery.ilike("webhook_url", `%${appliedFilters.webhookUrl}%`);
        }

        if (appliedFilters.startDate) {
          countQuery = countQuery.gte("created_at", new Date(appliedFilters.startDate).toISOString());
        }
        
        if (appliedFilters.endDate) {
          const endDate = new Date(appliedFilters.endDate);
          endDate.setHours(23, 59, 59, 999);
          countQuery = countQuery.lte("created_at", endDate.toISOString());
        }

        const { count } = await countQuery;
        
        if (count !== null) {
          setTotalCount(count);
        }

        // Fetch paginated data
        const from = (currentPage - 1) * itemsPerPage;
        const to = from + itemsPerPage - 1;

        const { data: logsData } = await logsQuery
          .order("created_at", { ascending: false })
          .range(from, to);

        if (logsData) {
          setLogs(logsData);
        }
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

  const fetchSalesWithWebhookStatus = async (productIds: string[], productsData: Product[]) => {
    // Get confirmed/received transactions
    let txQuery = supabase
      .from("transactions")
      .select("id, product_id, customer_name, customer_email, value, status, created_at")
      .in("product_id", productIds)
      .in("status", ["RECEIVED", "CONFIRMED"]);

    if (appliedFilters.startDate) {
      txQuery = txQuery.gte("created_at", new Date(appliedFilters.startDate).toISOString());
    }
    if (appliedFilters.endDate) {
      const endDate = new Date(appliedFilters.endDate);
      endDate.setHours(23, 59, 59, 999);
      txQuery = txQuery.lte("created_at", endDate.toISOString());
    }

    // Count query
    let countQuery = supabase
      .from("transactions")
      .select("*", { count: "exact", head: true })
      .in("product_id", productIds)
      .in("status", ["RECEIVED", "CONFIRMED"]);

    if (appliedFilters.startDate) {
      countQuery = countQuery.gte("created_at", new Date(appliedFilters.startDate).toISOString());
    }
    if (appliedFilters.endDate) {
      const endDate = new Date(appliedFilters.endDate);
      endDate.setHours(23, 59, 59, 999);
      countQuery = countQuery.lte("created_at", endDate.toISOString());
    }

    const { count } = await countQuery;
    if (count !== null) {
      setSalesTotalCount(count);
    }

    // Paginated transactions
    const from = (salesCurrentPage - 1) * salesItemsPerPage;
    const to = from + salesItemsPerPage - 1;

    const { data: transactions } = await txQuery
      .order("created_at", { ascending: false })
      .range(from, to);

    if (!transactions || transactions.length === 0) {
      setSalesWebhooks([]);
      return;
    }

    // Get webhook logs for these transactions
    const transactionIds = transactions.map(t => t.id);
    
    const { data: webhookLogs } = await supabase
      .from("webhook_logs")
      .select("payload, success")
      .in("product_id", productIds);

    // Get webhook queue for these transactions
    const { data: webhookQueue } = await supabase
      .from("webhook_queue")
      .select("payload, status")
      .in("product_id", productIds);

    // Check which products have webhooks configured
    const { data: productWebhooks } = await supabase
      .from("product_webhooks")
      .select("product_id")
      .in("product_id", productIds)
      .eq("is_active", true);

    const productsWithWebhooks = new Set(productWebhooks?.map(pw => pw.product_id) || []);

    // Map transactions to webhook status
    const salesStatus: SaleWebhookStatus[] = transactions.map(tx => {
      const productName = productsData.find(p => p.id === tx.product_id)?.name || "Produto";
      
      // Check if webhook was sent in logs (match by transaction_id in payload)
      const logEntry = webhookLogs?.find(log => 
        log.payload && typeof log.payload === 'object' && 
        (log.payload as any).transaction_id === tx.id
      );
      
      // Check queue status
      const queueEntry = webhookQueue?.find(q => 
        q.payload && typeof q.payload === 'object' && 
        (q.payload as any).transaction_id === tx.id
      );

      let webhookStatus: 'sent' | 'pending' | 'failed' | 'no_webhook' = 'no_webhook';
      
      if (!productsWithWebhooks.has(tx.product_id)) {
        webhookStatus = 'no_webhook';
      } else if (logEntry?.success) {
        webhookStatus = 'sent';
      } else if (queueEntry?.status === 'pending' || queueEntry?.status === 'processing') {
        webhookStatus = 'pending';
      } else if (queueEntry?.status === 'failed' || logEntry?.success === false) {
        webhookStatus = 'failed';
      } else {
        webhookStatus = 'pending'; // Has webhook config but no log/queue = never sent
      }

      return {
        transactionId: tx.id,
        productId: tx.product_id,
        productName,
        customerName: tx.customer_name,
        customerEmail: tx.customer_email,
        value: tx.value,
        status: tx.status,
        webhookSent: webhookStatus === 'sent',
        webhookStatus,
        createdAt: tx.created_at,
      };
    });

    setSalesWebhooks(salesStatus);
  };

  const handleRetry = async (queueItem: WebhookQueueItem) => {
    setRetrying(queueItem.id);
    try {
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

  const handleSendWebhook = async (sale: SaleWebhookStatus) => {
    setSendingWebhook(sale.transactionId);
    try {
      const { data, error } = await supabase.functions.invoke("send-sale-webhook", {
        body: { transactionId: sale.transactionId },
      });

      if (error) throw error;

      setSendResult(data);
      setSendResultDialog(true);

      if (data.success) {
        toast.success("Webhook enviado com sucesso!");
      } else {
        toast.error(data.error || "Erro ao enviar webhook");
      }

      fetchData();
    } catch (error: any) {
      console.error("Error sending webhook:", error);
      toast.error(error.message || "Erro ao enviar webhook");
    } finally {
      setSendingWebhook(null);
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

  const getWebhookStatusBadge = (status: SaleWebhookStatus['webhookStatus']) => {
    switch (status) {
      case 'sent':
        return <Badge className="bg-green-500/10 text-green-600">Enviado</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pendente</Badge>;
      case 'failed':
        return <Badge variant="destructive">Falhou</Badge>;
      case 'no_webhook':
        return <Badge variant="outline" className="text-muted-foreground">Sem webhook</Badge>;
    }
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

  const applyFilters = () => {
    setCurrentPage(1);
    setSalesCurrentPage(1);
    setAppliedFilters(tempFilters);
  };

  const clearFilters = () => {
    const emptyFilters = {
      productId: "all",
      status: "all",
      webhookUrl: "",
      startDate: "",
      endDate: "",
    };
    setTempFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setCurrentPage(1);
    setSalesCurrentPage(1);
  };

  const totalPages = Math.ceil(totalCount / itemsPerPage);
  const salesTotalPages = Math.ceil(salesTotalCount / salesItemsPerPage);

  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(Number(value));
    setCurrentPage(1);
  };

  const handleSalesItemsPerPageChange = (value: string) => {
    setSalesItemsPerPage(Number(value));
    setSalesCurrentPage(1);
  };

  const hasActiveFilters = appliedFilters.productId !== "all" || 
    appliedFilters.status !== "all" || 
    appliedFilters.webhookUrl !== "" || 
    appliedFilters.startDate !== "" || 
    appliedFilters.endDate !== "";

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Webhooks</h1>
          <p className="text-muted-foreground">
            Monitore e envie webhooks para suas vendas
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
                {Object.values(appliedFilters).filter(v => v !== "" && v !== "all").length}
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
              <CardTitle>Filtros</CardTitle>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="w-4 h-4 mr-2" />
                  Limpar
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="product-filter">Produto</Label>
                <Select
                  value={tempFilters.productId}
                  onValueChange={(value) =>
                    setTempFilters({ ...tempFilters, productId: value })
                  }
                >
                  <SelectTrigger id="product-filter">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="start-date">Data Inicial</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={tempFilters.startDate}
                  onChange={(e) =>
                    setTempFilters({ ...tempFilters, startDate: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end-date">Data Final</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={tempFilters.endDate}
                  onChange={(e) =>
                    setTempFilters({ ...tempFilters, endDate: e.target.value })
                  }
                />
              </div>

              <div className="flex items-end">
                <Button onClick={applyFilters} className="w-full">
                  Buscar
                </Button>
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
            <p className="text-xs text-muted-foreground">Webhooks na fila</p>
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

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="sales">Vendas</TabsTrigger>
          <TabsTrigger value="failed">Falhados ({stats.failed})</TabsTrigger>
          <TabsTrigger value="history">Histórico</TabsTrigger>
        </TabsList>

        {/* Sales Tab - Webhook per Sale */}
        <TabsContent value="sales" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Webhooks por Venda</CardTitle>
              <CardDescription>
                {salesTotalCount > 0 
                  ? `${salesTotalCount} ${salesTotalCount === 1 ? 'venda confirmada' : 'vendas confirmadas'}`
                  : 'Nenhuma venda confirmada'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">Carregando...</p>
              ) : salesWebhooks.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma venda confirmada encontrada
                </p>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produto</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Status Pagamento</TableHead>
                        <TableHead>Status Webhook</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead className="text-right">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {salesWebhooks.map((sale) => (
                        <TableRow key={sale.transactionId}>
                          <TableCell className="font-medium">
                            {sale.productName}
                          </TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{sale.customerName}</div>
                              <div className="text-xs text-muted-foreground">{sale.customerEmail}</div>
                            </div>
                          </TableCell>
                          <TableCell>{formatCurrency(sale.value)}</TableCell>
                          <TableCell>
                            <Badge className="bg-green-500/10 text-green-600">
                              {sale.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {getWebhookStatusBadge(sale.webhookStatus)}
                          </TableCell>
                          <TableCell>
                            {format(new Date(sale.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </TableCell>
                          <TableCell className="text-right">
                            {sale.webhookStatus !== 'no_webhook' && (
                              <Button
                                size="sm"
                                variant={sale.webhookStatus === 'sent' ? 'outline' : 'default'}
                                onClick={() => handleSendWebhook(sale)}
                                disabled={sendingWebhook === sale.transactionId}
                              >
                                {sendingWebhook === sale.transactionId ? (
                                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                  <Send className="w-4 h-4 mr-2" />
                                )}
                                {sale.webhookStatus === 'sent' ? 'Reenviar' : 'Enviar'}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Pagination */}
                  <div className="flex items-center justify-between pt-4 border-t mt-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        Itens por página:
                      </span>
                      <Select value={salesItemsPerPage.toString()} onValueChange={handleSalesItemsPerPageChange}>
                        <SelectTrigger className="w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="25">25</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                          <SelectItem value="100">100</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="text-sm text-muted-foreground ml-4">
                        {((salesCurrentPage - 1) * salesItemsPerPage) + 1} - {Math.min(salesCurrentPage * salesItemsPerPage, salesTotalCount)} de {salesTotalCount}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSalesCurrentPage(salesCurrentPage - 1)}
                        disabled={salesCurrentPage === 1}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        {salesCurrentPage} / {salesTotalPages || 1}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSalesCurrentPage(salesCurrentPage + 1)}
                        disabled={salesCurrentPage >= salesTotalPages}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Failed Tab */}
        <TabsContent value="failed" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Webhooks Falhados</CardTitle>
              <CardDescription>
                Webhooks que falharam após múltiplas tentativas
              </CardDescription>
            </CardHeader>
            <CardContent>
              {failedQueue.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum webhook falhado
                </p>
              ) : (
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
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Histórico de Entregas</CardTitle>
              <CardDescription>
                {totalCount > 0 ? `${totalCount} entregas registradas` : 'Nenhuma entrega registrada'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">Carregando...</p>
              ) : logs.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum webhook foi enviado ainda
                </p>
              ) : (
                <>
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

                  {/* Pagination */}
                  <div className="flex items-center justify-between pt-4 border-t mt-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        Itens por página:
                      </span>
                      <Select value={itemsPerPage.toString()} onValueChange={handleItemsPerPageChange}>
                        <SelectTrigger className="w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="25">25</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                          <SelectItem value="100">100</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="text-sm text-muted-foreground ml-4">
                        {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, totalCount)} de {totalCount}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(currentPage - 1)}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        {currentPage} / {totalPages || 1}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(currentPage + 1)}
                        disabled={currentPage >= totalPages}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Send Result Dialog */}
      <Dialog open={sendResultDialog} onOpenChange={setSendResultDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {sendResult?.success ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <AlertCircle className="w-5 h-5 text-destructive" />
              )}
              Resultado do Envio
            </DialogTitle>
            <DialogDescription>
              {sendResult?.message || sendResult?.error}
            </DialogDescription>
          </DialogHeader>
          
          {sendResult?.results && (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {sendResult.results.map((result: any, index: number) => (
                <div key={index} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-sm truncate flex-1 mr-2">
                      {result.webhookUrl}
                    </span>
                    {result.success ? (
                      <Badge className="bg-green-500/10 text-green-600">
                        {result.status}
                      </Badge>
                    ) : (
                      <Badge variant="destructive">Erro</Badge>
                    )}
                  </div>
                  {result.response && (
                    <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                      {result.response}
                    </pre>
                  )}
                  {result.error && (
                    <p className="text-xs text-destructive">{result.error}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
