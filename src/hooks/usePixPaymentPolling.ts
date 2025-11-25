import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UsePixPaymentPollingProps {
  paymentId: string | null;
  userId: string | null;
  onSuccess: () => void;
  onError: (error: string) => void;
  enabled: boolean;
}

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
  userId,
  onSuccess,
  onError,
  enabled,
}: UsePixPaymentPollingProps) {
  const [isPolling, setIsPolling] = useState(false);
  const [checkCount, setCheckCount] = useState(0);
  const timeoutRef = useRef<number>();
  const startTimeRef = useRef<number>();
  const currentDelayRef = useRef<number>(DEFAULT_CONFIG.initialDelay);
  const abortControllerRef = useRef<AbortController>();

  const checkPaymentStatus = useCallback(async () => {
    if (!paymentId || !userId || !enabled) return;

    try {
      // Criar novo AbortController para esta requisição
      abortControllerRef.current = new AbortController();

      const { data, error } = await supabase.functions.invoke('check-payment-status', {
        body: { paymentId, userId },
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

      return false; // Continuar polling
    } catch (error: any) {
      // Ignorar erros de abort
      if (error.name === 'AbortError') return false;
      
      console.error('Error checking payment status:', error);
      // Não para o polling em caso de erro de rede, apenas loga
      return false;
    }
  }, [paymentId, userId, enabled, onSuccess]);

  const scheduleNextCheck = useCallback(() => {
    if (!enabled) return;

    const elapsed = Date.now() - (startTimeRef.current || 0);
    
    // Verificar timeout total
    if (elapsed >= DEFAULT_CONFIG.maxDuration) {
      setIsPolling(false);
      onError('Tempo limite para verificação do pagamento excedido. Por favor, verifique seu e-mail ou entre em contato com o suporte.');
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
  }, [enabled, checkPaymentStatus, onError]);

  const startPolling = useCallback(() => {
    if (isPolling || !enabled || !paymentId || !userId) return;

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
  }, [isPolling, enabled, paymentId, userId, checkPaymentStatus, scheduleNextCheck]);

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
    if (enabled && paymentId && userId && !isPolling) {
      startPolling();
    }

    return () => {
      stopPolling();
    };
  }, [enabled, paymentId, userId]);

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
