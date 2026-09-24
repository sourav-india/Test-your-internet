(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const el = {
    meter: $('meter'), meterValue: $('meterValue'), meterLabel: $('meterLabel'), testStatus: $('testStatus'), statusLight: $('statusLight'), testNote: $('testNote'),
    start: $('startButton'), cancel: $('cancelButton'), again: $('againButton'), download: $('downloadValue'), upload: $('uploadValue'), ping: $('pingValue'), jitter: $('jitterValue'),
    downloadHint: $('downloadHint'), uploadHint: $('uploadHint'), chart: $('speedChart'), chartEmpty: $('chartEmpty'), serverMini: $('serverMini'), serverName: $('serverName'), serverLocation: $('serverLocation'), ip: $('ipAddress'), isp: $('ispName'), connection: $('connectionType'), device: $('deviceName'),
    resultSection: $('resultSection'), qualityText: $('qualityText'), qualityDescription: $('qualityDescription'), qualityBadge: $('qualityBadge'), qualityBadgeText: $('qualityBadgeText'), resultDownload: $('resultDownload'), resultUpload: $('resultUpload'), resultPing: $('resultPing'), resultJitter: $('resultJitter'),
    share: $('shareButton'), copy: $('copyButton'), image: $('downloadImageButton'), history: $('historyList'), clearHistory: $('clearHistory'), theme: $('themeToggle'), toast: $('toast')
  };
  const HISTORY_KEY = 'pulse-speed-history-v1';
  let controller = null;
  let activeXhr = null;
  let running = false;
  let points = [];
  let current = null;
  let toastTimer;
  let serverInfo = { name: 'Auto Select', location: 'Nearest available region', ip: 'Unavailable', isp: 'Unavailable' };

  const number = (value, decimals = 1) => Number.isFinite(value) ? value.toFixed(decimals) : '—';
  const metric = (value, decimals = 1) => Number.isFinite(value) ? Number(value.toFixed(decimals)) : null;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const cacheBust = () => `?t=${Date.now()}-${Math.random().toString(36).slice(2)}`;

  function toast(message) { clearTimeout(toastTimer); el.toast.textContent = message; el.toast.classList.add('show'); toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2800); }
  function setText(node, value) { node.textContent = value; }
  function setMeter(value, label = 'DOWNLOAD', color) {
    el.meterLabel.textContent = label;
    el.meterValue.textContent = Number.isFinite(value) ? number(value) : '—';
    const cap = Math.max(30, Math.ceil((value || 30) / 25) * 25);
    const progress = Math.min(268, Math.max(0, (value || 0) / cap * 268));
    el.meter.style.setProperty('--progress', progress);
    if (color) el.meter.style.setProperty('--meter-color', color); else el.meter.style.removeProperty('--meter-color');
    el.meter.setAttribute('aria-label', `Current ${label.toLowerCase()} speed: ${Number.isFinite(value) ? number(value) : 0} megabits per second`);
  }
  function status(message, state = 'ready') { setText(el.testStatus, message); el.statusLight.className = `status-light ${state === 'testing' ? 'testing' : state === 'error' ? 'error' : ''}`; }
  function showControls(state) { el.start.classList.toggle('hidden', state !== 'idle'); el.cancel.classList.toggle('hidden', state !== 'running'); el.again.classList.toggle('hidden', state !== 'done'); }
  function updateMetric(key, value, hint, decimals = 1) { const output = el[key]; output.textContent = number(value, decimals); const hintNode = el[`${key}Hint`]; if (hintNode && hint) hintNode.textContent = hint; }
  function resetTest() { points = []; current = null; drawChart(); el.chartEmpty.classList.remove('hidden'); ['download','upload','ping','jitter'].forEach((key) => { el[key].textContent = '—'; }); el.downloadHint.textContent = 'Waiting to test'; el.uploadHint.textContent = 'Waiting to test'; el.resultSection.classList.add('hidden'); setMeter(null); }
  function getConnection() { const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection; const type = connection?.type || connection?.effectiveType; return type ? type.replace(/^./, (c) => c.toUpperCase()) : 'Browser unavailable'; }
  function deviceLabel() { const ua = navigator.userAgent; const mobile = /Mobi|Android/i.test(ua); const platform = navigator.userAgentData?.platform || navigator.platform || 'Your device'; if (/iPhone/i.test(ua)) return 'iPhone'; if (/iPad/i.test(ua)) return 'iPad'; if (/Android/i.test(ua)) return mobile ? 'Android phone' : 'Android device'; if (/Mac/i.test(platform)) return 'Mac'; if (/Win/i.test(platform)) return 'Windows device'; return mobile ? 'Mobile device' : `${platform} device`; }
  async function loadServer() {
    try {
      const response = await fetch(`/api/server${cacheBust()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Server request failed');
      serverInfo = await response.json();
      setText(el.serverMini, serverInfo.name); setText(el.serverName, serverInfo.name); setText(el.serverLocation, serverInfo.location || 'Unavailable'); setText(el.ip, serverInfo.ip || 'Unavailable'); setText(el.isp, serverInfo.isp || 'Unavailable');
    } catch { setText(el.serverMini, 'Server unavailable'); setText(el.serverName, 'Unavailable'); setText(el.serverLocation, 'Unavailable'); setText(el.ip, 'Unavailable'); setText(el.isp, 'Unavailable'); }
    setText(el.connection, getConnection()); setText(el.device, deviceLabel());
  }
  function drawChart() {
    const canvas = el.chart; const rect = canvas.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
    if (!rect.width || !rect.height) return;
    canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr); const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h); if (points.length < 2) return;
    const max = Math.max(...points, 5) * 1.15; const x = (i) => (i / Math.max(points.length - 1, 1)) * w; const y = (v) => h - (v / max) * (h - 8);
    const gradient = ctx.createLinearGradient(0, 0, 0, h); gradient.addColorStop(0, 'rgba(64, 227, 204, .32)'); gradient.addColorStop(1, 'rgba(64, 227, 204, 0)');
    ctx.beginPath(); points.forEach((point, i) => i ? ctx.lineTo(x(i), y(point)) : ctx.moveTo(x(i), y(point))); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fillStyle = gradient; ctx.fill();
    ctx.beginPath(); points.forEach((point, i) => i ? ctx.lineTo(x(i), y(point)) : ctx.moveTo(x(i), y(point))); ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--aqua'); ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
  }
  function pushPoint(value) { if (!Number.isFinite(value)) return; points.push(value); if (points.length > 56) points.shift(); el.chartEmpty.classList.add('hidden'); drawChart(); }
  async function measurePing(signal) {
    const samples = [];
    status('Measuring latency', 'testing'); setText(el.testNote, 'Measuring real round-trip time to the selected server.');
    for (let i = 0; i < 5; i += 1) {
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      const start = performance.now(); const response = await fetch(`/api/ping${cacheBust()}`, { cache: 'no-store', signal });
      if (!response.ok) throw new Error('Ping endpoint failed'); await response.json(); samples.push(performance.now() - start); await sleep(110);
    }
    const ping = Math.min(...samples); const jitter = samples.slice(1).reduce((total, sample, i) => total + Math.abs(sample - samples[i]), 0) / (samples.length - 1);
    updateMetric('ping', ping, 'Round-trip latency'); updateMetric('jitter', jitter, 'Latency variation'); return { ping, jitter };
  }
  async function measureDownload(signal) {
    status('Testing download', 'testing'); setText(el.testNote, 'Downloading uncached test data. Keep this tab active for best accuracy.'); setMeter(0, 'DOWNLOAD');
    const started = performance.now(); const response = await fetch(`/api/download${cacheBust()}&bytes=${16 * 1024 * 1024}`, { cache: 'no-store', signal, headers: { 'X-Speed-Test': '1' } });
    if (!response.ok || !response.body) throw new Error('Download endpoint failed');
    const reader = response.body.getReader(); let total = 0; let lastPaint = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; total += value.byteLength; const elapsed = (performance.now() - started) / 1000; const speed = total * 8 / elapsed / 1e6;
      if (performance.now() - lastPaint > 100) { updateMetric('download', speed, 'Measuring live speed'); setMeter(speed, 'DOWNLOAD'); pushPoint(speed); lastPaint = performance.now(); }
    }
    const final = total * 8 / ((performance.now() - started) / 1000) / 1e6; updateMetric('download', final, 'Measured transfer speed'); setMeter(final, 'DOWNLOAD'); pushPoint(final); return final;
  }
  function randomPayload(bytes) { const data = new Uint8Array(bytes); for (let offset = 0; offset < data.length; offset += 65536) crypto.getRandomValues(data.subarray(offset, Math.min(offset + 65536, data.length))); return new Blob([data], { type: 'application/octet-stream' }); }
  function measureUpload() {
    return new Promise((resolve, reject) => {
      status('Testing upload', 'testing'); setText(el.testNote, 'Uploading real randomized data. This measures the path back to the server.'); setMeter(0, 'UPLOAD', 'var(--blue)');
      const payload = randomPayload(8 * 1024 * 1024); const xhr = new XMLHttpRequest(); activeXhr = xhr; const started = performance.now(); let lastPaint = 0;
      xhr.open('POST', `/api/upload${cacheBust()}`, true); xhr.setRequestHeader('Cache-Control', 'no-store');
      xhr.upload.onprogress = (event) => { if (!event.lengthComputable || !event.loaded) return; const speed = event.loaded * 8 / ((performance.now() - started) / 1000) / 1e6; if (performance.now() - lastPaint > 85) { updateMetric('upload', speed, 'Measuring live speed'); setMeter(speed, 'UPLOAD', 'var(--blue)'); pushPoint(speed); lastPaint = performance.now(); } };
      xhr.onload = () => { activeXhr = null; if (xhr.status >= 200 && xhr.status < 300) { const speed = payload.size * 8 / ((performance.now() - started) / 1000) / 1e6; updateMetric('upload', speed, 'Measured transfer speed'); setMeter(speed, 'UPLOAD', 'var(--blue)'); pushPoint(speed); resolve(speed); } else reject(new Error('Upload endpoint failed')); };
      xhr.onerror = () => { activeXhr = null; reject(new Error('Upload connection failed')); }; xhr.onabort = () => { activeXhr = null; reject(new DOMException('Cancelled', 'AbortError')); }; xhr.send(payload);
    });
  }
  function connectionQuality(result) { const { download, upload, ping, jitter } = result; if (download >= 100 && upload >= 20 && ping < 35 && jitter < 12) return { key:'excellent', name:'Excellent', adjective:'excellent', description:'Fast, stable and ready for demanding work, 4K streaming and online play.' }; if (download >= 30 && upload >= 8 && ping < 70 && jitter < 25) return { key:'good', name:'Good', adjective:'reliable', description:'A dependable connection for everyday work, calls and HD streaming.' }; if (download >= 10 && ping < 130) return { key:'fair', name:'Fair', adjective:'usable', description:'Your connection handles lighter tasks, but may struggle with intensive activity.' }; return { key:'poor', name:'Poor', adjective:'limited', description:'This connection may cause delays, buffering or interruptions during online activity.' }; }
  function setResult(result) { const quality = connectionQuality(result); current = { ...result, quality, date: new Date().toISOString(), server: serverInfo.name }; el.qualityText.textContent = quality.adjective; el.qualityDescription.textContent = quality.description; el.qualityBadge.className = `quality-badge ${quality.key}`; el.qualityBadgeText.textContent = quality.name; setText(el.resultDownload, number(result.download)); setText(el.resultUpload, number(result.upload)); setText(el.resultPing, number(result.ping)); setText(el.resultJitter, number(result.jitter)); el.resultSection.classList.remove('hidden'); el.resultSection.scrollIntoView({ behavior:'smooth', block:'nearest' }); saveHistory(current); }
  function readHistory() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; } }
  function saveHistory(result) { const history = [result, ...readHistory()].slice(0, 8); localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); renderHistory(); }
  function renderHistory() { const history = readHistory(); el.clearHistory.classList.toggle('hidden', history.length === 0); if (!history.length) { el.history.innerHTML = '<p class="history-empty">No tests yet. Your recent results stay privately on this device.</p>'; return; } el.history.innerHTML = history.map((row) => { const when = new Date(row.date).toLocaleString([], { dateStyle:'medium', timeStyle:'short' }); return `<article class="history-row"><span class="history-date">${when}</span><span class="history-number">↓ ${number(row.download)}<small>Mbps</small></span><span class="history-number">↑ ${number(row.upload)}<small>Mbps</small></span><span class="history-number">${number(row.ping)}<small>ms</small></span><span class="history-quality ${row.quality?.key || ''}">${row.quality?.name || 'Result'}</span></article>`; }).join(''); }
  function resultText() { if (!current) return ''; return `Pulse Speed Test\nDownload: ${number(current.download)} Mbps\nUpload: ${number(current.upload)} Mbps\nPing: ${number(current.ping)} ms\nJitter: ${number(current.jitter)} ms\nQuality: ${current.quality.name}\nServer: ${current.server}`; }
  async function copyResult() { if (!current) return; try { await navigator.clipboard.writeText(resultText()); toast('Result copied to clipboard'); } catch { const textarea = document.createElement('textarea'); textarea.value = resultText(); document.body.append(textarea); textarea.select(); document.execCommand('copy'); textarea.remove(); toast('Result copied to clipboard'); } }
  async function shareResult() { if (!current) return; if (navigator.share) { try { await navigator.share({ title:'My Pulse Speed Test', text:resultText() }); } catch (error) { if (error.name !== 'AbortError') copyResult(); } } else copyResult(); }
  function downloadImage() { if (!current) return; const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 900; const ctx = canvas.getContext('2d'); const dark = document.documentElement.dataset.theme !== 'light';
    ctx.fillStyle = dark ? '#071521' : '#f5f9fa'; ctx.fillRect(0,0,1600,900); const glow = ctx.createRadialGradient(1210,100,5,1210,100,500); glow.addColorStop(0, dark ? 'rgba(64,227,204,.22)' : 'rgba(0,159,144,.18)'); glow.addColorStop(1,'rgba(0,0,0,0)'); ctx.fillStyle=glow;ctx.fillRect(0,0,1600,900);
    const textColor = dark ? '#f2f8fa' : '#102d3d'; const muted = dark ? '#91a9b7' : '#5f7988'; const aqua = dark ? '#40e3cc' : '#009f90'; ctx.fillStyle=aqua;ctx.font='800 38px Manrope, sans-serif';ctx.fillText('PULSE.',104,115);ctx.fillStyle=muted;ctx.font='600 22px Manrope, sans-serif';ctx.fillText('INTERNET SPEED TEST',105,153);ctx.fillStyle=textColor;ctx.font='800 70px Manrope, sans-serif';ctx.fillText(`A ${current.quality.adjective} connection.`,104,268);ctx.fillStyle=muted;ctx.font='400 25px Manrope, sans-serif';ctx.fillText('Measured with real browser-to-server data transfer',105,313);
    const metrics=[['DOWNLOAD',number(current.download),'Mbps'],['UPLOAD',number(current.upload),'Mbps'],['PING',number(current.ping),'ms'],['JITTER',number(current.jitter),'ms']]; metrics.forEach((item,i)=>{const x=104+i*370;ctx.fillStyle=dark?'#10293a':'#ffffff';ctx.fillRect(x,415,330,195);ctx.strokeStyle=dark?'rgba(181,218,236,.15)':'rgba(17,60,77,.15)';ctx.strokeRect(x,415,330,195);ctx.fillStyle=muted;ctx.font='700 18px Manrope, sans-serif';ctx.fillText(item[0],x+28,460);ctx.fillStyle=textColor;ctx.font='500 48px monospace';ctx.fillText(item[1],x+28,535);ctx.fillStyle=muted;ctx.font='400 20px monospace';ctx.fillText(item[2],x+28,570);});
    ctx.fillStyle=muted;ctx.font='400 20px Manrope, sans-serif';ctx.fillText(`${current.quality.name} • ${current.server} • ${new Date(current.date).toLocaleString()}`,105,728);ctx.fillStyle=aqua;ctx.fillRect(105,772,1390,2);ctx.fillStyle=muted;ctx.font='600 18px Manrope, sans-serif';ctx.fillText('pulse speed test',105,824);
    const link = document.createElement('a'); link.download=`pulse-speed-test-${Date.now()}.png`; link.href=canvas.toDataURL('image/png'); link.click(); toast('Result image downloaded'); }
  async function runTest() { if (running) return; running = true; resetTest(); controller = new AbortController(); showControls('running'); document.body.classList.add('testing');
    try { await loadServer(); const latency = await measurePing(controller.signal); const download = await measureDownload(controller.signal); const upload = await measureUpload(); const result = { ...latency, download, upload }; setResult(result); status('Test complete', 'ready'); setText(el.testNote, 'Your result is saved privately in this browser.'); showControls('done'); }
    catch (error) { if (error.name === 'AbortError') { status('Test cancelled', 'ready'); setText(el.testNote, 'No result was saved. You can start again whenever you’re ready.'); showControls('idle'); } else { console.error(error); status('Unable to complete test', 'error'); setText(el.testNote, 'Check that the speed-test server is running, then try again.'); showControls('idle'); toast('The test could not be completed'); } }
    finally { running = false; controller = null; activeXhr = null; document.body.classList.remove('testing'); }
  }
  function cancelTest() { if (controller) controller.abort(); if (activeXhr) activeXhr.abort(); }
  function applyTheme(theme) { document.documentElement.dataset.theme = theme; localStorage.setItem('pulse-theme', theme); el.theme.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`); drawChart(); }
  el.start.addEventListener('click', runTest); el.again.addEventListener('click', runTest); el.cancel.addEventListener('click', cancelTest); el.copy.addEventListener('click', copyResult); el.share.addEventListener('click', shareResult); el.image.addEventListener('click', downloadImage);
  el.clearHistory.addEventListener('click', () => { localStorage.removeItem(HISTORY_KEY); renderHistory(); toast('History cleared'); }); el.theme.addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));
  window.addEventListener('resize', drawChart); document.addEventListener('visibilitychange', () => { if (!document.hidden) drawChart(); });
  const initialTheme = localStorage.getItem('pulse-theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'); applyTheme(initialTheme); $('year').textContent = new Date().getFullYear(); renderHistory(); loadServer(); drawChart();
})();
