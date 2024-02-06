type Vec3 = { x: number; y: number; z: number };
export interface Cube {
  origin: Vec3;
  size: Vec3;
}

export class GreedyMesher {
  private voxels: boolean[];
  private max = this.size * this.size * this.size;
  constructor(public readonly size: number) {
    this.voxels = new Array(this.max).fill(0);
  }

  private voxIndex(x: number, y: number, z: number) {
    return x + (z * this.size) + (y * this.size * this.size);
  }
  private voxVec(idx: number, size: number) {
    return ({
      x: idx % size,
      z: Math.floor(idx / size) % size,
      y: Math.floor(Math.floor(idx / size) / size) % size,
    });
  }
  private voxPos(idx: number) {
    return this.voxVec(idx, this.size);
  }
  private voxSize(idx: number) {
    return this.voxVec(idx, this.size + 1);
  }

  setVoxel(x: number, y: number, z: number) {
    const index = this.voxIndex(x, y, z);
    this.voxels[index] = true;
  }

  mesh() {
    // Create array of 1x1 groups
    const s = this.size + 1;
    const groups: number[] = new Array(this.max).fill(1 + s + (s * s));

    // Set empty columns to 0
    for (let i = 0; i < this.max; i++) {
      const column = this.voxels[i];
      if (!column) groups[i] = 0;
    }

    // Mesh X axis
    for (let i = 0; i < this.max; i++) {
      const { x, y, z } = this.voxPos(i);
      if (x < 1 || !this.voxels[i]) continue;

      const prevVoxIdx = this.voxIndex(x - 1, y, z);
      const prevVox = this.voxels[prevVoxIdx];
      if (!prevVox) continue;

      const prevGroup = groups[prevVoxIdx];

      const { x: psx } = this.voxSize(prevGroup);
      groups[i] += psx;
      groups[prevVoxIdx] = 0;
    }

    // Mesh Z axis
    for (let i = 0; i < this.max; i++) {
      const { x, y, z } = this.voxPos(i);
      if (z < 1 || !this.voxels[i]) continue;

      const prevVoxIdx = this.voxIndex(x, y, z - 1);
      const prevVox = this.voxels[prevVoxIdx];
      if (!prevVox) continue;

      const prevGroup = groups[prevVoxIdx];
      const group = groups[i];

      const { x: psx, z: psz } = this.voxSize(prevGroup);
      const { x: sx } = this.voxSize(group);
      if (psx !== sx) continue;

      groups[i] += psz * (this.size + 1);
      groups[prevVoxIdx] = 0;
    }

    // Mesh Y axis
    for (let i = 0; i < this.max; i++) {
      const { x, y, z } = this.voxPos(i);
      if (y < 1 || !this.voxels[i]) continue;

      const prevVoxIdx = this.voxIndex(x, y - 1, z);
      const prevVox = this.voxels[prevVoxIdx];
      if (!prevVox) continue;

      const prevGroup = groups[prevVoxIdx];
      const group = groups[i];

      const { x: psx, z: psz, y: psy } = this.voxSize(prevGroup);
      const { x: sx, z: sz } = this.voxSize(group);
      if (psx !== sx || psz !== sz) continue;

      groups[i] += psy * (this.size + 1) * (this.size + 1);
      groups[prevVoxIdx] = 0;
    }

    return groups;
  }

  meshCubes() {
    const groups = this.mesh();
    const cubes: Cube[] = [];
    for (let i = 0; i < groups.length; i++) {
      if (!groups[i]) continue;
      const pos = this.voxPos(i);
      const size = this.voxSize(groups[i]);
      cubes.push({
        origin: {
          x: pos.x + 1 - size.x / 2,
          z: pos.z + 1 - size.z / 2,
          y: pos.y + 1 - size.y / 2 + 0.5,
        },
        size: { x: size.x, z: size.z, y: size.y },
      });
    }
    return cubes;
  }
}
