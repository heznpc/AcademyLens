const { execFileSync } = require("node:child_process");

const REPO = process.env.ACADEMYLENS_GITHUB_REPO || "heznpc/AcademyLens";
const REQUIRED_RULESET_NAME = "Protect main release gate";
const REQUIRED_RULE_TYPES = ["deletion", "non_fast_forward", "pull_request", "required_status_checks"];
const REQUIRED_STATUS_CHECKS = ["verify", "Analyze JavaScript", "CodeQL"];
const REQUIRED_SECURITY_FEATURES = [
  "dependabot_security_updates",
  "secret_scanning",
  "secret_scanning_push_protection"
];
const OPTIONAL_SECURITY_FEATURES = ["secret_scanning_non_provider_patterns", "secret_scanning_validity_checks"];

function ghApi(path) {
  try {
    return JSON.parse(execFileSync("gh", ["api", path], { encoding: "utf8" }));
  } catch (error) {
    const stderr = error.stderr ? String(error.stderr) : "";
    throw new Error(`GitHub API request failed for ${path}\n${stderr}`.trim(), { cause: error });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function securityStatus(repo, key) {
  return repo.security_and_analysis && repo.security_and_analysis[key]
    ? repo.security_and_analysis[key].status
    : "missing";
}

function openAlerts(path) {
  return ghApi(`/repos/${REPO}/${path}?state=open`);
}

const repo = ghApi(`/repos/${REPO}`);

assert(repo.default_branch === "main", "Default branch must remain main");
assert(repo.delete_branch_on_merge === true, "delete_branch_on_merge must be enabled");
assert(repo.allow_update_branch === true, "allow_update_branch must be enabled");
assert(repo.allow_auto_merge === true, "allow_auto_merge must be enabled");

for (const feature of REQUIRED_SECURITY_FEATURES) {
  assert(securityStatus(repo, feature) === "enabled", `${feature} must be enabled`);
}

const rulesets = ghApi(`/repos/${REPO}/rulesets`).map((ruleset) => ghApi(`/repos/${REPO}/rulesets/${ruleset.id}`));
const releaseGateRuleset = rulesets.find((ruleset) => ruleset.name === REQUIRED_RULESET_NAME);

assert(releaseGateRuleset, `Missing ruleset: ${REQUIRED_RULESET_NAME}`);
assert(releaseGateRuleset.enforcement === "active", `${REQUIRED_RULESET_NAME} must be active`);
assert(releaseGateRuleset.target === "branch", `${REQUIRED_RULESET_NAME} must target branches`);
assert(
  releaseGateRuleset.conditions &&
    releaseGateRuleset.conditions.ref_name &&
    releaseGateRuleset.conditions.ref_name.include.includes("~DEFAULT_BRANCH"),
  `${REQUIRED_RULESET_NAME} must include the default branch`
);

const rules = new Map(releaseGateRuleset.rules.map((rule) => [rule.type, rule]));
for (const type of REQUIRED_RULE_TYPES) {
  assert(rules.has(type), `${REQUIRED_RULESET_NAME} missing rule: ${type}`);
}
assert(rules.has("required_linear_history"), `${REQUIRED_RULESET_NAME} missing rule: required_linear_history`);

const statusRule = rules.get("required_status_checks");
assert(
  statusRule.parameters && statusRule.parameters.strict_required_status_checks_policy === true,
  "Required status checks must be strict"
);
const statusContexts = new Set(
  (statusRule.parameters.required_status_checks || []).map((statusCheck) => statusCheck.context)
);
for (const context of REQUIRED_STATUS_CHECKS) {
  assert(statusContexts.has(context), `Required status check missing: ${context}`);
}

assert(openAlerts("code-scanning/alerts").length === 0, "Open CodeQL/code scanning alerts must be zero");
assert(openAlerts("dependabot/alerts").length === 0, "Open Dependabot alerts must be zero");
assert(openAlerts("secret-scanning/alerts").length === 0, "Open secret scanning alerts must be zero");

const disabledOptionalFeatures = OPTIONAL_SECURITY_FEATURES.filter(
  (feature) => securityStatus(repo, feature) !== "enabled"
);
if (disabledOptionalFeatures.length > 0) {
  console.log(`optional security features not enabled by GitHub: ${disabledOptionalFeatures.join(", ")}`);
}

console.log("github security checks ok");
