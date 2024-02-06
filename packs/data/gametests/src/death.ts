import { Player, system, world } from "@minecraft/server";
import Physics from "./physics";
import { Body, Constraint, Vec3 } from "cannon-es";

const RAGDOLL_PREFABS: { [k: string]: string } = {
  zombie: "ragdoll",
  husk: "ragdoll",
  drowned: "ragdoll",
};

const DESPAWN_TIMER = 15 * 20;

world.afterEvents.entityDie.subscribe((ev) => {
  const entity = ev.deadEntity;
  if (entity instanceof Player) return;
  if (entity.typeId.startsWith("physics:")) return entity.remove();

  let id = entity.typeId.replace("minecraft:", "");
  if (entity.hasComponent("is_baby")) id += ".baby";

  const prefab = RAGDOLL_PREFABS[id];
  if (!prefab) return;

  const prefabValue = Physics.spawnPrefab(
    prefab,
    entity.dimension,
    entity.location,
  );
  const { bodychest: chest } = prefabValue;
  const vel = entity.getVelocity();
  chest.velocity = new Vec3(vel.x, vel.y, vel.z).scale(70);
  entity.remove();

  system.runTimeout(() => {
    const constraints = <Constraint[]> Object.values(prefabValue).filter((v) =>
      !("velocity" in v)
    );
    const bodies = <Body[]> Object.values(prefabValue).filter((v) =>
      "velocity" in v
    );
    for (const c of constraints) {
      const world = c.bodyA.world ?? c.bodyB.world;
      world?.removeConstraint(c);
    }
    for (const b of bodies) b.world?.removeBody(b);
  }, DESPAWN_TIMER);
});
