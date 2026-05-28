# Photos bucket + CORS configuration.
#
# CORS is applied OUT-OF-BAND via `null_resource` + `aws s3api put-bucket-cors`
# against the OCI S3-compatibility endpoint. The `oci_objectstorage_bucket`
# resource has NO native nested-block for CORS (verified RESEARCH Pattern 4 +
# project memory `feedback_oci_cors_via_s3.md`). CONTEXT D-15's original
# "TF provider supports CORS natively" wording is INCORRECT and superseded by
# this file's null_resource path.

data "oci_objectstorage_namespace" "this" {
  compartment_id = var.tenancy_ocid
}

resource "oci_objectstorage_bucket" "photos" {
  compartment_id = var.compartment_ocid
  namespace      = data.oci_objectstorage_namespace.this.namespace
  name           = "timeline-photos"
  access_type    = "NoPublicAccess" # PARs minted per-object; no public list access
  versioning     = "Enabled"

  freeform_tags = {
    "managed-by"  = "terraform"
    "phase"       = "08.1"
    "environment" = "production"
  }

  lifecycle {
    ignore_changes = [defined_tags] # Pitfall 8 — silence Oracle-Tags drift
  }
}

# CORS via aws s3api against OCI S3-compat endpoint.
# - triggers.rules_hash re-runs the provisioner when the rules change.
# - triggers.bucket_id re-runs if the bucket is recreated.
# - AWS_REQUEST_CHECKSUM_CALCULATION=when_required is MANDATORY on AWS CLI
#   v2.23.5+ (Pitfall 9 + `feedback_oci_cors_via_s3.md`); OCI S3-compat rejects
#   the new default sha256 mode otherwise.
# - --cors-configuration is JSON-encoded with the AWS S3 API PascalCase key
#   `CORSRules` (the var.photos_cors_rules object fields already use the
#   PascalCase shape AllowedOrigins/AllowedMethods/AllowedHeaders/ExposeHeaders/
#   MaxAgeSeconds — see variables.tf).
# CORS configuration deferred — see CONTEXT.md D-15 + 08.1-HUMAN-UAT.md.
# Neither OCI S3-compat (returns 501 NotImplemented on PutBucketCors) nor OCI
# Native API (no corsRules field on bucket data model) currently support CORS
# configuration via Terraform. Set CORS via OCI Console UI as a one-time
# operator step when cross-origin photo uploads are needed. The
# `var.photos_cors_rules` variable in variables.tf preserves the intended
# values for future reactivation when upstream API support lands.
