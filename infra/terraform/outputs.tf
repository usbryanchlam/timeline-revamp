output "public_ip" {
  description = "Reserved public IP — copy into DNS provider A-record (Phase 8 Wave 3 hand-off)"
  value       = oci_core_public_ip.timeline.ip_address
}

output "instance_ocid" {
  description = "Instance OCID — for dynamic group rule (Plan 02) and ad-hoc oci CLI use"
  value       = oci_core_instance.timeline.id
}

# NOTE: bucket_name + namespace outputs are added by Plan 02 (storage.tf).
