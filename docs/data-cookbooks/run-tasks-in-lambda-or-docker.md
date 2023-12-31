---
id: run-tasks-in-lambda-or-docker
title: Run Step Function Tasks in AWS Lambda or Docker
hide_title: false
---

## Overview

[AWS Step Function Tasks](https://docs.aws.amazon.com/step-functions/latest/dg/concepts-tasks.html) can run tasks on [AWS Lambda](https://aws.amazon.com/lambda/) or on [AWS Elastic Container Service (ECS)](https://aws.amazon.com/ecs/) as a Docker container.

Lambda provides serverless architecture, providing the best option for minimizing cost and server management. ECS provides the fullest extent of AWS EC2 resources via the flexibility to execute arbitrary code on any AWS EC2 instance type.

## When to use Lambda

You should use AWS Lambda whenever all of the following are true:

- The task runs on one of the supported [Lambda Runtimes](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html). At time of this writing, supported runtimes include versions of python, Java, Ruby, node.js, Go and .NET.
- The lambda package is less than 50 MB in size, zipped.
- The task consumes less than each of the following resources:
  - 3008 MB memory allocation
  - 512 MB disk storage (must be written to `/tmp`)
  - 15 minutes of execution time

:::info

See [this page](https://docs.aws.amazon.com/lambda/latest/dg/limits.html) for a complete and up-to-date list of AWS Lambda limits.

:::

If your task requires more than any of these resources or an unsupported runtime, creating a Docker image which can be run on ECS is the way to go. Cumulus supports running any lambda package (and its configured layers) as a Docker container with [`cumulus-ecs-task`](https://github.com/nasa/cumulus-ecs-task).

## Step Function Activities and `cumulus-ecs-task`

[Step Function Activities](https://docs.aws.amazon.com/step-functions/latest/dg/concepts-activities.html) enable a state machine task to "publish" an activity task which can be picked up by any activity worker. Activity workers can run pretty much anywhere, but Cumulus workflows support the [`cumulus-ecs-task`](https://github.com/nasa/cumulus-ecs-task) activity worker. The `cumulus-ecs-task` worker runs as a Docker container on the Cumulus ECS cluster.

The `cumulus-ecs-task` container takes an AWS Lambda Amazon Resource Name (ARN) as an argument (see `--lambdaArn` in the example below). This ARN argument is defined at deployment time. The `cumulus-ecs-task` worker polls for new Step Function Activity Tasks. When a Step Function executes, the worker (container) picks up the activity task and runs the code contained in the lambda package defined on deployment.

## Example: Replacing AWS Lambda with a Docker container run on ECS

This example will use an already-defined workflow from the `cumulus` module that includes the [`QueueGranules` task](https://github.com/nasa/cumulus/blob/master/tf-modules/ingest/queue-granules-task.tf) in its configuration.

The following example is an excerpt from the [Discover Granules workflow](https://github.com/nasa/cumulus/blob/master/example/cumulus-tf/discover_granules_workflow.asl.json) containing the step definition for the `QueueGranules` step:

:::note interpolated values

`${ingest_granule_workflow_name}` and `${queue_granules_task_arn}` are interpolated values that refer to Terraform resources. See the example deployment code for the [Discover Granules workflow](https://github.com/nasa/cumulus/blob/master/example/cumulus-tf/discover_granules_workflow.tf).

:::

```json
  "QueueGranules": {
    "Parameters": {
      "cma": {
        "event.$": "$",
        "ReplaceConfig": {
          "FullMessage": true
        },
        "task_config": {
          "provider": "{$.meta.provider}",
          "internalBucket": "{$.meta.buckets.internal.name}",
          "stackName": "{$.meta.stack}",
          "granuleIngestWorkflow": "${ingest_granule_workflow_name}",
          "queueUrl": "{$.meta.queues.startSF}"
        }
      }
    },
    "Type": "Task",
    "Resource": "${queue_granules_task_arn}",
    "Retry": [
      {
        "ErrorEquals": [
          "Lambda.ServiceException",
          "Lambda.AWSLambdaException",
          "Lambda.SdkClientException"
        ],
        "IntervalSeconds": 2,
        "MaxAttempts": 6,
        "BackoffRate": 2
      }
    ],
    "Catch": [
      {
        "ErrorEquals": [
          "States.ALL"
        ],
        "ResultPath": "$.exception",
        "Next": "WorkflowFailed"
      }
    ],
    "End": true
  },
```

Given it has been discovered this task can no longer run in AWS Lambda, you can instead run it on the Cumulus ECS cluster by adding the following resources to your terraform deployment (by either adding a new `.tf` file or updating an existing one):

- A `aws_sfn_activity` resource:

```hcl
resource "aws_sfn_activity" "queue_granules" {
  name = "${var.prefix}-QueueGranules"
}
```

- An instance of the `cumulus_ecs_service` module (found on the [Cumulus releases page](https://github.com/nasa/cumulus/releases) configured to provide the `QueueGranules` task:

```hcl

module "queue_granules_service" {
  source = "https://github.com/nasa/cumulus/releases/download/{version}/terraform-aws-cumulus-ecs-service.zip"

  prefix = var.prefix
  name   = "QueueGranules"

  cluster_arn                           = module.cumulus.ecs_cluster_arn
  desired_count                         = 1
  image                                 = "cumuluss/cumulus-ecs-task:1.9.0"

  cpu                = 400
  memory_reservation = 700

  environment = {
    AWS_DEFAULT_REGION = data.aws_region.current.name
  }
  command = [
    "cumulus-ecs-task",
    "--activityArn",
    aws_sfn_activity.queue_granules.id,
    "--lambdaArn",
    module.cumulus.queue_granules_task.task_arn,
    "--lastModified",
    module.cumulus.queue_granules_task.last_modified_date
  ]
  alarms = {
    MemoryUtilizationHigh = {
      comparison_operator = "GreaterThanThreshold"
      evaluation_periods  = 1
      metric_name         = "MemoryUtilization"
      statistic           = "SampleCount"
      threshold           = 75
    }
  }
}
```

:::note

If you have updated the code for the Lambda specified by `--lambdaArn`, you will have to manually restart the tasks in your ECS service before invocation of the Step Function activity will use the updated Lambda code.

:::

- An updated [Discover Granules workflow](https://github.com/nasa/cumulus/blob/master/example/cumulus-tf/discover_granules_workflow.asl.json)) to utilize the new resource (the `Resource` key in the `QueueGranules` step has been updated to:

`"Resource": "${aws_sfn_activity.queue_granules.id}"`)`

If you then run this workflow in place of the `DiscoverGranules` workflow, the `QueueGranules` step would run as an ECS task instead of a lambda.

## Final note

Step Function Activities and AWS Lambda are not the only ways to run tasks in an AWS Step Function. Learn more about other service integrations, including direct ECS integration via the [AWS Service Integrations](https://docs.aws.amazon.com/step-functions/latest/dg/concepts-connectors.html) page.
