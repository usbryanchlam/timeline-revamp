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

# OIDC Identity Propagation Trust (Plan 03) appends to this file.
