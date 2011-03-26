/**
 * Module dependencies.
 */

var vows = require('vows')
  , assert = require('assert');

var sparql = require('../models/sparql')
  , config = require('../config')
  , reset = config.reset;

exports.sparqlTests = vows.describe('a sparql endpoint')
.addBatch({
  'resetting the triplestore': {
    topic: function () {
      reset(this.callback);
    }
  , 'it should be deleted': function (err, success) {
      assert.isNull(err);
    }
  }
})
.addBatch({
  'when inserting data': {
    topic: function () {
      endpoint = new sparql.Endpoint('http://localhost:4000/update/');
      endpoint.insertData('<http://example.org/test> a <http://poolrs.org/def/Pool> .', this.callback);
    },
    'the body should be a string': function (err, body, res) {
      assert.isString(body);
    },
    'the response should be an object': function (err, body, res) {
      assert.isObject(res);
    },
    'it should be successful': function (err, body, res) {
      assert.equal(res.statusCode, 200);
    },
    
    'after a successful insertion, a sparql query': {
      topic: function () {
        var endpoint = new sparql.Endpoint('http://localhost:4000/sparql/');
        endpoint.select('SELECT ?p ?o WHERE { <http://example.org/test> ?p ?o . }', this.callback);
      },
      'it should be successful': function (err, body, res) {
        assert.equal(res.statusCode, 200);
      },
      'the body should be a Javascript object': function (err, body, res) {
        assert.isObject(body);
      },
      'it should hold the results': function (err, body, res) {
        assert.isObject(body.results);
      },
      'the results should hold bindings': function (err, body, res) {
        assert.isArray(body.results.bindings);
      },
      'the bindings shouldn\'t be empty': function (err, body, res) {
        assert.isTrue(body.results.bindings.length >= 1);
      },
      'the first binding should contain what was put into the store': function (err, body, res) {
        var binding = body.results.bindings[0];
        assert.isObject(binding);
        assert.isObject(binding.p);
        assert.isObject(binding.o);
        assert.equal(binding.p.type, 'uri');
        assert.equal(binding.p.value, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
        assert.equal(binding.o.type, 'uri');
        assert.equal(binding.o.value, 'http://poolrs.org/def/Pool');
      },
      
      'deleting the data': {
        topic: function () {
          endpoint = new sparql.Endpoint('http://localhost:4000/update/');
          endpoint.deleteData('<http://example.org/test> a <http://poolrs.org/def/Pool> .', this.callback);
        },
        'the body should be a string': function (err, body, res) {
          assert.isString(body);
        },
        'the response should be an object': function (err, body, res) {
          assert.isObject(res);
        },
        'it should be successful': function (err, body, res) {
          assert.equal(res.statusCode, 200);
        },
        
        'after a successful deletion, a sparql query': {
          topic: function () {
            endpoint = new sparql.Endpoint('http://localhost:4000/sparql/');
            endpoint.select('SELECT ?p ?o WHERE { <http://example.org/test> ?p ?o . }', this.callback);
          },
          'it should be successful': function (err, body, res) {
            assert.equal(res.statusCode, 200);
          },
          'the body should be a Javascript object': function (err, body, res) {
            assert.isObject(body);
          },
          'it should hold the results': function (err, body, res) {
            assert.isObject(body.results);
          },
          'the results should hold bindings': function (err, body, res) {
            assert.isArray(body.results.bindings);
          },
          'the bindings should be empty': function (err, body, res) {
            assert.isEmpty(body.results.bindings);
          }
        }
      }
    },
    'a badly formed sparql query': {
      topic: function () {
        endpoint = new sparql.Endpoint('http://localhost:4000/sparql/');
        endpoint.select('SELECT ?p ?o WHERE { <http://example.org/test> ?p ?o .', this.callback);
      },
      'it should not be successful': function (err, body, res) {
        assert.equal(res.statusCode, 400);
      },
      'the body should be a string': function (err, body, res) {
        assert.isString(body);
      }
    }
  },
  'when inserting badly formed data': {
    topic: function () {
      endpoint = new sparql.Endpoint('http://localhost:4000/update/');
      endpoint.insertData('<http://example.org/test> undeclared:prefix <http://poolrs.org/def/Pool> .', this.callback);
    },
    'the body should be a string': function (err, body, res) {
      assert.isString(body);
    },
    'the response should be an object': function (err, body, res) {
      assert.isObject(res);
    },
    'it should return a bad request response': function (err, body, res) {
      assert.equal(res.statusCode, 400);
    },
  },
  'after inserting data': {
    topic: function () {
      endpoint = new sparql.Endpoint('http://localhost:4000/update/');
      endpoint.insertData('<http://example.org/test2> a <http://poolrs.org/def/Pool> .', this.callback);
    },
    'asking for something true': {
      topic: function () {
        endpoint = new sparql.Endpoint('http://localhost:4000/sparql/');
        endpoint.ask('<http://example.org/test2> ?p ?o .', this.callback, function () { return false; });
      },
      'should call the `pass` callback': function (err) {
        assert.isTrue(true);
      }
    },
    'asking for something false': {
      topic: function () {
        endpoint = new sparql.Endpoint('http://localhost:4000/sparql/');
        endpoint.ask('<http://example.org/test3> ?p ?o .', function () { return false; }, this.callback);
      },
      'should call the `fail` callback': function (err) {
        assert.isTrue(true);
      }
    }
  }
})