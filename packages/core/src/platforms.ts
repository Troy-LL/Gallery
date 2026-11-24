import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parsePlatformConfig } from "./preview.js";
import type { PlatformConfig } from "./schema.js";

export function loadPlatformConfigs(directory: string): PlatformConfig[] {
  return readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => parsePlatformConfig(JSON.parse(readFileSync(join(directory, name), "utf8"))));
}
