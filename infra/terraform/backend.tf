terraform {
  backend "s3" {
    bucket = "timeline-tfstate"
    key    = "infra/terraform.tfstate"
    # region + endpoints.s3 supplied via `terraform init -backend-config=` flags
    # (D-09 — tenant-specific; do not commit). See infra/DEPLOY.md § "Terraform
    # Provisioning" for the exact init invocation.
    use_lockfile                = true # TF 1.10+ native conditional-write locking via S3 If-None-Match
    use_path_style              = true # OCI S3-compat requires path-style URLs (NOT virtual-host)
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
  }
}
