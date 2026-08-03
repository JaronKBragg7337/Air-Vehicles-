import * as THREE from "three";

export type AssetRole = "aircraft" | "mechanism" | "environment" | "structure" | "light" | "effect";

export interface AssetFlags {
  dynamic?: boolean;
  unsupported?: boolean;
  interpenetrates?: boolean;
  outOfBounds?: boolean;
}

export interface SceneAsset {
  id: string;
  role: AssetRole;
  object: THREE.Object3D;
  flags?: AssetFlags;
  expectedGrounded?: boolean;
}

export interface SceneIssue {
  key: string;
  kind: "invalid-transform" | "non-uniform-scale" | "ground-clearance";
  id: string;
  role: AssetRole;
  address: string;
  message: string;
}

export interface SceneReport {
  generatedAt: string;
  world: { size: number; module: number };
  counts: { assets: number; issues: number; apertures: number; byRole: Record<string, number> };
  issues: SceneIssue[];
  assets: Array<{
    id: string;
    role: AssetRole;
    address: string;
    pos: [number, number, number];
    size: [number, number, number];
    clearance: number;
    flags?: AssetFlags;
  }>;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export class SceneRegistry {
  private readonly assets = new Map<string, SceneAsset>();
  private baseline: Map<string, THREE.Vector3> | null = null;

  register(asset: SceneAsset): void {
    if (this.assets.has(asset.id)) {
      throw new Error(`Duplicate scene asset id: ${asset.id}`);
    }
    this.assets.set(asset.id, asset);
  }

  addressFor(position: THREE.Vector3): string {
    const column = Math.floor((position.x + 200) / 4);
    const row = Math.floor((position.z + 200) / 4);
    const level = Math.max(0, Math.floor(position.y / 3));
    return `L${level}-H${column}-R${row}`;
  }

  report(): SceneReport {
    const issues: SceneIssue[] = [];
    const byRole: Record<string, number> = {};
    const assets = [...this.assets.values()].map((asset) => {
      asset.object.updateWorldMatrix(true, true);
      const position = new THREE.Vector3();
      const scale = new THREE.Vector3();
      asset.object.matrixWorld.decompose(position, new THREE.Quaternion(), scale);
      const bounds = new THREE.Box3().setFromObject(asset.object);
      const size = bounds.isEmpty() ? new THREE.Vector3() : bounds.getSize(new THREE.Vector3());
      const clearance = bounds.isEmpty() ? position.y : bounds.min.y;
      const address = this.addressFor(position);
      byRole[asset.role] = (byRole[asset.role] ?? 0) + 1;

      const finite = [position.x, position.y, position.z, scale.x, scale.y, scale.z].every(Number.isFinite);
      if (!finite) {
        issues.push({
          key: stableHash(`${asset.id}:invalid-transform`),
          kind: "invalid-transform",
          id: asset.id,
          role: asset.role,
          address,
          message: "Object transform contains a non-finite value.",
        });
      }

      const nonUniform = Math.max(scale.x, scale.y, scale.z) - Math.min(scale.x, scale.y, scale.z) > 0.001;
      if (nonUniform && !asset.flags?.dynamic) {
        issues.push({
          key: stableHash(`${asset.id}:non-uniform-scale`),
          kind: "non-uniform-scale",
          id: asset.id,
          role: asset.role,
          address,
          message: "Static object uses non-uniform scale instead of baked geometry.",
        });
      }

      if (asset.expectedGrounded && !asset.flags?.dynamic && Math.abs(clearance) > 0.06) {
        issues.push({
          key: stableHash(`${asset.id}:ground-clearance:${round(clearance)}`),
          kind: "ground-clearance",
          id: asset.id,
          role: asset.role,
          address,
          message: `Expected ground contact but measured ${round(clearance)}m clearance.`,
        });
      }

      return {
        id: asset.id,
        role: asset.role,
        address,
        pos: [round(position.x), round(position.y), round(position.z)] as [number, number, number],
        size: [round(size.x), round(size.y), round(size.z)] as [number, number, number],
        clearance: round(clearance),
        flags: asset.flags,
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      world: { size: 1000, module: 4 },
      counts: { assets: assets.length, issues: issues.length, apertures: 0, byRole },
      issues,
      assets,
    };
  }

  reportText(): string {
    const report = this.report();
    const roleText = Object.entries(report.counts.byRole).map(([role, count]) => `${role}:${count}`).join(" · ");
    const headline = `SCENE REPORT — ${report.counts.assets} registered groups · ${report.counts.issues} issue(s) · ${roleText}`;
    if (report.issues.length === 0) {
      return `${headline}\nAll registered transforms are finite; static groups use baked scale; grounded structures meet the 0.06m tolerance.`;
    }
    return `${headline}\n${report.issues.map((issue) => `[${issue.key}] ${issue.id}: ${issue.message}`).join("\n")}`;
  }

  snapshot(): void {
    this.baseline = new Map(
      [...this.assets.entries()].map(([id, asset]) => [id, asset.object.getWorldPosition(new THREE.Vector3())]),
    );
  }

  diffSinceSnapshot(): { added: string[]; removed: string[]; moved: string[]; newIssues: number } {
    const before = this.baseline ?? new Map<string, THREE.Vector3>();
    const now = new Map(
      [...this.assets.entries()].map(([id, asset]) => [id, asset.object.getWorldPosition(new THREE.Vector3())]),
    );
    const added = [...now.keys()].filter((id) => !before.has(id));
    const removed = [...before.keys()].filter((id) => !now.has(id));
    const moved = [...now.entries()]
      .filter(([id, position]) => {
        const previous = before.get(id);
        return previous !== undefined && previous.distanceTo(position) > 0.05;
      })
      .map(([id]) => id);
    return { added, removed, moved, newIssues: this.report().counts.issues };
  }
}
