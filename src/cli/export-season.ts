import { readFile } from "node:fs/promises";
import { seasonPaths } from "../seasonSource.js";
import { parseSeasonArgs } from "./seasonArgs.js";

const args = parseSeasonArgs();
const paths = seasonPaths(args.year, args.season);
const path = args.format === "json" ? paths.ranking : paths.csv;
console.log(await readFile(path, "utf-8"));
