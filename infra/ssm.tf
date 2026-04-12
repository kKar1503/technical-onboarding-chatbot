resource "aws_kms_key" "ssm" {
  description         = "KMS key for SSM SecureString parameters"
  enable_key_rotation = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowAccountRoot"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${local.account_id}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
    ]
  })

  tags = local.common_tags
}

resource "aws_kms_alias" "ssm" {
  name          = "alias/${local.name_prefix}-ssm"
  target_key_id = aws_kms_key.ssm.key_id
}

resource "aws_ssm_parameter" "gitlab_webhook_secret" {
  name   = "/${local.name_prefix}/gitlab-webhook-secret"
  type   = "SecureString"
  value  = var.gitlab_webhook_secret
  key_id = aws_kms_key.ssm.arn

  tags = local.common_tags
}

resource "aws_ssm_parameter" "gitlab_access_token" {
  name   = "/${local.name_prefix}/gitlab-access-token"
  type   = "SecureString"
  value  = var.gitlab_access_token
  key_id = aws_kms_key.ssm.arn

  tags = local.common_tags
}
