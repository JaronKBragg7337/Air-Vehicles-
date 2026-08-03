import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { FlightInput } from "./input";

export const JET_DIMENSIONS = {
  lengthM: 15.7,
  spanM: 10.7,
  heightM: 4.4,
} as const;

export interface FlightTelemetry {
  throttle: number;
  nozzleAngleDeg: number;
  speedKnots: number;
  altitudeM: number;
  verticalSpeedMps: number;
  gLoad: number;
  vtol: boolean;
}

interface NozzleDrive {
  gear: THREE.Object3D;
  phase: number;
}

interface WingAssembly {
  group: THREE.Group;
  flap: THREE.Mesh;
  side: -1 | 1;
}

interface TailplaneAssembly {
  group: THREE.Group;
  stabilizer: THREE.Mesh;
}

interface CockpitInstruments {
  group: THREE.Group;
  throttleNeedle: THREE.Mesh;
  vectorNeedle: THREE.Mesh;
  speedNeedle: THREE.Mesh;
}

const MAT = {
  body: new THREE.MeshStandardMaterial({ color: 0x545d67, metalness: 0.78, roughness: 0.38 }),
  bodyDark: new THREE.MeshStandardMaterial({ color: 0x1d252d, metalness: 0.84, roughness: 0.33 }),
  bodyLight: new THREE.MeshStandardMaterial({ color: 0x88939d, metalness: 0.7, roughness: 0.29 }),
  panel: new THREE.MeshStandardMaterial({ color: 0x36414c, metalness: 0.72, roughness: 0.45 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x0c4a62, metalness: 0.2, roughness: 0.13, transmission: 0.15, transparent: true, opacity: 0.88 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x080a0d, metalness: 0.05, roughness: 0.78 }),
  silver: new THREE.MeshStandardMaterial({ color: 0xc4cbd0, metalness: 0.94, roughness: 0.22 }),
  titanium: new THREE.MeshStandardMaterial({ color: 0x59616b, metalness: 0.9, roughness: 0.27 }),
  hotMetal: new THREE.MeshStandardMaterial({ color: 0x8a7965, metalness: 0.92, roughness: 0.31 }),
  blue: new THREE.MeshStandardMaterial({ color: 0x125dc8, metalness: 0.62, roughness: 0.26 }),
  blueLight: new THREE.MeshStandardMaterial({ color: 0x3f8cff, metalness: 0.55, roughness: 0.21 }),
  purple: new THREE.MeshStandardMaterial({ color: 0x8c32ce, metalness: 0.68, roughness: 0.27 }),
  green: new THREE.MeshStandardMaterial({ color: 0x30be63, metalness: 0.62, roughness: 0.25 }),
  red: new THREE.MeshStandardMaterial({ color: 0xd64b48, metalness: 0.64, roughness: 0.27 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xc4842b, metalness: 0.91, roughness: 0.2 }),
  orangeGlow: new THREE.MeshBasicMaterial({ color: 0xff8a22, transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending }),
  blueGlow: new THREE.MeshBasicMaterial({ color: 0x4dcfff, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }),
};

function damp(current: number, target: number, lambda: number, dt: number): number {
  return THREE.MathUtils.damp(current, target, lambda, dt);
}

function bevelBox(width: number, height: number, depth: number, radius: number, material: THREE.Material): THREE.Mesh {
  const geometry = new RoundedBoxGeometry(width, height, depth, 3, radius);
  return new THREE.Mesh(geometry, material);
}

function cylinderZ(radiusTop: number, radiusBottom: number, length: number, material: THREE.Material, radialSegments = 32, openEnded = false): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, radialSegments, 1, openEnded);
  geometry.rotateX(Math.PI / 2);
  return new THREE.Mesh(geometry, material);
}

function rodBetween(start: THREE.Vector3, end: THREE.Vector3, radius: number, material: THREE.Material): THREE.Mesh {
  const direction = end.clone().sub(start);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 10), material);
  rod.position.copy(start).add(end).multiplyScalar(0.5);
  rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return rod;
}

function addBoltRing(parent: THREE.Object3D, radius: number, z: number, count: number): void {
  const bolts = new THREE.InstancedMesh(new THREE.SphereGeometry(0.038, 8, 6), MAT.silver, count);
  const matrix = new THREE.Matrix4();
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    matrix.makeTranslation(Math.cos(angle) * radius, Math.sin(angle) * radius, z);
    bolts.setMatrixAt(index, matrix);
  }
  bolts.instanceMatrix.needsUpdate = true;
  parent.add(bolts);
}

function addPanelSeam(parent: THREE.Object3D, points: THREE.Vector3[], color = 0x151b20): void {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.72 }));
  parent.add(line);
}

function extrudedPolygonXZ(points: Array<[number, number]>, thickness: number, material: THREE.Material): THREE.Mesh {
  const vertices: number[] = [];
  const indices: number[] = [];
  const half = thickness / 2;
  for (const y of [half, -half]) {
    for (const [x, z] of points) vertices.push(x, y, z);
  }
  const count = points.length;
  for (let index = 1; index < count - 1; index += 1) {
    indices.push(0, index + 1, index);
    indices.push(count, count + index, count + index + 1);
  }
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    indices.push(index, next, count + next, index, count + next, count + index);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

function createFuselage(): THREE.Group {
  const sections = [
    { z: -7.45, width: 0.08, height: 0.08 },
    { z: -6.55, width: 0.9, height: 0.72 },
    { z: -4.6, width: 1.65, height: 1.32 },
    { z: -1.25, width: 2.28, height: 1.9 },
    { z: 2.55, width: 2.18, height: 1.75 },
    { z: 5.05, width: 1.72, height: 1.32 },
    { z: 6.2, width: 1.2, height: 0.98 },
  ];
  const ring = (width: number, height: number): Array<[number, number]> => [
    [-width * 0.38, height * 0.5],
    [width * 0.38, height * 0.5],
    [width * 0.5, height * 0.2],
    [width * 0.48, -height * 0.33],
    [width * 0.25, -height * 0.5],
    [-width * 0.25, -height * 0.5],
    [-width * 0.48, -height * 0.33],
    [-width * 0.5, height * 0.2],
  ];
  const vertices: number[] = [];
  const indices: number[] = [];
  for (const section of sections) {
    for (const [x, y] of ring(section.width, section.height)) vertices.push(x, y, section.z);
  }
  const ringSize = 8;
  for (let sectionIndex = 0; sectionIndex < sections.length - 1; sectionIndex += 1) {
    for (let index = 0; index < ringSize; index += 1) {
      const next = (index + 1) % ringSize;
      const a = sectionIndex * ringSize + index;
      const b = sectionIndex * ringSize + next;
      const c = (sectionIndex + 1) * ringSize + next;
      const d = (sectionIndex + 1) * ringSize + index;
      indices.push(a, b, d, b, c, d);
    }
  }
  for (let index = 1; index < ringSize - 1; index += 1) {
    indices.push(0, index, index + 1);
    const offset = (sections.length - 1) * ringSize;
    indices.push(offset, offset + index + 1, offset + index);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, MAT.body);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const group = new THREE.Group();
  group.name = "airframe-fuselage";
  group.add(mesh);
  const edgeLines = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 27), new THREE.LineBasicMaterial({ color: 0x202930, transparent: true, opacity: 0.38 }));
  group.add(edgeLines);

  for (const z of [-5.6, -2.65, 0.9, 3.9]) {
    const seam = new THREE.Mesh(new THREE.TorusGeometry(1, 0.026, 6, 28), MAT.panel);
    seam.scale.set(z < -4 ? 0.5 : z < 2 ? 0.98 : 0.82, z < -4 ? 0.38 : z < 2 ? 0.72 : 0.55, 1);
    seam.position.z = z;
    seam.rotation.z = Math.PI / 4;
    group.add(seam);
  }
  return group;
}

function createWing(side: -1 | 1): WingAssembly {
  const group = new THREE.Group();
  const points: Array<[number, number]> = side === 1
    ? [[0.38, -1.8], [5.38, -0.1], [4.78, 3.1], [0.52, 3.75]]
    : [[-0.38, -1.8], [-5.38, -0.1], [-4.78, 3.1], [-0.52, 3.75]];
  const wing = extrudedPolygonXZ(points, 0.18, MAT.body);
  wing.castShadow = true;
  wing.receiveShadow = true;
  group.add(wing);

  const leading = extrudedPolygonXZ(side === 1
    ? [[0.38, -1.8], [5.38, -0.1], [5.13, 0.28], [0.48, -1.38]]
    : [[-0.38, -1.8], [-5.38, -0.1], [-5.13, 0.28], [-0.48, -1.38]], 0.19, MAT.bodyLight);
  group.add(leading);

  const flap = extrudedPolygonXZ(side === 1
    ? [[0.78, 2.95], [4.82, 2.42], [4.78, 3.1], [0.52, 3.75]]
    : [[-0.78, 2.95], [-4.82, 2.42], [-4.78, 3.1], [-0.52, 3.75]], 0.14, MAT.panel);
  flap.position.y = -0.06;
  group.add(flap);

  addPanelSeam(group, [new THREE.Vector3(side * 0.72, 0.11, -1.3), new THREE.Vector3(side * 4.82, 0.11, 0.12)]);
  addPanelSeam(group, [new THREE.Vector3(side * 0.75, 0.11, 1.0), new THREE.Vector3(side * 4.85, 0.11, 2.05)]);
  for (const x of [1.55, 2.45, 3.35]) {
    addPanelSeam(group, [new THREE.Vector3(side * x, 0.11, 0.2), new THREE.Vector3(side * (x + 0.3), 0.11, 2.8)]);
  }
  return { group, flap, side };
}

function createTailplane(side: -1 | 1): TailplaneAssembly {
  const group = new THREE.Group();
  const points: Array<[number, number]> = side === 1
    ? [[0.42, 3.55], [3.05, 4.4], [2.72, 6.05], [0.42, 5.35]]
    : [[-0.42, 3.55], [-3.05, 4.4], [-2.72, 6.05], [-0.42, 5.35]];
  const stabilizer = extrudedPolygonXZ(points, 0.14, MAT.bodyDark);
  stabilizer.castShadow = true;
  group.add(stabilizer);
  addPanelSeam(group, [new THREE.Vector3(side * 0.56, 0.09, 4.7), new THREE.Vector3(side * 2.74, 0.09, 5.54)], 0x727d86);
  return { group, stabilizer };
}

function createFin(side: -1 | 1): THREE.Group {
  const fin = new THREE.Group();
  const points: Array<[number, number]> = [[0, 3.5], [0.1, 6.0], [0.92, 5.3], [0.75, 3.9]];
  const mesh = extrudedPolygonXZ(points, 0.17, MAT.bodyDark);
  mesh.rotation.z = side * -Math.PI / 2;
  mesh.position.set(side * 0.82, 0.78, 0.15);
  mesh.castShadow = true;
  fin.add(mesh);
  const trim = bevelBox(0.08, 0.62, 1.52, 0.025, MAT.bodyLight);
  trim.position.set(side * 0.98, 1.65, 4.62);
  trim.rotation.z = side * -0.34;
  fin.add(trim);
  return fin;
}

function createIntake(side: -1 | 1): THREE.Group {
  const intake = new THREE.Group();
  const shell = bevelBox(1.05, 0.7, 2.0, 0.12, MAT.bodyDark);
  shell.position.set(side * 1.1, -0.17, -0.45);
  shell.rotation.y = side * 0.15;
  intake.add(shell);
  const mouth = bevelBox(0.73, 0.38, 0.06, 0.025, MAT.rubber);
  mouth.position.set(side * 1.26, -0.16, -1.49);
  mouth.rotation.y = side * 0.15;
  intake.add(mouth);
  const lip = bevelBox(0.86, 0.52, 0.07, 0.025, MAT.bodyLight);
  lip.position.set(side * 1.26, -0.16, -1.52);
  lip.rotation.y = side * 0.15;
  intake.add(lip);
  return intake;
}

function createCanopy(): THREE.Group {
  const canopy = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), MAT.glass);
  glass.scale.set(0.78, 0.43, 1.86);
  glass.position.set(0, 0.78, -3.6);
  canopy.add(glass);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(1, 0.028, 6, 32, Math.PI * 1.28), MAT.bodyDark);
  frame.scale.set(0.78, 0.43, 1);
  frame.rotation.x = Math.PI / 2;
  frame.position.set(0, 0.8, -3.6);
  canopy.add(frame);
  for (const z of [-4.68, -3.95, -3.17, -2.47]) {
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.019, 6, 18, Math.PI), MAT.bodyLight);
    arch.scale.set(1.45, 1, 1);
    arch.rotation.y = Math.PI / 2;
    arch.position.set(0, 0.78, z);
    canopy.add(arch);
  }
  return canopy;
}

function createCockpitInterior(): CockpitInstruments {
  const group = new THREE.Group();
  group.name = "cockpit-interior";

  const dashboard = bevelBox(1.72, 0.28, 0.36, 0.05, MAT.bodyDark);
  dashboard.position.set(0, 0.55, -4.9);
  dashboard.rotation.x = -0.12;
  group.add(dashboard);

  const glareShield = bevelBox(1.45, 0.08, 0.22, 0.03, MAT.rubber);
  glareShield.position.set(0, 0.88, -4.86);
  group.add(glareShield);

  const addGauge = (x: number, color: THREE.ColorRepresentation): THREE.Mesh => {
    const gauge = new THREE.Group();
    gauge.position.set(x, 0.72, -4.73);
    const dial = new THREE.Mesh(new THREE.CircleGeometry(0.17, 24), MAT.panel);
    const bezel = new THREE.Mesh(new THREE.RingGeometry(0.175, 0.205, 24), MAT.silver);
    bezel.position.z = 0.005;
    const needle = new THREE.Mesh(
      new THREE.BoxGeometry(0.018, 0.13, 0.018),
      new THREE.MeshBasicMaterial({ color }),
    );
    needle.position.set(0, 0.045, 0.02);
    needle.rotation.z = -0.78;
    gauge.add(dial, bezel, needle);
    group.add(gauge);
    return needle;
  };

  const throttleNeedle = addGauge(-0.48, 0x65c7ff);
  const vectorNeedle = addGauge(0, 0xffbd67);
  const speedNeedle = addGauge(0.48, 0x70edb0);

  const stick = rodBetween(new THREE.Vector3(0, 0.25, -3.58), new THREE.Vector3(0, 0.53, -3.72), 0.035, MAT.bodyLight);
  group.add(stick);
  return { group, throttleNeedle, vectorNeedle, speedNeedle };
}

function createLandingGear(): THREE.Group {
  const gear = new THREE.Group();
  const makeWheel = (x: number, y: number, z: number, radius: number): void => {
    const strut = rodBetween(new THREE.Vector3(x * 0.72, y + 0.72, z + 0.1), new THREE.Vector3(x, y + 0.1, z), 0.07, MAT.silver);
    gear.add(strut);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.45, radius * 0.45, 0.18, 16), MAT.silver);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(x, y, z);
    gear.add(hub);
    const tire = new THREE.Mesh(new THREE.TorusGeometry(radius, radius * 0.24, 10, 20), MAT.rubber);
    tire.rotation.y = Math.PI / 2;
    tire.position.set(x, y, z);
    gear.add(tire);
  };
  makeWheel(-0.83, -1.2, 1.85, 0.32);
  makeWheel(0.83, -1.2, 1.85, 0.32);
  makeWheel(0, -1.08, -4.95, 0.24);
  return gear;
}

function createTurbine(): THREE.Group {
  const turbine = new THREE.Group();
  const hub = cylinderZ(0.24, 0.24, 0.18, MAT.gold, 24);
  turbine.add(hub);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.08, 8, 36), MAT.hotMetal);
  turbine.add(ring);
  for (let index = 0; index < 20; index += 1) {
    const angle = (index / 20) * Math.PI * 2;
    const blade = bevelBox(0.08, 0.42, 0.36, 0.025, MAT.gold);
    blade.position.set(Math.cos(angle) * 0.56, Math.sin(angle) * 0.56, 0.02);
    blade.rotation.z = angle + Math.PI / 2;
    blade.rotation.y = 0.3;
    turbine.add(blade);
  }
  return turbine;
}

function createDuctSegment(radiusStart: number, radiusEnd: number, length: number, material: THREE.Material, name: string): THREE.Group {
  const segment = new THREE.Group();
  segment.name = name;
  const shell = cylinderZ(radiusStart, radiusEnd, length, material, 40, true);
  shell.castShadow = true;
  segment.add(shell);
  const interior = cylinderZ(radiusStart * 0.83, radiusEnd * 0.83, length * 0.98, MAT.rubber, 36, true);
  interior.material = new THREE.MeshStandardMaterial({ color: 0x101318, metalness: 0.4, roughness: 0.68, side: THREE.BackSide });
  segment.add(interior);
  for (const z of [-length * 0.44, length * 0.44]) {
    const seam = new THREE.Mesh(new THREE.TorusGeometry(Math.max(radiusStart, radiusEnd) * 0.98, 0.035, 8, 40), MAT.titanium);
    seam.position.z = z;
    segment.add(seam);
    addBoltRing(segment, Math.max(radiusStart, radiusEnd) * 1.02, z, 24);
  }
  return segment;
}

function createGearRing(radius: number, toothColor: THREE.Material): THREE.Group {
  const gear = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.075, 8, 48), MAT.bodyDark);
  gear.add(ring);
  const toothGeometry = new RoundedBoxGeometry(0.105, 0.16, 0.14, 2, 0.018);
  const count = 36;
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    const tooth = new THREE.Mesh(toothGeometry, toothColor);
    tooth.position.set(Math.cos(angle) * (radius + 0.05), Math.sin(angle) * (radius + 0.05), 0);
    tooth.rotation.z = angle;
    gear.add(tooth);
  }
  return gear;
}

function createActuator(radius: number, angle: number, z: number): { group: THREE.Group; drive: THREE.Object3D } {
  const group = new THREE.Group();
  const radial = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
  const tangent = new THREE.Vector3(-Math.sin(angle), Math.cos(angle), 0);
  const gear = new THREE.Group();
  const gearDisc = cylinderZ(0.2, 0.2, 0.17, MAT.blueLight, 16);
  gear.add(gearDisc);
  for (let index = 0; index < 12; index += 1) {
    const toothAngle = (index / 12) * Math.PI * 2;
    const tooth = bevelBox(0.055, 0.09, 0.18, 0.012, MAT.blue);
    tooth.position.set(Math.cos(toothAngle) * 0.22, Math.sin(toothAngle) * 0.22, 0);
    tooth.rotation.z = toothAngle;
    gear.add(tooth);
  }
  gear.position.copy(radial).multiplyScalar(radius + 0.12);
  gear.position.z = z;
  group.add(gear);

  const mount = bevelBox(0.42, 0.28, 0.52, 0.05, MAT.bodyDark);
  mount.position.copy(radial).multiplyScalar(radius + 0.48);
  mount.position.z = z + 0.04;
  mount.rotation.z = angle;
  group.add(mount);

  const motor = bevelBox(0.28, 0.3, 0.34, 0.045, MAT.blue);
  motor.position.copy(radial).multiplyScalar(radius + 0.54).addScaledVector(tangent, 0.08);
  motor.position.z = z + 0.03;
  motor.rotation.z = angle;
  group.add(motor);

  const indicator = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.11, 10), new THREE.MeshStandardMaterial({ color: 0xe44942, metalness: 0.5, roughness: 0.32 }));
  indicator.rotation.x = Math.PI / 2;
  indicator.position.copy(radial).multiplyScalar(radius + 0.64).addScaledVector(tangent, 0.08);
  indicator.position.z = z + 0.27;
  group.add(indicator);

  const gearPosition = gear.position.clone();
  const motorPosition = motor.position.clone();
  group.add(rodBetween(gearPosition, motorPosition, 0.045, MAT.silver));
  const conduitEnd = motorPosition.clone().addScaledVector(tangent, 0.16).add(new THREE.Vector3(0, 0, 0.42));
  group.add(rodBetween(motorPosition.clone().add(new THREE.Vector3(0, 0, 0.12)), conduitEnd, 0.022, MAT.silver));
  return { group, drive: gear };
}

class ThreeBearingNozzle {
  readonly group = new THREE.Group();
  private readonly pivotA = new THREE.Group();
  private readonly pivotB = new THREE.Group();
  private readonly pivotC = new THREE.Group();
  private readonly drives: NozzleDrive[] = [];
  private readonly turbine = createTurbine();
  private readonly flame = new THREE.Group();
  private gearMotion = 0;

  constructor() {
    this.group.name = "three-bearing-swivel-nozzle";
    const engineCase = cylinderZ(1.25, 1.08, 1.18, MAT.titanium, 40, true);
    engineCase.position.z = -0.6;
    this.group.add(engineCase);
    const engineBand = new THREE.Mesh(new THREE.TorusGeometry(1.23, 0.07, 8, 42), MAT.silver);
    engineBand.position.z = -1.02;
    this.group.add(engineBand);
    addBoltRing(this.group, 1.26, -1.02, 30);

    this.turbine.position.z = -0.18;
    this.group.add(this.turbine);

    const collar = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.13, 10, 42), MAT.hotMetal);
    collar.position.z = 0.04;
    this.group.add(collar);
    this.group.add(this.pivotA);

    const purple = createDuctSegment(1.09, 1.08, 0.62, MAT.purple, "bearing-a-purple");
    purple.position.z = 0.33;
    this.pivotA.add(purple);
    const gearA = createGearRing(1.2, MAT.purple);
    gearA.position.z = 0.02;
    this.pivotA.add(gearA);
    this.drives.push({ gear: gearA, phase: 1 });
    for (const angle of [Math.PI / 2, -Math.PI / 2]) {
      const actuator = createActuator(1.2, angle, 0.02);
      this.pivotA.add(actuator.group);
      this.drives.push({ gear: actuator.drive, phase: -2.8 });
    }

    this.pivotB.position.z = 0.65;
    this.pivotA.add(this.pivotB);
    const green = createDuctSegment(1.08, 1.12, 0.78, MAT.green, "bearing-b-green");
    green.position.z = 0.4;
    this.pivotB.add(green);
    const gearB = createGearRing(1.24, MAT.green);
    gearB.position.z = 0.04;
    this.pivotB.add(gearB);
    this.drives.push({ gear: gearB, phase: -1.2 });
    for (const angle of [Math.PI * 0.1, Math.PI * 0.9]) {
      const actuator = createActuator(1.24, angle, 0.04);
      this.pivotB.add(actuator.group);
      this.drives.push({ gear: actuator.drive, phase: 2.3 });
    }

    this.pivotC.position.z = 0.82;
    this.pivotB.add(this.pivotC);
    const blue = createDuctSegment(1.12, 1.02, 1.22, MAT.blue, "bearing-c-blue");
    blue.position.z = 0.62;
    this.pivotC.add(blue);
    const gearC = createGearRing(1.21, MAT.blueLight);
    gearC.position.z = 0.04;
    this.pivotC.add(gearC);
    this.drives.push({ gear: gearC, phase: 1.5 });
    for (const angle of [Math.PI * 0.5, Math.PI * 1.5]) {
      const actuator = createActuator(1.21, angle, 0.04);
      this.pivotC.add(actuator.group);
      this.drives.push({ gear: actuator.drive, phase: -2.1 });
    }

    const redSection = new THREE.Group();
    redSection.position.z = 1.26;
    this.pivotC.add(redSection);
    const red = createDuctSegment(1.02, 0.82, 0.88, MAT.red, "nozzle-red-exit");
    red.position.z = 0.44;
    redSection.add(red);
    const petalBand = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.08, 8, 38), MAT.hotMetal);
    petalBand.position.z = 0.84;
    redSection.add(petalBand);
    this.addPetals(redSection);
    this.addFlame(redSection);
  }

  private addPetals(parent: THREE.Object3D): void {
    const petalGeometry = new RoundedBoxGeometry(0.16, 0.18, 0.58, 2, 0.03);
    for (let index = 0; index < 15; index += 1) {
      const angle = (index / 15) * Math.PI * 2;
      const petal = new THREE.Mesh(petalGeometry, index % 3 === 0 ? MAT.bodyLight : MAT.titanium);
      petal.position.set(Math.cos(angle) * 0.87, Math.sin(angle) * 0.87, 1.08);
      petal.rotation.z = angle;
      petal.rotation.y = -0.13;
      parent.add(petal);
    }
    addBoltRing(parent, 0.91, 0.81, 30);
  }

  private addFlame(parent: THREE.Object3D): void {
    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.67, 2.45, 24, 1, true), MAT.orangeGlow);
    outer.rotation.x = Math.PI / 2;
    outer.position.z = 2.14;
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.75, 18, 1, true), MAT.blueGlow);
    core.rotation.x = Math.PI / 2;
    core.position.z = 1.83;
    this.flame.add(outer, core);
    parent.add(this.flame);
  }

  setVectorAngle(angle: number): void {
    this.pivotA.rotation.x = angle * 0.2;
    this.pivotB.rotation.x = angle * 0.3;
    this.pivotC.rotation.x = angle * 0.5;
    this.gearMotion = angle;
    this.drives.forEach(({ gear, phase }, index) => {
      gear.rotation.z = this.gearMotion * phase + index * 0.18;
    });
  }

  update(dt: number, throttle: number, boost = false): void {
    this.turbine.rotation.z += dt * (4 + throttle * 48);
    const pulse = 0.94 + Math.sin(performance.now() * 0.016) * 0.035;
    const scale = (0.18 + throttle * (boost ? 1.12 : 0.92)) * pulse;
    this.flame.scale.set(scale, scale, Math.max(0.12, throttle * (boost ? 1.4 : 1.08)));
    this.flame.visible = throttle > 0.05;
  }
}

export class JetRig {
  readonly group = new THREE.Group();
  readonly velocity = new THREE.Vector3();
  readonly nozzle = new ThreeBearingNozzle();
  private readonly landingGear = createLandingGear();
  private readonly canopy = createCanopy();
  private readonly cockpit = createCockpitInterior();
  private readonly ailerons: WingAssembly[] = [];
  private readonly elevators: TailplaneAssembly[] = [];
  private readonly forwardAxis = new THREE.Vector3();
  private readonly upAxis = new THREE.Vector3();
  private readonly rightAxis = new THREE.Vector3();
  private readonly thrustAxis = new THREE.Vector3();
  private readonly inverseOrientation = new THREE.Quaternion();
  private readonly localVelocity = new THREE.Vector3();
  private throttle = 0.38;
  private throttleTarget = 0.38;
  private nozzleAngle = 0;
  private nozzleTarget = 0;
  private yaw = 0;
  private pitch = 0;
  private roll = 0;
  private yawRate = 0;
  private pitchRate = 0;
  private rollRate = 0;
  private verticalSpeed = 0;
  private gLoad = 1;
  private isVtol = false;

  constructor() {
    this.group.name = "vector-35-aircraft";
    this.group.position.set(0, 10, 14);
    this.group.add(createFuselage());
    const rightWing = createWing(1);
    const leftWing = createWing(-1);
    this.ailerons.push(rightWing, leftWing);
    this.group.add(rightWing.group, leftWing.group);
    const rightTailplane = createTailplane(1);
    const leftTailplane = createTailplane(-1);
    this.elevators.push(rightTailplane, leftTailplane);
    this.group.add(rightTailplane.group, leftTailplane.group);
    this.group.add(createFin(1), createFin(-1));
    this.group.add(createIntake(1), createIntake(-1));
    this.group.add(this.canopy);
    this.group.add(this.cockpit.group);

    const spine = bevelBox(0.42, 0.18, 5.1, 0.05, MAT.panel);
    spine.position.set(0, 1.0, 1.1);
    this.group.add(spine);
    for (const z of [-1.7, -0.65, 0.4, 1.45, 2.5]) {
      const panel = bevelBox(1.2, 0.025, 0.38, 0.01, MAT.bodyLight);
      panel.position.set(0, 0.97, z);
      this.group.add(panel);
    }

    this.nozzle.group.position.set(0, -0.08, 5.72);
    this.group.add(this.nozzle.group);
    this.landingGear.visible = false;
    this.group.add(this.landingGear);
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    this.applyOrientation();
  }

  get telemetry(): FlightTelemetry {
    return {
      throttle: this.throttle,
      nozzleAngleDeg: THREE.MathUtils.radToDeg(this.nozzleAngle),
      speedKnots: this.velocity.length() * 1.94384,
      altitudeM: Math.max(0, this.group.position.y - 1.62),
      verticalSpeedMps: this.verticalSpeed,
      gLoad: this.gLoad,
      vtol: this.isVtol,
    };
  }

  get orientation(): { yaw: number; pitch: number; roll: number } {
    return { yaw: this.yaw, pitch: this.pitch, roll: this.roll };
  }

  getCockpitPosition(target: THREE.Vector3): THREE.Vector3 {
    return target.set(0, 0.94, -3.58).applyQuaternion(this.group.quaternion).add(this.group.position);
  }

  setCockpitView(active: boolean): void {
    this.canopy.visible = !active;
  }

  toggleVtol(): void {
    this.isVtol = !this.isVtol;
    this.nozzleTarget = this.isVtol ? Math.PI / 2 : 0;
  }

  reset(): void {
    this.group.position.set(0, 10, 14);
    this.velocity.set(0, 0, 0);
    this.throttle = 0.38;
    this.throttleTarget = 0.38;
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.yawRate = 0;
    this.pitchRate = 0;
    this.rollRate = 0;
    this.verticalSpeed = 0;
    this.gLoad = 1;
    this.isVtol = false;
    this.nozzleTarget = 0;
    this.nozzleAngle = 0;
    this.ailerons.forEach(({ flap }) => { flap.rotation.x = 0; });
    this.elevators.forEach(({ stabilizer }) => { stabilizer.rotation.x = 0; });
    this.cockpit.throttleNeedle.rotation.z = -0.78;
    this.cockpit.vectorNeedle.rotation.z = -0.78;
    this.cockpit.speedNeedle.rotation.z = -0.78;
    this.applyOrientation();
  }

  update(dt: number, input: FlightInput): void {
    this.throttleTarget = THREE.MathUtils.clamp(this.throttleTarget + input.throttleRate * dt * 0.36, 0, 1);
    this.throttle = damp(this.throttle, this.throttleTarget, 1.9, dt);

    const forwardBeforeTurn = this.forwardAxis.set(0, 0, -1).applyQuaternion(this.group.quaternion).normalize();
    const forwardSpeedBeforeTurn = Math.max(0, this.velocity.dot(forwardBeforeTurn));
    const speedAuthority = THREE.MathUtils.smoothstep(forwardSpeedBeforeTurn, 4, 46);
    const hoverAuthority = this.isVtol ? 1 : 0.22 + speedAuthority * 0.78;
    this.yawRate = damp(this.yawRate, input.yaw * 0.98 * hoverAuthority, 5.2, dt);
    this.pitchRate = damp(this.pitchRate, input.pitch * 0.82 * hoverAuthority, 5.5, dt);
    this.rollRate = damp(this.rollRate, input.roll * 1.18 * hoverAuthority, 5.8, dt);
    this.yaw -= this.yawRate * dt;
    this.pitch = THREE.MathUtils.clamp(this.pitch + this.pitchRate * dt, -1.02, 0.72);
    this.roll = THREE.MathUtils.clamp(this.roll - this.rollRate * dt, -1.18, 1.18);
    if (Math.abs(input.roll) < 0.03) this.roll = damp(this.roll, 0, 0.45 + speedAuthority * 0.65, dt);
    if (Math.abs(input.pitch) < 0.03) this.pitch = damp(this.pitch, 0, 0.08 + speedAuthority * 0.12, dt);
    this.applyOrientation();
    this.updateControlSurfaces(dt, input);

    this.nozzleAngle = damp(this.nozzleAngle, this.nozzleTarget, 2.2, dt);
    this.nozzle.setVectorAngle(this.nozzleAngle);
    this.nozzle.update(dt, this.throttle, input.boost);
    this.landingGear.visible = this.isVtol || this.group.position.y < 3.2;

    const forward = this.forwardAxis.set(0, 0, -1).applyQuaternion(this.group.quaternion).normalize();
    const up = this.upAxis.set(0, 1, 0).applyQuaternion(this.group.quaternion).normalize();
    const right = this.rightAxis.set(1, 0, 0).applyQuaternion(this.group.quaternion).normalize();
    const thrustDirection = this.thrustAxis.copy(forward)
      .multiplyScalar(Math.cos(this.nozzleAngle))
      .addScaledVector(up, Math.sin(this.nozzleAngle))
      .normalize();
    const engineAcceleration = (31 + (input.boost ? 12 : 0)) * this.throttle;
    this.velocity.addScaledVector(thrustDirection, engineAcceleration * dt);

    const forwardSpeed = Math.max(0, this.velocity.dot(forward));
    let lift = 0;
    if (forwardSpeed > 6 && this.nozzleAngle < 1.1) {
      lift = Math.min(20, forwardSpeed * forwardSpeed * 0.0063) * Math.cos(this.nozzleAngle);
      this.velocity.addScaledVector(up, lift * dt);
    }

    this.localVelocity.copy(this.velocity).applyQuaternion(this.inverseOrientation.copy(this.group.quaternion).invert());
    const sideSlip = this.localVelocity.x;
    this.velocity.addScaledVector(right, -sideSlip * (0.55 + speedAuthority * 2.6) * dt);
    this.velocity.y -= 9.81 * dt;
    const airspeed = this.velocity.length();
    const drag = 0.0045 + airspeed * 0.00165 + lift * 0.00075 + (this.nozzleAngle > 0.5 ? 0.018 : 0);
    this.velocity.multiplyScalar(Math.exp(-drag * dt));
    this.group.position.addScaledVector(this.velocity, dt);

    const groundLevel = 1.62;
    let onGround = false;
    if (this.group.position.y < groundLevel) {
      onGround = true;
      this.group.position.y = groundLevel;
      if (this.velocity.y < 0) this.velocity.y = 0;
      const groundFriction = this.isVtol ? 0.7 : 1.65;
      this.velocity.x *= Math.exp(-groundFriction * dt);
      this.velocity.z *= Math.exp(-groundFriction * dt);
    }
    this.verticalSpeed = this.velocity.y;
    this.gLoad = THREE.MathUtils.clamp((lift + engineAcceleration * Math.sin(this.nozzleAngle)) / 9.81, 0, 5.5);
    if (onGround) this.gLoad = Math.max(1, this.gLoad);
    this.updateCockpitInstruments(airspeed * 1.94384, dt);
  }

  private updateControlSurfaces(dt: number, input: FlightInput): void {
    this.ailerons.forEach(({ flap, side }) => {
      const deflection = input.pitch * 0.11 + input.roll * side * 0.25;
      flap.rotation.x = damp(flap.rotation.x, deflection, 8, dt);
    });
    this.elevators.forEach(({ stabilizer }) => {
      stabilizer.rotation.x = damp(stabilizer.rotation.x, input.pitch * 0.18, 8, dt);
    });
  }

  private updateCockpitInstruments(speedKnots: number, dt: number): void {
    this.cockpit.throttleNeedle.rotation.z = damp(this.cockpit.throttleNeedle.rotation.z, -0.78 + this.throttle * 1.56, 8, dt);
    this.cockpit.vectorNeedle.rotation.z = damp(this.cockpit.vectorNeedle.rotation.z, -0.78 + (this.nozzleAngle / (Math.PI / 2)) * 1.56, 8, dt);
    this.cockpit.speedNeedle.rotation.z = damp(this.cockpit.speedNeedle.rotation.z, -0.78 + THREE.MathUtils.clamp(speedKnots / 240, 0, 1) * 1.56, 5, dt);
  }

  private applyOrientation(): void {
    this.group.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, this.roll, "YXZ"));
  }
}
