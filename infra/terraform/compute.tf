resource "oci_core_instance" "timeline" {
  display_name        = "timeline-revamp-vm"
  compartment_id      = var.compartment_ocid
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
  shape               = "VM.Standard.A1.Flex"

  shape_config {
    ocpus         = 4
    memory_in_gbs = 24
  }

  source_details {
    source_type             = "image"
    source_id               = data.oci_core_images.ubuntu_22_04_aarch64.images[0].id
    boot_volume_size_in_gbs = 100
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.public.id
    assign_public_ip = false # Reserved IP attached separately via oci_core_public_ip.timeline
    display_name     = "timeline-vnic"
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
    user_data           = base64encode(local.cloud_init_rendered)
  }

  lifecycle {
    ignore_changes = [defined_tags]
  }
}

# Reserved IP attach — 3-resource dependency chain per RESEARCH Pitfall 5.
# OCI's VNIC attachment is asynchronous, so the instance can be RUNNING before
# its primary VNIC's private IP is queryable. Explicit depends_on on both data
# sources gives TF the right ordering hint.
#
# If first `terraform apply` fails with `data.oci_core_private_ips.primary.private_ips is empty`
# (Pitfall 5 — VNIC attachment eventual consistency), insert:
#
#   resource "time_sleep" "vnic_settle" {
#     depends_on      = [oci_core_instance.timeline]
#     create_duration = "30s"
#   }
#
# AND add `depends_on = [time_sleep.vnic_settle]` to BOTH data sources below.
# (Requires `terraform { required_providers { time = { source = "hashicorp/time" } } }`
# in versions.tf.)
data "oci_core_vnic_attachments" "primary" {
  compartment_id = var.compartment_ocid
  instance_id    = oci_core_instance.timeline.id
  depends_on     = [oci_core_instance.timeline]
}

data "oci_core_private_ips" "primary" {
  vnic_id    = data.oci_core_vnic_attachments.primary.vnic_attachments[0].vnic_id
  depends_on = [oci_core_instance.timeline]
}

resource "oci_core_public_ip" "timeline" {
  compartment_id = var.compartment_ocid
  display_name   = "timeline-reserved-ip"
  lifetime       = "RESERVED"
  private_ip_id  = data.oci_core_private_ips.primary.private_ips[0].id

  lifecycle {
    ignore_changes = [defined_tags]
  }
}
