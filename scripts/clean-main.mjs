import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
await fs.rm(path.join(root, "dist", "main"), { recursive: true, force: true });
