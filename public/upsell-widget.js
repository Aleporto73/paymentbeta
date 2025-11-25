(function() {
  'use strict';

  // Get configuration from script tag
  const currentScript = document.currentScript || document.querySelector('script[data-upsell-id]');
  const upsellId = currentScript?.dataset.upsellId;
  const containerId = currentScript?.dataset.containerId;

  if (!upsellId || !containerId) {
    console.error('[Upsell Widget] Missing upsellId or containerId');
    return;
  }

  // Get transaction token from URL
  const urlParams = new URLSearchParams(window.location.search);
  const transactionToken = urlParams.get('transaction_token');

  if (!transactionToken) {
    console.error('[Upsell Widget] Missing transaction_token in URL');
    return;
  }

  const API_URL = window.location.origin;

  // Widget state
  let upsellData = null;
  let customerData = null;
  let isProcessing = false;

  // Create widget styles
  const styles = `
    .upsell-widget {
      max-width: 600px;
      margin: 2rem auto;
      padding: 2rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 1rem;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .upsell-content {
      display: flex;
      gap: 1.5rem;
      align-items: center;
      margin-bottom: 1.5rem;
    }
    .upsell-image {
      width: 120px;
      height: 120px;
      object-fit: cover;
      border-radius: 0.5rem;
      border: 3px solid rgba(255, 255, 255, 0.3);
    }
    .upsell-details {
      flex: 1;
    }
    .upsell-title {
      font-size: 1.5rem;
      font-weight: bold;
      margin: 0 0 0.5rem 0;
    }
    .upsell-description {
      font-size: 0.95rem;
      opacity: 0.95;
      margin: 0 0 1rem 0;
      line-height: 1.5;
    }
    .upsell-price {
      display: flex;
      align-items: baseline;
      gap: 0.5rem;
    }
    .upsell-price-value {
      font-size: 2rem;
      font-weight: bold;
    }
    .upsell-price-discount {
      font-size: 1rem;
      text-decoration: line-through;
      opacity: 0.7;
    }
    .upsell-button {
      width: 100%;
      padding: 1rem 2rem;
      font-size: 1.1rem;
      font-weight: bold;
      background: white;
      color: #667eea;
      border: none;
      border-radius: 0.5rem;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .upsell-button:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 5px 20px rgba(0, 0, 0, 0.2);
    }
    .upsell-button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .upsell-error {
      background: #ef4444;
      padding: 1rem;
      border-radius: 0.5rem;
      margin-top: 1rem;
      text-align: center;
    }
    .upsell-success {
      background: #10b981;
      padding: 1rem;
      border-radius: 0.5rem;
      margin-top: 1rem;
      text-align: center;
    }
    .upsell-loading {
      text-align: center;
      padding: 2rem;
    }
    @media (max-width: 640px) {
      .upsell-widget {
        padding: 1.5rem;
      }
      .upsell-content {
        flex-direction: column;
        text-align: center;
      }
      .upsell-image {
        width: 100px;
        height: 100px;
      }
    }
  `;

  // Inject styles
  const styleElement = document.createElement('style');
  styleElement.textContent = styles;
  document.head.appendChild(styleElement);

  // Get container
  const container = document.getElementById(containerId);
  if (!container) {
    console.error('[Upsell Widget] Container not found:', containerId);
    return;
  }

  // Show loading
  container.innerHTML = `
    <div class="upsell-widget">
      <div class="upsell-loading">
        <p>Carregando oferta especial...</p>
      </div>
    </div>
  `;

  // Fetch upsell data
  fetch(`${API_URL}/functions/v1/get-upsell-data`, {
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

      upsellData = data.upsell;
      customerData = data.customer;

      renderWidget();
    })
    .catch(error => {
      console.error('[Upsell Widget] Error loading data:', error);
      container.innerHTML = `
        <div class="upsell-widget">
          <div class="upsell-error">
            Não foi possível carregar a oferta. Por favor, tente novamente.
          </div>
        </div>
      `;
    });

  function renderWidget() {
    const discountHtml = upsellData.discount_percentage
      ? `<span class="upsell-price-discount">R$ ${(upsellData.price / (1 - upsellData.discount_percentage / 100)).toFixed(2)}</span>`
      : '';

    container.innerHTML = `
      <div class="upsell-widget">
        <div class="upsell-content">
          ${upsellData.product.image_url ? `<img src="${upsellData.product.image_url}" alt="${upsellData.title}" class="upsell-image" />` : ''}
          <div class="upsell-details">
            <h2 class="upsell-title">${upsellData.title}</h2>
            ${upsellData.description ? `<p class="upsell-description">${upsellData.description}</p>` : ''}
            <div class="upsell-price">
              <span class="upsell-price-value">R$ ${upsellData.price.toFixed(2)}</span>
              ${discountHtml}
            </div>
          </div>
        </div>
        <button id="upsell-buy-button" class="upsell-button">
          ✨ Sim, quero aproveitar essa oferta! (One-Click)
        </button>
        <div id="upsell-message"></div>
      </div>
    `;

    // Add click handler
    document.getElementById('upsell-buy-button').addEventListener('click', handlePurchase);
  }

  function handlePurchase() {
    if (isProcessing) return;

    isProcessing = true;
    const button = document.getElementById('upsell-buy-button');
    const messageDiv = document.getElementById('upsell-message');

    button.disabled = true;
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
          <div class="upsell-success">
            <strong>🎉 Pagamento processado com sucesso!</strong><br>
            Você receberá os detalhes por e-mail em breve.
          </div>
        `;
        button.style.display = 'none';
      })
      .catch(error => {
        console.error('[Upsell Widget] Payment error:', error);
        messageDiv.innerHTML = `
          <div class="upsell-error">
            <strong>Erro ao processar pagamento</strong><br>
            ${error.message || 'Por favor, tente novamente.'}
          </div>
        `;
        button.disabled = false;
        button.textContent = '✨ Sim, quero aproveitar essa oferta! (One-Click)';
        isProcessing = false;
      });
  }
})();
