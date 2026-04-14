# S3 Vectors backing store for Bedrock Knowledge Bases.
# Replaces OpenSearch Serverless (~$350/mo floor) with S3 Vectors (~$0 floor,
# pay per storage + query).
#
# The vector *bucket* is static (one for this environment). Per-repo vector
# *indexes* are created at runtime by the application when a repo is
# registered, and destroyed when the repo is removed — they can't live in
# Terraform because repos are dynamic.

locals {
  vector_bucket_name = "${local.name_prefix}-vectors"
}

resource "aws_s3vectors_vector_bucket" "main" {
  vector_bucket_name = local.vector_bucket_name

  # SSE-S3 by default. Swap to kms with a dedicated key if compliance requires
  # customer-managed keys.
  encryption_configuration {
    sse_type = "AES256"
  }

  tags = local.common_tags
}

# --- Bedrock Knowledge Base service role ---
# Assumed by the Bedrock KB runtime when it ingests from S3 and writes to the
# vector bucket. One role shared across all per-repo KBs.

resource "aws_iam_role" "bedrock_kb" {
  name = "${local.name_prefix}-bedrock-kb"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "bedrock.amazonaws.com" }
      Condition = {
        StringEquals = { "aws:SourceAccount" = local.account_id }
        ArnLike      = { "aws:SourceArn" = "arn:aws:bedrock:${local.region}:${local.account_id}:knowledge-base/*" }
      }
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "bedrock_kb" {
  name = "${local.name_prefix}-bedrock-kb-policy"
  role = aws_iam_role.bedrock_kb.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadKnowledgeBucket"
        Effect = "Allow"
        Action = ["s3:ListBucket", "s3:GetObject"]
        Resource = [
          aws_s3_bucket.knowledge.arn,
          "${aws_s3_bucket.knowledge.arn}/*",
        ]
      },
      {
        Sid    = "DecryptKnowledgeBucket"
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey",
          "kms:DescribeKey",
        ]
        Resource = aws_kms_key.s3.arn
      },
      {
        Sid      = "InvokeEmbeddingModel"
        Effect   = "Allow"
        Action   = ["bedrock:InvokeModel"]
        Resource = "arn:aws:bedrock:${local.region}::foundation-model/${var.embedding_model_id}"
      },
      {
        Sid    = "S3VectorsReadWrite"
        Effect = "Allow"
        Action = [
          "s3vectors:GetVectors",
          "s3vectors:PutVectors",
          "s3vectors:DeleteVectors",
          "s3vectors:QueryVectors",
          "s3vectors:GetIndex",
          "s3vectors:ListIndexes",
        ]
        Resource = [
          aws_s3vectors_vector_bucket.main.vector_bucket_arn,
          "${aws_s3vectors_vector_bucket.main.vector_bucket_arn}/index/*",
        ]
      },
    ]
  })
}

output "vector_bucket_name" {
  value       = aws_s3vectors_vector_bucket.main.vector_bucket_name
  description = "S3 Vectors bucket name (shared by all per-repo KBs)"
}

output "vector_bucket_arn" {
  value       = aws_s3vectors_vector_bucket.main.vector_bucket_arn
  description = "S3 Vectors bucket ARN"
}

output "bedrock_kb_role_arn" {
  value       = aws_iam_role.bedrock_kb.arn
  description = "IAM role assumed by Bedrock KB at runtime"
}
