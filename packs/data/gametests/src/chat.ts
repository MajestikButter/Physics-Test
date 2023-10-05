import { Player, Vector, system, world } from '@minecraft/server';
import Physics from './physics';
import { Body, RaycastResult, Vec3 } from 'cannon-es';
import { CollisionGroup } from './consts';

world.afterEvents.chatSend.subscribe((ev) => {
  const dim = ev.sender.dimension;
  let args = ev.message.split(' ');
  const type = args[0];
  args = args.slice(1);
  switch (type) {
    case 'prefab': {
      const [prefab] = args;
      const hit = ev.sender.getBlockFromViewDirection();
      const loc = hit
        ? Vector.add(Vector.add(hit.block.location, hit.faceLocation), {
            x: 0,
            y: 2,
            z: 0,
          })
        : undefined;
      Physics.spawnPrefab(prefab, dim, loc ?? ev.sender.getHeadLocation());
    }
  }
});

const MAX_REACH = 6;
const IMPULSE = 5;

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
  if (itemStack.typeId !== 'minecraft:stick') return;

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
    res
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
