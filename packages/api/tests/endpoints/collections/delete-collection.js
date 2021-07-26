'use strict';

const test = require('ava');
const request = require('supertest');
const awsServices = require('@cumulus/aws-client/services');
const {
  recursivelyDeleteS3Bucket,
} = require('@cumulus/aws-client/S3');
const { randomString } = require('@cumulus/common/test-utils');
const {
  localStackConnectionEnv,
  generateLocalTestDb,
  destroyLocalTestDb,
  CollectionPgModel,
} = require('@cumulus/db');
const {
  constructCollectionId,
} = require('@cumulus/message/Collections');
const EsCollection = require('@cumulus/es-client/collections');
const {
  createTestIndex,
  cleanupTestIndex,
} = require('@cumulus/es-client/testUtils');

const { migrationDir } = require('../../../../../lambdas/db-migration');

const models = require('../../../models');
const {
  fakeCollectionFactory,
  createFakeJwtAuthToken,
  setAuthorizedOAuthUsers,
  createCollectionTestRecords,
} = require('../../../lib/testUtils');
const assertions = require('../../../lib/assertions');
const { fakeRuleFactoryV2 } = require('../../../lib/testUtils');
const { del } = require('../../../endpoints/collections');

process.env.AccessTokensTable = randomString();
process.env.CollectionsTable = randomString();
process.env.stackName = randomString();
process.env.system_bucket = randomString();
process.env.TOKEN_SECRET = randomString();

// import the express app after setting the env variables
const { app } = require('../../../app');

const { buildFakeExpressResponse } = require('../utils');

let jwtAuthToken;
let accessTokenModel;
let ruleModel;

const testDbName = randomString(12);

test.before(async (t) => {
  process.env = {
    ...process.env,
    ...localStackConnectionEnv,
    PG_DATABASE: testDbName,
  };

  const { knex, knexAdmin } = await generateLocalTestDb(testDbName, migrationDir);
  t.context.testKnex = knex;
  t.context.testKnexAdmin = knexAdmin;

  t.context.collectionPgModel = new CollectionPgModel();

  const { esIndex, esClient } = await createTestIndex();
  t.context.esIndex = esIndex;
  t.context.esClient = esClient;
  t.context.esCollectionClient = new EsCollection(
    {},
    undefined,
    t.context.esIndex
  );

  await awsServices.s3().createBucket({ Bucket: process.env.system_bucket }).promise();

  t.context.collectionModel = new models.Collection({ tableName: process.env.CollectionsTable });
  await t.context.collectionModel.createTable();

  const username = randomString();
  await setAuthorizedOAuthUsers([username]);

  accessTokenModel = new models.AccessToken();
  await accessTokenModel.createTable();

  jwtAuthToken = await createFakeJwtAuthToken({ accessTokenModel, username });

  process.env.RulesTable = randomString();
  ruleModel = new models.Rule();
  await ruleModel.createTable();

  await awsServices.s3().putObject({
    Bucket: process.env.system_bucket,
    Key: `${process.env.stackName}/workflow_template.json`,
    Body: JSON.stringify({}),
  }).promise();
});

test.beforeEach(async (t) => {
  t.context.testCollection = fakeCollectionFactory();
  await t.context.collectionModel.create(t.context.testCollection);
});

test.after.always(async (t) => {
  await accessTokenModel.deleteTable();
  await t.context.collectionModel.deleteTable();
  await recursivelyDeleteS3Bucket(process.env.system_bucket);
  await cleanupTestIndex(t.context);
  await ruleModel.deleteTable();
  await destroyLocalTestDb({
    knex: t.context.testKnex,
    knexAdmin: t.context.testKnexAdmin,
    testDbName,
  });
});

test('Attempting to delete a collection without an Authorization header returns an Authorization Missing response', async (t) => {
  const { testCollection } = t.context;
  const response = await request(app)
    .delete(`/collections/${testCollection.name}/${testCollection.version}`)
    .set('Accept', 'application/json')
    .expect(401);

  t.is(response.status, 401);
  t.true(
    await t.context.collectionModel.exists(
      testCollection.name,
      testCollection.version
    )
  );
});

test('Attempting to delete a collection with an invalid access token returns an unauthorized response', async (t) => {
  const response = await request(app)
    .delete('/collections/asdf/asdf')
    .set('Accept', 'application/json')
    .set('Authorization', 'Bearer ThisIsAnInvalidAuthorizationToken')
    .expect(401);

  assertions.isInvalidAccessTokenResponse(t, response);
});

test.todo('Attempting to delete a collection with an unauthorized user returns an unauthorized response');

test('Deleting a collection removes it from all data stores', async (t) => {
  const { originalCollection } = await createCollectionTestRecords(t.context);

  t.true(
    await t.context.collectionModel.exists(
      originalCollection.name,
      originalCollection.version
    )
  );
  t.true(await t.context.collectionPgModel.exists(t.context.testKnex, {
    name: originalCollection.name,
    version: originalCollection.version,
  }));
  t.true(
    await t.context.esCollectionClient.exists(
      constructCollectionId(originalCollection.name, originalCollection.version)
    )
  );

  await request(app)
    .delete(`/collections/${originalCollection.name}/${originalCollection.version}`)
    .set('Accept', 'application/json')
    .set('Authorization', `Bearer ${jwtAuthToken}`)
    .expect(200);

  t.false(
    await t.context.collectionModel.exists(
      originalCollection.name,
      originalCollection.version
    )
  );
  t.false(await t.context.collectionPgModel.exists(t.context.testKnex, {
    name: originalCollection.name,
    version: originalCollection.version,
  }));
  t.false(
    await t.context.esCollectionClient.exists(
      constructCollectionId(originalCollection.name, originalCollection.version)
    )
  );
});

test('Deleting a collection without a record in RDS succeeds', async (t) => {
  const { testCollection } = t.context;

  await request(app)
    .delete(`/collections/${testCollection.name}/${testCollection.version}`)
    .set('Accept', 'application/json')
    .set('Authorization', `Bearer ${jwtAuthToken}`)
    .expect(200);

  t.false(
    await t.context.collectionModel.exists(
      testCollection.name,
      testCollection.version
    )
  );
});

test('Attempting to delete a collection with an associated rule returns a 409 response', async (t) => {
  const { testCollection } = t.context;

  const rule = fakeRuleFactoryV2({
    collection: {
      name: testCollection.name,
      version: testCollection.version,
    },
    rule: {
      type: 'onetime',
    },
  });

  // The workflow message template must exist in S3 before the rule can be created
  await awsServices.s3().putObject({
    Bucket: process.env.system_bucket,
    Key: `${process.env.stackName}/workflows/${rule.workflow}.json`,
    Body: JSON.stringify({}),
  }).promise();

  await ruleModel.create(rule);

  const response = await request(app)
    .delete(`/collections/${testCollection.name}/${testCollection.version}`)
    .set('Accept', 'application/json')
    .set('Authorization', `Bearer ${jwtAuthToken}`)
    .expect(409);

  t.is(response.status, 409);
  t.is(response.body.message, `Cannot delete collection with associated rules: ${rule.name}`);
});

test('Attempting to delete a collection with an associated rule does not delete the provider', async (t) => {
  const { testCollection } = t.context;

  const rule = fakeRuleFactoryV2({
    collection: {
      name: testCollection.name,
      version: testCollection.version,
    },
    rule: {
      type: 'onetime',
    },
  });

  // The workflow message template must exist in S3 before the rule can be created
  await awsServices.s3().putObject({
    Bucket: process.env.system_bucket,
    Key: `${process.env.stackName}/workflows/${rule.workflow}.json`,
    Body: JSON.stringify({}),
  }).promise();

  await ruleModel.create(rule);

  await request(app)
    .delete(`/collections/${testCollection.name}/${testCollection.version}`)
    .set('Accept', 'application/json')
    .set('Authorization', `Bearer ${jwtAuthToken}`)
    .expect(409);

  t.true(await t.context.collectionModel.exists(testCollection.name, testCollection.version));
});

test('del() does not remove from PostgreSQL/Elasticsearch if removing from Dynamo fails', async (t) => {
  const {
    originalCollection,
  } = await createCollectionTestRecords(
    t.context
  );

  const fakeCollectionsModel = {
    get: () => Promise.resolve(originalCollection),
    delete: () => {
      throw new Error('something bad');
    },
    create: () => Promise.resolve(true),
  };

  const expressRequest = {
    params: {
      name: originalCollection.name,
      version: originalCollection.version,
    },
    body: originalCollection,
    testContext: {
      knex: t.context.testKnex,
      collectionsModel: fakeCollectionsModel,
    },
  };

  const response = buildFakeExpressResponse();

  await t.throwsAsync(
    del(expressRequest, response),
    { message: 'something bad' }
  );

  t.deepEqual(
    await t.context.collectionModel.get({
      name: originalCollection.name,
      version: originalCollection.version,
    }),
    originalCollection
  );
  t.true(
    await t.context.collectionPgModel.exists(t.context.testKnex, {
      name: originalCollection.name,
      version: originalCollection.version,
    })
  );
  t.true(
    await t.context.esCollectionClient.exists(
      constructCollectionId(originalCollection.name, originalCollection.version)
    )
  );
});

test('del() does not remove from Dynamo/Elasticsearch if removing from PostgreSQL fails', async (t) => {
  const {
    originalCollection,
  } = await createCollectionTestRecords(
    t.context
  );

  const fakeCollectionPgModel = {
    delete: () => {
      throw new Error('something bad');
    },
  };

  const expressRequest = {
    params: {
      name: originalCollection.name,
      version: originalCollection.version,
    },
    body: originalCollection,
    testContext: {
      knex: t.context.testKnex,
      collectionPgModel: fakeCollectionPgModel,
    },
  };

  const response = buildFakeExpressResponse();

  await t.throwsAsync(
    del(expressRequest, response),
    { message: 'something bad' }
  );

  t.deepEqual(
    await t.context.collectionModel.get({
      name: originalCollection.name,
      version: originalCollection.version,
    }),
    originalCollection
  );
  t.true(
    await t.context.collectionPgModel.exists(t.context.testKnex, {
      name: originalCollection.name,
      version: originalCollection.version,
    })
  );
  t.true(
    await t.context.esCollectionClient.exists(
      constructCollectionId(originalCollection.name, originalCollection.version)
    )
  );
});

test('del() does not remove from Dynamo/PostgreSQL if removing from Elasticsearch fails', async (t) => {
  const {
    originalCollection,
  } = await createCollectionTestRecords(
    t.context
  );

  const fakeEsClient = {
    delete: () => {
      throw new Error('something bad');
    },
  };

  const expressRequest = {
    params: {
      name: originalCollection.name,
      version: originalCollection.version,
    },
    body: originalCollection,
    testContext: {
      knex: t.context.testKnex,
      esClient: fakeEsClient,
    },
  };

  const response = buildFakeExpressResponse();

  await t.throwsAsync(
    del(expressRequest, response),
    { message: 'something bad' }
  );

  t.deepEqual(
    await t.context.collectionModel.get({
      name: originalCollection.name,
      version: originalCollection.version,
    }),
    originalCollection
  );
  t.true(
    await t.context.collectionPgModel.exists(t.context.testKnex, {
      name: originalCollection.name,
      version: originalCollection.version,
    })
  );
  t.true(
    await t.context.esCollectionClient.exists(
      constructCollectionId(originalCollection.name, originalCollection.version)
    )
  );
});