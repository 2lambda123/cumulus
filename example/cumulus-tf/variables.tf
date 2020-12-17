# Required

variable "async_operation_image" {
  description = "docker image to use for Cumulus async operations tasks"
  type = string
  default = "cumuluss/async-operation:27"
}

variable "cumulus_process_activity" {
  description = "docker image to use for python processing service"
  type = string
  default = "cumuluss/cumulus-process-activity:1"
}

variable "ecs_task_image" {
  description = "docker image to use for Cumulus hello world task"
  type = string
  default = "cumuluss/cumulus-ecs-task:1.7.0"
}

variable "cumulus_test_ingest_process" {
  description = "docker image to use for python test ingest processing service"
  type = string
  default = "jlkovarik/cumulus-test-ingest-process:12"
}

variable "cmr_client_id" {
  type = string
}

variable "cmr_environment" {
  type = string
}

variable "cmr_password" {
  type = string
}

variable "cmr_provider" {
  type = string
}

variable "cmr_username" {
  type = string
}

variable "bucket_map_key" {
  type    = string
  default = null
}

variable "cumulus_message_adapter_lambda_layer_version_arn" {
  type        = string
  description = "Layer version ARN of the Lambda layer for the Cumulus Message Adapter"
}

variable "cmr_oauth_provider" {
  type    = string
  default = "earthdata"
}

variable "launchpad_api" {
  type    = string
  default = "launchpadApi"
}

variable "launchpad_certificate" {
  type    = string
  default = "launchpad.pfx"
}

variable "launchpad_passphrase" {
  type    = string
  default = ""
}
variable "lzards_launchpad_certificate" {
  type    = string
  default = "launchpad.pfx"
}

variable "lzards_launchpad_passphrase" {
  type    = string
  default = ""
}

variable "lzards_api" {
  description = "LZARDS API endpoint"
  type        = string
  default     = "https://lzards.sit.earthdata.nasa.gov/api/backups"
}

variable "lzards_provider" {
  description = "LZARDS provider name"
  type        = string
  default     = "CUMULUS_INTEGRATION_TESTS"
}

variable "lzards_s3_link_timeout" {
  description = "LZARDS S3 access link timeout (seconds)"
  type        = string
  default     = ""
}

variable "oauth_provider" {
  type    = string
  default = "earthdata"
}

variable "oauth_user_group" {
  type    = string
  default = "N/A"
}

variable "data_persistence_remote_state_config" {
  type = object({ bucket = string, key = string, region = string })
}

variable "s3_replicator_config" {
  type        = object({ source_bucket = string, source_prefix = string, target_bucket = string, target_prefix = string })
  default     = null
  description = "Configuration for the s3-replicator module. Items with prefix of source_prefix in the source_bucket will be replicated to the target_bucket with target_prefix."
}

variable "prefix" {
  type = string
}

variable "saml_entity_id" {
  type    = string
  default = "N/A"
}

variable "saml_assertion_consumer_service" {
  type    = string
  default = "N/A"
}

variable "saml_idp_login" {
  type    = string
  default = "N/A"
}

variable "saml_launchpad_metadata_url" {
  type    = string
  default = "N/A"
}

variable "system_bucket" {
  type = string
}

variable "token_secret" {
  type = string
}

variable "urs_client_id" {
  type = string
}

variable "urs_client_password" {
  type = string
}

variable "vpc_id" {
  type = string
}

# Optional

variable "api_gateway_stage" {
  type        = string
  default     = "dev"
  description = "The archive API Gateway stage to create"
}

variable "buckets" {
  type    = map(object({ name = string, type = string }))
  default = {}
}

variable "distribution_url" {
  type    = string
  default = null
}

variable "ecs_cluster_instance_subnet_ids" {
  type = list(string)
  default = []
}

variable "ems_datasource" {
  type        = string
  description = "the data source of EMS reports"
  default     = "UAT"
}

variable "ems_host" {
  type        = string
  description = "EMS host"
  default     = "change-ems-host"
}

variable "ems_path" {
  type        = string
  description = "EMS host directory path for reports"
  default     = "/"
}

variable "ems_port" {
  type        = number
  description = "EMS host port"
  default     = 22
}

variable "ems_private_key" {
  type        = string
  description = "the private key file used for sending reports to EMS"
  default     = "ems-private.pem"
}

variable "ems_provider" {
  type        = string
  description = "the provider used for sending reports to EMS"
  default     = "CUMULUS"
}

variable "ems_retention_in_days" {
  type        = number
  description = "the retention in days for reports and s3 server access logs"
  default     = 30
}

variable "ems_submit_report" {
  type        = bool
  description = "toggle whether the reports will be sent to EMS"
  default     = false
}

variable "ems_username" {
  type        = string
  description = "the username used for sending reports to EMS"
  default     = "cumulus"
}

variable "es_request_concurrency" {
  type = number
  default = 10
  description = "Maximum number of concurrent requests to send to Elasticsearch. Used in index-from-database operation"
}

variable "key_name" {
  type    = string
  default = null
}

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "permissions_boundary_arn" {
  type    = string
  default = null
}

variable "aws_profile" {
  type    = string
  default = null
}

variable "lambda_subnet_ids" {
  type = list(string)
  default = []
}

variable "log_api_gateway_to_cloudwatch" {
  type        = bool
  default     = false
  description = "Enable logging of API Gateway activity to CloudWatch."
}

variable "log_destination_arn" {
  type        = string
  default     = null
  description = "Remote kinesis/destination arn for delivering logs."
}

variable "archive_api_port" {
  type    = number
  default = null
}

variable "archive_api_url" {
  type        = string
  default     = null
  description = "If not specified, the value of the Backend (Archive) API Gateway endpoint is used"
}

variable "private_archive_api_gateway" {
  type    = bool
  default = true
}

variable "thin_egress_jwt_secret_name" {
  type        = string
  description = "Name of AWS secret where keys for the Thin Egress App JWT encode/decode are stored"
  default     = "cumulus_sandbox_jwt_tea_secret"
}

variable "metrics_es_host" {
  type    = string
  default = null
}

variable "metrics_es_password" {
  type    = string
  default = null
}

variable "metrics_es_username" {
  type    = string
  default = null
}

variable "additional_log_groups_to_elk" {
  type    = map(string)
  default = {}
}

variable "tags" {
  description = "Tags to be applied to Cumulus resources that support tags"
  type        = map(string)
  default     = {}
}

variable "es_index_shards" {
  description = "The number of shards for the Elasticsearch index"
  type        = number
  default     = 2
}

variable "pdr_node_name_provider_bucket" {
  type = string
  description = "The name of the common bucket used as an S3 provider for PDR NODE_NAME tests"
  default = "cumulus-sandbox-pdr-node-name-provider"
}

variable "ems_deploy" {
  description = "If true, deploys the EMS reporting module"
  type        = bool
  default     = true
}
