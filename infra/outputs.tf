output "alb_dns_name" {
  description = "ALB DNS name (use as CNAME target or access directly)"
  value       = aws_lb.main.dns_name
}

output "ecr_repository_url" {
  description = "ECR repository URL for pushing Docker images"
  value       = aws_ecr_repository.app.repository_url
}

output "sqs_queue_url" {
  description = "SQS analysis queue URL (set as SQS_ANALYSIS_QUEUE_URL)"
  value       = aws_sqs_queue.analysis.url
}

output "sqs_dlq_url" {
  description = "SQS dead letter queue URL"
  value       = aws_sqs_queue.analysis_dlq.url
}

output "s3_bucket_name" {
  description = "S3 knowledge bucket name (set as KNOWLEDGE_S3_BUCKET)"
  value       = aws_s3_bucket.knowledge.id
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "nextjs_service_name" {
  description = "Next.js ECS service name"
  value       = aws_ecs_service.nextjs.name
}

output "worker_service_name" {
  description = "Worker ECS service name"
  value       = aws_ecs_service.worker.name
}

output "nextjs_task_family" {
  description = "Next.js task definition family (CI/CD uses this to register new revisions)"
  value       = aws_ecs_task_definition.nextjs.family
}

output "worker_task_family" {
  description = "Worker task definition family (CI/CD uses this to register new revisions)"
  value       = aws_ecs_task_definition.worker.family
}

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = [aws_subnet.private_a.id, aws_subnet.private_b.id]
}

output "conversations_table_name" {
  description = "DynamoDB conversations table name"
  value       = aws_dynamodb_table.conversations.name
}

output "repositories_table_name" {
  description = "DynamoDB repositories table name"
  value       = aws_dynamodb_table.repositories.name
}

output "users_table_name" {
  description = "DynamoDB users table name"
  value       = aws_dynamodb_table.users.name
}
