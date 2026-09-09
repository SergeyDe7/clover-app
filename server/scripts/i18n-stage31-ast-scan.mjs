import { Linter } from "eslint";

const AUTHORITY_PROP_NAMES = new Set([
  "deliveryNote",
  "category",
  "subcategory",
  "facet",
  "unit",
  "uom",
  "oneCCode",
  "oneCId",
  "reason",
  "status",
  "statusFilter",
  "exchangeFilter",
  "visibility",
  "mode",
  "tab",
  "view",
  "sort",
  "contactLabel",
  "addressLabel",
  "clientName",
  "counterparty",
  "deliveryOneCName",
  "storefrontName",
]);

const AUTHORITY_CALLEE_NAMES = new Set([
  "setFilter",
  "setStatus",
  "setStatusFilter",
  "setExchangeFilter",
  "setTab",
  "setView",
  "setMode",
  "setSort",
  "setVisibility",
  "setCategory",
  "setActiveCategory",
  "selectLinkFilter",
  "selectGroup",
  "onSave",
  "saveOrder",
  "createOrder",
  "updateOrder",
]);

const HOOK_NAMES = new Set(["useEffect", "useMemo", "useCallback"]);
const GENERIC_KEY = /^(shared|auth|storefront|client|manager|admin)\.(text|label|message)\d*$/;

function isTCallee(node) {
  return node?.type === "Identifier" && node.name === "t";
}

function staticString(node) {
  if (!node) return null;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0]?.value?.cooked ?? "";
  }
  return null;
}

function objectKeyName(node) {
  if (!node) return "";
  if (node.type === "Identifier") return node.name;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  return "";
}

function identUsesT(node) {
  if (!node) return false;
  if (node.type === "Identifier") return node.name === "t";
  return false;
}

function collectTFromPattern(node, out) {
  if (!node) return;
  if (node.type === "Identifier" && node.name === "t") out.add("t");
  if (node.type === "ObjectPattern") {
    for (const prop of node.properties || []) {
      collectTFromPattern(prop.value || prop.argument || prop.key, out);
    }
  }
  if (node.type === "ArrayPattern") {
    for (const el of node.elements || []) collectTFromPattern(el, out);
  }
}

export function scanSource(code, filename = "fixture.jsx") {
  const findings = {
    tCalls: [],
    unboundedT: [],
    genericKeys: [],
    authorityUnsafe: [],
    optionWithoutValue: [],
    optionTranslatedValue: [],
    templates: [],
    concatenations: [],
    jsxTexts: [],
    hookMissingT: [],
    foreignActivation: [],
    parseError: "",
  };

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
          stage31: {
            rules: {
              scan: {
                create(context) {
                  const sourceCode = context.sourceCode;
                  function locOf(node) {
                    return node.loc?.start?.line || 0;
                  }
                  function snippet(node) {
                    try {
                      return sourceCode.getText(node).slice(0, 180);
                    } catch {
                      return "";
                    }
                  }
                  function isTCall(node) {
                    return node?.type === "CallExpression" && isTCallee(node.callee);
                  }
                  function walkContainsTIdent(node, seen = new Set()) {
                    if (!node || typeof node !== "object") return false;
                    if (seen.has(node)) return false;
                    seen.add(node);
                    if (identUsesT(node)) return true;
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
                        if (value.some((item) => walkContainsTIdent(item, seen))) return true;
                      } else if (typeof value.type === "string" && walkContainsTIdent(value, seen)) {
                        return true;
                      }
                    }
                    return false;
                  }
                  function depsIncludeT(depsNode) {
                    if (!depsNode || depsNode.type !== "ArrayExpression") return false;
                    return (depsNode.elements || []).some((el) => identUsesT(el));
                  }
                  return {
                    CallExpression(node) {
                      if (!isTCall(node)) {
                        if (
                          node.callee?.type === "Identifier" &&
                          AUTHORITY_CALLEE_NAMES.has(node.callee.name)
                        ) {
                          for (const arg of node.arguments || []) {
                            if (isTCall(arg) || (arg?.type === "ObjectExpression" && (arg.properties || []).some((p) => isTCall(p.value)))) {
                              findings.authorityUnsafe.push({
                                kind: "callback-arg",
                                line: locOf(node),
                                text: snippet(node),
                              });
                            }
                          }
                        }
                        if (HOOK_NAMES.has(node.callee?.name) && node.arguments?.[0]) {
                          const fn = node.arguments[0];
                          const deps = node.arguments[1];
                          const usesT = walkContainsTIdent(fn);
                          if (usesT && !depsIncludeT(deps)) {
                            findings.hookMissingT.push({
                              hook: node.callee.name,
                              line: locOf(node),
                              text: snippet(node).slice(0, 120),
                            });
                          }
                        }
                        return;
                      }
                      const arg0 = node.arguments[0];
                      const key = staticString(arg0);
                      const line = locOf(node);
                      if (key == null) {
                        findings.unboundedT.push({ line, text: snippet(node) });
                      } else {
                        findings.tCalls.push({ key, line, text: snippet(node) });
                        if (GENERIC_KEY.test(key)) {
                          findings.genericKeys.push({ key, line });
                        }
                      }
                      const parent = node.parent;
                      if (parent?.type === "Property" && isTCall(node)) {
                        const name = objectKeyName(parent.key);
                        if (AUTHORITY_PROP_NAMES.has(name)) {
                          findings.authorityUnsafe.push({
                            kind: "object-prop",
                            prop: name,
                            line,
                            text: snippet(parent),
                          });
                        }
                      }
                    },
                    JSXOpeningElement(node) {
                      if (node.name?.type === "JSXIdentifier" && node.name.name === "LocalizationProvider") {
                        for (const attr of node.attributes || []) {
                          if (attr.type === "JSXSpreadAttribute") {
                            findings.foreignActivation.push({
                              kind: "jsx-spread",
                              line: locOf(node),
                              text: snippet(node),
                            });
                          }
                          if (
                            attr.type === "JSXAttribute" &&
                            attr.name?.name === "allowForeignRuntime" &&
                            attr.value !== false
                          ) {
                            const raw = attr.value == null ? true : staticString(attr.value.expression || attr.value);
                            if (raw !== "false" && raw !== false) {
                              findings.foreignActivation.push({
                                kind: "jsx-prop",
                                line: locOf(node),
                                text: snippet(node),
                              });
                            }
                          }
                          if (
                            attr.type === "JSXAttribute" &&
                            (attr.name?.name === "locale" || attr.name?.name === "language")
                          ) {
                            const loc = staticString(attr.value?.expression || attr.value);
                            if (loc && loc !== "ru") {
                              findings.foreignActivation.push({
                                kind: "jsx-locale",
                                line: locOf(node),
                                text: snippet(node),
                              });
                            }
                          }
                        }
                      }
                      if (node.name?.type !== "JSXIdentifier" || node.name.name !== "option") return;
                      const valueAttr = (node.attributes || []).find(
                        (attr) =>
                          attr.type === "JSXAttribute" &&
                          attr.name?.name === "value"
                      );
                      if (!valueAttr) {
                        findings.optionWithoutValue.push({
                          line: locOf(node),
                          text: snippet(node),
                        });
                      } else if (isTCall(valueAttr.value?.expression)) {
                        findings.optionTranslatedValue.push({
                          line: locOf(node),
                          text: snippet(node),
                        });
                      }
                    },
                    JSXText(node) {
                      const value = String(node.value || "").replace(/\s+/g, " ").trim();
                      if (value) {
                        findings.jsxTexts.push({
                          line: locOf(node),
                          text: value,
                        });
                      }
                    },
                    TemplateLiteral(node) {
                      const raw = node.quasis.map((q) => q.value.cooked || "").join("${}");
                      findings.templates.push({
                        line: locOf(node),
                        raw,
                        text: snippet(node),
                      });
                    },
                    BinaryExpression(node) {
                      if (node.operator !== "+") return;
                      const left = staticString(node.left);
                      const right = staticString(node.right);
                      const blob = `${left || ""}${right || ""}`;
                      if (/[А-Яа-яЁё]/.test(blob) || /[А-Яа-яЁё]/.test(snippet(node))) {
                        findings.concatenations.push({
                          line: locOf(node),
                          text: snippet(node),
                        });
                      }
                    },
                    VariableDeclarator(node) {
                      collectTFromPattern(node.id, new Set());
                    },
                    Property(node) {
                      if (objectKeyName(node.key) !== "allowForeignRuntime") return;
                      const value = staticString(node.value);
                      if (node.value?.type === "Literal" && node.value.value === true) {
                        findings.foreignActivation.push({
                          kind: "object-prop",
                          line: locOf(node),
                          text: snippet(node),
                        });
                      } else if (value === "true") {
                        findings.foreignActivation.push({
                          kind: "object-prop",
                          line: locOf(node),
                          text: snippet(node),
                        });
                      } else if (node.value && node.value.type !== "Literal") {
                        findings.foreignActivation.push({
                          kind: "dynamic-allowForeignRuntime",
                          line: locOf(node),
                          text: snippet(node),
                        });
                      }
                    },
                    SpreadElement(node) {
                      const parent = node.parent;
                      if (parent?.type === "ObjectExpression") {
                        const call = parent.parent;
                        if (
                          call?.type === "CallExpression" &&
                          call.callee?.type === "Identifier" &&
                          call.callee.name === "createLocalizationRuntime"
                        ) {
                          findings.foreignActivation.push({
                            kind: "runtime-spread",
                            line: locOf(node),
                            text: snippet(call),
                          });
                        }
                      }
                    },
                  };
                },
              },
            },
          },
        },
        rules: { "stage31/scan": "error" },
      },
    ],
    { filename }
  );

  const fatal = messages.find((m) => m.fatal);
  if (fatal) findings.parseError = fatal.message || "parse error";
  return findings;
}

export function catalogKeyFromTCall(call) {
  return call?.key || "";
}

export { GENERIC_KEY, AUTHORITY_PROP_NAMES, AUTHORITY_CALLEE_NAMES };
