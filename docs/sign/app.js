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

  function setAppContent(html) {
    const root = document.getElementById('app');
    root.classList.remove('loading');
    root.innerHTML = html;
  }

  function renderError(message) {
    setAppContent(
      '<div class="wrap"><div class="card center"><p class="error">' + escapeHtml(message) + '</p></div></div>',
    );
  }

  function renderSuccess(agreementNumber) {
    setAppContent(
      '<div class="wrap"><div class="card center">' +
      '<div class="success-icon">✓</div>' +
      '<h1>Agreement signed</h1>' +
      '<p class="muted">Thank you. Agreement <strong>' +
      escapeHtml(agreementNumber) +
      '</strong> has been submitted securely.</p>' +
      '</div></div>',
    );
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

  function sectionIconSvg(sectionId, title) {
    const lower = (sectionId + ' ' + title).toLowerCase();
    if (lower.includes('limit')) {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>';
    }
    if (lower.includes('scope')) {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>';
    }
    if (lower.includes('term')) {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>';
    }
    if (lower.includes('privacy')) {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>';
    }
    if (lower.includes('declar')) {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>';
  }

  function signatureIconSvg() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
  }

  function chevronSvg() {
    return '<svg class="accordion-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>';
  }

  function matchesSection(section, keyword) {
    const hay = (section.id + ' ' + section.title).toLowerCase();
    return hay.includes(keyword);
  }

  function renderProgressBar(state) {
    const steps = [
      { id: 'overview', label: 'Read Agreement' },
      { id: 'terms', label: 'Terms & Conditions' },
      { id: 'privacy', label: 'Privacy Policy' },
      { id: 'signature', label: 'Signature' },
    ];

    return (
      '<nav class="progress-bar" aria-label="Signing progress">' +
      steps
        .map(function (step, index) {
          const complete = state.completed[step.id];
          const active = state.active === step.id;
          const isSignature = step.id === 'signature';
          const clickable = isSignature && state.signatureUnlocked;
          let cls = 'progress-step';
          if (complete) cls += ' is-complete';
          if (active) cls += ' is-active';
          if (clickable) cls += ' is-clickable';

          const dot = complete ? '✓' : String(index + 1);
          const disabled = isSignature && !state.signatureUnlocked;

          return (
            '<button type="button" class="' +
            cls +
            '" data-progress-step="' +
            step.id +
            '"' +
            (disabled ? ' disabled' : '') +
            ' aria-label="' +
            escapeHtml(step.label) +
            '">' +
            '<span class="step-dot">' +
            dot +
            '</span>' +
            '<span class="step-label">' +
            escapeHtml(step.label) +
            '</span>' +
            '</button>'
          );
        })
        .join('') +
      '</nav>'
    );
  }

  function renderLegalAccordion(sections, openIndex) {
    return sections
      .map(function (s, index) {
        const isOpen = index === openIndex;
        return (
          '<div class="accordion-item' +
          (isOpen ? ' is-open' : '') +
          '" data-accordion-index="' +
          index +
          '" data-section-id="' +
          escapeHtml(s.id) +
          '">' +
          '<button type="button" class="accordion-header" aria-expanded="' +
          isOpen +
          '">' +
          '<span class="accordion-icon">' +
          sectionIconSvg(s.id, s.title) +
          '</span>' +
          '<span class="accordion-title-wrap">' +
          '<p class="accordion-title">' +
          escapeHtml(s.title) +
          '</p>' +
          '<p class="accordion-subtitle">Tap to ' +
          (isOpen ? 'collapse' : 'read') +
          '</p>' +
          '</span>' +
          chevronSvg() +
          '</button>' +
          '<div class="accordion-panel">' +
          '<div class="accordion-panel-inner">' +
          '<div class="accordion-body"><p>' +
          escapeHtml(s.content) +
          '</p></div>' +
          '</div>' +
          '</div>' +
          '</div>'
        );
      })
      .join('');
  }

  function renderSignatureAccordion(locked) {
    return (
      '<div class="accordion-item sign-card' +
      (locked ? ' is-locked' : '') +
      '" id="sign-accordion" data-accordion-signature="true">' +
      '<button type="button" class="accordion-header" aria-expanded="false" ' +
      (locked ? 'disabled' : '') +
      '>' +
      '<span class="accordion-icon">' +
      signatureIconSvg() +
      '</span>' +
      '<span class="accordion-title-wrap">' +
      '<p class="accordion-title">Sign agreement</p>' +
      '<p class="accordion-subtitle">' +
      (locked ? 'Read the privacy policy first' : 'Enter your name and signature') +
      '</p>' +
      '</span>' +
      chevronSvg() +
      '</button>' +
      '<div class="accordion-panel">' +
      '<div class="accordion-panel-inner">' +
      '<div class="accordion-body" id="sign-form">' +
      '<div id="form-error" class="error" hidden></div>' +
      '<label class="field">Full name<input type="text" id="signature-name" autocomplete="name" /></label>' +
      '<p class="label">Draw your signature</p>' +
      '<div class="sig-wrap"><canvas id="signature-canvas"></canvas></div>' +
      '<div class="sig-actions"><button type="button" class="btn-secondary" id="clear-sig">Clear signature</button></div>' +
      '<label class="checkbox"><input type="checkbox" id="accepted" />' +
      '<span>I have read and accept the terms, scope, limitations, privacy policy, and client declaration.</span></label>' +
      '<button type="button" class="btn-primary" id="submit-btn" disabled>Sign and submit</button>' +
      '</div></div></div></div></div>'
    );
  }

  function setupAccordion(state, sections, onProgressChange) {
    const items = Array.from(document.querySelectorAll('.accordion-item'));
    const hint = document.getElementById('accordion-hint');

    function setAccordionOpen(target) {
      items.forEach(function (item) {
        const isTarget = Boolean(target && item === target);
        item.classList.toggle('is-open', isTarget);
        const header = item.querySelector('.accordion-header');
        if (header) header.setAttribute('aria-expanded', isTarget ? 'true' : 'false');
        const subtitle = item.querySelector('.accordion-subtitle');
        if (subtitle && !item.dataset.accordionSignature) {
          subtitle.textContent = isTarget ? 'Tap to collapse' : 'Tap to read';
        }
      });

      if (!target) {
        onProgressChange();
        return;
      }

      if (target.dataset.sectionId) {
        const section = sections.find(function (s) {
          return s.id === target.dataset.sectionId;
        });
        if (section) {
          if (matchesSection(section, 'term')) state.completed.terms = true;
          if (matchesSection(section, 'privacy')) {
            state.completed.privacy = true;
            state.signatureUnlocked = true;
            const signAccordion = document.getElementById('sign-accordion');
            if (signAccordion) signAccordion.classList.remove('is-locked');
            if (hint) hint.classList.add('is-hidden');
          }
        }
      }

      if (target.dataset.accordionSignature === 'true') {
        state.completed.signature = true;
        state.active = 'signature';
      } else if (target.dataset.sectionId) {
        const section = sections.find(function (s) {
          return s.id === target.dataset.sectionId;
        });
        if (section && matchesSection(section, 'privacy')) state.active = 'privacy';
        else if (section && matchesSection(section, 'term')) state.active = 'terms';
        else state.active = 'overview';
      }

      onProgressChange();
    }

    items.forEach(function (item) {
      const header = item.querySelector('.accordion-header');
      if (!header || item.classList.contains('is-locked')) return;
      header.addEventListener('click', function () {
        if (item.classList.contains('is-open')) {
          setAccordionOpen(null);
          return;
        }
        setAccordionOpen(item);
        if (item.id === 'sign-accordion') {
          setTimeout(function () {
            item.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 120);
        }
      });
    });

    document.querySelectorAll('[data-progress-step="signature"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const signAccordion = document.getElementById('sign-accordion');
        if (signAccordion && state.signatureUnlocked) setAccordionOpen(signAccordion);
      });
    });

    return { setAccordionOpen: setAccordionOpen };
  }

  function updateProgressBar(state) {
    state.completed.overview = true;
    if (state.completed.privacy) state.signatureUnlocked = true;

    const steps = document.querySelectorAll('.progress-step');
    const order = ['overview', 'terms', 'privacy', 'signature'];
    steps.forEach(function (el, index) {
      const stepId = order[index];
      el.classList.toggle('is-complete', Boolean(state.completed[stepId]));
      el.classList.toggle('is-active', state.active === stepId);
      if (stepId === 'signature') {
        el.classList.toggle('is-clickable', state.signatureUnlocked);
        el.disabled = !state.signatureUnlocked;
      }
      const dot = el.querySelector('.step-dot');
      if (dot) dot.textContent = state.completed[stepId] ? '✓' : String(index + 1);
    });

    const signAccordion = document.getElementById('sign-accordion');
    if (signAccordion) signAccordion.classList.toggle('is-locked', !state.signatureUnlocked);
  }

  function renderAgreement(agreement, pending) {
    const sections = agreement.legalSections.sections;
    const progressState = {
      active: 'overview',
      completed: { overview: true, terms: false, privacy: false, signature: false },
      signatureUnlocked: false,
    };

    const signBlock = agreement.canSign
      ? '<p class="accordion-hint" id="accordion-hint">Please read each section. Your signature unlocks after you open the Privacy Policy.</p>' +
        '<div class="accordion">' +
        renderLegalAccordion(sections, 0) +
        renderSignatureAccordion(true) +
        '</div>'
      : '<div class="card center"><p class="muted">This agreement is already ' +
        escapeHtml(agreement.status.toLowerCase()) +
        '.</p></div>';

    setAppContent(
      '<div class="wrap">' +
      renderProgressBar(progressState) +
      '<div class="card hero-card">' +
      '<span class="hero-badge">SiteScop Inspections</span>' +
      '<p class="muted">' +
      escapeHtml(agreement.companyName) +
      '</p>' +
      '<h1>Client Inspection Agreement</h1>' +
      '<p class="muted">' +
      escapeHtml(agreement.agreementNumber) +
      ' · ' +
      escapeHtml(TYPE_LABELS[agreement.inspectionType] || agreement.inspectionType) +
      '</p>' +
      '<div class="client-details">' +
      '<div class="detail-item"><div class="label">Client</div><div class="detail-value">' +
      escapeHtml(agreement.clientName) +
      '</div><div class="detail-sub">' +
      escapeHtml(agreement.clientEmail) +
      '</div></div>' +
      '<div class="detail-item detail-item-wide"><div class="label">Property</div><div class="detail-value">' +
      escapeHtml(agreement.propertyAddress) +
      '</div></div>' +
      '<div class="detail-item"><div class="label">Total (inc. GST)</div><div class="detail-value price">' +
      formatAud(agreement.totalCents) +
      '</div></div>' +
      '<div class="detail-item"><div class="label">Agreement date</div><div class="detail-value">' +
      formatDate(agreement.agreementDate) +
      '</div></div></div></div>' +
      signBlock +
      '</div>',
    );

    if (!agreement.canSign) return;

    function refreshProgress() {
      updateProgressBar(progressState);
    }

    setupAccordion(progressState, sections, refreshProgress);
    refreshProgress();

    const nameInput = document.getElementById('signature-name');
    if (nameInput) nameInput.value = agreement.clientName;

    const canvasEl = document.getElementById('signature-canvas');
    const pad = setupSignaturePad(canvasEl);
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
