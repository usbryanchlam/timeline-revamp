# IAM for Instance Principal photos bucket access.
#
# Scope per CONTEXT D-05:
# - Dynamic group matches the SPECIFIC instance OCID (NOT compartment.id) so
#   the rule attaches to ONE instance. Future instances in the same compartment
#   do NOT auto-inherit photos access.
# - Policy statements scope `manage objects` and `read buckets` to the
#   photos bucket by name — the VM cannot touch any other bucket even within
#   the same compartment. See the two statement strings below.

resource "oci_identity_dynamic_group" "timeline_vm" {
  compartment_id = var.tenancy_ocid
  name           = "timeline-vm-dynamic-group"
  description    = "Matches the timeline-revamp Ampere A1 instance for Object Storage access"
  matching_rule  = "instance.id = '${oci_core_instance.timeline.id}'"

  lifecycle {
    ignore_changes = [defined_tags] # Pitfall 8
  }
}

resource "oci_identity_policy" "timeline_vm_photos" {
  compartment_id = var.compartment_ocid
  name           = "timeline-vm-photos-policy"
  description    = "Allow timeline VM to manage objects in the photos bucket"

  statements = [
    "Allow dynamic-group ${oci_identity_dynamic_group.timeline_vm.name} to manage objects in compartment id ${var.compartment_ocid} where target.bucket.name = '${oci_objectstorage_bucket.photos.name}'",
    "Allow dynamic-group ${oci_identity_dynamic_group.timeline_vm.name} to read buckets in compartment id ${var.compartment_ocid} where target.bucket.name = '${oci_objectstorage_bucket.photos.name}'"
  ]

  lifecycle {
    ignore_changes = [defined_tags] # Pitfall 8
  }
}

# --- OIDC Identity Propagation Trust (Plan 03) -------------------------------
#
# GitHub Actions ↔ OCI federation via OIDC token exchange. Two Service Users
# are impersonated based on the GitHub OIDC `sub` claim (D-19 two-identity
# pattern, mitigates Threat T-08.1-06 over-broad subject scope):
#
#   sub = "repo:usbryanchlam/timeline-revamp:ref:refs/heads/main"
#       → gha_deployer (manage all-resources in compartment)
#   sub = "repo:usbryanchlam/timeline-revamp:pull_request"
#       → gha_pr_reader (inspect + read object-family ONLY)
#
# Anti-Pattern: do NOT use the legacy SAML-federation resource from the v5-era
# IAM provider (the one whose type omits `_domains_` and ends in `_provider`).
# The modern Identity Domains stack uses
# `oci_identity_domains_identity_propagation_trust` exclusively.
#
# Pitfall 6: the Default Identity Domain MUST exist before first apply. Legacy
# tenancies (pre-2023 free tier) may not have one. Verify with
# `oci iam domain list --compartment-id $OCI_TENANCY_OCID` per DEPLOY.md
# Bootstrap.

data "oci_identity_domains" "default" {
  compartment_id = var.tenancy_ocid
  display_name   = "Default"
}

resource "oci_identity_domains_user" "gha_deployer" {
  # Provider v6.37.0 exposes Identity Domains under `domains` (NOT
  # `identity_domains` — RESEARCH Assumption A3/A10 field-name verification
  # confirmed against `terraform providers schema` at execution time).
  idcs_endpoint = data.oci_identity_domains.default.domains[0].url
  user_name     = "gha-deployer-timeline-revamp"

  name {
    family_name = "Deployer"
    given_name  = "Timeline-GHA"
  }
  emails {
    value   = "gha-deployer-noreply@bryanlam.dev"
    type    = "work"
    primary = true
  }

  schemas = ["urn:ietf:params:scim:schemas:core:2.0:User"]

  # NOTE: Pitfall-8 `ignore_changes = [defined_tags]` is omitted here on
  # purpose — Identity Domains (IDCS) resources do NOT expose `defined_tags`
  # in the provider schema (they use SCIM `tags` blocks instead). Terraform
  # validate would reject the attribute. The Pitfall-8 guard remains on
  # `oci_identity_policy` resources below, where the attribute exists.
}

resource "oci_identity_domains_user" "gha_pr_reader" {
  idcs_endpoint = data.oci_identity_domains.default.domains[0].url
  user_name     = "gha-pr-reader-timeline-revamp"

  name {
    family_name = "Reader"
    given_name  = "Timeline-GHA-PR"
  }
  emails {
    value   = "gha-pr-reader-noreply@bryanlam.dev"
    type    = "work"
    primary = true
  }

  schemas = ["urn:ietf:params:scim:schemas:core:2.0:User"]
}

resource "oci_identity_domains_identity_propagation_trust" "github_actions" {
  idcs_endpoint             = data.oci_identity_domains.default.domains[0].url
  name                      = "github-actions-timeline-revamp"
  description               = "OIDC trust for GitHub Actions workflows on usbryanchlam/timeline-revamp"
  active                    = true
  type                      = "JWT"
  account_id                = "usbryanchlam"
  issuer                    = "https://token.actions.githubusercontent.com"
  subject_type              = "User"
  subject_mapping_attribute = "sub"
  subject_claim_name        = "sub"

  # NOTE: oracle/oci v6.37.0 does NOT expose an `allowed_token_issuers` nested
  # block on this resource (RESEARCH Assumption A3 — field-name verification
  # via `terraform providers schema` at execution time). The `issuer` attribute
  # alone is the JWT issuer constraint; `impersonation_service_users.rule`
  # below provides the subject-claim narrowing.

  # D-19 two-identity pattern: tight OIDC subject scoping per Threat T-08.1-06.
  # Exact-string matches — NEVER widen to `repo:OWNER/REPO:*` or any wildcard.
  impersonation_service_users {
    rule  = "sub eq \"repo:usbryanchlam/timeline-revamp:ref:refs/heads/main\""
    value = oci_identity_domains_user.gha_deployer.id
  }
  impersonation_service_users {
    rule  = "sub eq \"repo:usbryanchlam/timeline-revamp:pull_request\""
    value = oci_identity_domains_user.gha_pr_reader.id
  }

  schemas = ["urn:ietf:params:scim:schemas:oracle:idcs:IdentityPropagationTrust"]
}

resource "oci_identity_policy" "gha_deployer_manage" {
  compartment_id = var.compartment_ocid
  name           = "gha-deployer-manage-policy"
  description    = "Allow GHA main-branch identity to manage all resources in the timeline compartment"

  statements = [
    "Allow any-user to manage all-resources in compartment id ${var.compartment_ocid} where request.principal.id = '${oci_identity_domains_user.gha_deployer.id}'"
  ]

  lifecycle {
    ignore_changes = [defined_tags] # Pitfall 8
  }
}

resource "oci_identity_policy" "gha_pr_reader_inspect" {
  compartment_id = var.compartment_ocid
  name           = "gha-pr-reader-inspect-policy"
  description    = "Allow GHA PR identity read-only inspect across the timeline compartment"

  statements = [
    "Allow any-user to inspect all-resources in compartment id ${var.compartment_ocid} where request.principal.id = '${oci_identity_domains_user.gha_pr_reader.id}'",
    "Allow any-user to read object-family in compartment id ${var.compartment_ocid} where request.principal.id = '${oci_identity_domains_user.gha_pr_reader.id}'"
  ]

  lifecycle {
    ignore_changes = [defined_tags] # Pitfall 8
  }
}
