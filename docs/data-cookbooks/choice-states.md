---
id: choice-states
title: Choice States
hide_title: false
---

Cumulus supports AWS Step Function [`Choice`](https://docs.aws.amazon.com/step-functions/latest/dg/amazon-states-language-choice-state.html) states. A `Choice` state enables branching logic in Cumulus workflows.

`Choice` state definitions include a list of `Choice Rule`s. Each `Choice Rule` defines a logical operation which compares an input value against a value using a comparison operator. For available comparison operators, review [the AWS docs](https://docs.aws.amazon.com/step-functions/latest/dg/amazon-states-language-choice-state.html).

If the comparison evaluates to `true`, the `Next` state is followed.

## Example

In [examples/cumulus-tf/parse_pdr_workflow.tf](https://github.com/nasa/cumulus/blob/master/example/cumulus-tf/parse_pdr_workflow.tf) the `ParsePdr` workflow uses a `Choice` state, `CheckAgainChoice`, to terminate the workflow once `meta.isPdrFinished: true` is returned by the `CheckStatus` state.

The `CheckAgainChoice` state definition requires an input object of the following structure:

```json
{
  "meta": {
    "isPdrFinished": false
  }
}
```

Given the above input to the `CheckAgainChoice` state, the workflow would transition to the `PdrStatusReport` state.

```json
"CheckAgainChoice": {
  "Type": "Choice",
  "Choices": [
    {
      "Variable": "$.meta.isPdrFinished",
      "BooleanEquals": false,
      "Next": "PdrStatusReport"
    },
    {
      "Variable": "$.meta.isPdrFinished",
      "BooleanEquals": true,
      "Next": "WorkflowSucceeded"
    }
  ],
  "Default": "WorkflowSucceeded"
}
```

## Advanced: Loops in Cumulus Workflows

Understanding the complete `ParsePdr` workflow is not necessary to understanding how `Choice` states work, but `ParsePdr` provides an example of how `Choice` states can be used to create a loop in a Cumulus workflow.

In the complete `ParsePdr` workflow definition, the state `QueueGranules` is followed by `CheckStatus`. From `CheckStatus` a loop starts: Given `CheckStatus` returns `meta.isPdrFinished: false`, `CheckStatus` is followed by `CheckAgainChoice` is followed by `PdrStatusReport` is followed by `WaitForSomeTime`, which returns to `CheckStatus`. Once `CheckStatus` returns `meta.isPdrFinished: true`, `CheckAgainChoice` proceeds to `WorkflowSucceeded`.

![Execution graph of SIPS ParsePdr workflow in AWS Step Functions console](../assets/sips-parse-pdr.png)

## Further documentation

For complete details on `Choice` state configuration options, see [the Choice state documentation](https://docs.aws.amazon.com/step-functions/latest/dg/amazon-states-language-choice-state.html).
