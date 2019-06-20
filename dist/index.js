"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var tslib_1 = require("tslib");
/// <reference types="cypress" />
var graphql_1 = require("graphql");
var graphql_2 = require("graphql");
var graphql_tools_1 = require("graphql-tools");
/**
 * Adds a .mockGraphql() and .mockGraphqlOps() methods to the cypress chain.
 *
 * The .mockGraphql should be called in the cypress "before" or "beforeEach" block
 * config to setup the server.
 *
 * By default, it will use the /graphql endpoint, but this can be changed
 * depending on the server implementation
 *
 * It takes an "operations" object, representing the named operations
 * of the GraphQL server. This is combined with the "mocks" option,
 * to modify the output behavior per test.
 *
 * The .mockGraphqlOps() allows you to configure the mock responses at a
 * more granular level
 *
 * For example, if we has a query called "UserQuery" and wanted to
 * explicitly force a state where a viewer is null (logged out), it would
 * look something like:
 *
 * .mockGraphqlOps({
 *   operations: {
 *     UserQuery: {
 *       viewer: null
 *     }
 *   }
 * })
 */
Cypress.Commands.add("mockGraphql", function(options) {
  var _a = options.endpoint,
    endpoint = _a === void 0 ? "/graphql" : _a,
    _b = options.operations,
    operations = _b === void 0 ? {} : _b,
    _c = options.mocks,
    mocks = _c === void 0 ? {} : _c;
  var schema = graphql_tools_1.makeExecutableSchema({
    typeDefs: schemaAsSDL(options.schema)
  });
  graphql_tools_1.addMockFunctionsToSchema({
    schema: schema,
    mocks: mocks
  });
  var currentOps = operations;
  cy.on("window:before:load", function(win) {
    var originalFetch = win.fetch;
    function mockGraphqlResponse(payload) {
      var operationName = payload.operationName,
        query = payload.query,
        variables = payload.variables;
      // If using apollo-link-persisted-queries, return an error so that Apollo
      // Client will retry as a standard GraphQL query <https://git.io/fjV9B>:
      if (payload.extensions && payload.extensions.persistedQuery) {
        return Promise.resolve({
          errors: [{ message: "PersistedQueryNotSupported" }]
        });
      }
      return graphql_1.graphql({
        schema: schema,
        source: query,
        variableValues: variables,
        operationName: operationName,
        rootValue: getRootValue(currentOps, operationName, variables)
      });
    }
    function fetch(input, init) {
      if (typeof input !== "string") {
        throw new Error(
          "Currently only support fetch(url, options), saw fetch(Request)"
        );
      }
      if (input.indexOf(endpoint) !== -1 && init && init.method === "POST") {
        var payload = JSON.parse(init.body);
        // If an array of queries is sent, we're likely using apollo-link-batch-http
        // and should resolve each of them independently before responding.
        var response = Array.isArray(payload)
          ? Promise.all(payload.map(mockGraphqlResponse))
          : mockGraphqlResponse(payload);
        return response.then(function(data) {
          return new Response(JSON.stringify(data));
        });
      }
      return originalFetch(input, init);
    }
    cy.stub(win, "fetch", fetch).as("fetchStub");
  });
  //
  cy.wrap({
    setOperations: function(newOperations) {
      currentOps = tslib_1.__assign({}, currentOps, newOperations);
    }
  }).as(getAlias(options));
});
Cypress.Commands.add("mockGraphqlOps", function(options) {
  cy.get("@" + getAlias(options)).invoke(
    "setOperations",
    options.operations || {}
  );
});
var getAlias = function(_a) {
  var name = _a.name,
    endpoint = _a.endpoint;
  if (name || endpoint) {
    return "mockGraphqlOps:" + (name || endpoint);
  }
  return "mockGraphqlOps";
};
// Takes the schema either as the full .graphql file (string) or
// the introspection object.
function schemaAsSDL(schema) {
  if (typeof schema === "string" || Array.isArray(schema)) {
    return schema;
  }
  return graphql_2.printSchema(graphql_2.buildClientSchema(schema));
}
function getRootValue(operations, operationName, variables) {
  if (!operationName || !operations[operationName]) {
    return {};
  }
  var op = operations[operationName];
  if (typeof op === "function") {
    return op(variables);
  }
  return op;
}
