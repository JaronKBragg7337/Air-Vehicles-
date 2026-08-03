import * as THREE from "three";
import "./styles.css";
import { EnvironmentRig } from "./environment";
import { InputController } from "./input";
import { JetRig } from "./jet";
import { SceneRegistry } from "./sceneReport";

declare global {
  interface Window {
    __VECTOR35__?: {
      scene: THREE.Scene;
      renderer: THREE.WebGLRenderer;
      camera: THREE.PerspectiveCamera;
      jet: JetRig;
      sceneReport: () => ReturnType<SceneRegistry["report"]>;
      reportText: () => string;
      step: (dt?: number) => void;
    };
  }
}

const canvas = document.querySelector<HTMLCanvasElement>("#flight-canvas");
if (!canvas) throw new Error("Missing #flight-canvas");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 720 ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xb6d8eb, 0.00145);
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 1800);
const environment = new EnvironmentRig();
const jet = new JetRig();
scene.add(environment.group, jet.group);

const registry = new SceneRegistry();
registry.register({ id: "ENV-TEST-RANGE-001", role: "environment", object: environment.group });
registry.register({ id: "AST-VECTOR35-001", role: "aircraft", object: jet.group, flags: { dynamic: true } });
registry.register({ id: "MECH-3BSD-001", role: "mechanism", object: jet.nozzle.group, flags: { dynamic: true } });
registry.register({ id: "LGT-TRACKED-SUN-001", role: "light", object: environment.sun, flags: { dynamic: true } });
registry.snapshot();

const input = new InputController(canvas);
const hud = {
  mode: requireElement("hud-mode"),
  vector: requireElement("hud-vector"),
  throttle: requireElement("hud-throttle"),
  speed: requireElement("hud-speed"),
  altitude: requireElement("hud-altitude"),
  mechanism: requireElement("hud-mechanism"),
  debugPanel: requireElement("debug-panel"),
  debugOutput: requireElement("debug-output"),
  inspectionButton: requireElement("inspection-button"),
};

let cameraMode = 0;
let orbitYaw = 0;
let orbitPitch = 0.17;
const cameraTarget = new THREE.Vector3();
const desiredCameraPosition = new THREE.Vector3();
const desiredLookTarget = new THREE.Vector3();
const lookQuaternion = new THREE.Quaternion();
const lookOffset = new THREE.Vector3();
const clock = new THREE.Clock();
let latestReport = registry.report();
let nextReportRefresh = performance.now() + 750;

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id) as T | null;
  if (!element) throw new Error(`Missing #${id}`);
  return element;
}

function updateHud(): void {
  const telemetry = jet.telemetry;
  const report = refreshReport(!hud.debugPanel.hidden);
  hud.mode.textContent = telemetry.vtol ? "HOVER" : "FORWARD";
  hud.vector.textContent = `${Math.round(telemetry.nozzleAngleDeg)}°`;
  hud.throttle.textContent = `${Math.round(telemetry.throttle * 100)}%`;
  hud.speed.textContent = `${Math.round(telemetry.speedKnots)} KT`;
  hud.altitude.textContent = `${Math.round(telemetry.altitudeM)} M`;
  hud.mechanism.textContent = telemetry.nozzleAngleDeg < 3
    ? "3 bearing rings synchronized · nozzle locked aft"
    : telemetry.nozzleAngleDeg > 82
      ? "All drive rings engaged · full hover vector"
      : "Bearing rings sequencing · external gear drives rotating";
  hud.inspectionButton.innerHTML = `INSPECT <span>${report.counts.issues}</span>`;
  if (!hud.debugPanel.hidden) hud.debugOutput.textContent = registry.reportText();
}

function toggleInspection(): void {
  hud.debugPanel.hidden = !hud.debugPanel.hidden;
  hud.inspectionButton.classList.toggle("active", !hud.debugPanel.hidden);
  refreshReport(true);
  hud.debugOutput.textContent = registry.reportText();
}

function refreshReport(force = false): ReturnType<SceneRegistry["report"]> {
  if (force || performance.now() >= nextReportRefresh) {
    latestReport = registry.report();
    nextReportRefresh = performance.now() + (hud.debugPanel.hidden ? 750 : 250);
  }
  return latestReport;
}

function updateCamera(dt: number): void {
  const look = input.consumeLook();
  orbitYaw -= look.x * (window.innerWidth < 720 ? 0.0052 : 0.0024);
  orbitPitch = THREE.MathUtils.clamp(orbitPitch - look.y * (window.innerWidth < 720 ? 0.0052 : 0.0024), -0.42, 0.72);

  const state = jet.orientation;
  const yawOnly = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, state.yaw, 0, "YXZ"));
  const target = jet.group.position;
  if (cameraMode === 0) {
    lookQuaternion.setFromEuler(new THREE.Euler(orbitPitch, orbitYaw, 0, "YXZ"));
    lookOffset.set(0, 3.1, 11.6).applyQuaternion(lookQuaternion).applyQuaternion(yawOnly);
    desiredCameraPosition.copy(target).add(lookOffset);
    desiredLookTarget.copy(target).add(new THREE.Vector3(0, 0.3, -4.2).applyQuaternion(yawOnly));
    camera.fov = dampNumber(camera.fov, 72 + Math.min(9, jet.velocity.length() * 0.15), 6, dt);
  } else if (cameraMode === 1) {
    desiredCameraPosition.copy(new THREE.Vector3(0, 0.98, -3.85).applyQuaternion(jet.group.quaternion).add(target));
    desiredLookTarget.copy(new THREE.Vector3(0, 0.55, -25).applyQuaternion(jet.group.quaternion).add(target));
    camera.fov = dampNumber(camera.fov, 82, 6, dt);
  } else {
    const inspectionAngle = performance.now() * 0.00011;
    desiredCameraPosition.set(Math.sin(inspectionAngle) * 14, 6.4, Math.cos(inspectionAngle) * 14).add(target);
    desiredLookTarget.copy(target).add(new THREE.Vector3(0, -0.15, 2.2).applyQuaternion(yawOnly));
    camera.fov = dampNumber(camera.fov, 62, 6, dt);
  }
  cameraTarget.lerp(desiredLookTarget, 1 - Math.exp(-10 * dt));
  camera.position.lerp(desiredCameraPosition, 1 - Math.exp(-5.5 * dt));
  camera.fov = Math.min(90, Math.max(55, camera.fov));
  camera.updateProjectionMatrix();
  camera.lookAt(cameraTarget);
}

function dampNumber(current: number, target: number, lambda: number, dt: number): number {
  return THREE.MathUtils.damp(current, target, lambda, dt);
}

function step(dt: number): void {
  const events = input.consumeEvents();
  if (events.toggleVtol) jet.toggleVtol();
  if (events.toggleCamera) cameraMode = (cameraMode + 1) % 3;
  if (events.toggleInspection) toggleInspection();
  if (events.reset) jet.reset();
  jet.update(dt, input.read());
  environment.updateFollow(jet.group.position);
  updateCamera(dt);
  updateHud();
  renderer.render(scene, camera);
}

function renderFrame(): void {
  const dt = Math.min(clock.getDelta(), 0.05);
  step(dt);
  requestAnimationFrame(renderFrame);
}

window.addEventListener("resize", () => {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 720 ? 1.5 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

requireElement<HTMLButtonElement>("inspection-button").addEventListener("click", toggleInspection);
requireElement<HTMLButtonElement>("debug-close").addEventListener("click", toggleInspection);
requireElement<HTMLButtonElement>("fullscreen-button").addEventListener("click", () => {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen();
});
requireElement<HTMLButtonElement>("start-button").addEventListener("click", () => {
  requireElement("start-screen").classList.add("dismissed");
});

if (import.meta.env.DEV) {
  window.__VECTOR35__ = {
    scene,
    renderer,
    camera,
    jet,
    sceneReport: () => registry.report(),
    reportText: () => registry.reportText(),
    step: (dt = 1 / 60) => step(dt),
  };
}

document.body.dataset.ready = "true";
updateHud();
renderFrame();
