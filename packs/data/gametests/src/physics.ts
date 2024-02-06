import { Dimension, Entity, system, Vector3, world } from "@minecraft/server";
import {
  Body,
  BODY_TYPES,
  Box,
  Constraint,
  Cylinder,
  Plane,
  Sphere,
  Vec3,
  World,
} from "cannon-es";
import { CollisionGroup } from "./consts";
import { Cube } from "./meshing";

const EARTH_GRAVITY = -9.82;
// const EARTH_GRAVITY = -0.1;

const worlds = {
  overworld: new World({
    gravity: new Vec3(0, EARTH_GRAVITY, 0),
  }),
  nether: new World({
    gravity: new Vec3(0, EARTH_GRAVITY * 1.3, 0),
  }),
  the_end: new World({
    gravity: new Vec3(0, EARTH_GRAVITY * 0.6, 0),
  }),
};

type DimensionId = keyof typeof worlds;

const TO_RAD = Math.PI / 180;
const TO_DEG = 180 / Math.PI;

type PrefabFunc = (ctx: {
  physWorld: World;
  pos: Vec3;
  dim: Dimension;
}) => {
  [k: `constraint${string}`]: Constraint;
  [k: `body${string}`]: Body;
};
const prefabs: { [id: string]: PrefabFunc } = {};

function loadPhysicsRotation(entity: Entity, body: Body) {
  const [pitch, yaw, roll] = [
    <number> entity.getProperty("physics:pitch") ?? 0,
    <number> entity.getProperty("physics:yaw") ?? entity.getRotation().y,
    <number> entity.getProperty("physics:roll") ?? 0,
  ];
  body.quaternion.setFromEuler(pitch * TO_RAD, yaw * TO_RAD, roll * TO_RAD);
}
function loadPhysicsBody(entity: Entity, body: Body) {
  const { x, y, z } = entity.location;
  body.position.set(x, y, z);

  const physWorld = Physics.getWorld(entity.dimension);
  physWorld.addBody(body);
  physObjects[entity.id] = { body, entity, physWorld };
}
export namespace Physics {
  export const bindEntityBody = loadPhysicsBody;

  export function createWorldMesh(
    dim: Dimension,
    origin: Vector3,
    cubes: Cube[],
  ) {
    const physWorld = Physics.getWorld(dim);
    const worldBody = new Body({
      type: Body.STATIC,
      position: new Vec3(origin.x, origin.y - 0.5, origin.z),
    });
    for (const cube of cubes) {
      const extents = new Vec3(
        cube.size.x / 2,
        cube.size.y / 2,
        cube.size.z / 2,
      );
      const off = new Vec3(
        cube.origin.x,
        cube.origin.y,
        cube.origin.z,
      );
      worldBody.addShape(new Box(extents), off);
      physWorld.addBody(worldBody);
    }
  }

  export function getWorld(dim: DimensionId | Dimension) {
    if (dim instanceof Dimension) {
      dim = <DimensionId> dim.id.replace("minecraft:", "");
    }
    return worlds[dim];
  }
  export function executeWorlds(
    exec: (physicsWorld: World, dimension: Dimension) => void,
  ) {
    for (const id in worlds) {
      exec(worlds[<DimensionId> id], world.getDimension(id));
    }
  }
  export function createBodyEntity(
    id: string,
    pos: Vector3,
    dim: Dimension,
    body: Body,
  ) {
    const ent = dim.spawnEntity(id, pos);
    loadPhysicsBody(ent, body);
  }

  const step = 1 / 20;
  let lastTime = new Date().getTime() / 1000;
  export function stepPhysics() {
    const curr = new Date().getTime() / 1000;
    const delta = curr - lastTime;
    lastTime = curr;
    Physics.executeWorlds((physicsWorld) => {
      physicsWorld.step(step, delta);
    });
  }

  export function registerPrefab(id: string, func: PrefabFunc) {
    prefabs[id] = func;
  }

  export function spawnPrefab(id: string, dim: Dimension, pos: Vector3) {
    const prefab = prefabs[id];
    if (!prefab) throw `${id} is not a valid prefab`;
    const physWorld = getWorld(dim);
    const vec3Pos = new Vec3(pos.x, pos.y, pos.z);
    return prefab({ physWorld, dim, pos: vec3Pos });
  }
}
export default Physics;

Physics.executeWorlds((physicsWorld) => {
  const groundBody = new Body({
    type: Body.STATIC,
    shape: new Plane(),
  });
  groundBody.position.set(0, -60, 0);
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  physicsWorld.addBody(groundBody);
});

const physObjects: {
  [entId: string]: { body: Body; entity: Entity; physWorld: World };
} = {};

function loadObject(entity: Entity) {
  if (physObjects[entity.id]) return;
  if (!entity.typeId.startsWith("physics:")) return;

  const body = new Body({
    mass: 5,
    shape: new Sphere(0.5),
    collisionFilterGroup: CollisionGroup.Object,
    collisionFilterMask: CollisionGroup.World | CollisionGroup.Object |
      CollisionGroup.Player,
  });
  loadPhysicsRotation(entity, body);
  loadPhysicsBody(entity, body);
}

function unloadObject(id: string) {
  const info = physObjects[id];
  if (!info) return;
  info.physWorld.removeBody(info.body);
  delete physObjects[id];
}

world.afterEvents.entitySpawn.subscribe((ev) => {
  loadObject(ev.entity);
});
world.afterEvents.entityLoad.subscribe((ev) => {
  loadObject(ev.entity);
});
world.afterEvents.entityRemove.subscribe((ev) => {
  unloadObject(ev.removedEntityId);
});

const PLR_HEIGHT = 1.8;
function playerCollider(player: Entity) {
  const body = new Body({
    mass: 5,
    type: BODY_TYPES.KINEMATIC,
    shape: new Cylinder(0.5, 0.5, PLR_HEIGHT),
    collisionFilterGroup: CollisionGroup.Player,
    collisionFilterMask: CollisionGroup.Object,
  });
  loadPhysicsBody(player, body);
}
world.afterEvents.playerSpawn.subscribe((ev) => {
  if (!ev.initialSpawn) return;
  playerCollider(ev.player);
});

for (const ent of world.getDimension("overworld").getEntities()) {
  if (ent.typeId === "minecraft:player") {
    playerCollider(ent);
  } else loadObject(ent);
}

system.runInterval(() => {
  Physics.stepPhysics();

  for (const k in physObjects) {
    const { body, entity } = physObjects[k];
    if (!entity.isValid()) continue;
    if (entity.typeId === "minecraft:player") {
      const { x, y, z } = entity.location;
      body.position.set(x, y + PLR_HEIGHT / 2, z);
      const { x: vx, y: vy, z: vz } = entity.getVelocity();
      body.velocity.set(vx, vy, vz);
    } else {
      const rot = new Vec3();
      body.quaternion.toEuler(rot, "YZX");
      entity.setProperty("physics:pitch", rot.x * TO_DEG);
      entity.setProperty("physics:roll", rot.z * TO_DEG);
      entity.setProperty("physics:yaw", rot.y * TO_DEG);
      const { x, y, z } = body.position;
      entity.teleport({ x, y: y, z });
    }
  }

  // if (system.currentTick % 10 !== 0) return;
  // Physics.executeWorlds((world, dim) => {
  //   for (const body of world.bodies) {
  //     // if (body.shapes.length < 2) continue;
  //     try {
  //       dim.spawnParticle('minecraft:endrod', body.position);
  //     } catch (error) {
  //       // noop
  //     }
  //   }
  // });
}, 1);
