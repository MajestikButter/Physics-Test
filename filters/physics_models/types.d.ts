export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

type Cardinal = "north" | "south" | "east" | "west" | "up" | "down";

interface Cube {
  origin: Vec3;
  size: Vec3;
  rotation?: Vec3;
  uv: {
    [c in Cardinal]: {
      uv: Vec2;
      uv_size: Vec2;
    };
  };
}

interface Bone {
  name: string;
  parent?: string;
  pivot: Vec3;
  locators?: { [id: string]: Vec3 };
  cubes?: Cube[];
}

export interface ModelFile {
  format_version: string;
  "minecraft:geometry": {
    description: {
      identifier: string;
      texture_width: number;
      texture_height: number;
      visible_bounds_width: number;
      visible_bounds_height: number;
      visible_bounds_offset: Vec3;
    };
    bones: Bone[];
  }[];
}

interface HingeOptions {
  pivotA?: Vec3 | string;
  pivotB?: Vec3 | string;
  axisA?: Vec3;
  axisB?: Vec3;
  collideConnected?: boolean;
  maxForce?: number;
}

interface TwistOptions {
  pivotA?: Vec3 | string;
  pivotB?: Vec3 | string;
  axisA?: Vec3;
  axisB?: Vec3;
  angle?: number;
  twistAngle?: number;
  maxForce?: number;
  collideConnected?: boolean;
}

interface Constraint {
  id: string;
  type: string;
  bodyA: string;
  bodyB: string;
  params: any[];
}

export interface Shape {
  type: string;
  params: any[];
  offset: Vec3;
  orientation: Vec3;
}

interface Body {
  id: string;
  offset: Vec3;
  shapes: Shape[];
  cubes: Cube[];
  locators: { [k: string]: Vec3 };
  friction?: number;
  mass?: number;
}

export interface Prefab {
  id: string;
  body: Body[];
  constraints: Constraint[];
}
