type LoggingEnvironment = Partial<
  Pick<NodeJS.ProcessEnv, "ALCHEMY_DEV" | "NODE_ENV" | "LOG_FORMAT">
>;

export function resolveLogEnvironment(env: LoggingEnvironment): string {
  if (env.LOG_FORMAT === "pretty" || env.ALCHEMY_DEV === "true") return "development";
  return env.NODE_ENV ?? "development";
}
