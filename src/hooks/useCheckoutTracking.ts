import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface TrackCheckoutParams {
  productId: string;
  priceId?: string;
  affiliateCode?: string;
}

export function useCheckoutTracking({ productId, priceId, affiliateCode }: TrackCheckoutParams) {
  const sessionId = useRef<string>(
    `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  );
  const hasTrackedView = useRef(false);

  useEffect(() => {
    // Track checkout view only once
    if (!hasTrackedView.current && productId) {
      trackEvent("view");
      hasTrackedView.current = true;
    }

    // Track abandon on page unload
    const handleBeforeUnload = () => {
      if (hasTrackedView.current) {
        trackEvent("abandon", { sendBeacon: true });
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [productId]);

  const trackEvent = async (
    eventType: "view" | "abandon" | "conversion",
    options?: {
      orderBumpsSelected?: string[];
      totalAmount?: number;
      orderBumpsAmount?: number;
      sendBeacon?: boolean;
    }
  ) => {
    const eventData = {
      session_id: sessionId.current,
      product_id: productId,
      price_id: priceId || null,
      affiliate_code: affiliateCode || null,
      event_type: eventType,
      order_bumps_selected: options?.orderBumpsSelected || null,
      total_amount: options?.totalAmount || 0,
      order_bumps_amount: options?.orderBumpsAmount || 0,
      user_agent: navigator.userAgent,
    };

    if (options?.sendBeacon) {
      // Use sendBeacon for abandon events to ensure they're sent even when page is closing
      const blob = new Blob([JSON.stringify(eventData)], { type: "application/json" });
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-checkout`;
      navigator.sendBeacon(url, blob);
    } else {
      try {
        await supabase.from("checkout_events").insert(eventData);
      } catch (error) {
        console.error("Error tracking checkout event:", error);
      }
    }
  };

  const trackConversion = (orderBumpsSelected: string[], totalAmount: number, orderBumpsAmount: number) => {
    trackEvent("conversion", {
      orderBumpsSelected,
      totalAmount,
      orderBumpsAmount,
    });
  };

  return { trackConversion };
}
