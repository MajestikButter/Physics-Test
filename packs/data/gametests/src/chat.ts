import { Dimension, Player, system, Vector3, world } from "@minecraft/server";
import Physics from "./physics";
import { Body, Box, RaycastResult, Vec3 } from "cannon-es";
import { CollisionGroup } from "./consts";
import { ColorJSON, Vec3 as Vec } from "@bedrock-oss/bedrock-boost";
import { GreedyMesher } from "./meshing";

function meshDimension(dim: Dimension, pos: Vector3) {
  const start = new Date().getTime();
  const mesher = new GreedyMesher(16);
  for (let i = 0; i < 16 * 16 * 16; i++) {
    const x = i % 16;
    const z = Math.floor(i / 16) % 16;
    const y = Math.floor(i / 16 / 16) % 16;
    try {
      const block = dim.getBlock({ x, y, z });
      if (block && !block.isAir && !block.isLiquid) {
        mesher.setVoxel(x - pos.x, y - pos.y, z - pos.z);
      }
    } catch {}
  }
  console.log(`${new Date().getTime() - start}ms to get 16x16x16 blocks`);
  const startMesh = new Date().getTime();
  const cubes = mesher.meshCubes();
  console.log(cubes.map((v) => ColorJSON.DEFAULT.stringify(v)));
  console.log(`${new Date().getTime() - startMesh}ms to mesh blocks`);
  return cubes;
}

const overworld = world.getDimension("overworld");
const min = { x: 0, y: 0, z: 0 };
Physics.createWorldMesh(overworld, min, meshDimension(overworld, min));

world.afterEvents.chatSend.subscribe((ev) => {
  const { sender, message } = ev;
  const dim = sender.dimension;
  let args = message.split(" ");
  const type = args[0];
  args = args.slice(1);

  const hit = sender.getBlockFromViewDirection();
  const loc = hit
    ? Vec.from(hit.block.location).add(hit.faceLocation).add({
      x: 0,
      y: 2,
      z: 0,
    })
    : undefined;

  switch (type) {
    case "mesh": {
      Physics.createWorldMesh(dim, min, meshDimension(dim, min));
      break;
    }
    case "prefab": {
      const [prefab] = args;
      Physics.spawnPrefab(prefab, dim, loc ?? sender.getHeadLocation());
      break;
    }
    case "block": {
      const [item] = args;
      if (!item) {
        return sender.sendMessage(`'${item}' is not a valid item`);
      }
      const pos = loc ?? sender.getHeadLocation();
      const entity = dim.spawnEntity("physics:block", pos);
      entity.runCommand(`replaceitem entity @s slot.weapon.mainhand 0 ${item}`);
      const body = new Body({
        mass: 1,
        shape: new Box(new Vec3(0.5, 0.5, 0.5)),
        collisionFilterGroup: CollisionGroup.Object,
        collisionFilterMask: CollisionGroup.World | CollisionGroup.Object |
          CollisionGroup.Player,
      });
      Physics.bindEntityBody(entity, body);
    }
  }
  return;
});

const MAX_REACH = 6;

const plrBodyMap: { [id: string]: Body } = {};
const bodyPlrMap: { [id: string]: Player } = {};

function clearSelect(key: Player | Body) {
  if (key instanceof Player) {
    const body = plrBodyMap[key.id];
    delete plrBodyMap[key.id];
    if (body) delete bodyPlrMap[`${body.id}`];
    return;
  }
  const id = `${key.id}`;
  const plr = bodyPlrMap[id];
  if (plr) delete plrBodyMap[plr.id];
  delete bodyPlrMap[id];
}

function selectBody(plr: Player, body: Body) {
  clearSelect(plr);
  clearSelect(body);

  plrBodyMap[plr.id] = body;
  bodyPlrMap[`${body.id}`] = plr;
}

world.afterEvents.itemUse.subscribe((ev) => {
  const { source, itemStack } = ev;
  if (itemStack.typeId !== "minecraft:stick") return;

  if (plrBodyMap[source.id]) {
    clearSelect(source);
    return;
  }

  const dim = source.dimension;
  const physWorld = Physics.getWorld(dim);
  const loc = source.getHeadLocation();
  const dir = source.getViewDirection();
  const locVec = new Vec3(loc.x, loc.y, loc.z);
  const dirVec = new Vec3(dir.x, dir.y, dir.z);
  const toVec = new Vec3().copy(locVec);
  locVec.addScaledVector(MAX_REACH, dirVec, toVec);

  const res = new RaycastResult();
  physWorld.raycastClosest(
    locVec,
    toVec,
    { collisionFilterMask: CollisionGroup.Object },
    res,
  );
  if (!res.body) return;

  const body = res.body;
  selectBody(source, body);

  // const local = new Vec3();
  // body.pointToLocalFrame(res.hitPointWorld, local);
  // body.applyImpulse(res.hitNormalWorld.scale(-IMPULSE), local);
});

system.runInterval(() => {
  for (const plrId in plrBodyMap) {
    const body = plrBodyMap[plrId];
    const plr = bodyPlrMap[`${body?.id}`];
    if (!body || plr?.id !== plrId) {
      clearSelect(body);
      clearSelect(plr);
      continue;
    }

    const { x: dx, y: dy, z: dz } = plr.getViewDirection();
    const { x, y, z } = plr.getHeadLocation();
    const target = new Vec3(x + dx * 3, y + dy * 3, z + dz * 3);
    const dif = new Vec3();
    target.vsub(body.position, dif);
    body.velocity = dif.scale(10);
  }
}, 1);
