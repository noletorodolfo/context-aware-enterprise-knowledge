#!/usr/bin/env bash
# Runs `terraform plan` or `plan` + `apply` for infra/terraform/envs/dev in GitHub Actions without
# printing anything that could identify the partner tenant (Phase 4 D3):
# - every quoted value of the tfvars/backend secrets and every output of the identity state is masked
#   before Terraform runs;
# - Terraform output goes to files; only `Error:` blocks (masked) and a value-free summary are shown.
# Requires: azure/login done, ARM_* OIDC variables set, secrets TF_VARS_DEV and TF_BACKEND_DEV.
set -euo pipefail

mode="${1:?usage: terraform-ci.sh plan|apply}"
root="infra/terraform/envs/dev"
out="${RUNNER_TEMP:-/tmp}/terraform"
mkdir -p "$out"

mask() {
  while IFS= read -r value; do
    if [ "${#value}" -ge 4 ]; then echo "::add-mask::$value"; fi
  done
}
quoted_values() { { grep -oE '"[^"]+"' "$1" || true; } | tr -d '"' | sort -u; }

run() {
  local log="$1"
  shift
  if ! "$@" >"$log" 2>&1; then
    echo "::error::terraform ${mode} failed; masked error blocks follow"
    grep -A15 '^Error:' "$log" || echo "(no Error: block found; the full log is not printed on purpose)"
    exit 1
  fi
}

printf '%s\n' "$TF_VARS_DEV" >"$root/terraform.tfvars"
printf '%s\n' "$TF_BACKEND_DEV" >"$root/backend.hcl"
quoted_values "$root/terraform.tfvars" | mask
quoted_values "$root/backend.hcl" | mask

# The Azure root reads the partner app's IDs from the identity state; mask all of them.
account=$(sed -n 's/^ *storage_account_name *= *"\(.*\)" *$/\1/p' "$root/backend.hcl")
container=$(sed -n 's/^ *container_name *= *"\(.*\)" *$/\1/p' "$root/backend.hcl")
az storage blob download --auth-mode login --only-show-errors \
  --account-name "$account" --container-name "$container" \
  --name dev-identity.tfstate --file "$out/identity.tfstate" >/dev/null
jq -r '[.outputs[].value | .. | strings] | unique | .[]' "$out/identity.tfstate" | mask
rm -f "$out/identity.tfstate"

run "$out/init.log" terraform -chdir="$root" init -input=false -no-color \
  -backend-config=backend.hcl -backend-config=use_oidc=true
run "$out/plan.log" terraform -chdir="$root" plan -input=false -no-color -lock-timeout=5m -out=tfplan
terraform -chdir="$root" show -json tfplan >"$out/plan.json"
node scripts/plan-summary.mjs "$out/plan.json" >"$out/summary.md"
rm -f "$out/plan.json"

if [ "$mode" = "apply" ]; then
  run "$out/apply.log" terraform -chdir="$root" apply -input=false -no-color -lock-timeout=5m tfplan
fi

rm -f "$root/terraform.tfvars" "$root/backend.hcl" "$root/tfplan"
echo "summary=$out/summary.md" >>"${GITHUB_OUTPUT:-/dev/null}"
