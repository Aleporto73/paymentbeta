import { supabase } from "@/integrations/supabase/client";

interface ConversionEventParams {
  productId: string;
  eventType: "InitiateCheckout" | "Purchase";
  value: number;
  currency?: string;
  transactionId?: string;
  customerEmail?: string;
  customerName?: string;
}

export function useConversionTracking() {
  const sendConversionEvent = async (params: ConversionEventParams) => {
    try {
      const { data, error } = await supabase.functions.invoke("send-conversion-events", {
        body: {
          productId: params.productId,
          eventType: params.eventType,
          value: params.value,
          currency: params.currency || "BRL",
          transactionId: params.transactionId,
          customerEmail: params.customerEmail,
          customerName: params.customerName,
        },
      });

      if (error) {
        console.error("Error sending conversion event:", error);
        return { success: false, error };
      }

      console.log("Conversion event sent successfully:", data);
      return { success: true, data };
    } catch (error) {
      console.error("Error invoking conversion tracking:", error);
      return { success: false, error };
    }
  };

  return { sendConversionEvent };
}
