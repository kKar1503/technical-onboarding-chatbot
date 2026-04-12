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

# ---------------------------------------------------------------------------
# Alerting: SNS topic + alarms for the signals worth paging on.
# ---------------------------------------------------------------------------

resource "aws_sns_topic" "alerts" {
  name              = "${local.name_prefix}-alerts"
  kms_master_key_id = "alias/aws/sns"
  tags              = local.common_tags
}

resource "aws_sns_topic_subscription" "alerts_email" {
  count     = var.alarm_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

# Next.js ALB target: 5xx error rate.
resource "aws_cloudwatch_metric_alarm" "nextjs_5xx" {
  alarm_name          = "${local.name_prefix}-nextjs-5xx"
  alarm_description   = "Next.js target group is returning 5xx responses"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = 5
  period              = 60
  statistic           = "Sum"
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
    TargetGroup  = aws_lb_target_group.nextjs.arn_suffix
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]
  tags          = local.common_tags
}

# Next.js target group: unhealthy hosts.
resource "aws_cloudwatch_metric_alarm" "nextjs_unhealthy" {
  alarm_name          = "${local.name_prefix}-nextjs-unhealthy-hosts"
  alarm_description   = "One or more Next.js targets failing ALB health checks"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = 0
  period              = 60
  statistic           = "Maximum"
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
    TargetGroup  = aws_lb_target_group.nextjs.arn_suffix
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  tags          = local.common_tags
}

# SQS DLQ depth: anything landing here needs eyes on it.
resource "aws_cloudwatch_metric_alarm" "analysis_dlq_depth" {
  alarm_name          = "${local.name_prefix}-analysis-dlq-not-empty"
  alarm_description   = "Messages are accumulating in the analysis DLQ"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 0
  period              = 300
  statistic           = "Maximum"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.analysis_dlq.name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  tags          = local.common_tags
}

# SQS analysis queue: backlog building up (possibly stuck worker).
resource "aws_cloudwatch_metric_alarm" "analysis_queue_backlog" {
  alarm_name          = "${local.name_prefix}-analysis-queue-backlog"
  alarm_description   = "Analysis queue depth is high — worker may be stuck or underscaled"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  threshold           = 100
  period              = 300
  statistic           = "Maximum"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.analysis.name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  tags          = local.common_tags
}

# SQS oldest message age: proxy for processing latency.
resource "aws_cloudwatch_metric_alarm" "analysis_queue_age" {
  alarm_name          = "${local.name_prefix}-analysis-queue-oldest-age"
  alarm_description   = "Oldest analysis job has been waiting too long"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = 900 # 15 minutes
  period              = 300
  statistic           = "Maximum"
  metric_name         = "ApproximateAgeOfOldestMessage"
  namespace           = "AWS/SQS"
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.analysis.name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  tags          = local.common_tags
}

# Bedrock throttling: surfaces model-level quota pressure.
resource "aws_cloudwatch_metric_alarm" "bedrock_throttles" {
  alarm_name          = "${local.name_prefix}-bedrock-throttles"
  alarm_description   = "Bedrock invocations are being throttled"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = 5
  period              = 60
  statistic           = "Sum"
  metric_name         = "InvocationThrottles"
  namespace           = "AWS/Bedrock"
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts.arn]
  tags          = local.common_tags
}

# ECS Next.js service: high CPU (autoscaling signal + capacity check).
resource "aws_cloudwatch_metric_alarm" "nextjs_cpu_high" {
  alarm_name          = "${local.name_prefix}-nextjs-cpu-high"
  alarm_description   = "Next.js ECS service CPU is sustained high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  threshold           = 80
  period              = 300
  statistic           = "Average"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  treat_missing_data  = "notBreaching"

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.nextjs.name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  tags          = local.common_tags
}

# ---------------------------------------------------------------------------
# Dashboard: one-pane overview of the request path and async pipeline.
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${local.name_prefix}-overview"

  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric", x = 0, y = 0, width = 12, height = 6,
        properties = {
          title  = "ALB requests & 5xx"
          region = local.region
          view   = "timeSeries"
          stat   = "Sum"
          period = 60
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", aws_lb.main.arn_suffix, "TargetGroup", aws_lb_target_group.nextjs.arn_suffix],
            [".", "HTTPCode_Target_5XX_Count", ".", ".", ".", "."],
            [".", "HTTPCode_Target_4XX_Count", ".", ".", ".", "."],
          ]
        }
      },
      {
        type = "metric", x = 12, y = 0, width = 12, height = 6,
        properties = {
          title  = "ALB target latency (p95)"
          region = local.region
          view   = "timeSeries"
          stat   = "p95"
          period = 60
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", aws_lb.main.arn_suffix, "TargetGroup", aws_lb_target_group.nextjs.arn_suffix],
          ]
        }
      },
      {
        type = "metric", x = 0, y = 6, width = 12, height = 6,
        properties = {
          title  = "Analysis queue depth / DLQ"
          region = local.region
          view   = "timeSeries"
          stat   = "Maximum"
          period = 60
          metrics = [
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", aws_sqs_queue.analysis.name],
            [".", ".", ".", aws_sqs_queue.analysis_dlq.name],
            ["AWS/SQS", "ApproximateAgeOfOldestMessage", "QueueName", aws_sqs_queue.analysis.name],
          ]
        }
      },
      {
        type = "metric", x = 12, y = 6, width = 12, height = 6,
        properties = {
          title  = "ECS CPU/Memory"
          region = local.region
          view   = "timeSeries"
          stat   = "Average"
          period = 60
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ClusterName", aws_ecs_cluster.main.name, "ServiceName", aws_ecs_service.nextjs.name],
            [".", "MemoryUtilization", ".", ".", ".", "."],
            [".", "CPUUtilization", ".", ".", ".", aws_ecs_service.worker.name],
            [".", "MemoryUtilization", ".", ".", ".", "."],
          ]
        }
      },
      {
        type = "metric", x = 0, y = 12, width = 24, height = 6,
        properties = {
          title  = "Bedrock invocations / throttles / errors"
          region = local.region
          view   = "timeSeries"
          stat   = "Sum"
          period = 60
          metrics = [
            ["AWS/Bedrock", "Invocations"],
            [".", "InvocationThrottles"],
            [".", "InvocationClientErrors"],
            [".", "InvocationServerErrors"],
          ]
        }
      },
    ]
  })
}
