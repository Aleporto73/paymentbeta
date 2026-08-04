import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UsePixPaymentPollingProps {
  paymentId: string | null;
  /**
   * Capacidade devolvida uma unica vez por create-payment. Autoriza consultar
   * SOMENTE este paymentId e expira em 30 minutos.
   *
   * Vive apenas em memoria: nao vai para URL, localStorage nem sessionStorage.
   * O polling nao precisa sobreviver a recarga -- um reload perde o paymentResult
   * e portanto ja perdia o polling antes desta mudanca.
   */
  pollingToken: string | null;
  onSuccess: () => void;
  /**
   * Recusa/cancelamento FINANCEIRO confirmado pelo gateway (REFUSED, DECLINED,
   * FAILED, REJECTED, CANCELLED, DELETED). So este callback deve levar o
   * cliente ao fluxo de pagamento recusado.
   */
  onRefused: (status: string) => void;
  /**
   * Fim da janela de verificacao SEM resposta definitiva. Nao e recusa: o PIX
   * continua valido e pagavel. O chamador decide como orientar o cliente e pode
   * reiniciar a verificacao com startPolling().
   */
  onTimeout: () => void;
  enabled: boolean;
}

// Status finais negativos do Asaas. Qualquer outro status nao confirmado
// (PENDING, AWAITING_RISK_ANALYSIS, ...) mantem o polling: ausencia de
// confirmacao nunca e tratada como recusa.
const REFUSED_STATUSES = new Set([
  'REFUSED',
  'DECLINED',
  'FAILED',
  'REJECTED',
  'CANCELLED',
  'DELETED',
]);

interface PollingConfig {
  initialDelay: number;
  maxDelay: number;
  maxDuration: number;
  backoffMultiplier: number;
}

const DEFAULT_CONFIG: PollingConfig = {
  initialDelay: 3000,      // 3 segundos inicial
  maxDelay: 10000,         // 10 segundos máximo entre checks
  maxDuration: 900000,     // 15 minutos timeout total
  backoffMultiplier: 1.5,  // Aumenta 50% a cada iteração
};

export function usePixPaymentPolling({
  paymentId,
  pollingToken,
  onSuccess,
  onRefused,
  onTimeout,
  enabled,
}: UsePixPaymentPollingProps) {
  const [isPolling, setIsPolling] = useState(false);
  const [checkCount, setCheckCount] = useState(0);
  const timeoutRef = useRef<number>();
  const startTimeRef = useRef<number>();
  const currentDelayRef = useRef<number>(DEFAULT_CONFIG.initialDelay);
  const abortControllerRef = useRef<AbortController>();

  const checkPaymentStatus = useCallback(async () => {
    if (!paymentId || !pollingToken || !enabled) return;

    try {
      // Criar novo AbortController para esta requisição
      abortControllerRef.current = new AbortController();

      const { data, error } = await supabase.functions.invoke('check-payment-status', {
        body: { paymentId, pollingToken },
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || 'Failed to check payment status');
      }

      setCheckCount(prev => prev + 1);

      // Verificar se o pagamento foi confirmado
      if (data.status === 'CONFIRMED' || data.status === 'RECEIVED') {
        setIsPolling(false);
        onSuccess();
        return true; // Parar polling
      }

      // Recusa/cancelamento definitivo: este e o UNICO caminho que leva ao
      // fluxo de pagamento recusado. Timeout e erro tecnico nao passam por aqui.
      // check-payment-status repassa o status cru do Asaas, sempre maiusculo.
      if (REFUSED_STATUSES.has(data.status)) {
        setIsPolling(false);
        onRefused(data.status);
        return true; // Parar polling
      }

      return false; // Continuar polling (pending e afins)
    } catch (error: any) {
      // Ignorar erros de abort
      if (error.name === 'AbortError') return false;

      console.error('Error checking payment status:', error);
      // Erro tecnico/de rede nao e recusa: nao para o polling, apenas loga
      return false;
    }
  }, [paymentId, pollingToken, enabled, onSuccess, onRefused]);

  const scheduleNextCheck = useCallback(() => {
    if (!enabled) return;

    const elapsed = Date.now() - (startTimeRef.current || 0);

    // Fim da janela de verificacao. Isto NAO e recusa: o PIX segue valido (o
    // vencimento da cobranca e de dias, nao minutos). Apenas paramos de
    // consultar e avisamos o chamador; o cliente pode reiniciar com
    // startPolling() ("Ja paguei") e o webhook confirma de qualquer forma.
    if (elapsed >= DEFAULT_CONFIG.maxDuration) {
      setIsPolling(false);
      onTimeout();
      return;
    }

    // Calcular próximo delay com exponential backoff
    const nextDelay = Math.min(
      currentDelayRef.current * DEFAULT_CONFIG.backoffMultiplier,
      DEFAULT_CONFIG.maxDelay
    );
    currentDelayRef.current = nextDelay;

    // Usar setTimeout ao invés de setInterval para melhor controle
    timeoutRef.current = window.setTimeout(async () => {
      const shouldStop = await checkPaymentStatus();
      if (!shouldStop) {
        scheduleNextCheck();
      }
    }, currentDelayRef.current);
  }, [enabled, checkPaymentStatus, onTimeout]);

  const startPolling = useCallback(() => {
    if (isPolling || !enabled || !paymentId || !pollingToken) return;

    console.log('Starting intelligent PIX payment polling...');
    setIsPolling(true);
    startTimeRef.current = Date.now();
    currentDelayRef.current = DEFAULT_CONFIG.initialDelay;
    setCheckCount(0);

    // Fazer primeira verificação imediatamente
    checkPaymentStatus().then((shouldStop) => {
      if (!shouldStop) {
        scheduleNextCheck();
      }
    });
  }, [isPolling, enabled, paymentId, pollingToken, checkPaymentStatus, scheduleNextCheck]);

  const stopPolling = useCallback(() => {
    console.log('Stopping PIX payment polling...');
    setIsPolling(false);
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = undefined;
    }
  }, []);

  // Iniciar polling quando enabled muda para true
  useEffect(() => {
    if (enabled && paymentId && pollingToken && !isPolling) {
      startPolling();
    }

    return () => {
      stopPolling();
    };
  }, [enabled, paymentId, pollingToken]);

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  return {
    isPolling,
    checkCount,
    stopPolling,
    startPolling,
  };
}
