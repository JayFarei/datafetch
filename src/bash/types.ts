export type BashExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type BashLikeSession = {
  exec(command: string): Promise<BashExecResult>;
  flushLib(): Promise<void>;
};

export type BashRuntimeKind = "just-bash" | "mirage";

export function resolveBashRuntimeKind(value?: string): BashRuntimeKind {
  if (value === "mirage") return "mirage";
  return "just-bash";
}
