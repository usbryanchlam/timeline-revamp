terraform {
  required_version = "~> 1.10.0" # NOT >= 1.10 — see Pitfall 2 (TF 1.11.2 breaks OCI S3-compat: hashicorp/terraform#36742)

  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 6.0"
    }
  }
}
