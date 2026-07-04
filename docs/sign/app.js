/* SiteScop V6 — GitHub Cloud Signing (GitHub Pages client portal)
 * Reads agreement data from public raw GitHub URLs.
 * Submits signatures via the SiteScop desktop signing relay (no secrets in browser). */
(function () {
  'use strict';

  const TYPE_LABELS = { BUILDING: 'Building', PEST: 'Pest', COMBINED: 'Building & Pest' };
  const token = new URLSearchParams(location.search).get('token') || '';

  function cfg() {
    const c = window.SITESCOP_SIGN_CONFIG;
    if (!c || !c.owner || !c.repo) {
      throw new Error('Missing config.js — copy config.example.js to config.js on GitHub.');
    }
    return c;
  }

  function rawGitHubUrl(path) {
    const c = cfg();
    const branch = c.branch || 'main';
    return (
      'https://raw.githubusercontent.com/' +
      encodeURIComponent(c.owner) +
      '/' +
      encodeURIComponent(c.repo) +
      '/' +
      encodeURIComponent(branch) +
      '/' +
      path
    );
  }

  function formatAud(cents) {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cents / 100);
  }

  function formatDate(iso) {
    if (!iso) return '';
    const parts = iso.slice(0, 10).split('-');
    return parts[2] + '/' + parts[1] + '/' + parts[0];
  }

  async function fetchPendingAgreement() {
    let res;
    try {
      res = await fetch(rawGitHubUrl('agreements/pending/' + token + '.json'));
    } catch {
      throw new Error('Network error — could not reach GitHub.');
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('Could not load agreement from GitHub (' + res.status + ').');
    return res.json();
  }

  function submitEndpoints(pending) {
    const endpoints = [];
    const relay = pending && pending.submitEndpoints;
    if (relay && relay.public) endpoints.push(relay.public);
    if (relay && relay.lan) endpoints.push(relay.lan);
    return endpoints;
  }

  async function relayRequest(baseUrl, suffix, options) {
    const url = baseUrl.replace(/\/$/, '') + suffix;
    let res;
    try {
      res = await fetch(url, options);
    } catch {
      throw new Error('Network error — could not reach the SiteScop signing relay.');
    }
    if (res.status === 204) return null;
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    if (!res.ok) {
      const message = (body && body.error) || 'Signing relay request failed (' + res.status + ').';
      throw new Error(message);
    }
    return body;
  }

  async function relayWithFallback(pending, suffix, options) {
    const endpoints = submitEndpoints(pending);
    if (!endpoints.length) {
      throw new Error(
        'This agreement has no secure signing relay. Ask your inspector to re-send the link from SiteScop.',
      );
    }

    let lastError = null;
    for (let i = 0; i < endpoints.length; i += 1) {
      try {
        return await relayRequest(endpoints[i], suffix, options);
      } catch (e) {
        lastError = e;
        if (i === endpoints.length - 1) throw e;
      }
    }
    throw lastError || new Error('Could not reach the SiteScop signing relay.');
  }

  function renderError(message) {
    document.getElementById('app').innerHTML =
      '<div class="wrap"><div class="card center"><p class="error">' + escapeHtml(message) + '</p></div></div>';
  }

  function renderSuccess(agreementNumber) {
    document.getElementById('app').innerHTML =
      '<div class="wrap"><div class="card center">' +
      '<div class="success-icon">✓</div>' +
      '<h1>Agreement signed</h1>' +
      '<p class="muted">Thank you. Agreement <strong>' +
      escapeHtml(agreementNumber) +
      '</strong> has been submitted securely.</p>' +
      '</div></div>';
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function setupSignaturePad(canvas) {
    const ctx = canvas.getContext('2d');
    let drawing = false;
    let empty = true;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * devicePixelRatio);
      canvas.height = Math.floor(rect.height * devicePixelRatio);
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#1a2332';
    }

    function pos(e) {
      const rect = canvas.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }

    function start(e) {
      e.preventDefault();
      drawing = true;
      empty = false;
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    }

    function move(e) {
      if (!drawing) return;
      e.preventDefault();
      const p = pos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }

    function end() {
      drawing = false;
    }

    resize();
    window.addEventListener('resize', resize);
    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mouseup', end);
    canvas.addEventListener('mouseleave', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);

    return {
      clear() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        empty = true;
      },
      isEmpty() {
        return empty;
      },
      toDataUrl() {
        return empty ? '' : canvas.toDataURL('image/png');
      },
    };
  }

  function renderAgreement(agreement, pending) {
    const sections = agreement.legalSections.sections
      .map(function (s) {
        return (
          '<div class="section"><h2>' +
          escapeHtml(s.title) +
          '</h2><p>' +
          escapeHtml(s.content) +
          '</p></div>'
        );
      })
      .join('');

    const signBlock = agreement.canSign
      ? '<div class="card" id="sign-form">' +
        '<h2 style="color:var(--text)">Sign agreement</h2>' +
        '<div id="form-error" class="error" hidden></div>' +
        '<label class="field">Full name<input type="text" id="signature-name" value="' +
        escapeHtml(agreement.clientName) +
        '" /></label>' +
        '<p class="label">Signature</p>' +
        '<div class="sig-wrap"><canvas id="signature-canvas"></canvas></div>' +
        '<div class="sig-actions"><button type="button" class="btn-secondary" id="clear-sig">Clear signature</button></div>' +
        '<label class="checkbox"><input type="checkbox" id="accepted" />' +
        '<span>I have read and accept the terms, scope, limitations, privacy policy, and client declaration.</span></label>' +
        '<button type="button" class="btn-primary" id="submit-btn" disabled>Sign and submit</button></div>'
      : '<div class="card center"><p class="muted">This agreement is already ' +
        escapeHtml(agreement.status.toLowerCase()) +
        '.</p></div>';

    document.getElementById('app').innerHTML =
      '<div class="wrap">' +
      '<div class="card"><p class="muted">' +
      escapeHtml(agreement.companyName) +
      '</p>' +
      '<h1>Client Inspection Agreement</h1>' +
      '<p class="muted">' +
      escapeHtml(agreement.agreementNumber) +
      ' · ' +
      escapeHtml(TYPE_LABELS[agreement.inspectionType] || agreement.inspectionType) +
      '</p></div>' +
      '<div class="card"><div class="grid">' +
      '<div><div class="label">Client</div><div>' +
      escapeHtml(agreement.clientName) +
      '</div><div class="muted">' +
      escapeHtml(agreement.clientEmail) +
      '</div></div>' +
      '<div><div class="label">Property</div><div>' +
      escapeHtml(agreement.propertyAddress) +
      '</div></div>' +
      '<div><div class="label">Total (inc. GST)</div><div class="price">' +
      formatAud(agreement.totalCents) +
      '</div></div>' +
      '<div><div class="label">Agreement date</div><div>' +
      formatDate(agreement.agreementDate) +
      '</div></div></div></div>' +
      '<div class="card">' +
      sections +
      '</div>' +
      signBlock +
      '</div>';

    if (!agreement.canSign) return;

    const canvasEl = document.getElementById('signature-canvas');
    const pad = setupSignaturePad(canvasEl);
    const nameInput = document.getElementById('signature-name');
    const accepted = document.getElementById('accepted');
    const submitBtn = document.getElementById('submit-btn');
    const formError = document.getElementById('form-error');

    function validate() {
      submitBtn.disabled = !(nameInput.value.trim() && !pad.isEmpty() && accepted.checked);
    }

    nameInput.addEventListener('input', validate);
    accepted.addEventListener('change', validate);
    document.getElementById('clear-sig').addEventListener('click', function () {
      pad.clear();
      validate();
    });
    canvasEl.addEventListener('mouseup', validate);
    canvasEl.addEventListener('touchend', validate);

    submitBtn.addEventListener('click', async function () {
      formError.hidden = true;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting…';
      try {
        await relayWithFallback(pending, '', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            signatureName: nameInput.value.trim(),
            signatureData: pad.toDataUrl(),
            declarationsAccepted: true,
          }),
        });
        renderSuccess(pending.agreementNumber);
      } catch (e) {
        formError.textContent = e.message || 'Signing failed';
        formError.hidden = false;
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign and submit';
        validate();
      }
    });
  }

  async function boot() {
    if (!token) {
      renderError('Invalid signing link — token is missing.');
      return;
    }

    try {
      const pending = await fetchPendingAgreement();
      if (!pending || !pending.publicView) {
        renderError('This agreement link is invalid or has expired.');
        return;
      }

      void relayWithFallback(pending, '/viewed', { method: 'POST' }).catch(function () {});

      renderAgreement(pending.publicView, pending);
    } catch (e) {
      renderError(e.message || 'Could not load agreement.');
    }
  }

  boot();
})();
