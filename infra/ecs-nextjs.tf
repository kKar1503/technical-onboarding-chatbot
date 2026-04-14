# --- Launch Template ---

resource "aws_launch_template" "nextjs" {
  name_prefix   = "${local.name_prefix}-nextjs-"
  image_id      = data.aws_ssm_parameter.ecs_ami.value
  instance_type = var.nextjs_instance_type

  iam_instance_profile {
    arn = aws_iam_instance_profile.ecs_instance.arn
  }

  vpc_security_group_ids = [aws_security_group.ecs_ec2.id]

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }

  user_data = base64encode(<<-EOF
    #!/bin/bash
    echo "ECS_CLUSTER=${aws_ecs_cluster.main.name}" >> /etc/ecs/ecs.config
  EOF
  )

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size = 30
      volume_type = "gp3"
      encrypted   = true
    }
  }

  tag_specifications {
    resource_type = "instance"
    tags = merge(local.common_tags, {
      Name = "${local.name_prefix}-ecs-instance"
    })
  }

  tags = local.common_tags
}

# --- Auto Scaling Group ---

resource "aws_autoscaling_group" "nextjs" {
  name_prefix         = "${local.name_prefix}-nextjs-"
  min_size            = 1
  max_size            = var.nextjs_max_count
  desired_capacity    = 1
  vpc_zone_identifier = [aws_subnet.private_a.id, aws_subnet.private_b.id]

  protect_from_scale_in = true

  launch_template {
    id      = aws_launch_template.nextjs.id
    version = "$Latest"
  }

  tag {
    key                 = "AmazonECSManaged"
    value               = "true"
    propagate_at_launch = true
  }

  dynamic "tag" {
    for_each = local.common_tags
    content {
      key                 = tag.key
      value               = tag.value
      propagate_at_launch = true
    }
  }

  lifecycle {
    create_before_destroy = true
  }
}

# --- ECS Task Definition ---

resource "aws_ecs_task_definition" "nextjs" {
  family             = "${local.name_prefix}-nextjs"
  network_mode       = "bridge"
  execution_role_arn = aws_iam_role.ecs_execution.arn
  task_role_arn      = aws_iam_role.nextjs_task.arn

  container_definitions = jsonencode([{
    name      = "nextjs"
    image     = "${aws_ecr_repository.app.repository_url}:${var.nextjs_image_tag}"
    essential = true

    portMappings = [{
      containerPort = 3000
      hostPort      = 0 # Dynamic port mapping
      protocol      = "tcp"
    }]

    memoryReservation = 512
    cpu               = 256

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
        "awslogs-group"         = aws_cloudwatch_log_group.nextjs.name
        "awslogs-region"        = var.aws_region
        "awslogs-stream-prefix" = "nextjs"
      }
    }
  }])

  tags = local.common_tags
}

# --- ECS Service ---

resource "aws_ecs_service" "nextjs" {
  name            = "${local.name_prefix}-nextjs"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.nextjs.arn
  desired_count   = var.nextjs_desired_count

  capacity_provider_strategy {
    capacity_provider = aws_ecs_capacity_provider.ec2.name
    weight            = 1
    base              = 1
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.nextjs.arn
    container_name   = "nextjs"
    container_port   = 3000
  }

  ordered_placement_strategy {
    type  = "spread"
    field = "attribute:ecs.availability-zone"
  }

  depends_on = [aws_lb_listener.http]

  tags = local.common_tags
}
