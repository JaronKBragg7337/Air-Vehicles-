import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";

const deckMaterial = new THREE.MeshStandardMaterial({ color: 0x202c35, metalness: 0.58, roughness: 0.76 });
const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0xc1c6c7, metalness: 0.52, roughness: 0.52 });
const oceanMaterial = new THREE.MeshPhysicalMaterial({ color: 0x0c2d48, metalness: 0.38, roughness: 0.27, clearcoat: 0.5, clearcoatRoughness: 0.22 });

function deckBox(width: number, height: number, depth: number, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeCloud(seed: number): THREE.Group {
  const cloud = new THREE.Group();
  const random = (index: number): number => {
    const value = Math.sin(seed * 91.17 + index * 52.31) * 43758.5453;
    return value - Math.floor(value);
  };
  const material = new THREE.MeshBasicMaterial({ color: 0xe9f4ff, transparent: true, opacity: 0.14, depthWrite: false });
  for (let index = 0; index < 8; index += 1) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), material);
    puff.scale.set(2.5 + random(index) * 3.2, 0.6 + random(index + 4) * 0.75, 1.1 + random(index + 8) * 1.7);
    puff.position.set((index - 3.5) * 2.0 + random(index + 11), random(index + 15) * 0.55, (random(index + 20) - 0.5) * 4);
    cloud.add(puff);
  }
  return cloud;
}

function makeDeckMarking(width: number, depth: number, x: number, z: number, color: number): THREE.Mesh {
  const marking = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72 }));
  marking.rotation.x = -Math.PI / 2;
  marking.position.set(x, 0.061, z);
  return marking;
}

export class EnvironmentRig {
  readonly group = new THREE.Group();
  readonly sun = new THREE.DirectionalLight(0xfff3df, 3.2);
  readonly sunTarget = new THREE.Object3D();
  private readonly sea = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600, 1, 1), oceanMaterial);
  private readonly deck = new THREE.Group();
  private readonly cameraObstacles: THREE.Object3D[] = [];
  private readonly cameraRaycaster = new THREE.Raycaster();

  constructor() {
    this.group.name = "test-range-environment";
    const sky = new Sky();
    sky.scale.setScalar(450000);
    const uniforms = sky.material.uniforms;
    uniforms.turbidity.value = 5.5;
    uniforms.rayleigh.value = 1.4;
    uniforms.mieCoefficient.value = 0.003;
    uniforms.mieDirectionalG.value = 0.78;
    uniforms.sunPosition.value.set(-1800, 720, -4200);
    this.group.add(sky);

    this.sea.rotation.x = -Math.PI / 2;
    this.sea.position.y = -0.34;
    this.sea.receiveShadow = true;
    this.group.add(this.sea);

    this.buildDeck();
    this.buildHorizon();
    this.buildCloudField();

    const hemisphere = new THREE.HemisphereLight(0xbcdcff, 0x15212b, 2.25);
    this.group.add(hemisphere);
    this.sun.position.set(-36, 58, -22);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(window.innerWidth < 720 ? 1024 : 2048, window.innerWidth < 720 ? 1024 : 2048);
    this.sun.shadow.camera.left = -48;
    this.sun.shadow.camera.right = 48;
    this.sun.shadow.camera.top = 48;
    this.sun.shadow.camera.bottom = -48;
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 140;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.035;
    this.group.add(this.sun, this.sunTarget);
  }

  private buildDeck(): void {
    this.deck.name = "vtol-test-deck";
    const slab = deckBox(48, 0.6, 154, deckMaterial);
    slab.position.y = -0.3;
    this.deck.add(slab);
    const edgeLeft = deckBox(0.42, 0.23, 154, edgeMaterial);
    edgeLeft.position.set(-23.78, 0.06, 0);
    const edgeRight = edgeLeft.clone();
    edgeRight.position.x = 23.78;
    this.deck.add(edgeLeft, edgeRight);
    this.cameraObstacles.push(slab, edgeLeft, edgeRight);

    for (let z = -67; z <= 67; z += 8) {
      this.deck.add(makeDeckMarking(0.18, 4.6, 0, z, 0xe8b54c));
      for (const x of [-21.7, 21.7]) {
        const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: 0x64baff }));
        beacon.position.set(x, 0.16, z);
        this.deck.add(beacon);
      }
    }
    this.deck.add(makeDeckMarking(14, 0.38, 0, 14, 0xe4bd62));
    this.deck.add(makeDeckMarking(14, 0.38, 0, -14, 0xe4bd62));
    const circle = new THREE.Mesh(new THREE.RingGeometry(5.3, 5.65, 64), new THREE.MeshBasicMaterial({ color: 0xd9e0e3, transparent: true, opacity: 0.72, side: THREE.DoubleSide }));
    circle.rotation.x = -Math.PI / 2;
    circle.position.y = 0.062;
    this.deck.add(circle);

    for (const x of [-22.3, 22.3]) {
      for (const z of [-65, -33, 0, 33, 65]) {
        const railPost = deckBox(0.08, 1.1, 0.08, edgeMaterial);
        railPost.position.set(x, 0.55, z);
        this.deck.add(railPost);
      }
    }
    this.group.add(this.deck);
  }

  private buildHorizon(): void {
    const mountainMaterial = new THREE.MeshStandardMaterial({ color: 0x446171, metalness: 0.05, roughness: 0.93 });
    for (let index = 0; index < 22; index += 1) {
      const angle = (index / 22) * Math.PI * 2;
      const radius = 230 + (index % 4) * 35;
      const mountain = new THREE.Mesh(new THREE.ConeGeometry(18 + (index % 5) * 7, 25 + (index % 6) * 12, 7), mountainMaterial);
      mountain.position.set(Math.cos(angle) * radius, 8, Math.sin(angle) * radius);
      mountain.rotation.y = angle * 2.7;
      this.group.add(mountain);
    }
  }

  private buildCloudField(): void {
    const locations: Array<[number, number, number, number]> = [
      [-70, 42, -90, 1],
      [64, 31, -45, 2],
      [-108, 55, 45, 3],
      [118, 68, 96, 4],
      [12, 48, 148, 5],
      [-55, 78, 185, 6],
    ];
    for (const [x, y, z, seed] of locations) {
      const cloud = makeCloud(seed);
      cloud.position.set(x, y, z);
      this.group.add(cloud);
    }
  }

  updateFollow(subject: THREE.Vector3): void {
    const snap = 0.18;
    this.sunTarget.position.copy(subject);
    this.sun.position.set(
      Math.round((subject.x - 36) / snap) * snap,
      Math.round((subject.y + 58) / snap) * snap,
      Math.round((subject.z - 22) / snap) * snap,
    );
    this.sunTarget.updateMatrixWorld();
  }

  constrainCamera(subject: THREE.Vector3, desired: THREE.Vector3, margin = 0.24): THREE.Vector3 {
    const direction = desired.clone().sub(subject);
    const distance = direction.length();
    if (distance > 0.001) {
      direction.multiplyScalar(1 / distance);
      this.cameraRaycaster.set(subject, direction);
      this.cameraRaycaster.near = 0.05;
      this.cameraRaycaster.far = distance;
      const hit = this.cameraRaycaster.intersectObjects(this.cameraObstacles, true)[0];
      if (hit) desired.copy(subject).addScaledVector(direction, Math.max(0.65, hit.distance - margin));
    }
    desired.y = Math.max(desired.y, this.sea.position.y + 0.34);
    return desired;
  }
}
