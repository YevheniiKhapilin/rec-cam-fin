(() => {
  const canvas = document.querySelector('#particles');
  const ctx = canvas.getContext('2d', { alpha: true });
  const video = document.querySelector('#camera');
  const button = document.querySelector('#camera-button');
  const buttonLabel = document.querySelector('#camera-button-label');
  const status = document.querySelector('#camera-status');
  const statusLight = document.querySelector('#status-light');
  const number = document.querySelector('#finger-number');
  const fingerLabel = document.querySelector('#finger-label');
  const sceneTitle = document.querySelector('#scene-title');
  const helpText = document.querySelector('#help-text');
  const presetButtons = [...document.querySelectorAll('[data-gesture]')];
  const COUNT = 3600;
  const TAU = Math.PI * 2;
  const targets = { 1: [], 2: [], 3: [] };
  let points = [];
  let gesture = 1;
  let width = 0;
  let height = 0;
  let rotation = 0;
  let stream = null;
  let tracking = false;
  let detectorTimer = null;
  let requestPending = false;
  let samples = [];

  function random() { return Math.random(); }
  function makeSpace() {
    return Array.from({ length: COUNT }, () => {
      const radius = 2.1 + random() * 3.8;
      const theta = random() * TAU;
      const phi = Math.acos(2 * random() - 1);
      return [radius * Math.sin(phi) * Math.cos(theta), radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi)];
    });
  }
  function makeHeart() {
    return Array.from({ length: COUNT }, () => {
      const t = random() * TAU;
      const scale = .92 + random() * .16;
      return [16 * Math.sin(t) ** 3 * .17 * scale, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * .17 * scale, (random() - .5) * .4];
    });
  }
  function makeText() {
    const bitmap = document.createElement('canvas');
    bitmap.width = 1500; bitmap.height = 260;
    const bctx = bitmap.getContext('2d');
    bctx.clearRect(0, 0, bitmap.width, bitmap.height);
    bctx.fillStyle = '#fff'; bctx.textAlign = 'center'; bctx.textBaseline = 'middle';
    bctx.font = '600 112px Georgia, "Times New Roman", serif';
    bctx.fillText('Я люблю тебя, Леся', bitmap.width / 2, bitmap.height / 2, bitmap.width - 40);
    const { data } = bctx.getImageData(0, 0, bitmap.width, bitmap.height);
    const pixels = [];
    for (let y = 0; y < bitmap.height; y += 3) for (let x = 0; x < bitmap.width; x += 3) if (data[(y * bitmap.width + x) * 4 + 3] > 90) pixels.push([x, y]);
    return Array.from({ length: COUNT }, (_, i) => {
      const [x, y] = pixels[Math.floor(random() * pixels.length)];
      return [(x - bitmap.width / 2) / 115, -(y - bitmap.height / 2) / 115, (random() - .5) * .12];
    });
  }
  function setGesture(next, fromDetection = false) {
    if (![1, 2, 3].includes(next)) return;
    gesture = next;
    const titles = { 1: 'SPACE FIELD', 2: 'HEART SIGNAL', 3: 'Я ЛЮБЛЮ ТЕБЯ, ЛЕСЯ' };
    const labels = { 1: 'ONE FINGER', 2: 'TWO FINGERS', 3: 'THREE FINGERS' };
    sceneTitle.textContent = titles[next]; number.textContent = `0${next}`; fingerLabel.textContent = labels[next];
    presetButtons.forEach((item) => item.classList.toggle('active', Number(item.dataset.gesture) === next));
    if (fromDetection) helpText.textContent = `Detected ${labels[next].toLowerCase()} · Your camera stays in this browser.`;
  }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    width = rect.width; height = rect.height;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function render() {
    requestAnimationFrame(render);
    const target = targets[gesture];
    const ease = .11;
    for (let i = 0; i < COUNT; i++) {
      points[i][0] += (target[i][0] - points[i][0]) * ease;
      points[i][1] += (target[i][1] - points[i][1]) * ease;
      points[i][2] += (target[i][2] - points[i][2]) * ease;
    }
    rotation += .0024;
    ctx.clearRect(0, 0, width, height);
    const cos = Math.cos(rotation), sin = Math.sin(rotation);
    const scaleBase = Math.min(width, height) * .18;
    const centerX = width * .5, centerY = height * .53;
    const colors = gesture === 1 ? ['116,86,255', '23,36,93'] : gesture === 2 ? ['255,63,105', '255,154,158'] : ['245,248,255', '155,221,255'];
    for (let i = 0; i < COUNT; i++) {
      const [x, y, z] = points[i];
      const rx = x * cos - z * sin;
      const rz = x * sin + z * cos;
      const perspective = 6.6 / (6.6 + rz);
      const px = centerX + rx * scaleBase * perspective;
      const py = centerY - y * scaleBase * perspective;
      if (px < 2 || px > width - 2 || py < 2 || py > height - 2) continue;
      const mix = i % 9 === 0 ? 1 : ((i * 13) % 100) / 310;
      const alpha = Math.max(.25, Math.min(.95, .55 + (1 - perspective) * .7));
      ctx.fillStyle = `rgba(${colors[mix > .6 ? 1 : 0]},${alpha})`;
      const size = perspective > 1 ? 2 : 1.45;
      ctx.fillRect(px, py, size, size);
    }
  }
  async function detectLoop() {
    if (!tracking) return;
    if (!requestPending && video.readyState >= 2) {
      requestPending = true;
      const capture = document.createElement('canvas'); capture.width = 320; capture.height = 240;
      capture.getContext('2d').drawImage(video, 0, 0, capture.width, capture.height);
      try {
        const response = await fetch('/api/gesture', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: capture.toDataURL('image/jpeg', .55) }) });
        if (response.ok) {
          const data = await response.json();
          if (data.detected && data.fingers > 0) {
            samples.push(data.fingers); if (samples.length > 4) samples.shift();
            if (samples.length >= 2 && samples.slice(-2).every((n) => n === data.fingers)) setGesture(data.fingers, true);
          }
        }
      } catch (error) { console.error('Gesture detection request failed', error); }
      finally { requestPending = false; }
    }
    detectorTimer = window.setTimeout(detectLoop, 140);
  }
  async function toggleCamera() {
    if (tracking) { stopCamera(); return; }
    button.disabled = true; buttonLabel.textContent = 'STARTING CAMERA…';
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
      video.srcObject = stream; await video.play(); tracking = true; samples = [];
      status.textContent = 'CAMERA LIVE'; statusLight.classList.add('on'); buttonLabel.textContent = 'STOP CAMERA';
      helpText.textContent = 'Hand tracking is active. Show one, two, or three fingers.';
      detectLoop();
    } catch (error) {
      console.error(error); status.textContent = 'CAMERA BLOCKED';
      helpText.textContent = 'Camera access was blocked or unavailable. Use the scene presets or keys 1–3.';
      buttonLabel.textContent = 'RETRY CAMERA';
    } finally { button.disabled = false; }
  }
  function stopCamera() {
    tracking = false; window.clearTimeout(detectorTimer);
    if (stream) stream.getTracks().forEach((track) => track.stop());
    stream = null; video.srcObject = null; status.textContent = 'CAMERA OFF'; statusLight.classList.remove('on'); buttonLabel.textContent = 'ENABLE CAMERA';
    helpText.textContent = 'Your camera stays in this browser. Camera snapshots are sent to the Python app for gesture detection.';
  }
  targets[1] = makeSpace(); targets[2] = makeHeart(); targets[3] = makeText(); points = targets[1].map((point) => [...point]);
  presetButtons.forEach((item) => item.addEventListener('click', () => setGesture(Number(item.dataset.gesture))));
  button.addEventListener('click', toggleCamera);
  window.addEventListener('keydown', (event) => { if (['1', '2', '3'].includes(event.key)) setGesture(Number(event.key)); });
  window.addEventListener('resize', resize);
  resize(); render();
})();
