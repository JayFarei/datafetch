import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";

export interface AgentRun {
  stdout: string;
  stderr: string;
  exitCode: number;
  elapsedMs: number;
  finalMessage: string;
  usage: {
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
  };
  totalCostUsd: number;
}

export function buildClaudeAgentArgs(input: {
  claudeBin: string;
  model: string;
  prompt: string;
  timeoutMs: number;
}): string[] {
  const isClaudeP = /(?:^|\/)claude-p$/.test(input.claudeBin);
  if (isClaudeP) {
    return [
      "--output-format", "json",
      "--model", input.model,
      "--dangerously-skip-permissions",
      "--timeout", String(Math.max(60, Math.ceil(input.timeoutMs / 1000))),
      input.prompt,
    ];
  }
  return [
    "--print",
    "--output-format", "json",
    "--model", input.model,
    "--dangerously-skip-permissions",
    "--no-session-persistence",
    input.prompt,
  ];
}

export function parseClaudeAgentStdout(stdout: string): Pick<
  AgentRun,
  "finalMessage" | "usage" | "totalCostUsd"
> {
  let finalMessage = "";
  const usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
  let totalCostUsd = 0;
  try {
    const parsed = JSON.parse(stdout) as Record<string, unknown>;
    const result = parsed["result"];
    if (typeof result === "string") {
      finalMessage = result;
    } else if (result !== undefined) {
      finalMessage = JSON.stringify(result);
    }
    const cost = parsed["total_cost_usd"];
    if (typeof cost === "number" && Number.isFinite(cost)) {
      totalCostUsd = cost;
    }
    const rawUsage = parsed["usage"];
    if (rawUsage && typeof rawUsage === "object") {
      const u = rawUsage as Record<string, unknown>;
      usage.inputTokens = numberField(u, "input_tokens");
      usage.cachedInputTokens =
        numberField(u, "cache_read_input_tokens") +
        numberField(u, "cache_creation_input_tokens");
      usage.outputTokens = numberField(u, "output_tokens");
    }
  } catch {
    finalMessage = stdout.trim();
  }
  return { finalMessage, usage, totalCostUsd };
}

export async function runClaudeAgent(input: {
  workspaceDir: string;
  prompt: string;
  model: string;
  baseDir: string;
  timeoutMs: number;
}): Promise<AgentRun> {
  const claudeBin = process.env["CLAUDE_CLI"] ?? "claude-p";
  const cliArgs = buildClaudeAgentArgs({
    claudeBin,
    model: input.model,
    prompt: input.prompt,
    timeoutMs: input.timeoutMs,
  });

  const started = performance.now();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATAFETCH_HOME: input.baseDir,
  };
  const run = await spawnProcess(claudeBin, cliArgs, {
    cwd: input.workspaceDir,
    env,
    timeoutMs: input.timeoutMs,
  });
  const elapsedMs = performance.now() - started;
  const parsed = parseClaudeAgentStdout(run.stdout);

  return {
    stdout: run.stdout,
    stderr: run.stderr,
    exitCode: run.exitCode,
    elapsedMs,
    finalMessage: parsed.finalMessage,
    usage: parsed.usage,
    totalCostUsd: parsed.totalCostUsd,
  };
}

function spawnProcess(
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; input?: string },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let timedOut = false;
    let closed = false;
    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGTERM");
          setTimeout(() => {
            if (!closed) child.kill("SIGKILL");
          }, 2_000).unref();
        }, options.timeoutMs)
      : undefined;
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: `${Buffer.concat(stderr).toString("utf8")}${String(err)}`,
        exitCode: 1,
      });
    });
    child.on("close", (code, signal) => {
      closed = true;
      if (timer) clearTimeout(timer);
      const sBuf = Buffer.concat(stderr).toString("utf8");
      resolve({
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: timedOut
          ? `${sBuf}\n[timed out after ${options.timeoutMs}ms signal=${signal ?? ""}]\n`
          : sBuf,
        exitCode: typeof code === "number" ? code : 1,
      });
    });
    if (options.input !== undefined) {
      child.stdin.end(options.input);
    } else {
      child.stdin.end();
    }
  });
}

function numberField(record: Record<string, unknown>, key: string): number {
  const v = record[key];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
