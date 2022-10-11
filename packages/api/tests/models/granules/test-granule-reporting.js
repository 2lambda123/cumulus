const test = require('ava');

const S3 = require('@cumulus/aws-client/S3');
const awsClients = require('@cumulus/aws-client/services');
const cmrUtils = require('@cumulus/cmrjs/cmr-utils');
const { buildURL } = require('@cumulus/common/URLUtils');
const { randomId } = require('@cumulus/common/test-utils');

const { getGranuleStatus, generateGranuleApiRecord } = require('@cumulus/message/Granules');
const { fakeFileFactory, fakeGranuleFactoryV2 } = require('../../../lib/testUtils');
const Granule = require('../../../models/granules');

test.before(async (t) => {
  process.env.GranulesTable = randomId('granule');

  const fakeStepFunctionUtils = {
    describeExecution: () => Promise.resolve({}),
  };
  const fakeCmrUtils = {
    getGranuleTemporalInfo: () => Promise.resolve({}),
  };

  const granuleModel = new Granule({
    cmrUtils: fakeCmrUtils,
    stepFunctionUtils: fakeStepFunctionUtils,
  });
  t.context.granuleModel = granuleModel;
  await granuleModel.createTable();
});

test.beforeEach((t) => {
  t.context.collectionId = randomId('collection');
  t.context.provider = {
    name: randomId('name'),
    protocol: 's3',
    host: randomId('host'),
  };
  t.context.workflowStartTime = Date.now();
  t.context.workflowStatus = 'completed';
});

test('_storeGranuleRecord() can be used to create a new running granule', async (t) => {
  const { granuleModel } = t.context;

  const granule = fakeGranuleFactoryV2({
    status: 'running',
  });

  await granuleModel._storeGranuleRecord(granule);

  const fetchedItem = await granuleModel.get({ granuleId: granule.granuleId });

  t.is(fetchedItem.status, 'running');
});

test('_storeGranuleRecord() can be used to create a new completed granule', async (t) => {
  const { granuleModel } = t.context;

  const granule = fakeGranuleFactoryV2();

  await granuleModel._storeGranuleRecord(granule);

  const fetchedItem = await granuleModel.get({ granuleId: granule.granuleId });

  t.is(fetchedItem.status, 'completed');
});

test('_storeGranuleRecord() can be used to create a new failed granule', async (t) => {
  const { granuleModel } = t.context;

  const granule = fakeGranuleFactoryV2({ status: 'failed' });

  await granuleModel._storeGranuleRecord(granule);

  const fetchedItem = await granuleModel.get({ granuleId: granule.granuleId });

  t.is(fetchedItem.status, 'failed');
});

test('_storeGranuleRecord() can be used to create a new queued granule', async (t) => {
  const { granuleModel } = t.context;

  const granule = fakeGranuleFactoryV2({
    status: 'queued',
  });

  await granuleModel._storeGranuleRecord(granule);

  const fetchedItem = await granuleModel.get({ granuleId: granule.granuleId });

  t.is(fetchedItem.status, 'queued');
});

test('_storeGranuleRecord() can be used to update a completed granule', async (t) => {
  const { granuleModel } = t.context;

  const granule = fakeGranuleFactoryV2();

  await granuleModel._storeGranuleRecord(granule);

  const updatedGranule = {
    ...granule,
    productVolume: '500',
  };

  await granuleModel._storeGranuleRecord(updatedGranule);

  const fetchedItem = await granuleModel.get({ granuleId: granule.granuleId });

  t.is(fetchedItem.status, 'completed');
  t.is(fetchedItem.productVolume, '500');
});

test('_storeGranuleRecord() can be used to update a failed granule', async (t) => {
  const { granuleModel } = t.context;

  const granule = fakeGranuleFactoryV2({ status: 'failed' });

  await granuleModel._storeGranuleRecord(granule);

  const newError = { cause: 'fail' };
  const updatedGranule = {
    ...granule,
    error: newError,
  };

  await granuleModel._storeGranuleRecord(updatedGranule);

  const fetchedItem = await granuleModel.get({ granuleId: granule.granuleId });

  t.is(fetchedItem.status, 'failed');
  t.deepEqual(fetchedItem.error, newError);
});

test('_storeGranuleRecord() will allow a completed status to replace a running status for same execution', async (t) => {
  const { granuleModel } = t.context;

  const granule = fakeGranuleFactoryV2({ status: 'running' });

  await granuleModel._storeGranuleRecord(granule);

  const updatedGranule = {
    ...granule,
    status: 'completed',
  };

  await granuleModel._storeGranuleRecord(updatedGranule);

  const fetchedItem = await granuleModel.get({ granuleId: granule.granuleId });

  t.deepEqual(fetchedItem, updatedGranule);
});

test('_storeGranuleRecord() will allow a failed status to replace a running status for same execution', async (t) => {
  const { granuleModel } = t.context;

  const granule = fakeGranuleFactoryV2({ status: 'running' });

  await granuleModel._storeGranuleRecord(granule);

  const updatedGranule = {
    ...granule,
    status: 'failed',
  };

  await granuleModel._storeGranuleRecord(updatedGranule);

  const fetchedItem = await granuleModel.get({ granuleId: granule.granuleId });

  t.deepEqual(fetchedItem, updatedGranule);
});

test('_storeGranuleRecord() will not allow a running status to replace a completed status for same execution', async (t) => {
  const { granuleModel } = t.context;

  const granule = fakeGranuleFactoryV2();

  await granuleModel._storeGranuleRecord(granule);

  const updatedGranule = {
    ...granule,
    status: 'running',
  };

  await t.notThrowsAsync(granuleModel._storeGranuleRecord(updatedGranule));

  const fetchedItem = await granuleModel.get({ granuleId: granule.granuleId });

  t.deepEqual(fetchedItem, granule);
});

test('_storeGranuleRecord() will not allow a running status to replace a failed status for same execution', async (t) => {
  const { granuleModel } = t.context;

  const granule = fakeGranuleFactoryV2({ status: 'failed' });

  await granuleModel._storeGranuleRecord(granule);

  const updatedGranule = {
    ...granule,
    status: 'running',
  };

  await t.notThrowsAsync(granuleModel._storeGranuleRecord(updatedGranule));

  const fetchedItem = await granuleModel.get({ granuleId: granule.granuleId });

  t.deepEqual(fetchedItem, granule);
});

test('_storeGranuleRecord() will allow a running status to replace a completed status for a new execution', async (t) => {
  const { granuleModel } = t.context;

  const granule = fakeGranuleFactoryV2();

  await granuleModel._storeGranuleRecord(granule);
  const updateTime = Date.now();

  const updatedGranule = {
    ...granule,
    execution: 'new-execution-url',
    status: 'running',
    createdAt: updateTime,
  };

  await granuleModel._storeGranuleRecord(updatedGranule);

  const fetchedItem = await granuleModel.get({ granuleId: granule.granuleId });

  t.deepEqual(
    fetchedItem,
    {
      ...granule,
      status: 'running',
      createdAt: updateTime,
      execution: 'new-execution-url',
    }
  );
});

test('_storeGranuleRecord() will allow a running status to replace a failed status for a new execution', async (t) => {
  const { granuleModel } = t.context;

  const granule = fakeGranuleFactoryV2({ status: 'failed' });

  await granuleModel._storeGranuleRecord(granule);
  const updateTime = Date.now();

  const updatedGranule = {
    ...granule,
    execution: 'new-execution-url',
    status: 'running',
    createdAt: updateTime,
  };

  await granuleModel._storeGranuleRecord(updatedGranule);

  const fetchedItem = await granuleModel.get({ granuleId: granule.granuleId });

  t.deepEqual(
    fetchedItem,
    {
      ...granule,
      status: 'running',
      createdAt: updateTime,
      execution: 'new-execution-url',
    }
  );
});

test('_storeGranuleRecord() will allow a completed status to replace a queued status for a new execution', async (t) => {
  const { granuleModel } = t.context;

  const granule = fakeGranuleFactoryV2({ status: 'queued' });

  await granuleModel._storeGranuleRecord(granule);
  const updateTime = Date.now();

  const updatedGranule = {
    ...granule,
    execution: 'new-execution-url',
    status: 'completed',
    createdAt: updateTime,
  };

  await granuleModel._storeGranuleRecord(updatedGranule);

  const fetchedItem = await granuleModel.get({ granuleId: granule.granuleId });

  t.deepEqual(
    fetchedItem,
    {
      ...granule,
      status: 'completed',
      createdAt: updateTime,
      execution: 'new-execution-url',
    }
  );
});

test('_storeGranuleRecord() will allow a running status to replace a queued status for a new execution', async (t) => {
  const { granuleModel } = t.context;

  const granule = fakeGranuleFactoryV2({ status: 'queued' });

  await granuleModel._storeGranuleRecord(granule);
  const updateTime = Date.now();

  const updatedGranule = {
    ...granule,
    execution: 'new-execution-url',
    status: 'running',
    createdAt: updateTime,
  };

  await granuleModel._storeGranuleRecord(updatedGranule);

  const fetchedItem = await granuleModel.get({ granuleId: granule.granuleId });

  t.deepEqual(
    fetchedItem,
    {
      ...granule,
      status: 'running',
      createdAt: updateTime,
      execution: 'new-execution-url',
    }
  );
});

test('_storeGranuleRecord() will allow a running status to replace a queued status for the same execution', async (t) => {
  const { granuleModel } = t.context;

  const granule = fakeGranuleFactoryV2({ status: 'queued' });

  await granuleModel._storeGranuleRecord(granule);
  const updateTime = Date.now();

  const updatedGranule = {
    ...granule,
    status: 'running',
    createdAt: updateTime,
  };

  await granuleModel._storeGranuleRecord(updatedGranule);

  const fetchedItem = await granuleModel.get({ granuleId: granule.granuleId });

  t.deepEqual(
    fetchedItem,
    {
      ...granule,
      status: 'running',
      createdAt: updateTime,
    }
  );
});

test('_storeGranuleRecord() will allow a queued status to replace a running status for a new execution', async (t) => {
  const { granuleModel } = t.context;

  const granule = fakeGranuleFactoryV2({ status: 'running' });

  await granuleModel._storeGranuleRecord(granule);
  const updateTime = Date.now();

  const updatedGranule = {
    ...granule,
    execution: 'new-execution-url',
    status: 'queued',
    createdAt: updateTime,
  };

  await granuleModel._storeGranuleRecord(updatedGranule);

  const fetchedItem = await granuleModel.get({ granuleId: granule.granuleId });

  t.deepEqual(
    fetchedItem,
    {
      ...granule,
      status: 'queued',
      createdAt: updateTime,
      execution: 'new-execution-url',
    }
  );
});

test('_storeGranuleRecord() will not allow a queued status to replace running for same execution', async (t) => {
  const { granuleModel } = t.context;

  const granule = fakeGranuleFactoryV2({ status: 'running' });

  await granuleModel._storeGranuleRecord(granule);

  const updatedGranule = {
    ...granule,
    status: 'queued',
  };

  await granuleModel._storeGranuleRecord(updatedGranule);

  const fetchedItem = await granuleModel.get({ granuleId: granule.granuleId });

  t.deepEqual(
    fetchedItem,
    {
      ...granule,
      status: 'running',
    }
  );
});

test('_storeGranuleRecord() will not allow a queued status to replace completed/failed for same execution', async (t) => {
  const { granuleModel } = t.context;

  const granule = fakeGranuleFactoryV2({ status: 'completed' });

  await granuleModel._storeGranuleRecord(granule);

  const updatedGranule = {
    ...granule,
    status: 'queued',
  };

  await granuleModel._storeGranuleRecord(updatedGranule);

  const fetchedItem = await granuleModel.get({ granuleId: granule.granuleId });

  t.deepEqual(
    fetchedItem,
    {
      ...granule,
      status: 'completed',
    }
  );
});

test('_storeGranuleRecord() will allow a completed status to replace queued for same execution', async (t) => {
  const { granuleModel } = t.context;

  const granule = fakeGranuleFactoryV2({ status: 'queued' });

  await granuleModel._storeGranuleRecord(granule);

  const updatedGranule = {
    ...granule,
    status: 'completed',
  };

  await granuleModel._storeGranuleRecord(updatedGranule);

  const fetchedItem = await granuleModel.get({ granuleId: granule.granuleId });

  t.deepEqual(
    fetchedItem,
    {
      ...granule,
      status: 'completed',
    }
  );
});

test('_validateAndStoreGranuleRecord() will not allow a final status for an older execution to replace a running status for a newer execution ', async (t) => {
  const { granuleModel } = t.context;

  const timeVal = Date.now();

  const granule = fakeGranuleFactoryV2();

  const originalGranule = {
    ...granule,
    createdAt: timeVal + 1000000,
    status: 'running',
  };

  await granuleModel._validateAndStoreGranuleRecord(originalGranule);

  const updatedGranule = {
    ...granule,
    execution: 'new-execution-url',
    status: 'failed',
  };

  await t.notThrowsAsync(granuleModel._validateAndStoreGranuleRecord(updatedGranule));

  const fetchedItem = await granuleModel.get({ granuleId: granule.granuleId });

  t.deepEqual(fetchedItem, originalGranule);
});

test('_validateAndStoreGranuleRecord() will not allow a final status for an older execution to replace a final status for a newer execution ', async (t) => {
  const { granuleModel } = t.context;

  const timeVal = Date.now();

  const granule = fakeGranuleFactoryV2();

  const originalGranule = {
    ...granule,
    createdAt: timeVal + 1000000,
    status: 'completed',
  };

  await granuleModel._validateAndStoreGranuleRecord(originalGranule);

  const updatedGranule = {
    ...granule,
    execution: 'alt-execution-url',
    status: 'failed',
  };

  await t.notThrowsAsync(granuleModel._validateAndStoreGranuleRecord(updatedGranule));

  const fetchedItem = await granuleModel.get({ granuleId: granule.granuleId });
  t.deepEqual(fetchedItem, originalGranule);
});

test('_validateAndStoreGranuleRecord() will allow a final status for a new execution to replace a final status for an older execution ', async (t) => {
  const { granuleModel } = t.context;

  const granule = fakeGranuleFactoryV2();

  await granuleModel._validateAndStoreGranuleRecord({
    ...granule,
    status: 'completed',
  });

  const updatedGranule = {
    ...granule,
    createdAt: Date.now(),
    execution: 'alt-execution-url',
    status: 'failed',
  };

  await granuleModel._validateAndStoreGranuleRecord(updatedGranule);

  const fetchedItem = await granuleModel.get({ granuleId: granule.granuleId });

  t.deepEqual(fetchedItem, updatedGranule);
});

test('_validateAndStoreGranuleRecord() does throw validation error', async (t) => {
  const { granuleModel } = t.context;

  const granule = fakeGranuleFactoryV2();
  // granule without granuleId should fail validation
  delete granule.granuleId;

  await t.throwsAsync(granuleModel._validateAndStoreGranuleRecord(granule));
});

test('_validateAndStoreGranuleRecord() throws an error if trying to update granule to failed -> running without a new execution', async (t) => {
  const { granuleModel } = t.context;

  const granule = fakeGranuleFactoryV2({ status: 'failed' });

  await granuleModel._validateAndStoreGranuleRecord(granule);

  const updatedGranule = {
    ...granule,
    status: 'running',
  };

  await t.notThrowsAsync(granuleModel._validateAndStoreGranuleRecord(updatedGranule));
});

test('storeGranule() correctly stores granule record', async (t) => {
  const {
    granuleModel,
    collectionId,
    provider,
    workflowStartTime,
    workflowStatus,
  } = t.context;

  const bucket = randomId('bucket');
  await S3.createBucket(bucket);
  t.teardown(() => S3.recursivelyDeleteS3Bucket(bucket));

  const granule1 = fakeGranuleFactoryV2({
    files: [fakeFileFactory({ bucket })],
  });

  await S3.s3PutObject({ Bucket: bucket, Key: granule1.files[0].key, Body: 'asdf' });

  const files = await granuleModel.fileUtils.buildDatabaseFiles({
    s3: awsClients.s3(),
    providerURL: buildURL(provider),
    files: granule1.files,
  });

  const granuleRecord = await generateGranuleApiRecord({ // TODO -- fix
    granule: granule1,
    files,
    executionUrl: 'http://execution-url.com',
    collectionId,
    provider: provider.id,
    workflowStartTime, // TODO -- fix
    workflowStatus,
    status: getGranuleStatus(workflowStatus, granule1),
    cmrUtils,
    updatedAt: Date.now(),
  });
  await granuleModel.storeGranule(granuleRecord);

  t.true(await granuleModel.exists({ granuleId: granule1.granuleId }));
});
