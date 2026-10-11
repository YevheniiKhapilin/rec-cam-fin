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
    return Array.from({ length: COUNT }, (_, i) => {
      const [x, y] = pixels[Math.floor(random() * pixels.length)];
      return [(x - bitmap.width / 2) / 115, -(y - bitmap.height / 2) / 115, (random() - .5) * .12];
    });
  }
  function setGesture(next, fromDetection = false) {
    if (![1, 2, 3, 4].includes(next)) return;
    gesture = next;
    const titles = { 1: 'КОСМИЧЕСКОЕ ПОЛЕ', 2: 'СИГНАЛ СЕРДЦА', 3: 'Я ЛЮБЛЮ ТЕБЯ, ЛЕСЮША', 4: 'ПОЦЕЛУЙЧИК ТЕБЕ' };
    const labels = { 1: 'ОДИН ПАЛЕЦ', 2: 'ДВА ПАЛЬЦА', 3: 'ТРИ ПАЛЬЦА', 4: 'ЧЕТЫРЕ ПАЛЬЦА' };
    sceneTitle.textContent = titles[next]; number.textContent = `0${next}`; fingerLabel.textContent = labels[next];
    presetButtons.forEach((item) => item.classList.toggle('active', Number(item.dataset.gesture) === next));
    if (fromDetection) helpText.textContent = `Обнаружено: ${labels[next].toLowerCase()}. Камера остаётся в этом браузере.`;
  }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    width = rect.width; height = rect.height;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function render(timestamp) {
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
    const sceneRotation = gesture === 3 ? Math.sin(timestamp * .00045) * .045 : gesture === 4 ? Math.sin(timestamp * .0006) * .05 : rotation;
    const cos = Math.cos(sceneRotation), sin = Math.sin(sceneRotation);
    const tilt = gesture === 3 || gesture === 4 ? .055 : 0;
    const cosTilt = Math.cos(tilt), sinTilt = Math.sin(tilt);
    const scaleBase = Math.min(width, height) * (gesture >= 3 ? .14 : .18);
    const centerX = width * .5, centerY = height * (gesture === 4 ? .69 : .53);
    const colors = gesture === 1 ? ['116,86,255', '23,36,93'] : gesture === 2 ? ['255,63,105', '255,154,158'] : gesture === 4 ? ['255,177,211', '255,244,250'] : ['245,248,255', '155,221,255'];
    for (let i = 0; i < COUNT; i++) {
      const [x, y, z] = points[i];
      const rx = x * cos - z * sin;
      const rz = x * sin + z * cos;
      const tiltedY = y * cosTilt - rz * sinTilt;
      const tiltedZ = y * sinTilt + rz * cosTilt;
      const perspective = 6.6 / (6.6 + tiltedZ);
      const px = centerX + rx * scaleBase * perspective;
      const py = centerY - tiltedY * scaleBase * perspective;
      if (px < 2 || px > width - 2 || py < 2 || py > height - 2) continue;
      const mix = i % 9 === 0 ? 1 : ((i * 13) % 100) / 310;
      const alpha = Math.max(.25, Math.min(.95, .55 + (1 - perspective) * .7));
      ctx.fillStyle = `rgba(${colors[mix > .6 ? 1 : 0]},${alpha})`;
      const size = perspective > 1 ? 2 : 1.45;
      ctx.fillRect(px, py, size, size);
    }
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
    for (let i = 0; i < 14; i++) {
      const orbit = i * Math.PI * 2 / 14 + kissRotation * .28;
      const pulse = .82 + .18 * Math.sin(timestamp * .006 + i * 1.7);
      const radius = emojiSize * (.74 + .12 * Math.sin(i * 2.1));
      const sx = x + Math.cos(orbit) * radius, sy = y + Math.sin(orbit) * radius * .58;
      const size = (i % 3 === 0 ? 9 : 5) * pulse;
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(orbit + timestamp * .001);
      ctx.fillStyle = i % 2 ? 'rgba(255,228,243,.88)' : 'rgba(255,171,211,.95)'; ctx.shadowColor = '#ff9bce'; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(size * .34, -size * .34); ctx.lineTo(size, 0); ctx.lineTo(size * .34, size * .34); ctx.lineTo(0, size); ctx.lineTo(-size * .34, size * .34); ctx.lineTo(-size, 0); ctx.lineTo(-size * .34, -size * .34); ctx.closePath(); ctx.fill(); ctx.restore();
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
  targets[1] = makeSpace(); targets[2] = makeHeart(); targets[3] = makeText('Я люблю тебя, Лесюша'); targets[4] = makeText('поцелуйчик тебе', 88); points = targets[1].map((point) => [...point]);
  presetButtons.forEach((item) => item.addEventListener('click', () => setGesture(Number(item.dataset.gesture))));
  button.addEventListener('click', toggleCamera);
  window.addEventListener('keydown', (event) => { if (['1', '2', '3', '4'].includes(event.key)) setGesture(Number(event.key)); });
  window.addEventListener('resize', resize);
  resize(); render();
})();
