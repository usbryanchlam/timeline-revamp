# OCI provider — auth=SecurityToken consumes the UPST token written by the GHA OIDC
# exchange step (~/.oci/config + ~/.oci/upst.token). For local-laptop development,
# override at the shell level with `OCI_CLI_AUTH=api_key` to fall back to API-key auth
# from ~/.oci/config without editing this file.
provider "oci" {
  auth                = "SecurityToken"
  config_file_profile = "DEFAULT"
  region              = var.region
}
