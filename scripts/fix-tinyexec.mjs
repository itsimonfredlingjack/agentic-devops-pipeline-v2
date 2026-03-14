import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const packageRoot = resolve("node_modules", "tinyexec");
const distRoot = resolve(packageRoot, "dist");
const mainMjs = resolve(distRoot, "main.mjs");
const mainJs = resolve(distRoot, "main.js");
const typesMts = resolve(distRoot, "main.d.mts");
const typesTs = resolve(distRoot, "main.d.ts");

if (existsSync(mainMjs) && !existsSync(mainJs)) {
  copyFileSync(mainMjs, mainJs);
}

if (existsSync(typesMts) && !existsSync(typesTs)) {
  copyFileSync(typesMts, typesTs);
}
