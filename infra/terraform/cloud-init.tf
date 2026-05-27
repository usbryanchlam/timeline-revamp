locals {
  cloud_init_rendered = templatefile("${path.module}/../cloud-init.yaml", {
    repo_url = var.repo_url
  })
}
