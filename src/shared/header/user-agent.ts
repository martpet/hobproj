import { Engine } from "@std/http";

export function isWebKit(engine: Engine) {
  return engine.name === "WebKit";
}
