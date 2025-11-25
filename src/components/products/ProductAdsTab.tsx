import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit, Facebook, Chrome } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tables } from "@/integrations/supabase/types";

interface ProductAdsTabProps {
  productId: string;
}

type AdsConfig = Tables<"product_ads_configs">;

const platformInfo = {
  meta: {
    name: "Meta Ads (Facebook/Instagram)",
    icon: Facebook,
    color: "text-blue-600",
  },
  google: {
    name: "Google Ads",
    icon: Chrome,
    color: "text-red-600",
  },
  tiktok: {
    name: "TikTok Ads",
    icon: Plus,
    color: "text-black",
  },
  taboola: {
    name: "Taboola Ads",
    icon: Plus,
    color: "text-blue-700",
  },
};

export function ProductAdsTab({ productId }: ProductAdsTabProps) {
  const [configs, setConfigs] = useState<AdsConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [showPlatformSelector, setShowPlatformSelector] = useState(true);
  const [selectedPlatform, setSelectedPlatform] = useState<keyof typeof platformInfo | null>(null);
  const [editingConfig, setEditingConfig] = useState<AdsConfig | null>(null);
  const [formData, setFormData] = useState({
    pixel_id: "",
    token: "",
    is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchConfigs();
  }, [productId]);

  const fetchConfigs = async () => {
    try {
      const { data, error } = await supabase
        .from("product_ads_configs")
        .select("*")
        .eq("product_id", productId)
        .order("platform");

      if (error) throw error;
      setConfigs(data || []);
    } catch (error) {
      console.error("Error fetching ads configs:", error);
      toast({
        title: "Erro",
        description: "Erro ao carregar configurações de anúncios",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = () => {
    setShowDialog(true);
    setShowPlatformSelector(true);
    setSelectedPlatform(null);
    setEditingConfig(null);
    setFormData({ pixel_id: "", token: "", is_active: true });
  };

  const handleSelectPlatform = (platform: keyof typeof platformInfo) => {
    const exists = configs.find((c) => c.platform === platform);
    if (exists && !editingConfig) {
      toast({
        title: "Atenção",
        description: "Esta plataforma já está configurada",
        variant: "destructive",
      });
      return;
    }
    setSelectedPlatform(platform);
    setShowPlatformSelector(false);
  };

  const handleEdit = (config: AdsConfig) => {
    setEditingConfig(config);
    setSelectedPlatform(config.platform as keyof typeof platformInfo);
    setFormData({
      pixel_id: config.pixel_id || "",
      token: config.token || "",
      is_active: config.is_active,
    });
    setShowPlatformSelector(false);
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!selectedPlatform) return;

    setSaving(true);
    try {
      const dataToSave = {
        id: editingConfig?.id,
        product_id: productId,
        platform: selectedPlatform,
        pixel_id: formData.pixel_id || null,
        token: formData.token || null,
        is_active: formData.is_active,
      };

      const { error } = await supabase
        .from("product_ads_configs")
        .upsert(dataToSave);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: editingConfig
          ? "Configuração atualizada com sucesso"
          : "Configuração criada com sucesso",
      });
      setShowDialog(false);
      fetchConfigs();
    } catch (error) {
      console.error("Error saving ads config:", error);
      toast({
        title: "Erro",
        description: "Erro ao salvar configuração",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      const { error } = await supabase
        .from("product_ads_configs")
        .delete()
        .eq("id", deleteId);

      if (error) throw error;

      toast({
        title: "Sucesso",
        description: "Configuração removida com sucesso",
      });
      fetchConfigs();
    } catch (error) {
      console.error("Error deleting ads config:", error);
      toast({
        title: "Erro",
        description: "Erro ao remover configuração",
        variant: "destructive",
      });
    } finally {
      setDeleteId(null);
    }
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setShowPlatformSelector(true);
    setSelectedPlatform(null);
    setEditingConfig(null);
    setFormData({ pixel_id: "", token: "", is_active: true });
  };

  if (loading) {
    return <div className="p-6">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Configurações de Anúncios</h3>
          <p className="text-sm text-muted-foreground">
            Configure Pixels e Tokens para suas plataformas de anúncios
          </p>
        </div>
        <Button onClick={handleOpenDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Adicionar Plataforma
        </Button>
      </div>

      {configs.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Nenhuma plataforma configurada. Adicione uma plataforma para começar.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {configs.map((config) => {
            const PlatformIcon = platformInfo[config.platform as keyof typeof platformInfo]?.icon || Plus;
            return (
              <Card key={config.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <PlatformIcon className={`h-6 w-6 ${platformInfo[config.platform as keyof typeof platformInfo]?.color}`} />
                      <div>
                        <CardTitle>{platformInfo[config.platform as keyof typeof platformInfo]?.name}</CardTitle>
                        <CardDescription className="mt-1">
                          {config.pixel_id ? `Pixel ID: ${config.pixel_id}` : "Pixel ID não configurado"}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleEdit(config)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteId(config.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm ${config.is_active ? "text-green-600" : "text-muted-foreground"}`}>
                      {config.is_active ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={handleCloseDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {showPlatformSelector
                ? "Selecione a Plataforma"
                : editingConfig
                ? "Editar Configuração"
                : "Configurar Plataforma"}
            </DialogTitle>
            <DialogDescription>
              {showPlatformSelector
                ? "Escolha qual plataforma de anúncios você deseja configurar"
                : "Configure o Pixel ID e Token para esta plataforma"}
            </DialogDescription>
          </DialogHeader>

          {showPlatformSelector ? (
            <div className="grid grid-cols-2 gap-4 py-4">
              {(Object.keys(platformInfo) as Array<keyof typeof platformInfo>).map((platform) => {
                const PlatformIcon = platformInfo[platform].icon;
                const isConfigured = configs.some((c) => c.platform === platform);
                return (
                  <Button
                    key={platform}
                    variant="outline"
                    className="h-24 flex flex-col items-center justify-center gap-2"
                    onClick={() => handleSelectPlatform(platform)}
                    disabled={isConfigured && !editingConfig}
                  >
                    <PlatformIcon className={`h-8 w-8 ${platformInfo[platform].color}`} />
                    <span className="text-sm text-center">{platformInfo[platform].name}</span>
                    {isConfigured && (
                      <span className="text-xs text-muted-foreground">(Configurado)</span>
                    )}
                  </Button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
                {selectedPlatform && (
                  <>
                    {(() => {
                      const PlatformIcon = platformInfo[selectedPlatform].icon;
                      return <PlatformIcon className={`h-6 w-6 ${platformInfo[selectedPlatform].color}`} />;
                    })()}
                    <span className="font-medium">{selectedPlatform && platformInfo[selectedPlatform].name}</span>
                  </>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="pixel_id">Pixel ID</Label>
                <Input
                  id="pixel_id"
                  placeholder="Digite o Pixel ID"
                  value={formData.pixel_id}
                  onChange={(e) => setFormData({ ...formData, pixel_id: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="token">Token</Label>
                <Input
                  id="token"
                  type="password"
                  placeholder="Digite o Token"
                  value={formData.token}
                  onChange={(e) => setFormData({ ...formData, token: e.target.value })}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label htmlFor="is_active">Configuração ativa</Label>
              </div>
            </div>
          )}

          <DialogFooter>
            {!showPlatformSelector && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowPlatformSelector(true);
                    setSelectedPlatform(null);
                  }}
                >
                  Voltar
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Salvando..." : "Salvar Configuração"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover esta configuração? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
