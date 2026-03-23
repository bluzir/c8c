#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"
import ts from "typescript"

const repoRoot = process.cwd()
const rendererRoot = path.join(repoRoot, "src", "renderer")

const bannedTerms = [
  { regex: /\bworkflow(s)?\b/i, suggestion: "flow / flows" },
  { regex: /\bprocess(es)?\b/i, suggestion: "flow / flows" },
  { regex: /\bchain(s)?\b/i, suggestion: "flow / flows" },
  { regex: /\bstage(s)?\b/i, suggestion: "step / steps" },
  { regex: /\bphase(s)?\b/i, suggestion: "step / steps" },
  { regex: /\bgate(s)?\b/i, suggestion: "check / approval" },
  { regex: /\bartifact(s)?\b/i, suggestion: "result / results" },
  { regex: /\btemplate(s)?\b/i, suggestion: "starting point / library" },
  { regex: /\bcapabilit(?:y|ies)\b/i, suggestion: "skill / skills" },
  { regex: /\bfactor(?:y|ies)\b/i, suggestion: "lab / labs" },
  { regex: /\bcase(s)?\b/i, suggestion: "track / tracks" },
]

const userFacingAttributes = new Set([
  "aria-label",
  "ariaLabel",
  "confirmLabel",
  "description",
  "eyebrow",
  "helperText",
  "hint",
  "label",
  "placeholder",
  "prompt",
  "searchAriaLabel",
  "searchPlaceholder",
  "subtitle",
  "summary",
  "title",
  "warning",
])

const userFacingPropertyNames = new Set([
  "confirmLabel",
  "description",
  "detailSummary",
  "eyebrow",
  "helperText",
  "hint",
  "label",
  "message",
  "placeholder",
  "subtitle",
  "summary",
  "title",
  "warning",
])

const userFacingVariablePattern =
  /(title|label|description|summary|subtitle|placeholder|warning|hint|message|eyebrow|helperText)$/i
const copyReturnFilePattern =
  /src[\\/]renderer[\\/]lib[\\/](workflow-entry|workflow-mutations|result-mode-factory|runtime-card-copy|runtime-flow-labels|process-spine|chat-tool-summary)\.ts$/i
const copyPushVariablePattern =
  /(summaryParts|labels|labelParts|descriptions|hints|warnings|messages|titles|subtitles)$/i
const userFacingSetterPattern =
  /^set(?:.*(?:Error|Message|Warning|Hint|Title|Subtitle|Label|Summary)|Error)$/i

function walkFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const nextPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkFiles(nextPath))
      continue
    }
    if (
      entry.isFile() &&
      /\.(ts|tsx)$/.test(entry.name) &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".test.tsx")
    ) {
      files.push(nextPath)
    }
  }

  return files
}

function lineAndColumn(sourceFile, position) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(position)
  return { line: line + 1, column: character + 1 }
}

function textForNode(node) {
  if (ts.isJsxText(node)) return node.getText()
  if (ts.isStringLiteralLike(node)) return node.text
  if (ts.isTemplateExpression(node)) {
    return [
      node.head.text,
      ...node.templateSpans.map((span) => span.literal.text),
    ].join("")
  }
  return ""
}

function normalizedText(value) {
  return value.replace(/\s+/g, " ").trim()
}

function attributeNameFromParent(node) {
  if (!ts.isJsxAttribute(node.parent)) return null
  return node.parent.name.getText()
}

function propertyName(node) {
  if (!ts.isPropertyAssignment(node.parent)) return null
  const nameNode = node.parent.name
  if (ts.isIdentifier(nameNode) || ts.isStringLiteral(nameNode))
    return nameNode.text
  return null
}

function variableName(node) {
  if (!ts.isVariableDeclaration(node.parent)) return null
  return ts.isIdentifier(node.parent.name) ? node.parent.name.text : null
}

function calleeText(node) {
  return ts.isCallExpression(node.parent)
    ? node.parent.expression.getText()
    : null
}

function isToastArgument(node) {
  if (!ts.isCallExpression(node.parent)) return false
  const parent = node.parent
  if (parent.arguments[0] !== node) return false
  const expression = parent.expression.getText()
  return /^toast\.(success|error|warning|info|loading)$/.test(expression)
}

function isConfirmDiscardArgument(node) {
  if (!ts.isCallExpression(node.parent)) return false
  const parent = node.parent
  return (
    parent.arguments[0] === node &&
    parent.expression.getText() === "confirmDiscard"
  )
}

function isStringInUserFacingProperty(node) {
  const propName = propertyName(node)
  return propName ? userFacingPropertyNames.has(propName) : false
}

function isStringInUserFacingVariable(node) {
  const name = variableName(node)
  return name ? userFacingVariablePattern.test(name) : false
}

function isCopyPush(node) {
  if (!ts.isCallExpression(node.parent)) return false
  const call = node.parent
  if (
    call.arguments[0] !== node ||
    !ts.isPropertyAccessExpression(call.expression)
  )
    return false
  if (call.expression.name.text !== "push") return false
  return copyPushVariablePattern.test(call.expression.expression.getText())
}

function isUserFacingSetterArgument(node) {
  if (!ts.isCallExpression(node.parent)) return false
  const call = node.parent
  if (call.arguments[0] !== node) return false
  return (
    ts.isIdentifier(call.expression) &&
    userFacingSetterPattern.test(call.expression.text)
  )
}

function userFacingContext(node, relativePath) {
  if (ts.isJsxText(node)) return "jsx-text"

  const attrName = attributeNameFromParent(node)
  if (attrName && userFacingAttributes.has(attrName)) return "jsx-attr"

  if (isToastArgument(node)) return "toast"
  if (isConfirmDiscardArgument(node)) return "confirm-discard"
  if (isUserFacingSetterArgument(node)) return "setter"
  if (isStringInUserFacingProperty(node)) return "property"
  if (isStringInUserFacingVariable(node)) return "variable"
  if (isCopyPush(node)) return "copy-push"

  for (let current = node.parent; current; current = current.parent) {
    if (
      ts.isReturnStatement(current) &&
      copyReturnFilePattern.test(relativePath)
    )
      return "copy-return"
  }

  return null
}

function looksLikeInternalToken(rawText, value) {
  const trimmedRaw = rawText.trim()
  if (!trimmedRaw) return false
  if (/\$\{/.test(trimmedRaw)) return true
  if (
    !/\s/.test(value) &&
    /^[a-z0-9._:/-]+$/i.test(value) &&
    value === value.toLowerCase()
  )
    return true
  return false
}

function findTerm(value) {
  for (const term of bannedTerms) {
    const match = value.match(term.regex)
    if (match) {
      return {
        matched: match[0],
        suggestion: term.suggestion,
      }
    }
  }
  return null
}

function collectViolations(filePath) {
  const sourceText = fs.readFileSync(filePath, "utf8")
  const relativePath = path.relative(repoRoot, filePath)
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const violations = []

  function visit(node) {
    if (
      ts.isJsxText(node) ||
      ts.isStringLiteralLike(node) ||
      ts.isTemplateExpression(node)
    ) {
      const rawText = textForNode(node)
      const value = normalizedText(rawText)
      const context = userFacingContext(node, relativePath)
      if (value && context) {
        if (
          (context === "copy-return" ||
            context === "copy-push" ||
            context === "property" ||
            context === "variable") &&
          looksLikeInternalToken(rawText, value)
        ) {
          ts.forEachChild(node, visit)
          return
        }
        const found = findTerm(value)
        if (found) {
          const { line, column } = lineAndColumn(
            sourceFile,
            node.getStart(sourceFile),
          )
          violations.push({
            file: relativePath,
            line,
            column,
            context,
            matched: found.matched,
            suggestion: found.suggestion,
            value,
          })
        }
      }
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return violations
}

const files = walkFiles(rendererRoot)
const violations = files.flatMap((filePath) => collectViolations(filePath))

if (violations.length === 0) {
  console.log("Canon vocabulary check passed.")
  process.exit(0)
}

console.error("Canon vocabulary violations found:\n")
for (const violation of violations) {
  console.error(`${violation.file}:${violation.line}:${violation.column}`)
  console.error(`  term: ${violation.matched}`)
  console.error(`  text: ${violation.value}`)
  console.error(`  use: ${violation.suggestion}\n`)
}

process.exit(1)
