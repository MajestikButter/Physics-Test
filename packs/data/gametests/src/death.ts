import { Player, world } from "@minecraft/server";
import Physics from "./physics";
import { Vec3 } from "cannon-es";

const RAGDOLL_PREFABS: { [k: string]: string } = {
  zombie: "ragdoll",
  husk: "ragdoll",
  drowned: "ragdoll",
};

world.afterEvents.entityDie.subscribe((ev) => {
  const entity = ev.deadEntity;
  if (entity instanceof Player) return;
  if (entity.typeId.startsWith("physics:")) return entity.remove();

  let id = entity.typeId.replace("minecraft:", "");
  if (entity.hasComponent("is_baby")) id += ".baby";

  const prefab = RAGDOLL_PREFABS[id];
  if (!prefab) return;

  const { bodychest: chest } = Physics.spawnPrefab(
    prefab,
    entity.dimension,
    entity.location,
  );
  const vel = entity.getVelocity();
  chest.velocity = new Vec3(vel.x, vel.y, vel.z).scale(70);
  entity.remove();
});
