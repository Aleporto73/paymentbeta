import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ProductLinksTabProps {
  productId: string;
}

export function ProductLinksTab({ productId }: ProductLinksTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Links de Divulgação</CardTitle>
        <CardDescription>Gerencie os links de divulgação do seu produto</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">Em desenvolvimento...</p>
      </CardContent>
    </Card>
  );
}
