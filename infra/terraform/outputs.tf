# Outputs are appended in Task 2 (alongside compute.tf, which declares the
# referenced resources). Declaring them here in Task 1 would break
# `terraform validate` — Plan 01 ordering deviation, see SUMMARY.md.
#
# Plan 02 appends `bucket_name` + `namespace` outputs.
