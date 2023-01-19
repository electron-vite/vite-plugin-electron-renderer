import fs from "node:fs/promises";
import { join } from "node:path";

console.log("path.join('a', 'b') ->", join("a", "b"));
console.log("node:fs/promises ->", fs);
