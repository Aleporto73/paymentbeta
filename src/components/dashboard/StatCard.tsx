import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  iconColor?: string;
  /** Linha extra de contexto abaixo da variação (ex.: contagem + ticket médio). */
  subtitle?: string;
  additionalMetrics?: {
    label: string;
    value: string;
  }[];
}

export function StatCard({
  title,
  value,
  change,
  changeType = "neutral",
  icon: Icon,
  iconColor = "text-primary",
  subtitle,
  additionalMetrics
}: StatCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow duration-200">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="space-y-2 flex-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold tracking-tight">{value}</p>
            {change && (
              <p className={cn(
                "text-sm font-medium flex items-center gap-1",
                changeType === "positive" && "text-success",
                changeType === "negative" && "text-destructive",
                changeType === "neutral" && "text-muted-foreground"
              )}>
                {change}
              </p>
            )}
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          <div className={cn(
            "p-3 rounded-lg",
            iconColor === "text-primary" && "bg-primary-light",
            iconColor === "text-success" && "bg-success-light",
            iconColor === "text-warning" && "bg-warning-light",
            iconColor === "text-info" && "bg-info-light"
          )}>
            <Icon className={cn("h-6 w-6", iconColor)} />
          </div>
        </div>
        {additionalMetrics && additionalMetrics.length > 0 && (
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border">
            {additionalMetrics.map((metric, index) => (
              <div key={index}>
                <p className="text-xs text-muted-foreground mb-1">{metric.label}</p>
                <p className="text-sm font-semibold">{metric.value}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
