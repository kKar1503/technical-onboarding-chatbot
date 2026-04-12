variable "aws_region" {
  type        = string
  default     = "ap-southeast-1"
  description = "AWS region to deploy into"
}

variable "environment" {
  type        = string
  description = "Environment name (dev, staging, prod)"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "project_name" {
  type        = string
  default     = "onboarding"
  description = "Project name used as resource prefix"
}

variable "vpc_cidr" {
  type        = string
  default     = "10.0.0.0/16"
  description = "CIDR block for the VPC"
}

variable "nextjs_image_tag" {
  type        = string
  default     = "latest"
  description = "Docker image tag for the Next.js service"
}

variable "worker_image_tag" {
  type        = string
  default     = "latest"
  description = "Docker image tag for the analysis worker"
}

variable "certificate_arn" {
  type        = string
  default     = ""
  description = "ACM certificate ARN for HTTPS. Leave empty for HTTP only."
}

variable "gitlab_webhook_secret" {
  type        = string
  sensitive   = true
  description = "Secret token for verifying GitLab webhook requests"
}

variable "gitlab_access_token" {
  type        = string
  sensitive   = true
  description = "GitLab personal access token for cloning repositories"
}

variable "nextjs_instance_type" {
  type        = string
  default     = "t3.small"
  description = "EC2 instance type for the Next.js ECS service"
}

variable "nextjs_desired_count" {
  type        = number
  default     = 1
  description = "Desired number of Next.js ECS tasks"
}

variable "nextjs_max_count" {
  type        = number
  default     = 2
  description = "Maximum number of EC2 instances in the Next.js ASG"
}

variable "worker_cpu" {
  type        = number
  default     = 1024
  description = "CPU units for the Fargate worker task (1024 = 1 vCPU)"
}

variable "worker_memory" {
  type        = number
  default     = 2048
  description = "Memory (MB) for the Fargate worker task"
}

variable "worker_max_count" {
  type        = number
  default     = 5
  description = "Maximum number of Fargate worker tasks"
}

variable "alarm_email" {
  type        = string
  default     = ""
  description = "Email address to receive CloudWatch alarm notifications. Leave empty to skip SNS subscription."
}
