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
  const sceneDescription = document.querySelector('#scene-description');
  const helpText = document.querySelector('#help-text');
  const presetButtons = [...document.querySelectorAll('[data-gesture]')];
  const COUNT = 2800;
  const TAU = Math.PI * 2;
  const targets = { 1: [], 2: [], 3: [], 4: [] };
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
  let kissRotation = 0;
  let previousTimestamp = 0;
  const capture = document.createElement('canvas');
  capture.width = 320; capture.height = 240;
  const captureContext = capture.getContext('2d');

  function random() { return Math.random(); }
  function makeSpace() {
    const points = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const radius = 2.1 + random() * 3.8;
      const theta = random() * TAU;
      const phi = Math.acos(2 * random() - 1);
      const offset = i * 3;
      points[offset] = radius * Math.sin(phi) * Math.cos(theta);
      points[offset + 1] = radius * Math.sin(phi) * Math.sin(theta);
      points[offset + 2] = radius * Math.cos(phi);
    }
    return points;
  }
  function makeHeart() {
    const points = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const t = random() * TAU;
      const scale = .92 + random() * .16;
      const offset = i * 3;
      points[offset] = 16 * Math.sin(t) ** 3 * .17 * scale;
      points[offset + 1] = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * .17 * scale;
      points[offset + 2] = (random() - .5) * .4;
    }
    return points;
  }
  function makeText(text, fontSize = 96) {
    const bitmap = document.createElement('canvas');
    bitmap.width = 1500; bitmap.height = 260;
    const bctx = bitmap.getContext('2d');
    bctx.clearRect(0, 0, bitmap.width, bitmap.height);
    bctx.fillStyle = '#fff'; bctx.textAlign = 'center'; bctx.textBaseline = 'middle';
    bctx.font = `600 ${fontSize}px Georgia, "Times New Roman", serif`;
    bctx.fillText(text, bitmap.width / 2, bitmap.height / 2, bitmap.width - 40);
    const { data } = bctx.getImageData(0, 0, bitmap.width, bitmap.height);
    const pixels = [];
    for (let y = 0; y < bitmap.height; y += 3) for (let x = 0; x < bitmap.width; x += 3) if (data[(y * bitmap.width + x) * 4 + 3] > 90) pixels.push([x, y]);
    const points = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const [x, y] = pixels[Math.floor(random() * pixels.length)];
      const offset = i * 3;
      points[offset] = (x - bitmap.width / 2) / 115;
      points[offset + 1] = -(y - bitmap.height / 2) / 115;
      points[offset + 2] = (random() - .5) * .12;
    }
    return points;
  }
  function setGesture(next, fromDetection = false) {
    if (![1, 2, 3, 4].includes(next)) return;
    gesture = next;
    const titles = { 1: 'КОСМИЧЕСКОЕ ПОЛЕ', 2: 'СИГНАЛ СЕРДЦА', 3: 'Я ЛЮБЛЮ ТЕБЯ, ЛЕСЮША', 4: 'ПОЦЕЛУЙЧИК ТЕБЕ' };
    const labels = { 1: 'ОДИН ПАЛЕЦ', 2: 'ДВА ПАЛЬЦА', 3: 'ТРИ ПАЛЬЦА', 4: 'ЧЕТЫРЕ ПАЛЬЦА' };
    const descriptions = {
      1: 'Один палец — частицы вращаются в глубоком космическом поле.',
      2: 'Два пальца — красные частицы складываются в объёмное сердце.',
      3: 'Три пальца — светлая надпись мягко покачивается, оставаясь читаемой.',
      4: 'Четыре пальца — поцелуй вращается среди мерцающих искр.',
    };
    sceneTitle.textContent = titles[next]; number.textContent = `0${next}`; fingerLabel.textContent = labels[next];
    sceneDescription.textContent = descriptions[next];
    presetButtons.forEach((item) => item.classList.toggle('active', Number(item.dataset.gesture) === next));
    if (fromDetection) helpText.textContent = `Обнаружено: ${labels[next].toLowerCase()}. Камера остаётся в этом браузере.`;
  }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.35);
    width = rect.width; height = rect.height;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function render(timestamp) {
    requestAnimationFrame(render);
    const target = targets[gesture];
    const frameScale = previousTimestamp ? Math.min((timestamp - previousTimestamp) / 16.67, 2) : 1;
    previousTimestamp = timestamp;
    const ease = 1 - Math.pow(.89, frameScale);
    for (let i = 0; i < COUNT; i++) {
      const offset = i * 3;
      points[offset] += (target[offset] - points[offset]) * ease;
      points[offset + 1] += (target[offset + 1] - points[offset + 1]) * ease;
      points[offset + 2] += (target[offset + 2] - points[offset + 2]) * ease;
    }
    rotation += .0024 * frameScale;
    ctx.clearRect(0, 0, width, height);
    const sceneRotation = gesture === 3 ? Math.sin(timestamp * .00045) * .045 : gesture === 4 ? Math.sin(timestamp * .0006) * .05 : rotation;
    const cos = Math.cos(sceneRotation), sin = Math.sin(sceneRotation);
    const tilt = gesture === 3 || gesture === 4 ? .055 : 0;
    const cosTilt = Math.cos(tilt), sinTilt = Math.sin(tilt);
    const scaleBase = Math.min(width, height) * (gesture >= 3 ? .14 : .18);
    const centerX = width * .5, centerY = height * (gesture === 4 ? .69 : .53);
    const colors = gesture === 1 ? ['116,86,255', '23,36,93'] : gesture === 2 ? ['255,63,105', '255,154,158'] : gesture === 4 ? ['255,177,211', '255,244,250'] : ['245,248,255', '155,221,255'];
    const mainPath = new Path2D(), accentPath = new Path2D();
    for (let i = 0; i < COUNT; i++) {
      const offset = i * 3;
      const x = points[offset], y = points[offset + 1], z = points[offset + 2];
      const rx = x * cos - z * sin;
      const rz = x * sin + z * cos;
      const tiltedY = y * cosTilt - rz * sinTilt;
      const tiltedZ = y * sinTilt + rz * cosTilt;
      const perspective = 6.6 / (6.6 + tiltedZ);
      const px = centerX + rx * scaleBase * perspective;
      const py = centerY - tiltedY * scaleBase * perspective;
      if (px < 2 || px > width - 2 || py < 2 || py > height - 2) continue;
      const size = perspective > 1 ? 2 : 1.45;
      const path = i % 9 === 0 || ((i * 13) % 100) / 310 > .6 ? accentPath : mainPath;
      path.rect(px, py, size, size);
    }
    ctx.fillStyle = `rgba(${colors[0]},.8)`; ctx.fill(mainPath);
    ctx.fillStyle = `rgba(${colors[1]},.8)`; ctx.fill(accentPath);
    if (gesture === 4) drawKiss(timestamp, centerX, height * .31);
  }
  function drawKiss(timestamp, x, y) {
    kissRotation = timestamp * .0018;
    const emojiSize = Math.min(width, height) * .19;
    ctx.save(); ctx.translate(x, y); ctx.scale(Math.cos(kissRotation), 1);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${emojiSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    ctx.shadowColor = 'rgba(255,118,183,.8)'; ctx.shadowBlur = 26;
    ctx.fillText('😘', 0, 0); ctx.restore();
    const sparkles = new Path2D();
    for (let i = 0; i < 10; i++) {
      const orbit = i * Math.PI * 2 / 14 + kissRotation * .28;
      const pulse = .82 + .18 * Math.sin(timestamp * .006 + i * 1.7);
      const radius = emojiSize * (.74 + .12 * Math.sin(i * 2.1));
      const sx = x + Math.cos(orbit) * radius, sy = y + Math.sin(orbit) * radius * .58;
      const size = (i % 3 === 0 ? 9 : 5) * pulse;
      const cos = Math.cos(orbit + timestamp * .001), sin = Math.sin(orbit + timestamp * .001);
      for (let corner = 0; corner < 8; corner++) {
        const angle = corner * Math.PI / 4;
        const radiusAtCorner = corner % 2 ? size * .34 : size;
        const px = sx + Math.cos(angle) * radiusAtCorner * cos - Math.sin(angle) * radiusAtCorner * sin;
        const py = sy + Math.cos(angle) * radiusAtCorner * sin + Math.sin(angle) * radiusAtCorner * cos;
        if (corner === 0) sparkles.moveTo(px, py); else sparkles.lineTo(px, py);
      }
      sparkles.closePath();
    }
    ctx.fillStyle = 'rgba(255,205,232,.92)'; ctx.shadowColor = '#ff9bce'; ctx.shadowBlur = 5; ctx.fill(sparkles); ctx.shadowBlur = 0;
  }
  async function detectLoop() {
    if (!tracking) return;
    if (!requestPending && video.readyState >= 2) {
      requestPending = true;
      captureContext.drawImage(video, 0, 0, capture.width, capture.height);
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
    button.disabled = true; buttonLabel.textContent = 'ЗАПУСК КАМЕРЫ…';
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
      video.srcObject = stream; await video.play(); tracking = true; samples = [];
      status.textContent = 'КАМЕРА ВКЛЮЧЕНА'; statusLight.classList.add('on'); buttonLabel.textContent = 'ВЫКЛЮЧИТЬ КАМЕРУ';
      helpText.textContent = 'Распознавание включено. Покажите один, два, три или четыре пальца.';
      detectLoop();
    } catch (error) {
      console.error(error); status.textContent = 'НЕТ ДОСТУПА К КАМЕРЕ';
      helpText.textContent = 'Нет доступа к камере. Выберите сцену вручную или нажмите клавишу от 1 до 4.';
      buttonLabel.textContent = 'ПОВТОРИТЬ ЗАПУСК';
    } finally { button.disabled = false; }
  }
  function stopCamera() {
    tracking = false; window.clearTimeout(detectorTimer);
    if (stream) stream.getTracks().forEach((track) => track.stop());
    stream = null; video.srcObject = null; status.textContent = 'КАМЕРА ВЫКЛЮЧЕНА'; statusLight.classList.remove('on'); buttonLabel.textContent = 'ВКЛЮЧИТЬ КАМЕРУ';
    helpText.textContent = 'Камера остаётся в этом браузере. Кадры отправляются приложению Python для распознавания жестов.';
  }
  targets[1] = makeSpace(); targets[2] = makeHeart(); targets[3] = makeText('Я люблю тебя, Лесюша'); targets[4] = makeText('поцелуйчик тебе', 88); points = targets[1].slice();
  presetButtons.forEach((item) => item.addEventListener('click', () => setGesture(Number(item.dataset.gesture))));
  button.addEventListener('click', toggleCamera);
  window.addEventListener('keydown', (event) => { if (['1', '2', '3', '4'].includes(event.key)) setGesture(Number(event.key)); });
  window.addEventListener('resize', resize);
  resize(); render();
})();
