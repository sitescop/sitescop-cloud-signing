/* SiteScop V6 — GitHub Cloud Signing (GitHub Pages client portal) */
(function () {
  'use strict';

  const TYPE_LABELS = { BUILDING: 'Building', PEST: 'Pest', COMBINED: 'Building & Pest' };
  const token = new URLSearchParams(location.search).get('token') || '';

  function cfg() {
    const c = window.SITESCOP_SIGN_CONFIG;
    if (!c || !c.owner || !c.repo || !c.token) {
      throw new Error('Missing config.js — copy config.example.js to config.js on GitHub.');
    }
    return c;
  }

  function ghHeaders(c) {
    return {
      Authorization: 'Bearer ' + c.token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  function formatAud(cents) {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cents / 100);
  }

  function formatDate(iso) {
    if (!iso) return '';
    const parts = iso.slice(0, 10).split('-');
    return parts[2] + '/' + parts[1] + '/' + parts[0];
  }

  function encodeBase64Utf8(text) {
    return btoa(unescape(encodeURIComponent(text)));
  }

  async function parseGitHubError(res) {
    try {
      const body = await res.json();
      return body.message || 'GitHub request failed (' + res.status + ')';
    } catch {
      return 'GitHub request failed (' + res.status + ')';
    }
  }

  async function ghGetJson(path) {
    const c = cfg();
    const branch = c.branch || 'main';
    const url =
      'https://api.github.com/repos/' +
      encodeURIComponent(c.owner) +
      '/' +
      encodeURIComponent(c.repo) +
      '/contents/' +
      path +
      '?ref=' +
      encodeURIComponent(branch);

    let res;
    try {
      res = await fetch(url, {
        headers: { ...ghHeaders(c), Accept: 'application/vnd.github.raw' },
      });
    } catch {
      throw new Error('Network error — could not reach GitHub.');
    }

    if (res.status === 404) return null;
    if (!res.ok) throw new Error(await parseGitHubError(res));

    const text = await res.text();
    return JSON.parse(text);
  }

  async function ghPutJson(path, payload, message) {
    const c = cfg();
    const branch = c.branch || 'main';
    const baseUrl =
      'https://api.github.com/repos/' +
      encodeURIComponent(c.owner) +
      '/' +
      encodeURIComponent(c.repo) +
      '/contents/' +
      path;

    let sha;
    try {
      const meta = await fetch(baseUrl + '?ref=' + encodeURIComponent(branch), {
        headers: ghHeaders(c),
      });
      if (meta.ok) sha = (await meta.json()).sha;
    } catch {
      throw new Error('Network error — could not reach GitHub.');
    }

    const body = {
      message: message,
      content: encodeBase64Utf8(JSON.stringify(payload, null, 2)),
      branch: branch,
    };
    if (sha) body.sha = sha;

    let res;
    try {
      res = await fetch(baseUrl, {
        method: 'PUT',
        headers: { ...ghHeaders(c), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error('Network error — could not save signature to GitHub.');
    }

    if (!res.ok) throw new Error(await parseGitHubError(res));
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
      '</strong> has been submitted via GitHub Cloud Signing.</p>' +
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
        const payload = {
          token: token,
          signatureName: nameInput.value.trim(),
          signatureData: pad.toDataUrl(),
          declarationsAccepted: true,
          signedAt: new Date().toISOString(),
        };
        await ghPutJson(
          'agreements/signed/' + token + '.json',
          payload,
          'SiteScop Cloud Signing: client signed ' + pending.agreementNumber,
        );
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
      const pending = await ghGetJson('agreements/pending/' + token + '.json');
      if (!pending || !pending.publicView) {
        renderError('This agreement link is invalid or has expired.');
        return;
      }

      void ghPutJson(
        'agreements/viewed/' + token + '.json',
        { token: token, viewedAt: new Date().toISOString() },
        'SiteScop Cloud Signing: agreement viewed',
      ).catch(function () {});

      renderAgreement(pending.publicView, pending);
    } catch (e) {
      renderError(e.message || 'Could not load agreement from GitHub.');
    }
  }

  boot();
})();
