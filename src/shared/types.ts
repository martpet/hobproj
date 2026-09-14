import { Context } from "@shared/context.ts";

export type AlertType = "success" | "info" | "warning" | "danger";

export type Handler<T = Response> = (c: Context) => T | Promise<T>;
export type Middleware<T = Response> = (next: Handler<T>) => Handler;
