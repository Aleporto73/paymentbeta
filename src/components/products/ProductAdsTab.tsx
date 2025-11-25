import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";
import { Tables } from "@/integrations/supabase/types";

interface ProductAdsTabProps {
  productId: string;
}

type AdsConfig = Tables<"product_ads_configs">;

const platformInfo = {
  meta: "Meta Ads (Facebook/Instagram)",
  google: "Google Ads",
  tiktok: "TikTok Ads",
  taboola: "Taboola Ads",
};

// Validação específica por plataforma
const validatePixelId = (platform: string, pixelId: string): string | null => {
  if (!pixelId.trim()) return "Pixel ID é obrigatório";
  
  switch (platform) {
    case "meta":
      // Meta Pixel ID: 15-16 dígitos numéricos
      if (!/^\d{15,16}$/.test(pixelId)) {
        return "Pixel ID do Meta deve conter 15-16 dígitos numéricos";
      }
      break;
    case "google":
      // Google Ads Conversion ID: formato AW-XXXXXXXXXX
      if (!/^AW-\d{9,11}$/.test(pixelId)) {
        return "Conversion ID do Google deve estar no formato AW-XXXXXXXXXX";
      }
      break;
    case "tiktok":
      // TikTok Pixel ID: alfanumérico, geralmente começa com C
      if (!/^[A-Z0-9]{15,20}$/.test(pixelId)) {
        return "Pixel ID do TikTok deve conter 15-20 caracteres alfanuméricos";
      }
      break;
    case "taboola":
      // Taboola Pixel ID: numérico
      if (!/^\d{5,10}$/.test(pixelId)) {
        return "Pixel ID do Taboola deve conter 5-10 dígitos numéricos";
      }
      break;
  }
  return null;
};

const validateToken = (platform: string, token: string): string | null => {
  if (!token.trim()) return null; // Token é opcional para algumas plataformas
  
  switch (platform) {
    case "meta":
      // Meta Access Token: geralmente começa com EAA
      if (!token.startsWith("EAA") || token.length < 50) {
        return "Token de acesso do Meta inválido (deve começar com EAA e ter pelo menos 50 caracteres)";
      }
      break;
    case "google":
      // Google Ads não usa token adicional na maioria dos casos
      break;
    case "tiktok":
      // TikTok Access Token: geralmente longo
      if (token.length < 30) {
        return "Token de acesso do TikTok deve ter pelo menos 30 caracteres";
      }
      break;
    case "taboola":
      // Taboola não especifica formato particular
      if (token.length < 10) {
        return "Token deve ter pelo menos 10 caracteres";
      }
      break;
  }
  return null;
};

export function ProductAdsTab({ productId }: ProductAdsTabProps) {
  const [configs, setConfigs] = useState<AdsConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<AdsConfig | null>(null);
  const [formData, setFormData] = useState({
    platform: "",
    pixel_id: "",
    token: "",
    is_active: true,
  });
  const [errors, setErrors] = useState({
    pixel_id: "",
    token: "",
  });

  useEffect(() => {
    fetchConfigs();
  }, [productId]);

  const fetchConfigs = async () => {
    try {
      const { data, error } = await supabase
        .from("product_ads_configs")
        .select("*")
        .eq("product_id", productId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setConfigs(data || []);
    } catch (error) {
      console.error("Error fetching ads configs:", error);
      toast.error("Erro ao carregar configurações de anúncios");
    } finally {
      setLoading(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors = {
      pixel_id: validatePixelId(formData.platform, formData.pixel_id) || "",
      token: validateToken(formData.platform, formData.token) || "",
    };
    
    setErrors(newErrors);
    return !newErrors.pixel_id && !newErrors.token;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast.error("Por favor, corrija os erros no formulário");
      return;
    }

    // Verificar se já existe config para esta plataforma
    if (!editingConfig) {
      const existingConfig = configs.find((c) => c.platform === formData.platform);
      if (existingConfig) {
        toast.error("Já existe uma configuração para esta plataforma");
        return;
      }
    }

    try {
      if (editingConfig) {
        const { error } = await supabase
          .from("product_ads_configs")
          .update({
            pixel_id: formData.pixel_id,
            token: formData.token || null,
            is_active: formData.is_active,
          })
          .eq("id", editingConfig.id);

        if (error) throw error;
        toast.success("Configuração atualizada com sucesso!");
      } else {
        const { error } = await supabase
          .from("product_ads_configs")
          .insert({
            product_id: productId,
            platform: formData.platform,
            pixel_id: formData.pixel_id,
            token: formData.token || null,
            is_active: formData.is_active,
          });

        if (error) throw error;
        toast.success("Configuração criada com sucesso!");
      }

      setDialogOpen(false);
      setEditingConfig(null);
      setFormData({ platform: "", pixel_id: "", token: "", is_active: true });
      setErrors({ pixel_id: "", token: "" });
      fetchConfigs();
    } catch (error) {
      console.error("Error saving ads config:", error);
      toast.error("Erro ao salvar configuração");
    }
  };

  const handleEdit = (config: AdsConfig) => {
    setEditingConfig(config);
    setFormData({
      platform: config.platform,
      pixel_id: config.pixel_id || "",
      token: config.token || "",
      is_active: config.is_active,
    });
    setErrors({ pixel_id: "", token: "" });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deseja realmente excluir esta configuração?")) return;

    try {
      const { error } = await supabase
        .from("product_ads_configs")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Configuração excluída com sucesso!");
      fetchConfigs();
    } catch (error) {
      console.error("Error deleting ads config:", error);
      toast.error("Erro ao excluir configuração");
    }
  };

  const handleToggleActive = async (config: AdsConfig) => {
    try {
      const { error } = await supabase
        .from("product_ads_configs")
        .update({ is_active: !config.is_active })
        .eq("id", config.id);

      if (error) throw error;
      toast.success(`Configuração ${!config.is_active ? "ativada" : "desativada"} com sucesso!`);
      fetchConfigs();
    } catch (error) {
      console.error("Error toggling ads config:", error);
      toast.error("Erro ao alterar status da configuração");
    }
  };

  const availablePlatforms = Object.keys(platformInfo).filter(
    (platform) => !configs.some((c) => c.platform === platform)
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Configurações de Anúncios</CardTitle>
            <CardDescription>
              Configure Pixels e Tokens para suas plataformas de anúncios
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) {
              setEditingConfig(null);
              setFormData({ platform: "", pixel_id: "", token: "", is_active: true });
              setErrors({ pixel_id: "", token: "" });
            }
          }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Plataforma
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>
                  {editingConfig ? "Editar Configuração" : "Adicionar Plataforma"}
                </DialogTitle>
                <DialogDescription>
                  Configure o Pixel ID e Token para rastreamento de conversões
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="platform">Plataforma *</Label>
                    <Select
                      value={formData.platform}
                      onValueChange={(value) => {
                        setFormData({ ...formData, platform: value });
                        setErrors({ pixel_id: "", token: "" });
                      }}
                      disabled={!!editingConfig}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a plataforma" />
                      </SelectTrigger>
                      <SelectContent>
                        {(editingConfig ? [editingConfig.platform] : availablePlatforms).map((platform) => (
                          <SelectItem key={platform} value={platform}>
                            {platformInfo[platform as keyof typeof platformInfo]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pixel_id">Pixel ID / Conversion ID *</Label>
                    <Input
                      id="pixel_id"
                      placeholder={
                        formData.platform === "meta" ? "Ex: 1234567890123456" :
                        formData.platform === "google" ? "Ex: AW-1234567890" :
                        formData.platform === "tiktok" ? "Ex: C4A1B2C3D4E5F6G7" :
                        formData.platform === "taboola" ? "Ex: 12345678" :
                        "Digite o Pixel ID"
                      }
                      value={formData.pixel_id}
                      onChange={(e) => {
                        setFormData({ ...formData, pixel_id: e.target.value });
                        if (errors.pixel_id) {
                          setErrors({ ...errors, pixel_id: "" });
                        }
                      }}
                      required
                    />
                    {errors.pixel_id && (
                      <p className="text-sm text-destructive">{errors.pixel_id}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="token">Token de Acesso (opcional)</Label>
                    <Input
                      id="token"
                      type="password"
                      placeholder="Digite o token se necessário"
                      value={formData.token}
                      onChange={(e) => {
                        setFormData({ ...formData, token: e.target.value });
                        if (errors.token) {
                          setErrors({ ...errors, token: "" });
                        }
                      }}
                    />
                    {errors.token && (
                      <p className="text-sm text-destructive">{errors.token}</p>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="is_active"
                      checked={formData.is_active}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, is_active: checked })
                      }
                    />
                    <Label htmlFor="is_active">Configuração ativa</Label>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit">
                    {editingConfig ? "Atualizar" : "Criar"}
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
        ) : configs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma plataforma configurada para este produto
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plataforma</TableHead>
                <TableHead>Pixel ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data de Criação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {configs.map((config) => (
                <TableRow key={config.id}>
                  <TableCell className="font-medium">
                    {platformInfo[config.platform as keyof typeof platformInfo]}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {config.pixel_id}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={config.is_active}
                      onCheckedChange={() => handleToggleActive(config)}
                    />
                  </TableCell>
                  <TableCell>
                    {new Date(config.created_at).toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(config)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(config.id)}
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
