// @ts-check
const { glob } = require("glob");
const fs = require("fs").promises;

const TO_RAD = Math.PI / 180;

/**  @typedef {import("./types.d.ts").ModelFile} ModelFile */
/**  @typedef {import("./types.d.ts").Body} Body */
/**  @typedef {import("./types.d.ts").Prefab} Prefab */
/**  @typedef {import("./types.d.ts").Vec3} Vec3 */
/**  @typedef {import("./types.d.ts").Vec2} Vec2 */
/**  @typedef {import("./types.d.ts").Shape} Shape */
/**  @typedef {import("./types.d.ts").Cube} Cube */
/**  @typedef {import("./types.d.ts").Bone} Bone */

const PREFAB_GLOB = "RP/models/entity/physics/prefabs/**/*.json";
const BP_OUTPUT_DIR = "BP/entities/physics/prefabs/";
const RP_OUTPUT_DIR = "RP/entity/physics/prefabs/";
const MODEL_OUTPUT_DIR = "RP/models/entity/physics/prefabs/";
const SCRIPT_OUTPUT_DIR = "data/gametests/src/prefabs/";

const behFile = JSON.stringify(require("./bp_entity.json"));
const resFile = JSON.stringify(require("./rp_entity.json"));
const geoFile = require("./geo.json");

/** @type {Prefab[]} */
const output = [];

/** @param {string} str */
const trimLocator = (str) => str.replace(/(?<=\w)_+$/, "");

/** @param {{[id: string]: any}} map @param {string} key */
function getOption(map, key) {
  key = `${key}_`;
  for (const k in map) {
    if (k.startsWith(key)) {
      const v = k.slice(key.length);
      return trimLocator(v);
    }
  }
}

/**
 * @param {string | undefined} str
 * @returns {number | undefined}
 */
const parseNum = (str) => {
  if (!str) return;
  let neg = false;
  if (str.startsWith("_")) {
    str = str.slice(1);
    neg = true;
  }
  const v = parseFloat(str.replace(/_/g, "."));
  if (isNaN(v)) return;
  return neg ? -v : v;
};
/**
 * @param {string | undefined} str
 * @returns {Vec3 | undefined}
 */
const parseVec3 = (str) => {
  if (!str) return;
  const [xS, yS, zS] = str.split("__");
  if (!xS || !yS || !zS) return;
  const x = parseNum(xS),
    y = parseNum(yS),
    z = parseNum(zS);
  if (x === undefined || y === undefined || z === undefined) return;
  return [x, y, z];
};

/**
 * @param {string | undefined} str
 * @param {Body | undefined} body
 * @returns {Vec3 | undefined}
 */
const parseRelativeVec3 = (str, body) => {
  const v = parseVec3(str);
  if (v) return v;
  if (!body) return;

  const { locators } = body;
  for (const k in locators) {
    if (trimLocator(k) !== str) continue;
    const [lx, ly, lz] = locators[k];
    return [lx / 16, ly / 16, lz / 16];
  }
};

/** @param {ModelFile["minecraft:geometry"][number]} geo  */
function handleGeo(geo) {
  const id = geo.description.identifier.replace("geometry.", "");
  /** @type {Prefab} */
  const prefab = {
    id,
    constraints: [],
    body: [],
  };
  for (const bone of geo.bones) {
    const { locators, cubes, pivot } = bone;

    if (cubes) {
      for (const cube of cubes) {
        for (let i = 0; i < 3; i++) {
          cube.origin[i] -= pivot[i];
        }
      }
      for (const k in locators) {
        for (let i = 0; i < 3; i++) {
          locators[k][i] -= pivot[i];
        }
      }
    }

    if (bone.parent === "Objects") {
      /** @type {Shape[]} */
      const shapes = [];
      const newCubes = [];
      if (cubes) {
        /** @type {Cube[]} */

        for (const cube of cubes) {
          newCubes.push(cube);

          const { origin, size } = cube;
          /** @type {Vec3} */
          const half = [size[0] / 16 / 2, size[1] / 16 / 2, size[2] / 16 / 2];
          /** @type {Vec3} */
          const pos = [origin[0] / 16 + half[0], origin[1] / 16 + half[1], origin[2] / 16 + half[2]];

          // TODO: Implement non-cube shapes
          shapes.push({
            type: "box",
            offset: pos,
            orientation: /** @type {Vec3} */ (cube.rotation?.map((v) => v * TO_RAD) ?? [0, 0, 0]),
            params: [half],
          });
        }
      }

      let friction, mass;
      if (locators) {
        const frictStr = getOption(locators, "friction");
        const massStr = getOption(locators, "mass");
        const frictVal = parseNum(frictStr);
        const massVal = parseNum(massStr);
        if (frictVal !== undefined) friction = frictVal;
        if (massVal !== undefined) mass = massVal;
      }

      const offset = /** @type {Vec3} */ (pivot.map((v) => v / 16));
      prefab.body.push({
        id: bone.name,
        locators: locators ?? {},
        offset,
        shapes,
        cubes: newCubes,
        friction,
        mass,
      });
    } else if (bone.parent === "Constraints" && locators) {
      const type = getOption(locators, "type");
      const bodyA = getOption(locators, "bodya");
      const bodyB = getOption(locators, "bodyb");
      if (!type || !bodyA || !bodyB) continue;

      const maxForce = parseNum(getOption(locators, "maxforce"));
      switch (type) {
        case "distance": {
          const distance = parseNum(getOption(locators, "distance"));
          prefab.constraints.push({
            id: bone.name,
            type: "distance",
            bodyA,
            bodyB,
            params: [distance, maxForce],
          });
          break;
        }
        case "lock": {
          prefab.constraints.push({
            id: bone.name,
            type: "lock",
            bodyA,
            bodyB,
            params: [{ maxForce }],
          });
          break;
        }
        case "hinge": {
          /** @type {import('./types.d.ts').HingeOptions} */
          const opts = {};

          opts.pivotA = getOption(locators, "pivota");
          opts.pivotB = getOption(locators, "pivotb");
          opts.axisA = parseVec3(getOption(locators, "axisa"));
          opts.axisB = parseVec3(getOption(locators, "axisb"));

          opts.maxForce = maxForce;
          opts.collideConnected = parseNum(getOption(locators, "collideconnected")) ? true : false;

          prefab.constraints.push({
            id: bone.name,
            type: "hinge",
            bodyA,
            bodyB,
            params: [opts],
          });
          break;
        }
        case "twist": {
          /** @type {import('./types.d.ts').TwistOptions} */
          const opts = {};

          opts.pivotA = getOption(locators, "pivota");
          opts.pivotB = getOption(locators, "pivotb");
          opts.axisA = parseVec3(getOption(locators, "axisa"));
          opts.axisB = parseVec3(getOption(locators, "axisb"));

          opts.angle = parseNum(getOption(locators, "angle"));
          opts.twistAngle = parseNum(getOption(locators, "twistangle"));

          opts.maxForce = maxForce;
          opts.collideConnected = parseNum(getOption(locators, "collideconnected")) ? true : false;

          prefab.constraints.push({
            id: bone.name,
            type: "twist",
            bodyA,
            bodyB,
            params: [opts],
          });
          break;
        }
        case "point": {
          const pivAStr = getOption(locators, "pivota"),
            pivBStr = getOption(locators, "pivotb");
          const pivA = parseVec3(pivAStr),
            pivB = parseVec3(pivBStr);
          prefab.constraints.push({
            id: bone.name,
            type: "point",
            bodyA,
            bodyB,
            params: [pivA, pivB, maxForce],
          });
          break;
        }
      }
    }
  }
  output.push(prefab);
}

/** @param {string} path */
async function readModel(path) {
  const content = await fs.readFile(path);
  /**
   * @type {ModelFile}
   */
  const json = JSON.parse(content.toString());
  const geos = json["minecraft:geometry"];
  for (const geo of geos) handleGeo(geo);
}

/** @param {Prefab} prefab */
function createScript(prefab) {
  /** @type {string[]} */
  const createConsts = [];
  const createFunc = `
  ${prefab.body
    .map(({ id, offset: [x, y, z], shapes, mass, friction }) => {
      const constId = `body${id}`;
      createConsts.push(constId);
      return `const offPos${constId} = pos.vadd(new CANNON.Vec3(${x}, ${y}, ${z}));
        const ${constId} = new CANNON.Body({
          mass: ${mass ?? 2},
          position: offPos${constId},
          material: new CANNON.Material({ friction: ${friction} }),
          collisionFilterGroup: CollisionGroup.Object,
          collisionFilterMask: CollisionGroup.World | CollisionGroup.Object | CollisionGroup.Player,
        });
        ${shapes
          .map(({ type, offset: [x, y, z], orientation: [pitch, yaw, roll], params }) => {
            // TODO: Implement non-box shapes
            const shape = `new CANNON.Box(new CANNON.Vec3(${params[0]}))`;
            const offVec = `new CANNON.Vec3(${x}, ${y}, ${z})`;
            const rot = `new CANNON.Quaternion().setFromEuler(${pitch * TO_RAD}, ${yaw * TO_RAD}, ${roll * TO_RAD})`;
            return `${constId}.addShape(${shape}, ${offVec}, ${rot});`;
          })
          .join("\n")};`;
    })
    .join("\n")}
  ${prefab.constraints
    .map(({ bodyA, bodyB, type, params, id }) => {
      const constId = `constraint${id}`;
      createConsts.push(constId);

      let constraint = "";
      switch (type) {
        case "distance": {
          constraint = `new CANNON.DistanceConstraint(body${bodyA}, body${bodyB}, ${params[0]}, ${params[1]})`;
          break;
        }
        case "hinge": {
          let optsStr = "undefined";
          const opts = /** @type {import('./types.d.ts').HingeOptions | undefined} */ (params[0]);
          if (opts) {
            if (typeof opts.pivotA === "string") {
              const aBody = prefab.body.find((v) => v.id === bodyA);
              opts.pivotA = parseRelativeVec3(opts.pivotA, aBody);
            }
            if (typeof opts.pivotB === "string") {
              const bBody = prefab.body.find((v) => v.id === bodyB);
              opts.pivotB = parseRelativeVec3(opts.pivotB, bBody);
            }

            optsStr = `{
              ${opts.axisA ? `axisA: new CANNON.Vec3(${opts.axisA}),` : ""}
              ${opts.axisB ? `axisB: new CANNON.Vec3(${opts.axisB}),` : ""}
              ${opts.pivotA ? `pivotA: new CANNON.Vec3(${opts.pivotA}),` : ""}
              ${opts.pivotB ? `pivotB: new CANNON.Vec3(${opts.pivotB}),` : ""}
              ${opts.collideConnected ? `collideConnected: ${opts.collideConnected},` : ""}
              ${opts.maxForce ? `maxForce: ${opts.maxForce},` : ""}
            }`;
          }
          constraint = `new CANNON.HingeConstraint(body${bodyA}, body${bodyB}, ${optsStr});`;
          break;
        }
        case "twist": {
          let optsStr = "undefined";
          const opts = /** @type {import('./types.d.ts').TwistOptions | undefined} */ (params[0]);
          if (opts) {
            if (typeof opts.pivotA === "string") {
              const aBody = prefab.body.find((v) => v.id === bodyA);
              console.log(opts.pivotA);
              opts.pivotA = parseRelativeVec3(opts.pivotA, aBody);
            }
            if (typeof opts.pivotB === "string") {
              const bBody = prefab.body.find((v) => v.id === bodyB);
              opts.pivotB = parseRelativeVec3(opts.pivotB, bBody);
            }

            optsStr = `{
              ${opts.axisA ? `axisA: new CANNON.Vec3(${opts.axisA}),` : ""}
              ${opts.axisB ? `axisB: new CANNON.Vec3(${opts.axisB}),` : ""}
              ${opts.pivotA ? `pivotA: new CANNON.Vec3(${opts.pivotA}),` : ""}
              ${opts.pivotB ? `pivotB: new CANNON.Vec3(${opts.pivotB}),` : ""}
              ${opts.twistAngle ? `twistAngle: ${opts.twistAngle * TO_RAD},` : ""}
              ${opts.angle ? `angle: ${opts.angle * TO_RAD},` : ""}
              ${opts.collideConnected ? `collideConnected: ${opts.collideConnected},` : ""}
              ${opts.maxForce ? `maxForce: ${opts.maxForce},` : ""}
            }`;
          }
          constraint = `new CANNON.ConeTwistConstraint(body${bodyA}, body${bodyB}, ${optsStr});`;
          break;
        }
        case "lock": {
          const opts = params[0];
          let optsStr = "undefined";
          if (opts) {
            optsStr = `{
              ${opts.maxForce ? `maxForce: ${opts.maxForce},` : ""}
            }`;
          }
          constraint = `new CANNON.LockConstraint(body${bodyA}, body${bodyB}, ${optsStr})`;
          break;
        }
        case "point": {
          constraint = `new CANNON.PointToPointConstraint(body${bodyA}, new CANNON.Vec3(${params[0]}), body${bodyB}, new CANNON.Vec3(${params[1]}), ${params[2]})`;
          break;
        }
      }

      return `const ${constId} = ${constraint};
      physWorld.addConstraint(${constId});`;
    })
    .join("\n")}
  ${prefab.body
    .map(({ id, cubes }) => {
      const constId = `body${id}`;
      if (cubes.length <= 0) return `physWorld.addBody(${constId})`;
      return `Physics.createBodyEntity("physics:${prefab.id}.${id}", offPos${constId}, dim, ${constId});`;
    })
    .join("\n")}
  `;
  const script = `
  import * as CANNON from "cannon-es";
  import Physics from "../physics";
  import { CollisionGroup } from "../consts";

  Physics.registerPrefab("${prefab.id}", ({physWorld, pos, dim}) => {
    ${createFunc}
    return { ${createConsts.join(", ")} };
  })
  `;

  const scriptPath = SCRIPT_OUTPUT_DIR + prefab.id + ".js";
  return fs.writeFile(scriptPath, script);
}

function replaceVars(vars, str) {
  for (const k in vars) {
    str = str.replaceAll(`#{${k}}`, vars[k]);
  }
  return str;
}

/** @param {Prefab} prefab */
async function createBehEntity(prefab) {
  const bpPath = BP_OUTPUT_DIR + prefab.id + "/";
  await ensureDir(bpPath);
  const writes = prefab.body.map((body) => {
    if (!body.cubes.length) return;
    const content = replaceVars({ prefab: prefab.id, body: body.id }, behFile);
    return fs.writeFile(bpPath + body.id + ".json", content);
  });
  return Promise.all(writes);
}

/** @param {Prefab} prefab */
async function createResEntity(prefab) {
  const rpPath = RP_OUTPUT_DIR + prefab.id + "/";
  await ensureDir(rpPath);
  const writes = prefab.body.map((body) => {
    if (!body.cubes.length) return;
    const content = replaceVars({ prefab: prefab.id, body: body.id }, resFile);
    return fs.writeFile(rpPath + body.id + ".json", content);
  });
  return Promise.all(writes);
}

/** @param {Prefab} prefab */
async function createGeometry(prefab) {
  const rpPath = MODEL_OUTPUT_DIR + prefab.id + "/";
  await ensureDir(rpPath);
  const writes = prefab.body.map((body) => {
    if (!body.cubes.length) return;
    /** @type {ModelFile} */
    const geoCopy = JSON.parse(JSON.stringify(geoFile));
    const geo = geoCopy["minecraft:geometry"][0];
    geo.description.identifier = `geometry.${prefab.id}.${body.id}`;
    const bone = geo.bones.find((v) => v.name === "model");
    if (!bone) return;
    bone.cubes = body.cubes;
    return fs.writeFile(rpPath + body.id + ".json", JSON.stringify(geoCopy));
  });
  return Promise.all(writes);
}

/** @param {Prefab} prefab  */
async function createPrefab(prefab) {
  return Promise.all([createBehEntity(prefab), createResEntity(prefab), createGeometry(prefab), createScript(prefab)]);
}

async function ensureDir(path) {
  try {
    await fs.mkdir(path, { recursive: true });
  } catch {}
}

async function main() {
  await ensureDir(SCRIPT_OUTPUT_DIR);
  await ensureDir(MODEL_OUTPUT_DIR);
  await ensureDir(BP_OUTPUT_DIR);
  await ensureDir(RP_OUTPUT_DIR);

  console.log("Reading physics models");
  const paths = await glob(PREFAB_GLOB);
  const reads = paths.map((v) => readModel(v));
  await Promise.all(reads);
  console.log("Writing physics model outputs");
  const writes = output.map((v) => createPrefab(v));
  await Promise.all(writes);
  await fs.writeFile(SCRIPT_OUTPUT_DIR + "index.js", output.map((v) => `import "./${v.id}";`).join("\n"));
  console.log("Deleting original models");
  const deletes = paths.map((v) => fs.rm(v));
  await Promise.all(deletes);
  console.log("Compilation complete");
}
main();
