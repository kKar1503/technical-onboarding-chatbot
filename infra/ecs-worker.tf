# --- ECS Task Definition (Fargate) ---

resource "aws_ecs_task_definition" "worker" {
  family                   = "${local.name_prefix}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.worker_cpu
  memory                   = var.worker_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.worker_task.arn

  container_definitions = jsonencode([{
    name      = "worker"
    image     = "${aws_ecr_repository.app.repository_url}:latest"
    essential = true

    command = ["npx", "tsx", "src/worker/index.ts"]

    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "AWS_REGION", value = var.aws_region },
      { name = "KNOWLEDGE_S3_BUCKET", value = aws_s3_bucket.knowledge.id },
      { name = "SQS_ANALYSIS_QUEUE_URL", value = aws_sqs_queue.analysis.url },
      { name = "DYNAMODB_TABLE_CONVERSATIONS", value = aws_dynamodb_table.conversations.name },
      { name = "DYNAMODB_TABLE_REPOSITORIES", value = aws_dynamodb_table.repositories.name },
      { name = "DYNAMODB_TABLE_USERS", value = aws_dynamodb_table.users.name },
      { name = "BEDROCK_CHAT_MODEL", value = var.bedrock_chat_model },
      { name = "BEDROCK_ANALYSIS_MODEL", value = var.bedrock_analysis_model },
    ]

    secrets = [
      { name = "GITLAB_WEBHOOK_SECRET", valueFrom = aws_ssm_parameter.gitlab_webhook_secret.arn },
      { name = "GITLAB_ACCESS_TOKEN", valueFrom = aws_ssm_parameter.gitlab_access_token.arn },
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.worker.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "worker"
      }
    }
  }])

  tags = local.common_tags
}

# --- ECS Service (Scale-to-Zero) ---

resource "aws_ecs_service" "worker" {
  name            = "${local.name_prefix}-worker"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = 0

  # CI/CD owns image rollouts; autoscaling owns desired_count.
  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }

  capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
  }

  network_configuration {
    subnets          = [aws_subnet.private_a.id, aws_subnet.private_b.id]
    security_groups  = [aws_security_group.worker.id]
    assign_public_ip = false
  }

  tags = local.common_tags
}

# --- Auto Scaling (Step Scaling for Scale-to-Zero) ---

resource "aws_appautoscaling_target" "worker" {
  max_capacity       = var.worker_max_count
  min_capacity       = 0
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.worker.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# Scale UP: when messages appear in the queue
resource "aws_cloudwatch_metric_alarm" "worker_scale_up" {
  alarm_name          = "${local.name_prefix}-worker-scale-up"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  alarm_description   = "Scale up worker when SQS messages are visible"
  alarm_actions       = [aws_appautoscaling_policy.worker_scale_up.arn]

  dimensions = {
    QueueName = aws_sqs_queue.analysis.name
  }

  tags = local.common_tags
}

resource "aws_appautoscaling_policy" "worker_scale_up" {
  name               = "${local.name_prefix}-worker-scale-up"
  policy_type        = "StepScaling"
  resource_id        = aws_appautoscaling_target.worker.resource_id
  scalable_dimension = aws_appautoscaling_target.worker.scalable_dimension
  service_namespace  = aws_appautoscaling_target.worker.service_namespace

  step_scaling_policy_configuration {
    adjustment_type         = "ChangeInCapacity"
    cooldown                = 60
    metric_aggregation_type = "Maximum"

    step_adjustment {
      metric_interval_lower_bound = 0
      scaling_adjustment          = 1
    }
  }
}

# Scale DOWN: when queue is empty for 5 minutes
resource "aws_cloudwatch_metric_alarm" "worker_scale_down" {
  alarm_name          = "${local.name_prefix}-worker-scale-down"
  comparison_operator = "LessThanOrEqualToThreshold"
  evaluation_periods  = 5
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  alarm_description   = "Scale down worker when SQS queue is empty"
  alarm_actions       = [aws_appautoscaling_policy.worker_scale_down.arn]

  dimensions = {
    QueueName = aws_sqs_queue.analysis.name
  }

  tags = local.common_tags
}

resource "aws_appautoscaling_policy" "worker_scale_down" {
  name               = "${local.name_prefix}-worker-scale-down"
  policy_type        = "StepScaling"
  resource_id        = aws_appautoscaling_target.worker.resource_id
  scalable_dimension = aws_appautoscaling_target.worker.scalable_dimension
  service_namespace  = aws_appautoscaling_target.worker.service_namespace

  step_scaling_policy_configuration {
    adjustment_type         = "ChangeInCapacity"
    cooldown                = 300
    metric_aggregation_type = "Maximum"

    step_adjustment {
      metric_interval_upper_bound = 0
      scaling_adjustment          = -1
    }
  }
}
