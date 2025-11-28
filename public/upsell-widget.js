(function() {
  'use strict';

  // Get configuration from script tag
  const currentScript = document.currentScript || document.querySelector('script[data-upsell-id]');
  const upsellId = currentScript?.dataset.upsellId;

  if (!upsellId) {
    console.error('[Upsell Widget] Missing upsellId');
    return;
  }

  const API_URL = window.location.origin;

  // Widget state
  let upsellData = null;
  let customerData = null;
  let isProcessing = false;
  let transactionToken = null;

  // Create widget styles
  const styles = `
    .upsell-modal-overlay {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      z-index: 999999;
      animation: fadeIn 0.3s ease;
    }
    .upsell-modal-overlay.active {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes slideUp {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .upsell-modal {
      max-width: 600px;
      width: 100%;
      max-height: 90vh;
      overflow-y: auto;
      background: white;
      border-radius: 1rem;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      animation: slideUp 0.3s ease;
      position: relative;
    }
    .upsell-modal-close {
      position: absolute;
      top: 1rem;
      right: 1rem;
      background: rgba(0, 0, 0, 0.1);
      border: none;
      border-radius: 50%;
      width: 32px;
      height: 32px;
      cursor: pointer;
      font-size: 20px;
      line-height: 1;
      color: #333;
      transition: background 0.2s;
      z-index: 10;
    }
    .upsell-modal-close:hover {
      background: rgba(0, 0, 0, 0.2);
    }
    .upsell-modal-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 2rem;
      border-radius: 1rem 1rem 0 0;
    }
    .upsell-modal-title {
      font-size: 1.75rem;
      font-weight: bold;
      margin: 0 0 0.5rem 0;
      padding-right: 2rem;
    }
    .upsell-modal-subtitle {
      font-size: 1rem;
      opacity: 0.95;
      margin: 0;
    }
    .upsell-modal-body {
      padding: 2rem;
    }
    .upsell-content {
      display: flex;
      gap: 1.5rem;
      align-items: flex-start;
      margin-bottom: 1.5rem;
    }
    .upsell-image {
      width: 120px;
      height: 120px;
      object-fit: cover;
      border-radius: 0.5rem;
      border: 3px solid #f0f0f0;
      flex-shrink: 0;
    }
    .upsell-details {
      flex: 1;
    }
    .upsell-product-name {
      font-size: 0.875rem;
      color: #666;
      margin: 0 0 0.5rem 0;
      font-weight: 500;
    }
    .upsell-description {
      font-size: 0.95rem;
      color: #333;
      margin: 0 0 1rem 0;
      line-height: 1.6;
    }
    .upsell-price-container {
      background: #f8f9fa;
      padding: 1rem;
      border-radius: 0.5rem;
      margin-bottom: 1.5rem;
    }
    .upsell-price {
      display: flex;
      align-items: baseline;
      gap: 0.75rem;
    }
    .upsell-price-label {
      font-size: 0.875rem;
      color: #666;
      margin-bottom: 0.25rem;
    }
    .upsell-price-value {
      font-size: 2rem;
      font-weight: bold;
      color: #10b981;
    }
    .upsell-price-discount {
      font-size: 1rem;
      text-decoration: line-through;
      color: #999;
    }
    .upsell-discount-badge {
      display: inline-block;
      background: #10b981;
      color: white;
      padding: 0.25rem 0.75rem;
      border-radius: 1rem;
      font-size: 0.875rem;
      font-weight: 600;
      margin-top: 0.5rem;
    }
    .upsell-buttons {
      display: flex;
      gap: 1rem;
      margin-top: 1.5rem;
    }
    .upsell-button {
      flex: 1;
      padding: 1rem 2rem;
      font-size: 1.1rem;
      font-weight: bold;
      border: none;
      border-radius: 0.5rem;
      cursor: pointer;
      transition: all 0.2s;
      font-family: inherit;
    }
    .upsell-button-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .upsell-button-primary:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4);
    }
    .upsell-button-secondary {
      background: #f3f4f6;
      color: #666;
    }
    .upsell-button-secondary:hover:not(:disabled) {
      background: #e5e7eb;
    }
    .upsell-button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .upsell-message {
      margin-top: 1rem;
      padding: 1rem;
      border-radius: 0.5rem;
      text-align: center;
    }
    .upsell-error {
      background: #fee;
      color: #c00;
    }
    .upsell-success {
      background: #efe;
      color: #060;
    }
    .upsell-loading {
      text-align: center;
      padding: 2rem;
      color: #666;
    }
    @media (max-width: 640px) {
      .upsell-modal {
        max-height: 100vh;
        border-radius: 0;
      }
      .upsell-modal-header {
        border-radius: 0;
        padding: 1.5rem;
      }
      .upsell-modal-body {
        padding: 1.5rem;
      }
      .upsell-content {
        flex-direction: column;
        text-align: center;
      }
      .upsell-image {
        width: 100px;
        height: 100px;
        margin: 0 auto;
      }
      .upsell-buttons {
        flex-direction: column;
      }
    }
  `;

  // Inject styles
  const styleElement = document.createElement('style');
  styleElement.textContent = styles;
  document.head.appendChild(styleElement);

  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.className = 'upsell-modal-overlay';
  overlay.innerHTML = `
    <div class="upsell-modal">
      <button class="upsell-modal-close" onclick="closeUpsellModal()">&times;</button>
      <div id="upsell-modal-content">
        <div class="upsell-loading">
          <p>Carregando oferta especial...</p>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Close modal on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeUpsellModal();
    }
  });

  // Global functions
  window.openUpsellModal = function() {
    console.log('[Upsell Widget] Opening modal');
    
    // Get transaction token from URL or localStorage
    const urlParams = new URLSearchParams(window.location.search);
    console.log('[Upsell Widget] URL params:', window.location.search);
    
    transactionToken = urlParams.get('transaction_token');
    console.log('[Upsell Widget] Token from URL:', transactionToken ? 'Found' : 'Not found');

    // Se não estiver na URL, buscar no localStorage
    if (!transactionToken) {
      console.log('[Upsell Widget] Checking localStorage for token');
      transactionToken = localStorage.getItem('transaction_token');
      console.log('[Upsell Widget] Token from localStorage:', transactionToken ? 'Found' : 'Not found');
      
      // Verificar se o token não expirou
      if (transactionToken) {
        const expiryDate = localStorage.getItem('transaction_token_expiry');
        console.log('[Upsell Widget] Token expiry date:', expiryDate);
        
        if (expiryDate && new Date(expiryDate) < new Date()) {
          // Token expirado, limpar
          console.log('[Upsell Widget] Token expired, removing from localStorage');
          localStorage.removeItem('transaction_token');
          localStorage.removeItem('transaction_token_expiry');
          transactionToken = null;
        } else {
          console.log('[Upsell Widget] Token is valid (not expired)');
        }
      }
    }

    console.log('[Upsell Widget] Final token status:', transactionToken ? 'Available' : 'Not available');
    console.log('[Upsell Widget] Token value (first 10 chars):', transactionToken ? transactionToken.substring(0, 10) + '...' : 'null');

    if (!transactionToken) {
      console.error('[Upsell Widget] No transaction token found!');
      console.log('[Upsell Widget] localStorage keys:', Object.keys(localStorage));
      alert('Token de transação não encontrado. Este upsell só funciona em páginas de confirmação de pagamento.');
      return;
    }

    overlay.classList.add('active');
    
    if (!upsellData) {
      loadUpsellData();
    }
  };

  window.closeUpsellModal = function() {
    overlay.classList.remove('active');
  };

  function loadUpsellData() {
    const contentDiv = document.getElementById('upsell-modal-content');
    
    console.log('[Upsell Widget] Loading upsell data');
    console.log('[Upsell Widget] API URL:', API_URL);
    console.log('[Upsell Widget] Upsell ID:', upsellId);
    console.log('[Upsell Widget] Transaction Token (first 10 chars):', transactionToken ? transactionToken.substring(0, 10) + '...' : 'null');
    
    const payload = {
      upsellCode: upsellId,
      transactionToken: transactionToken,
    };
    console.log('[Upsell Widget] Request payload:', payload);
    
    fetch(`${API_URL}/functions/v1/get-upsell-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
      .then(response => {
        console.log('[Upsell Widget] Response status:', response.status);
        return response.json();
      })
      .then(data => {
        console.log('[Upsell Widget] Response data:', data);
        
        if (data.error) {
          throw new Error(data.error);
        }

        upsellData = data.upsell;
        customerData = data.customer;
        upsellData.oneClickAvailable = data.oneClickAvailable;
        upsellData.paymentMethod = data.paymentMethod;

        console.log('[Upsell Widget] Upsell data loaded successfully');
        renderModal();
      })
      .catch(error => {
        console.error('[Upsell Widget] Error loading data:', error);
        console.error('[Upsell Widget] Error details:', error.message);
        contentDiv.innerHTML = `
          <div class="upsell-modal-body">
            <div class="upsell-message upsell-error">
              Não foi possível carregar a oferta. Por favor, tente novamente.<br>
              <small style="font-size: 0.85em; opacity: 0.8;">Erro: ${error.message}</small>
            </div>
          </div>
        `;
      });
  }

  function renderModal() {
    const contentDiv = document.getElementById('upsell-modal-content');
    
    // Check if one-click payment is available
    const oneClickAvailable = upsellData.oneClickAvailable !== false;
    const paymentMethod = upsellData.paymentMethod || 'UNKNOWN';
    
    const discountHtml = upsellData.discount_percentage
      ? `<span class="upsell-price-discount">R$ ${(upsellData.price / (1 - upsellData.discount_percentage / 100)).toFixed(2)}</span>
         <div class="upsell-discount-badge">-${upsellData.discount_percentage}% OFF</div>`
      : '';

    // Payment warning if one-click not available
    const paymentWarning = !oneClickAvailable 
      ? `<div class="upsell-warning" style="background: #fef3c7; border: 1px solid #f59e0b; color: #92400e; padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 14px;">
          ⚠️ Pagamento one-click disponível apenas para compras com cartão de crédito. 
          ${paymentMethod === 'PIX' ? 'Sua compra anterior foi com PIX.' : 'Token de cartão não encontrado.'}
        </div>`
      : '';

    contentDiv.innerHTML = `
      <div class="upsell-modal-header">
        <h2 class="upsell-modal-title">${upsellData.title}</h2>
        <p class="upsell-modal-subtitle">Oferta exclusiva para você, ${customerData.name}!</p>
      </div>
      <div class="upsell-modal-body">
        ${paymentWarning}
        <div class="upsell-content">
          ${upsellData.product.image_url ? `<img src="${upsellData.product.image_url}" alt="${upsellData.title}" class="upsell-image" />` : ''}
          <div class="upsell-details">
            <p class="upsell-product-name">${upsellData.product.name}</p>
            ${upsellData.description ? `<p class="upsell-description">${upsellData.description}</p>` : ''}
          </div>
        </div>
        
        <div class="upsell-price-container">
          <div class="upsell-price-label">Preço especial:</div>
          <div class="upsell-price">
            <span class="upsell-price-value">R$ ${upsellData.price.toFixed(2)}</span>
            ${discountHtml}
          </div>
        </div>

        <div class="upsell-buttons">
          <button id="upsell-decline-button" class="upsell-button upsell-button-secondary" onclick="closeUpsellModal()">
            Não, obrigado
          </button>
          <button id="upsell-accept-button" class="upsell-button upsell-button-primary" ${!oneClickAvailable ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
            ✨ Sim, quero aproveitar! (One-Click)
          </button>
        </div>
        <div id="upsell-message"></div>
      </div>
    `;

    // Add click handler only if one-click is available
    if (oneClickAvailable) {
      document.getElementById('upsell-accept-button').addEventListener('click', handlePurchase);
    }
  }

  function handlePurchase() {
    if (isProcessing) return;

    isProcessing = true;
    const button = document.getElementById('upsell-accept-button');
    const declineButton = document.getElementById('upsell-decline-button');
    const messageDiv = document.getElementById('upsell-message');

    button.disabled = true;
    declineButton.disabled = true;
    button.textContent = 'Processando pagamento...';
    messageDiv.innerHTML = '';

    fetch(`${API_URL}/functions/v1/process-upsell-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        upsellCode: upsellId,
        transactionToken: transactionToken,
      }),
    })
      .then(response => response.json())
      .then(data => {
        if (data.error) {
          throw new Error(data.error);
        }

        messageDiv.innerHTML = `
          <div class="upsell-message upsell-success">
            <strong>🎉 Pagamento processado com sucesso!</strong><br>
            Redirecionando...
          </div>
        `;
        
        // Redirect after success
        setTimeout(() => {
          if (upsellData.redirect_url) {
            window.location.href = upsellData.redirect_url;
          } else {
            closeUpsellModal();
          }
        }, 2000);
      })
      .catch(error => {
        console.error('[Upsell Widget] Payment error:', error);
        messageDiv.innerHTML = `
          <div class="upsell-message upsell-error">
            <strong>Erro ao processar pagamento</strong><br>
            ${error.message || 'Por favor, tente novamente.'}
          </div>
        `;
        button.disabled = false;
        declineButton.disabled = false;
        button.textContent = '✨ Sim, quero aproveitar! (One-Click)';
        isProcessing = false;
      });
  }
})();
