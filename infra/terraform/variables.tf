variable "tenancy_ocid" {
  type        = string
  description = "Root tenancy OCID. Format: ocid1.tenancy.oc1..aaaa... (NOT compartment — see Pitfall 7)"
}

variable "compartment_ocid" {
  type        = string
  description = "Target compartment OCID. Format: ocid1.compartment.oc1..aaaa... (NOT tenancy — see Pitfall 7)"
}

variable "region" {
  type        = string
  description = "OCI home region (e.g., us-sanjose-1). No default per D-11 — forces explicit tenant-specific value."
}

variable "ssh_public_key" {
  type        = string
  description = "SSH public key for the ubuntu user on the VM (contents of ~/.ssh/oci-timeline.pub, including the ssh-ed25519 prefix)."
}

variable "repo_url" {
  type        = string
  default     = "https://github.com/usbryanchlam/timeline-revamp.git"
  description = "Git URL cloned by cloud-init runcmd into /opt/timeline-revamp."
}

variable "photos_cors_rules" {
  description = "CORS rules applied to the photos bucket via aws s3api in Plan 02. Declared here for stack cohesion (variables.tf is the single source of truth for inputs)."
  type = list(object({
    AllowedOrigins = list(string)
    AllowedMethods = list(string)
    AllowedHeaders = list(string)
    ExposeHeaders  = list(string)
    MaxAgeSeconds  = number
  }))
  default = [{
    AllowedOrigins = ["https://timeline.bryanlam.dev", "http://localhost:5173", "https://localhost:5173"]
    AllowedMethods = ["GET", "HEAD", "PUT"]
    AllowedHeaders = ["*"]
    ExposeHeaders  = ["ETag", "Content-Length", "x-amz-version-id"]
    MaxAgeSeconds  = 3600
  }]
}
