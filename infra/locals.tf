locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }

  has_https = var.certificate_arn != ""

  account_id = data.aws_caller_identity.current.account_id
  region     = var.aws_region
}
