---
id: sips-workflow
title: Science Investigator-led Processing Systems (SIPS)
hide_title: false
---

The Cumulus ingest workflow supports the SIPS workflow. In the following document, we'll discuss what a SIPS workflow is and how to set one up in a Cumulus instance.

In this document, we assume the user already has a provider endpoint configured and ready with some data to ingest. We'll be using an S3 provider and ingesting from a MOD09GQ collection.

## Setup

### Provider

We need to have a [provider](../configuration/data-management-types.md#providers) from whom data can be ingested. Our provider is an S3 provider hosted in the `cumulus-test-internal` bucket.

![Screenshot of Cumulus dashboard screen for configuring an S3 provider](../assets/sips-provider.png)

### Collection

We need to build a collection. Details on collections can be found
[here](../configuration/data-management-types.md#collections). The following collection will have
`MOD09GQ` as a collection name, `006` as a version.

```json
{
  "name": "MOD09GQ",
  "version": "006",
  "process": "modis",
  "sampleFileName": "MOD09GQ.A2017025.h21v00.006.2017034065104.hdf",
  "granuleIdExtraction": "(MOD09GQ\\..*)(\\.hdf|\\.cmr|_ndvi\\.jpg)",
  "granuleId": "^MOD09GQ\\.A[\\d]{7}\\.[\\S]{6}\\.006\\.[\\d]{13}$",
  "files": [
    {
      "bucket": "protected",
      "regex": "^MOD09GQ\\.A[\\d]{7}\\.[\\S]{6}\\.006\\.[\\d]{13}\\.hdf$",
      "sampleFileName": "MOD09GQ.A2017025.h21v00.006.2017034065104.hdf",
      "url_path": "{cmrMetadata.Granule.Collection.ShortName}/{extractYear(cmrMetadata.Granule.Temporal.RangeDateTime.BeginningDateTime)}/{substring(file.fileName, 0, 3)}"
    },
    {
      "bucket": "private",
      "regex": "^MOD09GQ\\.A[\\d]{7}\\.[\\S]{6}\\.006\\.[\\d]{13}\\.hdf\\.met$",
      "sampleFileName": "MOD09GQ.A2017025.h21v00.006.2017034065104.hdf.met"
    },
    {
      "bucket": "protected-2",
      "regex": "^MOD09GQ\\.A[\\d]{7}\\.[\\S]{6}\\.006\\.[\\d]{13}\\.cmr\\.xml$",
      "sampleFileName": "MOD09GQ.A2017025.h21v00.006.2017034065104.cmr.xml"
    },
    {
      "bucket": "public",
      "regex": "^MOD09GQ\\.A[\\d]{7}\\.[\\S]{6}\\.006\\.[\\d]{13}_ndvi\\.jpg$",
      "sampleFileName": "MOD09GQ.A2017025.h21v00.006.2017034065104_ndvi.jpg"
    }
  ],
  "duplicateHandling": "replace",
  "url_path": "{cmrMetadata.Granule.Collection.ShortName}/{substring(file.fileName, 0, 3)}",
}
```

### Rule

Finally, let's create a [rule](../configuration/data-management-types.md#rules). In this example
we're just going to create a `onetime` throw-away rule that will be easy to test
with. This rule will kick off the `DiscoverAndQueuePdrs` workflow, which is the
beginning of a Cumulus SIPS workflow:

![Screenshot of a Cumulus rule configuration](../assets/add_rule.png)

**Note:** A list of configured workflows exists under the "Workflows" in the navigation bar on the Cumulus dashboard. Additionally, one can find a list of executions and their respective status in the "Executions" tab in the navigation bar.

## DiscoverAndQueuePdrs Workflow

This workflow will discover PDRs and queue them to be processed. Duplicate PDRs will be dealt with according to the configured duplicate handling setting in the collection.   The lambdas below are included in the `cumulus` terraform module for use in your workflows:

1. DiscoverPdrs - [source](https://github.com/nasa/cumulus/tree/master/tasks/discover-pdrs)
2. QueuePdrs - [source](https://github.com/nasa/cumulus/tree/master/tasks/queue-pdrs)

![Screenshot of execution graph for discover and queue PDRs workflow in the AWS Step Functions console](../assets/sips-discover-and-queue-pdrs-execution.png)

_An example workflow module configuration can be viewed in the Cumulus source for the [discover_and_queue_pdrs_workflow](https://github.com/nasa/cumulus/blob/master/example/cumulus-tf/discover_and_queue_pdrs_workflow.tf)._

_**Please note:** To use this example workflow module as a template for a new workflow in your deployment the `source` key for the workflow module would need to point to a release of the cumulus-workflow (terraform-aws-cumulus-workflow.zip) module on our [release](https://github.com/nasa/cumulus/releases) page, as all of the provided Cumulus workflows are internally self-referential._

## ParsePdr Workflow

The ParsePdr workflow will parse a PDR, queue the specified granules (duplicates are handled according to the duplicate handling setting) and periodically check the status of those queued granules. This workflow will not succeed until all the granules included in the PDR are successfully ingested. If one of those fails, the ParsePdr workflow will fail. **NOTE** that ParsePdr may spin up multiple IngestGranule workflows in parallel, depending on the granules included in the PDR.

The lambdas below are included in the `cumulus` terraform module for use in your workflows:

1. ParsePdr - [source](https://github.com/nasa/cumulus/tree/master/tasks/parse-pdr)
2. QueueGranules - [source](https://github.com/nasa/cumulus/tree/master/tasks/queue-granules)
3. CheckStatus - [source](https://github.com/nasa/cumulus/tree/master/tasks/pdr-status-check)

![Screenshot of execution graph for SIPS Parse PDR workflow in AWS Step Functions console](../assets/sips-parse-pdr.png)

_An example workflow module configuration can be viewed in the Cumulus source for the [parse_pdr_workflow](https://github.com/nasa/cumulus/blob/master/example/cumulus-tf/parse_pdr_workflow.tf)._

_**Please note:** To use this example workflow module as a template for a new workflow in your deployment the `source` key for the workflow module would need to point to a release of the cumulus-workflow (terraform-aws-cumulus-workflow.zip) module on our [release](https://github.com/nasa/cumulus/releases) page, as all of the provided Cumulus workflows are internally self-referential._

## IngestGranule Workflow

The IngestGranule workflow processes and ingests a granule and posts the granule metadata to CMR.

The lambdas below are included in the `cumulus` terraform module for use in your workflows:

1. SyncGranule - [source](https://github.com/nasa/cumulus/tree/master/tasks/sync-granule).
2. CmrStep - [source](https://github.com/nasa/cumulus/tree/master/tasks/post-to-cmr)

Additionally this workflow requires a processing step you must provide. The ProcessingStep step in the workflow picture below is an example of a custom processing step.

**Note:** Using the CmrStep is not required and can be left out of the processing trajectory if desired (for example, in testing situations).

![Screenshot of execution graph for SIPS IngestGranule workflow in AWS Step Functions console](../assets/sips-ingest-granule.png)

_An example workflow module configuration can be viewed in the Cumulus source for the [ingest_and_publish_granule_workflow](https://github.com/nasa/cumulus/blob/master/example/cumulus-tf/ingest_and_publish_granule_workflow.tf)._

_**Please note:** To use this example workflow module as a template for a new workflow in your deployment the `source` key for the workflow module would need to point to a release of the cumulus-workflow (terraform-aws-cumulus-workflow.zip) module on our [release](https://github.com/nasa/cumulus/releases) page, as all of the provided Cumulus workflows are internally self-referential._

## Summary

In this cookbook we went over setting up a collection, rule, and provider for a SIPS workflow. Once we had the setup completed, we looked over the Cumulus workflows that participate in parsing PDRs, ingesting and processing granules, and updating CMR.
