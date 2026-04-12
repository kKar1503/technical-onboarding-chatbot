# --- ALB Security Group ---

resource "aws_security_group" "alb" {
  name_prefix = "${local.name_prefix}-alb-"
  description = "ALB - allow HTTP/HTTPS inbound"
  vpc_id      = aws_vpc.main.id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-alb-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "alb_all" {
  security_group_id = aws_security_group.alb.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# --- ECS EC2 Instance Security Group (Next.js) ---

resource "aws_security_group" "ecs_ec2" {
  name_prefix = "${local.name_prefix}-ecs-ec2-"
  description = "ECS EC2 instances - allow ALB traffic on ephemeral ports"
  vpc_id      = aws_vpc.main.id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-ecs-ec2-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "ecs_ec2_from_alb" {
  security_group_id            = aws_security_group.ecs_ec2.id
  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = 32768
  to_port                      = 65535
  ip_protocol                  = "tcp"
}

resource "aws_vpc_security_group_egress_rule" "ecs_ec2_all" {
  security_group_id = aws_security_group.ecs_ec2.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# --- Worker Task Security Group (Fargate) ---

resource "aws_security_group" "worker" {
  name_prefix = "${local.name_prefix}-worker-"
  description = "Worker tasks - outbound only (SQS polling)"
  vpc_id      = aws_vpc.main.id

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-worker-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_egress_rule" "worker_all" {
  security_group_id = aws_security_group.worker.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}
