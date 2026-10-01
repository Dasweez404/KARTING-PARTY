// Clavier (QWERTY + AZERTY), tactile et manette.

const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up', KeyZ: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', KeyQ: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ShiftLeft: 'drift', ShiftRight: 'drift', KeyC: 'drift',
  Space: 'item', KeyE: 'item',
};

export class Input {
  constructor() {
    this.keys = { up: false, down: false, left: false, right: false, drift: false, item: false };
    this.touch = { up: false, down: false, left: false, right: false, drift: false, item: false };
    this.pad = { up: false, down: false, left: false, right: false, drift: false, item: false, steer: 0 };
    this.itemQueued = false;
    this.onPause = null;
    this.onMute = null;

    window.addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code];
      if (a) {
        if (a === 'item' && !this.keys.item) this.itemQueued = true;
        this.keys[a] = true;
        e.preventDefault();
      }
      if ((e.code === 'Escape' || e.code === 'KeyP') && this.onPause) this.onPause();
      if (e.code === 'KeyM' && this.onMute) this.onMute();
    });
    window.addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code];
      if (a) { this.keys[a] = false; e.preventDefault(); }
    });
    window.addEventListener('blur', () => {
      for (const k in this.keys) this.keys[k] = false;
    });

    document.querySelectorAll('[data-touch]').forEach((el) => {
      const a = el.dataset.touch;
      const on = (e) => {
        e.preventDefault();
        if (a === 'item' && !this.touch.item) this.itemQueued = true;
        this.touch[a] = true; el.classList.add('pressed');
      };
      const off = (e) => { e.preventDefault(); this.touch[a] = false; el.classList.remove('pressed'); };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('pointerleave', off);
    });
  }

  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && [...pads].find((p) => p);
    if (!gp) { this.pad.steer = 0; return; }
    const b = (i) => gp.buttons[i] && gp.buttons[i].pressed;
    const ax = gp.axes[0] || 0;
    this.pad.steer = Math.abs(ax) > 0.15 ? -ax : 0;
    this.pad.left = b(14); this.pad.right = b(15);
    this.pad.up = b(0) || b(7) || b(12);
    this.pad.down = b(2) || b(6) || b(13);
    this.pad.drift = b(5) || b(4);
    const it = b(1) || b(3);
    if (it && !this.pad.item) this.itemQueued = true;
    this.pad.item = it;
    if (b(9) && !this.pad.start && this.onPause) this.onPause();
    this.pad.start = b(9);
  }

  read() {
    this.pollPad();
    const k = this.keys, t = this.touch, p = this.pad;
    const out = {
      up: k.up || t.up || p.up,
      down: k.down || t.down || p.down,
      left: k.left || t.left || p.left,
      right: k.right || t.right || p.right,
      drift: k.drift || t.drift || p.drift,
    };
    if (p.steer) out.steer = p.steer;
    return out;
  }

  consumeItem() {
    const q = this.itemQueued;
    this.itemQueued = false;
    return q;
  }
}
