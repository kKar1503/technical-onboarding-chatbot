resource "aws_kms_key" "cloudwatch" {
  description         = "KMS key for CloudWatch log group encryption"
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
      {
        Sid    = "AllowCloudWatchLogs"
        Effect = "Allow"
        Principal = {
          Service = "logs.${local.region}.amazonaws.com"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey",
        ]
        Resource = "*"
        Condition = {
          ArnLike = {
            "kms:EncryptionContext:aws:logs:arn" = "arn:aws:logs:${local.region}:${local.account_id}:log-group:*"
          }
        }
      },
    ]
  })

  tags = local.common_tags
}

resource "aws_kms_alias" "cloudwatch" {
  name          = "alias/${local.name_prefix}-cloudwatch-logs"
  target_key_id = aws_kms_key.cloudwatch.key_id
}

resource "aws_cloudwatch_log_group" "nextjs" {
  name              = "/ecs/${local.name_prefix}/nextjs"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.cloudwatch.arn

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/ecs/${local.name_prefix}/worker"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.cloudwatch.arn

  tags = local.common_tags
}
