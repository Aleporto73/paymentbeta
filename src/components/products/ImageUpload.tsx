import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ImageUploadProps {
  currentImageUrl?: string | null;
  onImageUploaded: (url: string) => void;
  onImageRemoved: () => void;
}

export function ImageUpload({ currentImageUrl, onImageUploaded, onImageRemoved }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl || null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const uploadImage = async (file: File) => {
    try {
      setUploading(true);

      // Validate file type
      if (!file.type.startsWith("image/")) {
        throw new Error("O arquivo deve ser uma imagem");
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        throw new Error("A imagem deve ter no máximo 5MB");
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Generate unique filename
      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("product-images")
        .getPublicUrl(fileName);

      setPreviewUrl(publicUrl);
      onImageUploaded(publicUrl);

      toast({
        title: "Imagem enviada!",
        description: "A imagem foi carregada com sucesso.",
      });
    } catch (error: any) {
      toast({
        title: "Erro ao enviar imagem",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadImage(file);
    }
  };

  const handleRemove = async () => {
    if (!previewUrl) return;

    try {
      // Extract file path from URL
      const url = new URL(previewUrl);
      const pathParts = url.pathname.split("/");
      const filePath = pathParts.slice(pathParts.indexOf("product-images") + 1).join("/");

      // Delete from storage
      const { error } = await supabase.storage
        .from("product-images")
        .remove([filePath]);

      if (error) throw error;

      setPreviewUrl(null);
      onImageRemoved();

      toast({
        title: "Imagem removida",
        description: "A imagem foi excluída com sucesso.",
      });
    } catch (error: any) {
      toast({
        title: "Erro ao remover imagem",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <Label>Imagem do Produto</Label>
      
      {previewUrl ? (
        <div className="relative inline-block">
          <img
            src={previewUrl}
            alt="Preview"
            className="w-full max-w-xs rounded-lg border"
          />
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2"
            onClick={handleRemove}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        <div
          className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Enviando imagem...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Clique para selecionar uma imagem
              </p>
              <p className="text-xs text-muted-foreground">
                PNG, JPG ou WEBP (máx. 5MB)
              </p>
            </div>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
        disabled={uploading}
      />
    </div>
  );
}
