import { Linter } from "eslint";

const VISIBLE_SETTERS = new Set([
  "setError",
  "setLocalError",
  "setSyncError",
  "setAuthError",
  "setOneCError",
  "setPhotoError",
  "setMessage",
  "setOneCNotice",
  "setNotice",
]);

const DATA_MUTATION_CALLEES = new Set([
  "sendPromotion",
  "onAdd",
  "saveOrder",
  "createOrder",
  "updateOrder",
  "onSave",
]);

const ERROR_OBJECT_RE =
  /^(error|err|loadError|saveError|deleteError|pickError|registrationError|changeError|sessionError|downloadError|createError|cleanupError|restoreError|searchError|selectError|addError|linkError|testError|previewError|actionError|removeError)$/;

function isTCallee(node) {
  return node?.type === "Identifier" && node.name === "t";
}

function isTCall(node) {
  return node?.type === "CallExpression" && isTCallee(node.callee);
}

function containsTCall(node, seen = new Set()) {
  if (!node || typeof node !== "object") return false;
  if (seen.has(node)) return false;
  seen.add(node);
  if (isTCall(node)) return true;
  for (const [key, value] of Object.entries(node)) {
    if (
      key === "parent" ||
      key === "range" ||
      key === "loc" ||
      key === "tokens" ||
      key === "comments" ||
      key === "leadingComments" ||
      key === "trailingComments"
    ) {
      continue;
    }
    if (!value || typeof value !== "object") continue;
    if (Array.isArray(value)) {
      if (value.some((item) => containsTCall(item, seen))) return true;
    } else if (typeof value.type === "string" && containsTCall(value, seen)) {
      return true;
    }
  }
  return false;
}

function calleeName(node) {
  if (!node) return "";
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression" && !node.computed) {
    if (node.object?.type === "Identifier" && node.object.name === "api") {
      return node.property?.name || "";
    }
    return node.property?.name || "";
  }
  return "";
}

function isMessageMember(node) {
  return (
    node?.type === "MemberExpression" &&
    !node.computed &&
    node.property?.name === "message"
  );
}

function messageRootName(node) {
  if (!isMessageMember(node)) return "";
  let current = node.object;
  while (current?.type === "MemberExpression" && !current.computed) {
    current = current.object;
  }
  return current?.type === "Identifier" ? current.name : "";
}

function messagePath(node) {
  if (!isMessageMember(node)) return "";
  const parts = ["message"];
  let current = node.object;
  while (current) {
    if (current.type === "Identifier") {
      parts.unshift(current.name);
      break;
    }
    if (current.type === "MemberExpression" && !current.computed && current.property?.name) {
      parts.unshift(current.property.name);
      current = current.object;
      continue;
    }
    break;
  }
  return parts.join(".");
}

function objectKeyName(node) {
  if (!node) return "";
  if (node.type === "Identifier") return node.name;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  return "";
}

function locOf(node) {
  return node?.loc?.start?.line || 0;
}

function walkLogicalOrT(node) {
  if (!node) return false;
  if (isTCall(node)) return true;
  if (node.type === "LogicalExpression" || node.type === "ConditionalExpression") {
    return walkLogicalOrT(node.left) || walkLogicalOrT(node.right) || walkLogicalOrT(node.consequent) || walkLogicalOrT(node.alternate);
  }
  return false;
}

function isFileNameOrT(node) {
  if (!node || node.type !== "LogicalExpression" || node.operator !== "||") return false;
  const left = node.left;
  const rightIsT = walkLogicalOrT(node.right);
  const leftIsFileName =
    left?.type === "MemberExpression" &&
    !left.computed &&
    left.property?.name === "name" &&
    left.object?.type === "Identifier" &&
    left.object.name === "file";
  return leftIsFileName && rightIsT;
}

function isReasonOrErrorIdent(node) {
  return node?.type === "Identifier" && (node.name === "reason" || node.name === "error");
}

function exprMentionsReasonOrError(node) {
  if (!node || typeof node !== "object") return false;
  if (isReasonOrErrorIdent(node)) return true;
  if (node.type === "LogicalExpression" || node.type === "ConditionalExpression") {
    return (
      exprMentionsReasonOrError(node.left) ||
      exprMentionsReasonOrError(node.right) ||
      exprMentionsReasonOrError(node.consequent) ||
      exprMentionsReasonOrError(node.alternate)
    );
  }
  if (node.type === "CallExpression") {
    return (node.arguments || []).some(exprMentionsReasonOrError) || exprMentionsReasonOrError(node.callee);
  }
  if (node.type === "MemberExpression") {
    return exprMentionsReasonOrError(node.object);
  }
  return false;
}

function unwrapTrimCall(node) {
  if (
    node?.type === "CallExpression" &&
    node.callee?.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.property?.name === "trim"
  ) {
    return node.callee.object;
  }
  return node;
}

function isStringCoerceOfReasonOrError(node) {
  const target = unwrapTrimCall(node);
  return (
    target?.type === "CallExpression" &&
    target.callee?.type === "Identifier" &&
    target.callee.name === "String" &&
    exprMentionsReasonOrError(target.arguments?.[0])
  );
}

export function scanStage32Display(code, filename = "fixture.jsx") {
  const findings = {
    parseError: "",
    translatedDataFlows: [],
    translatedPayloadFlows: [],
    rawErrorDisplays: [],
    resultMessageDisplays: [],
    rawDiagnosticReturns: [],
  };

  const translatedState = new Set();
  const translatedPhotoVars = new Set();
  const rawDiagnosticIdents = new Set();

  const linter = new Linter({ configType: "flat" });
  const messages = linter.verify(
    code,
    [
      {
        files: ["**/*.{js,jsx}"],
        languageOptions: {
          ecmaVersion: 2022,
          sourceType: "module",
          parserOptions: { ecmaFeatures: { jsx: true } },
        },
        plugins: {
          stage32: {
            rules: {
              scan: {
                create(context) {
                  const sourceCode = context.sourceCode;
                  function snippet(node) {
                    try {
                      return sourceCode.getText(node).slice(0, 220);
                    } catch {
                      return "";
                    }
                  }

                  function recordRaw(node, kind) {
                    const root = messageRootName(node);
                    const path = messagePath(node);
                    findings.rawErrorDisplays.push({
                      kind,
                      root,
                      path,
                      line: locOf(node),
                      text: snippet(node.parent || node),
                    });
                  }

                  function recordResult(node, kind) {
                    findings.resultMessageDisplays.push({
                      kind,
                      path: messagePath(node),
                      line: locOf(node),
                      text: snippet(node.parent || node),
                    });
                  }

                  function inspectMessageSink(valueNode, kind) {
                    if (!valueNode) return;
                    if (isMessageMember(valueNode)) {
                      const path = messagePath(valueNode);
                      if (path.endsWith(".message") && /^(result|response|payload)\b/.test(path)) {
                        recordResult(valueNode, kind);
                        return;
                      }
                      if (ERROR_OBJECT_RE.test(messageRootName(valueNode)) || /Error$/.test(messageRootName(valueNode))) {
                        recordRaw(valueNode, kind);
                      }
                      return;
                    }
                    if (valueNode.type === "LogicalExpression") {
                      inspectMessageSink(valueNode.left, kind);
                      inspectMessageSink(valueNode.right, kind);
                    }
                    if (valueNode.type === "ConditionalExpression") {
                      inspectMessageSink(valueNode.consequent, kind);
                      inspectMessageSink(valueNode.alternate, kind);
                    }
                    if (valueNode.type === "TemplateLiteral") {
                      for (const expr of valueNode.expressions || []) {
                        inspectMessageSink(expr, kind);
                      }
                    }
                    if (valueNode.type === "ObjectExpression") {
                      for (const prop of valueNode.properties || []) {
                        if (prop.type !== "Property") continue;
                        if (objectKeyName(prop.key) === "message") {
                          inspectMessageSink(prop.value, kind);
                        }
                      }
                    }
                    if (valueNode.type === "CallExpression" && isTCall(valueNode)) {
                      for (const arg of valueNode.arguments || []) {
                        if (arg?.type === "ObjectExpression") {
                          for (const prop of arg.properties || []) {
                            if (prop.type !== "Property") continue;
                            if (objectKeyName(prop.key) === "message") {
                              inspectMessageSink(prop.value, `${kind}-t-interpolation`);
                            }
                          }
                        }
                      }
                    }
                  }

                  return {
                    VariableDeclarator(node) {
                      if (node.id?.type === "Identifier" && isStringCoerceOfReasonOrError(node.init)) {
                        rawDiagnosticIdents.add(node.id.name);
                      }
                      const init = node.init;
                      if (
                        init?.type === "CallExpression" &&
                        init.callee?.type === "Identifier" &&
                        init.callee.name === "useState"
                      ) {
                        const first = init.arguments?.[0];
                        const initHasT =
                          isTCall(first) ||
                          (first?.type === "ArrowFunctionExpression" && containsTCall(first.body));
                        if (initHasT && node.id?.type === "ArrayPattern") {
                          const stateId = node.id.elements?.[0];
                          if (stateId?.type === "Identifier") translatedState.add(stateId.name);
                        }
                      }
                      if (node.id?.type === "Identifier" && init && isFileNameOrT(init)) {
                        translatedPhotoVars.add(node.id.name);
                      }
                      if (
                        node.id?.type === "Identifier" &&
                        init?.type === "ObjectExpression" &&
                        (init.properties || []).some(
                          (prop) =>
                            prop.type === "Property" &&
                            objectKeyName(prop.key) === "name" &&
                            (isFileNameOrT(prop.value) || walkLogicalOrT(prop.value))
                        )
                      ) {
                        translatedPhotoVars.add(node.id.name);
                      }
                    },
                    ObjectExpression(node) {
                      for (const prop of node.properties || []) {
                        if (prop.type !== "Property") continue;
                        if (objectKeyName(prop.key) !== "name") continue;
                        if (isFileNameOrT(prop.value) || (walkLogicalOrT(prop.value) && /file\.name/.test(snippet(prop)))) {
                          findings.translatedPayloadFlows.push({
                            kind: "photo-name-t",
                            line: locOf(prop),
                            text: snippet(prop),
                          });
                        }
                      }
                    },
                    ReturnStatement(node) {
                      const arg = node.argument;
                      if (arg?.type === "Identifier" && rawDiagnosticIdents.has(arg.name)) {
                        findings.rawDiagnosticReturns.push({
                          kind: "raw-diagnostic-return",
                          ident: arg.name,
                          line: locOf(node),
                          text: snippet(node),
                        });
                      }
                    },
                    JSXExpressionContainer(node) {
                      inspectMessageSink(node.expression, "jsx-expression");
                    },
                    CallExpression(node) {
                      const name = calleeName(node.callee);
                      if (isTCall(node)) {
                        for (const arg of node.arguments || []) {
                          if (arg?.type === "ObjectExpression") {
                            for (const prop of arg.properties || []) {
                              if (prop.type !== "Property") continue;
                              if (objectKeyName(prop.key) === "message") {
                                inspectMessageSink(prop.value, "t-interpolation");
                              }
                            }
                          }
                        }
                      }
                      if (name === "push") {
                        for (const arg of node.arguments || []) inspectMessageSink(arg, "push");
                      }
                      if (VISIBLE_SETTERS.has(name)) {
                        for (const arg of node.arguments || []) inspectMessageSink(arg, name);
                      }
                      if (name === "appAlert" || name === "appConfirm") {
                        for (const arg of node.arguments || []) inspectMessageSink(arg, name);
                      }
                      if (DATA_MUTATION_CALLEES.has(name) || (node.callee?.type === "MemberExpression" && node.callee.object?.name === "api")) {
                        for (const arg of node.arguments || []) {
                          if (arg?.type === "Identifier" && translatedState.has(arg.name)) {
                            findings.translatedDataFlows.push({
                              kind: "useState-t-to-api",
                              callee: name,
                              ident: arg.name,
                              line: locOf(node),
                              text: snippet(node),
                            });
                          }
                          if (arg?.type === "Identifier" && translatedPhotoVars.has(arg.name)) {
                            findings.translatedPayloadFlows.push({
                              kind: "photo-var-to-callback",
                              callee: name,
                              ident: arg.name,
                              line: locOf(node),
                              text: snippet(node),
                            });
                          }
                          if (arg?.type === "ObjectExpression") {
                            for (const prop of arg.properties || []) {
                              if (prop.type !== "Property") continue;
                              if (objectKeyName(prop.key) === "photo" && prop.value?.type === "Identifier" && translatedPhotoVars.has(prop.value.name)) {
                                findings.translatedPayloadFlows.push({
                                  kind: "photo-object-to-onAdd",
                                  callee: name,
                                  ident: prop.value.name,
                                  line: locOf(node),
                                  text: snippet(node),
                                });
                              }
                              if (isTCall(prop.value) || walkLogicalOrT(prop.value)) {
                                if (objectKeyName(prop.key) === "photo" || objectKeyName(prop.key) === "name") {
                                  findings.translatedPayloadFlows.push({
                                    kind: "translated-field-to-callback",
                                    callee: name,
                                    prop: objectKeyName(prop.key),
                                    line: locOf(node),
                                    text: snippet(prop),
                                  });
                                }
                              }
                            }
                          }
                        }
                      }
                    },
                  };
                },
              },
            },
          },
        },
        rules: { "stage32/scan": "error" },
      },
    ],
    { filename }
  );

  const fatal = messages.find((m) => m.fatal);
  if (fatal) findings.parseError = fatal.message || "parse error";
  return findings;
}
