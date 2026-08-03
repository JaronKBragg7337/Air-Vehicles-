export interface FlightInput {
  throttleRate: number;
  yaw: number;
  pitch: number;
  roll: number;
  boost: boolean;
}

export interface InputEvents {
  toggleVtol: boolean;
  toggleCamera: boolean;
  toggleInspection: boolean;
  reset: boolean;
}

type StickName = "throttle" | "attitude";

interface StickState {
  x: number;
  y: number;
  pointerId: number | null;
  base: HTMLElement;
  knob: HTMLElement;
}

const CONTROL_KEYS = new Set([
  "KeyW", "KeyS", "KeyA", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight", "KeyV", "KeyC", "KeyI", "KeyR",
]);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function applyDeadzone(value: number, threshold = 0.12): number {
  const magnitude = Math.abs(value);
  if (magnitude <= threshold) return 0;
  return Math.sign(value) * (magnitude - threshold) / (1 - threshold);
}

export class InputController {
  private readonly keys = new Set<string>();
  private readonly sticks: Record<StickName, StickState>;
  private readonly pointerOwners = new Map<number, "look" | StickName>();
  private lookDelta = { x: 0, y: 0 };
  private previousLookPoint = new Map<number, { x: number; y: number }>();
  private queued: InputEvents = { toggleVtol: false, toggleCamera: false, toggleInspection: false, reset: false };

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.sticks = {
      throttle: this.createStick("throttle-stick"),
      attitude: this.createStick("attitude-stick"),
    };
    this.attachKeyboard();
    this.attachLookControl();
    this.attachMobileActions();
    window.addEventListener("blur", () => this.reset());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.reset();
    });
    window.addEventListener("orientationchange", () => this.reset());
  }

  private createStick(id: string): StickState {
    const container = document.getElementById(id);
    const base = container?.querySelector<HTMLElement>(".stick-base");
    const knob = container?.querySelector<HTMLElement>(".stick-knob");
    if (!container || !base || !knob) throw new Error(`Missing mobile control: ${id}`);
    const state: StickState = { x: 0, y: 0, pointerId: null, base, knob };
    const name = id.startsWith("throttle") ? "throttle" : "attitude";

    container.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (state.pointerId !== null) return;
      state.pointerId = event.pointerId;
      this.pointerOwners.set(event.pointerId, name);
      container.setPointerCapture(event.pointerId);
      this.updateStick(state, event.clientX, event.clientY);
    });
    container.addEventListener("pointermove", (event) => {
      if (state.pointerId === event.pointerId) this.updateStick(state, event.clientX, event.clientY);
    });
    const release = (event: PointerEvent) => {
      if (state.pointerId !== event.pointerId) return;
      state.pointerId = null;
      state.x = 0;
      state.y = 0;
      state.knob.style.transform = "translate(-50%, -50%)";
      this.pointerOwners.delete(event.pointerId);
    };
    container.addEventListener("pointerup", release);
    container.addEventListener("pointercancel", release);
    return state;
  }

  private updateStick(state: StickState, x: number, y: number): void {
    const rect = state.base.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const max = rect.width * 0.34;
    const dx = x - centerX;
    const dy = y - centerY;
    const magnitude = Math.hypot(dx, dy);
    const factor = magnitude > max ? max / magnitude : 1;
    const clampedX = dx * factor;
    const clampedY = dy * factor;
    state.x = clamp(clampedX / max, -1, 1);
    state.y = clamp(clampedY / max, -1, 1);
    state.knob.style.transform = `translate(calc(-50% + ${clampedX}px), calc(-50% + ${clampedY}px))`;
  }

  private attachKeyboard(): void {
    window.addEventListener("keydown", (event) => {
      if (CONTROL_KEYS.has(event.code)) event.preventDefault();
      if (event.repeat) {
        this.keys.add(event.code);
        return;
      }
      this.keys.add(event.code);
      if (event.code === "KeyV") this.queued.toggleVtol = true;
      if (event.code === "KeyC") this.queued.toggleCamera = true;
      if (event.code === "KeyI") this.queued.toggleInspection = true;
      if (event.code === "KeyR") this.queued.reset = true;
    });
    window.addEventListener("keyup", (event) => {
      if (CONTROL_KEYS.has(event.code)) event.preventDefault();
      this.keys.delete(event.code);
    });
  }

  private attachLookControl(): void {
    this.canvas.addEventListener("pointerdown", (event) => {
      if (this.pointerOwners.has(event.pointerId)) return;
      this.pointerOwners.set(event.pointerId, "look");
      this.previousLookPoint.set(event.pointerId, { x: event.clientX, y: event.clientY });
      this.canvas.setPointerCapture(event.pointerId);
    });
    this.canvas.addEventListener("pointermove", (event) => {
      if (this.pointerOwners.get(event.pointerId) !== "look") return;
      const previous = this.previousLookPoint.get(event.pointerId);
      if (!previous) return;
      this.lookDelta.x += event.clientX - previous.x;
      this.lookDelta.y += event.clientY - previous.y;
      this.previousLookPoint.set(event.pointerId, { x: event.clientX, y: event.clientY });
    });
    const releaseLook = (event: PointerEvent) => {
      if (this.pointerOwners.get(event.pointerId) === "look") {
        this.pointerOwners.delete(event.pointerId);
        this.previousLookPoint.delete(event.pointerId);
      }
    };
    this.canvas.addEventListener("pointerup", releaseLook);
    this.canvas.addEventListener("pointercancel", releaseLook);
  }

  private attachMobileActions(): void {
    document.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => {
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const action = button.dataset.action;
        if (action === "toggle-vtol") this.queued.toggleVtol = true;
        if (action === "camera") this.queued.toggleCamera = true;
        if (action === "reset") this.queued.reset = true;
      });
    });
  }

  read(): FlightInput {
    const key = (positive: string, negative: string): number => Number(this.keys.has(positive)) - Number(this.keys.has(negative));
    const throttleRate = key("KeyW", "KeyS") + -applyDeadzone(this.sticks.throttle.y);
    const yaw = key("KeyD", "KeyA") + applyDeadzone(this.sticks.throttle.x);
    const pitch = key("ArrowUp", "ArrowDown") + -applyDeadzone(this.sticks.attitude.y);
    const roll = key("ArrowRight", "ArrowLeft") + applyDeadzone(this.sticks.attitude.x);
    return {
      throttleRate: clamp(throttleRate, -1, 1),
      yaw: clamp(yaw, -1, 1),
      pitch: clamp(pitch, -1, 1),
      roll: clamp(roll, -1, 1),
      boost: this.keys.has("ShiftLeft") || this.keys.has("ShiftRight"),
    };
  }

  consumeEvents(): InputEvents {
    const events = { ...this.queued };
    this.queued = { toggleVtol: false, toggleCamera: false, toggleInspection: false, reset: false };
    return events;
  }

  consumeLook(): { x: number; y: number } {
    const value = { ...this.lookDelta };
    this.lookDelta = { x: 0, y: 0 };
    return value;
  }

  reset(): void {
    this.keys.clear();
    this.pointerOwners.clear();
    this.previousLookPoint.clear();
    (Object.keys(this.sticks) as StickName[]).forEach((name) => {
      const stick = this.sticks[name];
      stick.pointerId = null;
      stick.x = 0;
      stick.y = 0;
      stick.knob.style.transform = "translate(-50%, -50%)";
    });
  }
}
