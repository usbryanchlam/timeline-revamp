output "public_ip" {
  description = "Reserved public IP — copy into DNS provider A-record (Phase 8 Wave 3 hand-off)"
  value       = oci_core_public_ip.timeline.ip_address
}

output "instance_ocid" {
  description = "Instance OCID — for dynamic group rule (Plan 02) and ad-hoc oci CLI use"
  value       = oci_core_instance.timeline.id
}

output "bucket_name" {
  description = "Photos bucket name (for app .env OCI_BUCKET_NAME)"
  value       = oci_objectstorage_bucket.photos.name
}

output "namespace" {
  description = "OCI Object Storage namespace (for app .env OCI_NAMESPACE)"
  value       = data.oci_objectstorage_namespace.this.namespace
}
