import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()

function replaceOrThrow(source, pattern, replacement, description) {
  if (source.includes(replacement)) {
    return source
  }

  if (!pattern.test(source)) {
    if (process.env.CI) {
      console.warn(
        `[patch-acp-stack] skipped: ${description} (pattern not found)`,
      )
      return source
    }
    throw new Error(`Could not find patch target: ${description}`)
  }

  return source.replace(pattern, replacement)
}

function patchFile(relativePath, patchers) {
  const filePath = join(root, relativePath)
  let source = readFileSync(filePath, "utf8")
  let changed = false

  for (const patcher of patchers) {
    const next = replaceOrThrow(
      source,
      patcher.pattern,
      patcher.replacement,
      `${relativePath} (${patcher.description})`,
    )
    if (next !== source) {
      changed = true
      source = next
    }
  }

  if (changed) {
    writeFileSync(filePath, source, "utf8")
    console.log(`[patch-acp-stack] patched ${relativePath}`)
  }
}

const tolerantFormatToolError = String.raw`function formatToolError(toolResult) {
  if (toolResult == null) return "Unknown tool error";
  if (typeof toolResult === "string") return toolResult || "Unknown tool error";
  if (!Array.isArray(toolResult)) {
    try {
      return JSON.stringify(toolResult);
    } catch {
      return String(toolResult);
    }
  }
  if (toolResult.length === 0) return "Unknown tool error";
  const parts = [];
  for (const blk of toolResult) {
    if (blk?.type === "content" && blk.content?.type === "text") {
      parts.push(blk.content.text);
      continue;
    }
    if (blk?.type === "text" && typeof blk.text === "string") {
      parts.push(blk.text);
    }
  }
  if (parts.length > 0) {
    return parts.join("\\n");
  }
  try {
    return JSON.stringify(toolResult);
  } catch {
    return String(toolResult);
  }
}`

const gatedMissingAuthWarning = String.raw`      if (!this.config.authMethodId || !validAuthMethods) {
        if (process.env.ACP_AI_PROVIDER_WARN_MISSING_AUTH_METHOD !== "0") {
          console.log("[acp-ai-provider] Warning: No authMethodId specified in config, skipping authentication step. If this is not desired, please set one of the authMethodId in the ACPProviderSettings.", JSON.stringify(initResult.authMethods, null, 2));
        }
      }`

const tolerantSessionUpdateHandler = String.raw`case schema.CLIENT_METHODS.session_update: {
                    try {
                        const validatedParams = validate.zSessionNotification.parse(params);
                        return client.sessionUpdate(validatedParams);
                    }
                    catch (error) {
                        const update = params && typeof params === "object" ? params.update : undefined;
                        const sessionUpdate = update && typeof update === "object" ? update.sessionUpdate : undefined;
                        if (sessionUpdate === "usage_update" || sessionUpdate === "tool_call_update") {
                            return client.sessionUpdate(params);
                        }
                        throw error;
                    }
                }`

patchFile("node_modules/@mcpc-tech/acp-ai-provider/index.mjs", [
  {
    description: "tolerant formatToolError",
    pattern:
      /function formatToolError\(toolResult\) \{[\s\S]*?return parts\.join\("\\n"\);\n\}/,
    replacement: tolerantFormatToolError,
  },
  {
    description: "suppressible missing auth warning",
    pattern:
      /      if \(!this\.config\.authMethodId \|\| !validAuthMethods\) \{\n        console\.log\("\[acp-ai-provider\] Warning: No authMethodId specified in config, skipping authentication step\. If this is not desired, please set one of the authMethodId in the ACPProviderSettings\.", JSON\.stringify\(initResult\.authMethods, null, 2\)\);\n      \}/,
    replacement: gatedMissingAuthWarning,
  },
])

patchFile("node_modules/@mcpc-tech/acp-ai-provider/index.cjs", [
  {
    description: "tolerant formatToolError",
    pattern:
      /function formatToolError\(toolResult\) \{[\s\S]*?return parts\.join\("\\n"\);\n\}/,
    replacement: tolerantFormatToolError,
  },
  {
    description: "suppressible missing auth warning",
    pattern:
      /      if \(!this\.config\.authMethodId \|\| !validAuthMethods\) \{\n        console\.log\("\[acp-ai-provider\] Warning: No authMethodId specified in config, skipping authentication step\. If this is not desired, please set one of the authMethodId in the ACPProviderSettings\.", JSON\.stringify\(initResult\.authMethods, null, 2\)\);\n      \}/,
    replacement: gatedMissingAuthWarning,
  },
])

patchFile("node_modules/@agentclientprotocol/sdk/dist/acp.js", [
  {
    description: "tolerant session_update notification handler",
    pattern:
      /case schema\.CLIENT_METHODS\.session_update: \{\n\s+const validatedParams = validate\.zSessionNotification\.parse\(params\);\n\s+return client\.sessionUpdate\(validatedParams\);\n\s+\}/,
    replacement: tolerantSessionUpdateHandler,
  },
])
