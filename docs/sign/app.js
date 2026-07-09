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

  function companyContact(agreement) {
    const c = cfg();
    return {
      phone: (agreement && agreement.companyPhone) || c.supportPhone || '',
      website: (agreement && agreement.companyWebsite) || c.supportWebsite || '',
      email: (agreement && agreement.companyEmail) || c.supportEmail || '',
      abn: (agreement && agreement.companyAbn) || c.supportAbn || '',
      name: (agreement && agreement.companyName) || 'SiteScop Inspections',
    };
  }

  function websiteHref(website) {
    const trimmed = String(website || '').trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return 'https://' + trimmed.replace(/^\/\//, '');
  }

  function phoneHref(phone) {
    const digits = String(phone || '').replace(/[^\d+]/g, '');
    return digits ? 'tel:' + digits : '';
  }

  function renderPortalFooter(agreement) {
    const contact = companyContact(agreement);
    const parts = [];
    if (contact.phone) {
      parts.push(
        '<a href="' +
          escapeHtml(phoneHref(contact.phone)) +
          '">' +
          escapeHtml(contact.phone) +
          '</a>',
      );
    }
    if (contact.email) {
      parts.push(
        '<a href="mailto:' +
          escapeHtml(contact.email) +
          '">' +
          escapeHtml(contact.email) +
          '</a>',
      );
    }
    if (contact.website) {
      parts.push(
        '<a href="' +
          escapeHtml(websiteHref(contact.website)) +
          '" target="_blank" rel="noopener noreferrer">' +
          escapeHtml(contact.website) +
          '</a>',
      );
    }
    if (contact.abn) {
      parts.push('<span>ABN ' + escapeHtml(contact.abn) + '</span>');
    }
    if (!parts.length) return '';
    return (
      '<footer class="portal-footer">' +
      '<p class="portal-footer-title">Questions about this agreement?</p>' +
      '<p class="portal-footer-contact">' +
      parts.join('<span class="portal-footer-sep">·</span>') +
      '</p>' +
      '<p class="portal-footer-note">Contact ' +
      escapeHtml(contact.name) +
      ' if you need help before signing.</p>' +
      '</footer>'
    );
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
      '<div class="wrap"><div class="card center"><p class="error">' +
        escapeHtml(message) +
        '</p></div>' +
        renderPortalFooter(null) +
        '</div>',
    );
  }

  function renderSuccess(agreementNumber, agreement) {
    setAppContent(
      '<div class="wrap"><div class="card center">' +
        '<div class="success-icon">✓</div>' +
        '<h1>Agreement signed</h1>' +
        '<p class="muted">Thank you. Agreement <strong>' +
        escapeHtml(agreementNumber) +
        '</strong> has been submitted securely.</p>' +
        '<p class="muted">We will be in touch shortly regarding your inspection.</p>' +
        '</div>' +
        renderPortalFooter(agreement) +
        '</div>',
    );
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function plainTextToSigningHtml(text) {
    var blocks = String(text || '')
      .split(/\n\n+/)
      .map(function (b) {
        return b.trim();
      })
      .filter(Boolean);
    var html = [];
    var i = 0;

    while (i < blocks.length) {
      var block = blocks[i];

      if (/^\d+\.\s/.test(block) && block.length < 160 && block.indexOf('\n') === -1) {
        html.push('<h3 class="legal-subhead">' + escapeHtml(block) + '</h3>');
        i += 1;
        continue;
      }

      if (/^important$/i.test(block)) {
        html.push('<div class="legal-callout legal-callout-note"><strong>Important</strong></div>');
        i += 1;
        continue;
      }

      if (/^additional fees may apply/i.test(block)) {
        var items = [];
        i += 1;
        while (
          i < blocks.length &&
          blocks[i].length < 140 &&
          !/^\d+\.\s/.test(blocks[i]) &&
          !/^important$/i.test(blocks[i]) &&
          !/^additional fees may apply/i.test(blocks[i])
        ) {
          items.push(blocks[i]);
          i += 1;
        }
        html.push(
          '<div class="legal-callout legal-callout-note"><p><strong>' +
            escapeHtml(block) +
            '</strong></p>' +
            (items.length
              ? '<ul>' +
                items
                  .map(function (item) {
                    var escaped = escapeHtml(item);
                    if (/additional buildings|additional structures|additional fees|granny|separate structure/i.test(item)) {
                      return '<li><strong>' + escaped + '</strong></li>';
                    }
                    return '<li>' + escaped + '</li>';
                  })
                  .join('') +
                '</ul>'
              : '') +
            '</div>',
        );
        continue;
      }

      if (
        (/^the written inspection report/i.test(block) ||
          /does not guarantee|concealed defects may exist|failure to obtain recommended/i.test(block)) &&
        block.length < 360
      ) {
        html.push('<div class="legal-callout legal-callout-note"><p>' + escapeHtml(block) + '</p></div>');
        i += 1;
        continue;
      }

      if (/warning|cannot be reported|excluded from the inspection/i.test(block) && block.length < 360) {
        html.push('<div class="legal-callout legal-callout-warning"><p>' + escapeHtml(block) + '</p></div>');
        i += 1;
        continue;
      }

      html.push('<p>' + escapeHtml(block).replace(/\n/g, '<br>') + '</p>');
      i += 1;
    }

    return html.join('');
  }

  function portalLogoUrl(agreement) {
    if (agreement.companyLogoUrl) return agreement.companyLogoUrl;
    if (window.SITESCOP_SIGN_LOGO_URL) return window.SITESCOP_SIGN_LOGO_URL;
    try {
      var config = cfg();
      if (config.defaultLogoUrl) return config.defaultLogoUrl;
    } catch (e) {
      /* config not loaded yet */
    }
    return './logo.jpeg';
  }

  function enrichAgreementForPortal(agreement, pending) {
    if (pending) {
      if (!agreement.agentName && pending.agentName) agreement.agentName = pending.agentName;
      if (!agreement.agencyName && pending.agencyName) agreement.agencyName = pending.agencyName;
      if (!agreement.agentEmail && pending.agentEmail) agreement.agentEmail = pending.agentEmail;
      if (agreement.agentSigningAvailable == null && pending.agentSigningAvailable != null) {
        agreement.agentSigningAvailable = pending.agentSigningAvailable;
      }
      if (!agreement.agentAuthoritySection && pending.agentAuthoritySection) {
        agreement.agentAuthoritySection = pending.agentAuthoritySection;
      }
    }
    if (!agreement.companyLogoUrl) {
      agreement.companyLogoUrl = portalLogoUrl(agreement);
    }
    if (agreement.legalSections && agreement.legalSections.sections) {
      agreement.legalSections.sections = stripAgentAuthoritySection(agreement.legalSections.sections);
      agreement.legalSections.sections.forEach(function (section) {
        if (!section.contentHtml || !String(section.contentHtml).trim()) {
          section.contentHtml = plainTextToSigningHtml(section.content);
        }
      });
    }
    return agreement;
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
    if (lower.includes('declar') && !lower.includes('agent')) {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>';
    }
    if (lower.includes('agent')) {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
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

  function agentSigningAvailable(agreement) {
    if (agreement.agentSigningAvailable === true) return true;
    if (agreement.agentSigningAvailable === false) return false;
    return Boolean(agreement.agentName && String(agreement.agentName).trim());
  }

  function isAgentSigning(agreement) {
    return agreement.selectedSigningParty === 'AGENT';
  }

  function stripAgentAuthoritySection(sections) {
    return sections.filter(function (section) {
      return section.id !== 'agent-authority';
    });
  }

  function insertAgentAuthoritySection(sections, agreement) {
    return withAgentAuthoritySection(sections, {
      agentName: agreement.agentName,
      agencyName: agreement.agencyName,
      clientName: agreement.clientName,
      propertyAddress: agreement.propertyAddress,
    });
  }

  function buildSectionsForParty(agreement, party) {
    var baseSections = stripAgentAuthoritySection(agreement.legalSections.sections || []);
    if (party === 'AGENT' && agentSigningAvailable(agreement)) {
      if (agreement.agentAuthoritySection && agreement.agentAuthoritySection.id) {
        var declIndex = -1;
        for (var i = 0; i < baseSections.length; i++) {
          if (
            baseSections[i].id === 'client-declaration' ||
            String(baseSections[i].title || '')
              .toLowerCase()
              .indexOf('client declaration') >= 0
          ) {
            declIndex = i;
            break;
          }
        }
        if (declIndex < 0) {
          baseSections = baseSections.concat([agreement.agentAuthoritySection]);
        } else {
          baseSections = baseSections
            .slice(0, declIndex + 1)
            .concat([agreement.agentAuthoritySection], baseSections.slice(declIndex + 1));
        }
      } else {
        baseSections = insertAgentAuthoritySection(baseSections, agreement);
      }
    }
    return baseSections;
  }

  function prepareAgreementForSigningParty(agreement, party) {
    var prepared = Object.assign({}, agreement, {
      selectedSigningParty: party,
      legalSections: {
        sections: buildSectionsForParty(agreement, party).map(function (section) {
          var next = Object.assign({}, section);
          if (!next.contentHtml || !String(next.contentHtml).trim()) {
            next.contentHtml = plainTextToSigningHtml(next.content);
          }
          return next;
        }),
      },
    });
    return prepared;
  }

  function buildAgentAuthoritySection(ctx) {
    var agency = ctx.agencyName && String(ctx.agencyName).trim() ? ctx.agencyName : 'the listed real estate agency';
    var contentHtml =
      '<p>This declaration applies because a <strong>real estate agent</strong> is signing this Inspection Agreement on behalf of the purchaser/client named in this agreement.</p>' +
      '<div class="legal-callout legal-callout-warning"><p><strong>Important:</strong> Only sign if you are the Agent named below and you have the Client\'s express authority to accept this agreement on their behalf.</p></div>' +
      '<h3 class="legal-subhead">1. Identity</h3>' +
      '<p>I confirm I am <strong>' +
      escapeHtml(ctx.agentName) +
      '</strong> of <strong>' +
      escapeHtml(agency) +
      '</strong> (the <strong>Agent</strong>).</p>' +
      '<h3 class="legal-subhead">2. Authority to act</h3>' +
      '<p>I confirm I have the <strong>express authority</strong> of <strong>' +
      escapeHtml(ctx.clientName) +
      '</strong> (the <strong>Client</strong>) to accept this SiteScop Inspection Agreement on the Client\'s behalf for the property at <strong>' +
      escapeHtml(ctx.propertyAddress) +
      '</strong>.</p>' +
      '<h3 class="legal-subhead">3. Client awareness</h3>' +
      '<p>I confirm I have explained to the Client (or will promptly provide the Client with) the Scope of Inspection, Inspection Limitations, Terms &amp; Conditions, Privacy Policy and Client Declaration; and that the <strong>Inspection Report is prepared for the Client only</strong>.</p>' +
      '<h3 class="legal-subhead">4. Binding effect</h3>' +
      '<p>I understand my electronic signature has the same legal effect as a handwritten signature to the extent permitted by Australian law, and <strong>binds the Client</strong> to this agreement as their authorised representative.</p>' +
      '<h3 class="legal-subhead">5. Agent responsibility</h3>' +
      '<p>SiteScop Pty Ltd relies on this declaration. The Agent accepts responsibility for ensuring they are authorised to sign for the Client.</p>' +
      '<div class="legal-callout legal-callout-note"><p>The Client remains the party to whom the inspection is provided. This agreement does not permit third parties to rely on the Inspection Report without SiteScop\'s written consent.</p></div>';
  return {
      id: 'agent-authority',
      title: 'Agent Authority Declaration',
      content: 'Agent Authority Declaration',
      contentHtml: contentHtml,
    };
  }

  function withAgentAuthoritySection(sections, ctx) {
    var agentSection = buildAgentAuthoritySection(ctx);
    var withoutAgent = sections.filter(function (section) {
      return section.id !== 'agent-authority';
    });
    var declIndex = -1;
    for (var i = 0; i < withoutAgent.length; i++) {
      var section = withoutAgent[i];
      if (
        section.id === 'client-declaration' ||
        String(section.title || '')
          .toLowerCase()
          .indexOf('client declaration') >= 0
      ) {
        declIndex = i;
        break;
      }
    }
    if (declIndex < 0) {
      return withoutAgent.concat([agentSection]);
    }
    return withoutAgent.slice(0, declIndex + 1).concat([agentSection], withoutAgent.slice(declIndex + 1));
  }

  function signingHintText(agreement) {
    if (isAgentSigning(agreement)) {
      return 'Please read each section. Your signature unlocks after you open the Client Declaration and Agent Authority Declaration.';
    }
    return 'Please read each section. Your signature unlocks after you open the Client Declaration.';
  }

  function signatureLockNotice(agreement) {
    if (isAgentSigning(agreement)) {
      return 'Please open the Client Declaration and Agent Authority Declaration above before signing.';
    }
    return 'Please open the Client Declaration section above before signing.';
  }

  function canUnlockSignature(state, agreement) {
    if (isAgentSigning(agreement)) {
      return state.completed.declaration && state.completed.agent;
    }
    return state.completed.declaration;
  }

  function renderProgressBar(state, agreement) {
    const steps = [
      { id: 'overview', label: 'Agreement' },
      { id: 'terms', label: 'Terms' },
      { id: 'privacy', label: 'Privacy' },
      { id: 'declaration', label: 'Declaration' },
    ];
    if (isAgentSigning(agreement)) {
      steps.push({ id: 'agent', label: 'Agent' });
    }
    steps.push({ id: 'signature', label: 'Signature' });

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

  function renderSectionBody(section) {
    if (section.contentHtml && String(section.contentHtml).trim()) {
      return String(section.contentHtml);
    }
    return plainTextToSigningHtml(section.content || '');
  }

  function renderAgreementLogo(agreement) {
    var logoUrl = portalLogoUrl(agreement);
    return (
      '<img class="agreement-logo" src="' +
      escapeHtml(logoUrl) +
      '" alt="' +
      escapeHtml(agreement.companyName) +
      '" onerror="this.onerror=null;if(window.SITESCOP_SIGN_LOGO_URL){this.src=window.SITESCOP_SIGN_LOGO_URL;}else{this.src=\'./logo.jpeg\';}" />'
    );
  }

  function renderAgreementHeader(agreement) {
    return (
      '<div class="card agreement-header agreement-header-branded">' +
      '<div class="agreement-header-banner">' +
      renderAgreementLogo(agreement) +
      '<div class="agreement-header-copy">' +
      '<p class="agreement-company-name">' +
      escapeHtml(agreement.companyName) +
      '</p>' +
      '<h1 class="agreement-page-title">Inspection Agreement</h1>' +
      '<p class="agreement-ref">' +
      escapeHtml(agreement.agreementNumber) +
      ' · ' +
      escapeHtml(TYPE_LABELS[agreement.inspectionType] || agreement.inspectionType) +
      '</p>' +
      '</div></div>' +
      '<div class="agreement-summary">' +
      '<div class="summary-item"><div class="label">Client</div><div class="summary-value">' +
      escapeHtml(agreement.clientName) +
      '</div><div class="summary-sub">' +
      escapeHtml(agreement.clientEmail) +
      '</div></div>' +
      '<div class="summary-item summary-item-wide"><div class="label">Property</div><div class="summary-value">' +
      escapeHtml(agreement.propertyAddress) +
      '</div></div>' +
      '<div class="summary-item"><div class="label">Agreement date</div><div class="summary-value">' +
      formatDate(agreement.agreementDate) +
      '</div></div>' +
      (isAgentSigning(agreement)
        ? '<div class="summary-item summary-item-wide"><div class="label">Signing as</div><div class="summary-value">Agent — ' +
          escapeHtml(agreement.agentName) +
          '</div><div class="summary-sub">On behalf of ' +
          escapeHtml(agreement.clientName) +
          (agreement.agencyName ? ' · ' + escapeHtml(agreement.agencyName) : '') +
          '</div></div>'
        : agreement.selectedSigningParty === 'CLIENT' && agentSigningAvailable(agreement)
          ? '<div class="summary-item summary-item-wide"><div class="label">Signing as</div><div class="summary-value">Client</div><div class="summary-sub">' +
            escapeHtml(agreement.clientName) +
            '</div></div>'
          : '') +
      '</div></div>'
    );
  }

  function renderLegalAccordion(sections, openIndex) {
    return sections
      .map(function (s, index) {
        const isOpen = openIndex >= 0 && index === openIndex;
        return (
          '<div class="accordion-item is-pending' +
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
          '<p class="accordion-subtitle">' +
          (isOpen ? 'Tap to close when finished reading' : 'Tap to read — turns green when done') +
          '</p>' +
          '</span>' +
          '<span class="accordion-status" aria-hidden="true">!</span>' +
          chevronSvg() +
          '</button>' +
          '<div class="accordion-panel">' +
          '<div class="accordion-panel-inner">' +
          '<div class="accordion-body legal-content" data-accordion-body="true">' +
          renderSectionBody(s) +
          '</div>' +
          '</div>' +
          '</div>' +
          '</div>'
        );
      })
      .join('');
  }

  function renderSignatureSection(locked, agreement) {
    const agentMode = isAgentSigning(agreement);
    const acceptLabel = agentMode
      ? 'I confirm I have express authority to sign on behalf of ' +
        agreement.clientName +
        ', and I have read and accept the terms, scope, limitations, privacy policy, client declaration, and agent authority declaration.'
      : 'I have read and accept the terms, scope, limitations, privacy policy, and client declaration.';
    return (
      '<div class="accordion-item sign-section is-open' +
      (locked ? ' is-pending is-locked' : ' is-reviewed') +
      '" id="sign-section">' +
      '<div class="sign-section-header">' +
      '<span class="accordion-icon">' +
      signatureIconSvg() +
      '</span>' +
      '<span class="accordion-title-wrap">' +
      '<p class="accordion-title">' +
      (agentMode ? 'Sign on behalf of client' : 'Sign Agreement') +
      '</p>' +
      '<p class="accordion-subtitle" id="sign-section-subtitle">' +
      (locked
        ? agentMode
          ? 'Read the Client and Agent Authority declarations above to enable signing'
          : 'Read the Client Declaration above to enable signing'
        : agentMode
          ? 'Enter your name and sign as authorised agent for ' + escapeHtml(agreement.clientName)
          : 'Enter your name and signature below') +
      '</p>' +
      '</span>' +
      '<span class="accordion-status' +
      (locked ? '' : ' is-complete') +
      '" id="sign-section-status" aria-hidden="true">' +
      (locked ? '!' : '✓') +
      '</span>' +
      '</div>' +
      '<div class="sign-section-body">' +
      '<p class="sign-lock-notice" id="sign-lock-notice"' +
      (locked ? '' : ' hidden') +
      '>' +
      signatureLockNotice(agreement) +
      '</p>' +
      '<div id="sign-form">' +
      '<div id="form-error" class="error" hidden></div>' +
      '<label class="field">' +
      (agentMode ? 'Agent full name' : 'Full name') +
      '<input type="text" id="signature-name" autocomplete="name"' +
      (locked ? ' disabled' : '') +
      ' /></label>' +
      '<p class="label">Draw your signature</p>' +
      '<div class="sig-wrap"><canvas id="signature-canvas"></canvas></div>' +
      '<div class="sig-actions"><button type="button" class="btn-secondary" id="clear-sig"' +
      (locked ? ' disabled' : '') +
      '>Clear signature</button></div>' +
      '<label class="checkbox"><input type="checkbox" id="accepted"' +
      (locked ? ' disabled' : '') +
      ' />' +
      '<span>' +
      escapeHtml(acceptLabel) +
      '</span></label>' +
      '<button type="button" class="btn-primary" id="submit-btn" disabled>Sign and submit</button>' +
      '</div></div></div>'
    );
  }

  function isInteractiveClick(target) {
    return Boolean(
      target.closest('a, button, input, textarea, select, label, canvas, .sig-wrap, .sig-actions, .checkbox'),
    );
  }

  function unlockSignatureSection(state, agreement, hint) {
    if (!canUnlockSignature(state, agreement)) return;
    state.signatureUnlocked = true;
    state.active = 'signature';
    const signSection = document.getElementById('sign-section');
    if (signSection) {
      signSection.classList.remove('is-locked', 'is-pending');
      signSection.classList.add('is-reviewed');
      signSection.querySelectorAll('input, button').forEach(function (el) {
        if (el.id !== 'submit-btn') el.disabled = false;
      });
      const statusEl = document.getElementById('sign-section-status');
      if (statusEl) {
        statusEl.textContent = '✓';
        statusEl.classList.add('is-complete');
      }
      const subtitle = document.getElementById('sign-section-subtitle');
      if (subtitle) {
        subtitle.textContent = isAgentSigning(agreement)
          ? 'Enter your name and sign as authorised agent for ' + agreement.clientName
          : 'Enter your name and signature below';
      }
    }
    const lockNotice = document.getElementById('sign-lock-notice');
    if (lockNotice) lockNotice.hidden = true;
    if (hint) hint.classList.add('is-hidden');
  }

  function markSectionReviewed(item, state, sections, hint, onProgressChange) {
    if (!item || item.classList.contains('is-reviewed')) return;
    item.classList.remove('is-pending');
    item.classList.add('is-reviewed');
    const statusEl = item.querySelector('.accordion-status');
    if (statusEl) {
      statusEl.textContent = '✓';
      statusEl.classList.add('is-complete');
    }
  }

  function applyProgressForSection(item, state, sections, agreement, hint) {
    const section = sections.find(function (s) {
      return s.id === item.dataset.sectionId;
    });
    if (!section) return;
    if (matchesSection(section, 'term')) state.completed.terms = true;
    if (matchesSection(section, 'privacy')) state.completed.privacy = true;
    if (section.id === 'agent-authority' || matchesSection(section, 'agent authority')) {
      state.completed.agent = true;
      unlockSignatureSection(state, agreement, hint);
      return;
    }
    if (matchesSection(section, 'declar') && section.id !== 'agent-authority') {
      state.completed.declaration = true;
      unlockSignatureSection(state, agreement, hint);
    }
  }

  function setupAccordion(state, sections, agreement, onProgressChange) {
    const items = Array.from(document.querySelectorAll('.accordion-item[data-section-id]'));
    const hint = document.getElementById('accordion-hint');

    function setAccordionOpen(target) {
      const currentlyOpen = items.find(function (item) {
        return item.classList.contains('is-open');
      });

      if (currentlyOpen && currentlyOpen !== target) {
        markSectionReviewed(currentlyOpen, state, sections, hint, onProgressChange);
        applyProgressForSection(currentlyOpen, state, sections, agreement, hint);
      }

      items.forEach(function (item) {
        const isTarget = Boolean(target && item === target);
        item.classList.toggle('is-open', isTarget);
        const header = item.querySelector('.accordion-header');
        if (header) header.setAttribute('aria-expanded', isTarget ? 'true' : 'false');
        const subtitle = item.querySelector('.accordion-subtitle');
        if (subtitle) {
          subtitle.textContent = isTarget
            ? 'Tap to close when finished reading'
            : item.classList.contains('is-reviewed')
              ? 'Read — tap to open again'
              : 'Tap to read — turns green when done';
        }
      });

      if (target && target.dataset.sectionId) {
        const section = sections.find(function (s) {
          return s.id === target.dataset.sectionId;
        });
        if (section && matchesSection(section, 'privacy')) state.active = 'privacy';
        else if (section && matchesSection(section, 'declar') && section.id !== 'agent-authority')
          state.active = 'declaration';
        else if (section && (section.id === 'agent-authority' || matchesSection(section, 'agent authority')))
          state.active = 'agent';
        else if (section && matchesSection(section, 'term')) state.active = 'terms';
        else state.active = 'overview';
      } else if (!target) {
        state.active = 'overview';
      }

      onProgressChange();
    }

    items.forEach(function (item) {
      const header = item.querySelector('.accordion-header');
      const body = item.querySelector('[data-accordion-body]');

      if (header) {
        header.addEventListener('click', function () {
          if (item.classList.contains('is-open')) {
            markSectionReviewed(item, state, sections, hint, onProgressChange);
            applyProgressForSection(item, state, sections, agreement, hint);
            setAccordionOpen(null);
            return;
          }
          setAccordionOpen(item);
        });
      }

      if (body) {
        body.addEventListener('click', function (e) {
          if (!item.classList.contains('is-open')) return;
          if (isInteractiveClick(e.target)) return;
          markSectionReviewed(item, state, sections, hint, onProgressChange);
          applyProgressForSection(item, state, sections, agreement, hint);
          setAccordionOpen(null);
        });
      }
    });

    document.querySelectorAll('[data-progress-step="signature"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!state.signatureUnlocked) return;
        state.completed.signature = true;
        state.active = 'signature';
        onProgressChange();
        const signSection = document.getElementById('sign-section');
        if (signSection) {
          signSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });

    return { setAccordionOpen: setAccordionOpen };
  }

  function updateProgressBar(state, agreement) {
    state.completed.overview = true;
    state.signatureUnlocked = canUnlockSignature(state, agreement);

    const steps = document.querySelectorAll('.progress-step');
    const order = ['overview', 'terms', 'privacy', 'declaration'];
    if (isAgentSigning(agreement)) order.push('agent');
    order.push('signature');
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

    const signAccordion = document.getElementById('sign-section');
    if (signAccordion) {
      signAccordion.classList.toggle('is-locked', !state.signatureUnlocked);
      signAccordion.classList.toggle('is-pending', !state.signatureUnlocked);
      signAccordion.classList.toggle('is-reviewed', state.signatureUnlocked);
      const statusEl = document.getElementById('sign-section-status');
      if (statusEl) {
        statusEl.textContent = state.signatureUnlocked ? '✓' : '!';
        statusEl.classList.toggle('is-complete', state.signatureUnlocked);
      }
    }
  }

  function renderSigningPartySelector(agreement, onChoose) {
    setAppContent(
      '<div class="wrap">' +
        '<div class="card agreement-header agreement-header-branded">' +
        '<div class="agreement-header-banner">' +
        renderAgreementLogo(agreement) +
        '<div class="agreement-header-copy">' +
        '<p class="agreement-company-name">' +
        escapeHtml(agreement.companyName) +
        '</p>' +
        '<h1 class="agreement-page-title">Inspection Agreement</h1>' +
        '<p class="agreement-ref">' +
        escapeHtml(agreement.agreementNumber) +
        ' · ' +
        escapeHtml(TYPE_LABELS[agreement.inspectionType] || agreement.inspectionType) +
        '</p>' +
        '</div></div>' +
        '<div class="agreement-summary">' +
        '<div class="summary-item"><div class="label">Client</div><div class="summary-value">' +
        escapeHtml(agreement.clientName) +
        '</div></div>' +
        '<div class="summary-item summary-item-wide"><div class="label">Property</div><div class="summary-value">' +
        escapeHtml(agreement.propertyAddress) +
        '</div></div>' +
        '</div></div>' +
        '<div class="card signing-party-card">' +
        '<h2 class="signing-party-title">Who is signing?</h2>' +
        '<p class="signing-party-lead">Select whether you are the purchaser/client or the real estate agent signing on the client\'s behalf.</p>' +
        '<div class="signing-party-options">' +
        '<button type="button" class="signing-party-option" data-signing-party="CLIENT">' +
        '<span class="signing-party-option-label">I am the client</span>' +
        '<span class="signing-party-option-name">' +
        escapeHtml(agreement.clientName) +
        '</span>' +
        '<span class="signing-party-option-note">Purchaser / client signs directly</span>' +
        '</button>' +
        '<button type="button" class="signing-party-option signing-party-option-agent" data-signing-party="AGENT">' +
        '<span class="signing-party-option-label">I am the agent</span>' +
        '<span class="signing-party-option-name">' +
        escapeHtml(agreement.agentName) +
        '</span>' +
        '<span class="signing-party-option-note">Sign on behalf of ' +
        escapeHtml(agreement.clientName) +
        (agreement.agencyName ? ' · ' + escapeHtml(agreement.agencyName) : '') +
        '</span>' +
        '</button>' +
        '</div></div>' +
        renderPortalFooter(agreement) +
        '</div>',
    );

    document.querySelectorAll('[data-signing-party]').forEach(function (button) {
      button.addEventListener('click', function () {
        onChoose(button.getAttribute('data-signing-party'));
      });
    });
  }

  function renderAgreement(agreement, pending) {
    const sections = agreement.legalSections.sections;
    const progressState = {
      active: 'overview',
      completed: {
        overview: true,
        terms: false,
        privacy: false,
        declaration: false,
        agent: false,
        signature: false,
      },
      signatureUnlocked: false,
    };

    const signBlock = agreement.canSign
      ? '<p class="accordion-hint" id="accordion-hint">' +
        escapeHtml(signingHintText(agreement)) +
        '</p>' +
        '<div class="accordion">' +
        renderLegalAccordion(sections, -1) +
        renderSignatureSection(true, agreement) +
        '</div>'
      : '<div class="card center"><p class="muted">This agreement is already ' +
        escapeHtml(agreement.status.toLowerCase()) +
        '.</p></div>';

    setAppContent(
      '<div class="wrap">' +
      renderProgressBar(progressState, agreement) +
      renderAgreementHeader(agreement) +
      signBlock +
      renderPortalFooter(agreement) +
      '</div>',
    );

    if (!agreement.canSign) return;

    function refreshProgress() {
      updateProgressBar(progressState, agreement);
    }

    setupAccordion(progressState, sections, agreement, refreshProgress);
    refreshProgress();

    const nameInput = document.getElementById('signature-name');
    if (nameInput) {
      nameInput.value = isAgentSigning(agreement) ? agreement.agentName : agreement.clientName;
    }

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
            signingParty: agreement.selectedSigningParty || 'CLIENT',
            agentAuthorityAccepted: isAgentSigning(agreement) ? true : undefined,
          }),
        });
        renderSuccess(pending.agreementNumber, pending.publicView);
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

      var baseAgreement = enrichAgreementForPortal(pending.publicView, pending);
      if (baseAgreement.canSign && agentSigningAvailable(baseAgreement)) {
        renderSigningPartySelector(baseAgreement, function (party) {
          renderAgreement(prepareAgreementForSigningParty(baseAgreement, party), pending);
        });
        return;
      }

      renderAgreement(prepareAgreementForSigningParty(baseAgreement, 'CLIENT'), pending);
    } catch (e) {
      renderError(e.message || 'Could not load agreement.');
    }
  }

  boot();
})();
