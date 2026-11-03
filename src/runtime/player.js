/* =====================================================================
   Lumen Player — reproductor de presentaciones sin dependencias.
   Se usa dentro de la app (modo presentación) y se incrusta tal cual en
   el HTML exportado. Escrito en JS plano a propósito.
   ===================================================================== */

/* ---------------------------- Sonido -------------------------------- */

let audioCtx = null;
let master = null;
let soundEnabled = true;
let soundVolume = 0.5;

function ctx() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
    master = audioCtx.createGain();
    master.gain.value = soundVolume;
    master.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

function noiseBuffer(ac, seconds) {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function tone(ac, { type = 'sine', from, to, start = 0, dur, gain = 0.3, attack = 0.005 }) {
  const t0 = ac.currentTime + start;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(ac, { dur, from, to, type = 'bandpass', q = 1.2, gain = 0.25, start = 0, attack = 0.04 }) {
  const t0 = ac.currentTime + start;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, dur + 0.1);
  const f = ac.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t0);
  f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.1);
}

const SOUNDS = {
  whoosh: (ac) => noise(ac, { dur: 0.55, from: 280, to: 3200, gain: 0.35, attack: 0.18 }),
  swoosh: (ac) => noise(ac, { dur: 0.38, from: 4200, to: 500, type: 'bandpass', q: 0.8, gain: 0.3, attack: 0.06 }),
  pop: (ac) => tone(ac, { from: 380, to: 920, dur: 0.12, gain: 0.35 }),
  chime: (ac) => {
    tone(ac, { from: 880, dur: 1.2, gain: 0.18 });
    tone(ac, { from: 1318.5, dur: 1.4, gain: 0.12, start: 0.08 });
    tone(ac, { from: 1760, dur: 1.0, gain: 0.06, start: 0.16 });
  },
  click: (ac) => tone(ac, { type: 'triangle', from: 1400, to: 900, dur: 0.05, gain: 0.25 }),
  soft: (ac) => tone(ac, { from: 520, to: 480, dur: 0.35, gain: 0.15, attack: 0.03 }),
  rise: (ac) => {
    tone(ac, { from: 180, to: 720, dur: 0.7, gain: 0.12, attack: 0.3 });
    noise(ac, { dur: 0.7, from: 400, to: 5000, gain: 0.15, attack: 0.5 });
  },
  // Sonidos de interfaz
  tick: (ac) => tone(ac, { type: 'sine', from: 1900, to: 1500, dur: 0.03, gain: 0.08 }),
  tap: (ac) => tone(ac, { type: 'triangle', from: 660, to: 520, dur: 0.06, gain: 0.12 }),
  toggle: (ac) => {
    tone(ac, { type: 'triangle', from: 740, dur: 0.05, gain: 0.12 });
    tone(ac, { type: 'triangle', from: 990, dur: 0.06, gain: 0.1, start: 0.05 });
  },
  success: (ac) => {
    tone(ac, { from: 523.25, dur: 0.18, gain: 0.14 });
    tone(ac, { from: 659.25, dur: 0.18, gain: 0.14, start: 0.08 });
    tone(ac, { from: 783.99, dur: 0.35, gain: 0.14, start: 0.16 });
  },
  error: (ac) => {
    tone(ac, { type: 'square', from: 220, dur: 0.12, gain: 0.06 });
    tone(ac, { type: 'square', from: 165, dur: 0.18, gain: 0.06, start: 0.12 });
  },
  remove: (ac) => tone(ac, { from: 600, to: 180, dur: 0.18, gain: 0.14 }),
  open: (ac) => noise(ac, { dur: 0.22, from: 900, to: 2600, gain: 0.08, attack: 0.08 }),
  close: (ac) => noise(ac, { dur: 0.2, from: 2600, to: 900, gain: 0.07, attack: 0.05 }),
};

export const lumenSound = {
  play(name) {
    if (!soundEnabled || !name || name === 'none' || !SOUNDS[name]) return;
    const ac = ctx();
    if (!ac) return;
    try {
      SOUNDS[name](ac);
    } catch (e) {
      /* audio no disponible */
    }
  },
  setEnabled(v) {
    soundEnabled = !!v;
  },
  isEnabled() {
    return soundEnabled;
  },
  setVolume(v) {
    soundVolume = Math.max(0, Math.min(1, v));
    if (master) master.gain.value = soundVolume;
  },
  names: Object.keys(SOUNDS),
};

/* --------------------------- Reproductor ---------------------------- */

const ICONS = {
  prev: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  next: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
  full: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>',
  notes: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><path d="M9 13h6M9 17h3"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  sound: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>',
  mute: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="m23 9-6 6M17 9l6 6"/></svg>',
};

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

/**
 * @param {HTMLElement} root  Contenedor .lm-deck con .lm-stage > .lm-frame
 * @param {object} options
 */
export function createPlayer(root, options) {
  const opts = Object.assign(
    {
      width: 1920,
      height: 1080,
      loop: false,
      autoAdvance: 0,
      progress: 'bar',
      slideNumbers: false,
      sounds: true,
      controls: true,
      startIndex: 0,
      hash: false,
      exitButton: false,
      onExit: null,
      onChange: null,
    },
    options || {},
  );
  const stage = root.querySelector('.lm-stage');
  const allFrames = Array.prototype.slice.call(root.querySelectorAll('.lm-frame'));
  const frames = allFrames.filter((f) => f.dataset.hidden !== 'true');
  allFrames.forEach((f) => {
    if (f.dataset.hidden === 'true') f.style.display = 'none';
  });

  let index = -1;
  let step = 0;
  let autoTimer = null;
  let idleTimer = null;
  let leaveTimers = [];
  let destroyed = false;
  let blackout = false;
  let soundOn = opts.sounds;

  /* ---- Escalado ---- */
  function fit() {
    const s = Math.min(root.clientWidth / opts.width, root.clientHeight / opts.height) || 1;
    stage.style.setProperty('--lm-scale', String(s));
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
  if (ro) ro.observe(root);
  window.addEventListener('resize', fit);
  fit();

  /* ---- Interfaz ---- */
  const ui = el('div', 'lm-ui');
  const progress = el('div', 'lm-progress', '<i></i>');
  const dots = el('div', 'lm-dots');
  const counter = el('div', 'lm-counter');
  const controls = el('div', 'lm-controls');
  const notes = el('div', 'lm-notes');
  const black = el('div', 'lm-blackout');
  const btn = (name, title, fn) => {
    const b = el('button', 'lm-btn lm-btn-' + name, ICONS[name]);
    b.type = 'button';
    b.title = title;
    b.setAttribute('aria-label', title);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      fn();
    });
    return b;
  };
  const soundBtn = btn(soundOn ? 'sound' : 'mute', 'Sonido (M)', () => toggleSound());
  controls.append(
    btn('prev', 'Anterior (←)', () => prev()),
    counter,
    btn('next', 'Siguiente (→)', () => next()),
    el('span', 'lm-sep'),
    btn('notes', 'Notas (N)', () => toggleNotes()),
    soundBtn,
    btn('full', 'Pantalla completa (F)', () => toggleFullscreen()),
  );
  if (opts.exitButton) controls.append(btn('close', 'Salir (Esc)', () => exit()));
  if (opts.progress === 'bar') ui.append(progress);
  if (opts.progress === 'dots') {
    frames.forEach((_, i) => {
      const d = el('button', 'lm-dot');
      d.type = 'button';
      d.setAttribute('aria-label', 'Diapositiva ' + (i + 1));
      d.addEventListener('click', (e) => {
        e.stopPropagation();
        go(i);
      });
      dots.append(d);
    });
    ui.append(dots);
  }
  if (opts.controls) ui.append(controls);
  if (opts.slideNumbers) ui.append(el('div', 'lm-slidenum'));
  ui.append(notes, black);
  root.append(ui);

  function toggleSound() {
    soundOn = !soundOn;
    soundBtn.innerHTML = soundOn ? ICONS.sound : ICONS.mute;
    if (soundOn) lumenSound.play('tap');
  }
  function toggleNotes() {
    root.classList.toggle('lm-show-notes');
  }
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else root.requestFullscreen && root.requestFullscreen().catch(() => {});
  }
  function exit() {
    if (typeof opts.onExit === 'function') opts.onExit();
  }

  /* ---- Pasos (builds) ---- */
  function anims(frame) {
    return Array.prototype.slice.call(frame.querySelectorAll('.lm-anim'));
  }
  function maxStep(frame) {
    return anims(frame).reduce((m, a) => Math.max(m, Number(a.dataset.step) || 0), 0);
  }
  function applyStep(frame, s, replay) {
    const list = anims(frame);
    if (replay) {
      list.forEach((a) => a.classList.remove('lm-in'));
      void frame.offsetWidth; // reinicia animaciones CSS
    }
    list.forEach((a) => a.classList.toggle('lm-in', (Number(a.dataset.step) || 0) <= s));
  }

  /* ---- Medios ---- */
  function media(frame, play) {
    frame.querySelectorAll('video').forEach((v) => {
      if (play) {
        v.playbackRate = Number(v.dataset.rate) || 1;
        if (v.dataset.autoplay !== 'false') {
          const p = v.play();
          if (p && p.catch)
            p.catch(() => {
              v.muted = true;
              v.play().catch(() => {});
            });
        }
      } else {
        v.pause();
      }
    });
  }

  /* ---- Navegación ---- */
  function updateUi() {
    const total = frames.length;
    counter.textContent = total ? index + 1 + ' / ' + total : '0 / 0';
    const bar = progress.firstChild;
    if (bar) bar.style.transform = 'scaleX(' + (total ? (index + 1) / total : 0) + ')';
    Array.prototype.forEach.call(dots.children, (d, i) => d.classList.toggle('is-active', i === index));
    const num = ui.querySelector('.lm-slidenum');
    if (num) num.textContent = String(index + 1);
    const f = frames[index];
    notes.textContent = (f && f.dataset.notes) || 'Sin notas para esta diapositiva.';
    if (opts.hash) history.replaceState(null, '', '#/' + (index + 1));
    if (typeof opts.onChange === 'function') opts.onChange(index, step);
  }

  function scheduleAuto() {
    clearTimeout(autoTimer);
    const f = frames[index];
    if (!f) return;
    const secs = Number(f.dataset.duration) || opts.autoAdvance || 0;
    if (secs > 0) autoTimer = setTimeout(() => next(), secs * 1000);
  }

  function go(i, dir, opt) {
    if (!frames.length) return;
    const total = frames.length;
    if (opts.loop) i = ((i % total) + total) % total;
    if (i < 0 || i >= total || i === index) return;
    dir = dir || (i > index ? 1 : -1);
    const prevFrame = frames[index];
    const nextFrame = frames[i];
    const type = (opt && opt.instant) || index < 0 ? 'none' : nextFrame.dataset.transition || 'fade';
    const dur = type === 'none' ? 0 : Number(nextFrame.dataset.tdur) || 800;

    leaveTimers.forEach(clearTimeout);
    leaveTimers = [];
    allFrames.forEach((f) => {
      if (f !== prevFrame && f !== nextFrame) {
        f.classList.remove('is-current', 'is-enter', 'is-leave');
        media(f, false);
      }
    });

    stage.style.setProperty('--dir', String(dir));
    stage.style.setProperty('--o-in', dir > 0 ? '0% 50%' : '100% 50%');
    stage.style.setProperty('--o-out', dir > 0 ? '100% 50%' : '0% 50%');

    nextFrame.style.setProperty('--lm-tdur', dur + 'ms');
    nextFrame.style.setProperty('--lm-offset', Math.round(dur * 0.45) + 'ms');
    nextFrame.dataset.t = type;
    nextFrame.classList.remove('is-leave');
    nextFrame.classList.add('is-current');
    if (type !== 'none') {
      nextFrame.classList.remove('is-enter');
      void nextFrame.offsetWidth;
      nextFrame.classList.add('is-enter');
    }

    if (prevFrame && prevFrame !== nextFrame) {
      prevFrame.style.setProperty('--lm-tdur', dur + 'ms');
      prevFrame.dataset.t = type;
      prevFrame.classList.remove('is-current', 'is-enter');
      if (type !== 'none') {
        prevFrame.classList.add('is-leave');
        leaveTimers.push(
          setTimeout(() => {
            prevFrame.classList.remove('is-leave');
            media(prevFrame, false);
          }, dur + 30),
        );
      } else {
        media(prevFrame, false);
      }
    }
    leaveTimers.push(setTimeout(() => nextFrame.classList.remove('is-enter'), dur + 30));

    index = i;
    step = dir < 0 && !(opt && opt.fromStart) ? maxStep(nextFrame) : 0;
    applyStep(nextFrame, step, true);
    media(nextFrame, true);
    if (soundOn && index >= 0 && prevFrame) lumenSound.play(nextFrame.dataset.sound);
    updateUi();
    scheduleAuto();
  }

  function next() {
    const f = frames[index];
    if (f && step < maxStep(f)) {
      step += 1;
      f.style.setProperty('--lm-offset', '0ms');
      applyStep(f, step, false);
      if (soundOn) lumenSound.play('tick');
      updateUi();
      scheduleAuto();
      return;
    }
    if (index < frames.length - 1 || opts.loop) go(index + 1, 1, { fromStart: true });
  }
  function prev() {
    const f = frames[index];
    if (f && step > 0) {
      step -= 1;
      applyStep(f, step, false);
      updateUi();
      return;
    }
    if (index > 0 || opts.loop) go(index - 1, -1);
  }

  /* ---- Entrada ---- */
  function onKey(e) {
    if (destroyed) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
      case 'PageDown':
      case ' ':
      case 'Enter':
        e.preventDefault();
        next();
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
      case 'PageUp':
      case 'Backspace':
        e.preventDefault();
        prev();
        break;
      case 'Home':
        go(0, -1, { fromStart: true });
        break;
      case 'End':
        go(frames.length - 1, 1);
        break;
      case 'f':
      case 'F':
        toggleFullscreen();
        break;
      case 'n':
      case 'N':
        toggleNotes();
        break;
      case 'm':
      case 'M':
        toggleSound();
        break;
      case 'b':
      case 'B':
      case '.':
        blackout = !blackout;
        root.classList.toggle('lm-black', blackout);
        break;
      case 'Escape':
        if (!document.fullscreenElement) exit();
        break;
      default:
        if (/^[0-9]$/.test(e.key)) {
          const n = Number(e.key) || 10;
          go(n - 1, undefined, { fromStart: true });
        }
    }
  }

  function onClick(e) {
    const t = e.target;
    if (t.closest('.lm-ui, video[controls], iframe, a')) return;
    const link = t.closest('[data-link]');
    if (link) {
      const href = link.getAttribute('data-link');
      if (href.charAt(0) === '#') go(Number(href.slice(1)) - 1, undefined, { fromStart: true });
      else window.open(href, '_blank', 'noopener');
      return;
    }
    if (e.clientX < root.clientWidth * 0.18) prev();
    else next();
  }

  let touchX = null;
  function onTouchStart(e) {
    touchX = e.touches[0].clientX;
  }
  function onTouchEnd(e) {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 50) {
      e.preventDefault();
      if (dx < 0) next();
      else prev();
    }
  }

  function onMove() {
    root.classList.remove('lm-idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => root.classList.add('lm-idle'), 2600);
  }

  function onFsChange() {
    root.classList.toggle('lm-fullscreen', !!document.fullscreenElement);
    if (!document.fullscreenElement && opts.exitOnFullscreenEnd) exit();
  }

  window.addEventListener('keydown', onKey);
  root.addEventListener('click', onClick);
  root.addEventListener('touchstart', onTouchStart, { passive: true });
  root.addEventListener('touchend', onTouchEnd);
  root.addEventListener('mousemove', onMove);
  document.addEventListener('fullscreenchange', onFsChange);
  onMove();

  let start = opts.startIndex || 0;
  if (opts.hash) {
    const m = /#\/(\d+)/.exec(location.hash);
    if (m) start = Number(m[1]) - 1;
  }
  go(Math.max(0, Math.min(start, frames.length - 1)), 1, { instant: true, fromStart: true });

  return {
    next,
    prev,
    go: (i) => go(i, undefined, { fromStart: true }),
    get index() {
      return index;
    },
    get step() {
      return step;
    },
    get count() {
      return frames.length;
    },
    destroy() {
      destroyed = true;
      clearTimeout(autoTimer);
      clearTimeout(idleTimer);
      leaveTimers.forEach(clearTimeout);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', fit);
      root.removeEventListener('click', onClick);
      root.removeEventListener('touchstart', onTouchStart);
      root.removeEventListener('touchend', onTouchEnd);
      root.removeEventListener('mousemove', onMove);
      document.removeEventListener('fullscreenchange', onFsChange);
      if (ro) ro.disconnect();
      allFrames.forEach((f) => media(f, false));
      ui.remove();
    },
  };
}
