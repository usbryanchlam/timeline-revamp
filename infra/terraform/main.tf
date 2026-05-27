# Cross-cutting data sources used by network.tf + compute.tf.
# Resource-specific data sources (VNIC attachments, private IPs) live in compute.tf
# alongside the resources they bridge.

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.tenancy_ocid
}

data "oci_core_images" "ubuntu_22_04_aarch64" {
  compartment_id           = var.tenancy_ocid
  operating_system         = "Canonical Ubuntu"
  operating_system_version = "22.04"
  shape                    = "VM.Standard.A1.Flex"

  filter {
    name   = "display_name"
    values = ["^.*-aarch64-.*$"]
    regex  = true
  }
}
