(function () {
  const previewHost = /(^|\.)github\.io$/i.test(window.location.hostname);
  const endpoint = '/api/intake';

  function value(form, name) {
    const input = form.elements.namedItem(name);
    return input && typeof input.value === 'string' ? input.value : '';
  }

  document.querySelectorAll('form[data-intake-form], form[action^="mailto:"]').forEach((form) => {
    const inquiryByPath = {
      'sell-a-business.html': 'Sell a business',
      'business-valuation.html': 'Business valuation',
      'buy-a-business.html': 'Buy a business',
      'business-consulting.html': 'Business consulting'
    };
    const path = window.location.pathname.split('/').pop() || 'index.html';
    if (!form.elements.namedItem('Website')) {
      const honeypot = document.createElement('input');
      honeypot.name = 'Website'; honeypot.autocomplete = 'off'; honeypot.tabIndex = -1;
      honeypot.setAttribute('aria-hidden', 'true'); honeypot.className = 'hp-field';
      form.append(honeypot);
    }
    const status = document.createElement('p');
    status.className = 'intake-status';
    status.setAttribute('aria-live', 'polite');
    form.append(status);

    form.addEventListener('submit', async (event) => {
      // The public GitHub Pages review stays a review-only site until production hosting is connected.
      if (previewHost) return;
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      const original = button ? button.innerHTML : '';
      if (button) { button.disabled = true; button.textContent = 'Sending…'; }
      status.textContent = '';

      const params = new URLSearchParams(window.location.search);
      const payload = {
        name: value(form, 'Name'), email: value(form, 'Email'), phone: value(form, 'Phone'),
        businessName: value(form, 'Business name'), timing: value(form, 'Timing'),
        focus: value(form, 'Focus'), revenueRange: value(form, 'Revenue range'),
        investmentRange: value(form, 'Investment range'), industry: value(form, 'Industry'),
        inquiryType: form.dataset.inquiryType || inquiryByPath[path] || 'Private inquiry', page: window.location.href,
        utmSource: params.get('utm_source') || '', utmCampaign: params.get('utm_campaign') || '',
        website: value(form, 'Website')
      };

      try {
        const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || 'Unable to send your request.');
        form.reset();
        status.classList.add('success');
        status.textContent = 'Received. Sean will follow up privately.';
      } catch (error) {
        status.classList.remove('success');
        status.textContent = `${error.message} You can also call (801) 433-7974.`;
      } finally {
        if (button) { button.disabled = false; button.innerHTML = original; }
      }
    });
  });
})();
