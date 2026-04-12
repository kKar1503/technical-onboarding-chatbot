resource "aws_sqs_queue" "analysis_dlq" {
  name                      = "${local.name_prefix}-analysis-dlq.fifo"
  fifo_queue                = true
  message_retention_seconds = 14 * 24 * 60 * 60 # 14 days
  sqs_managed_sse_enabled   = true

  tags = local.common_tags
}

resource "aws_sqs_queue" "analysis" {
  name                        = "${local.name_prefix}-analysis-queue.fifo"
  fifo_queue                  = true
  content_based_deduplication = true
  visibility_timeout_seconds  = 15 * 60          # 15 minutes
  message_retention_seconds   = 4 * 24 * 60 * 60 # 4 days
  sqs_managed_sse_enabled     = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.analysis_dlq.arn
    maxReceiveCount     = 3
  })

  tags = local.common_tags
}
