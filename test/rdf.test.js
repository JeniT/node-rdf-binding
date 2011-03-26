var vows = require('vows')
  , assert = require('assert');

var rdf = require('../models/rdf')
  , config = require('../config')
  , reset = config.reset
  , DCT = rdf.DCT
  , RDF = rdf.RDF
  , XSD = rdf.XSD
  , POOLRS = config.POOLRS;

var updateEndpoint = config.updateEndpoint;
var queryEndpoint = config.queryEndpoint;

exports.rdfTests = vows.describe('RDF mangling')
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
  'describing a new object type': {
    topic: function () {
      return rdf.describe({ _uriTemplate: 'http://poolrs.org/id/pool/{slug}'
      , type: { predicate: RDF.type, value: POOLRS.Pool, type: 'uri' }
      , slug: { predicate: DCT.identifier, required: true, pattern: /^[-_.a-zA-Z]+$/ }
      , title: { predicate: DCT.title, required: true, lang: 'en' }
      , description: { predicate: DCT.description }
      , modified: { predicate: DCT.modified, required: true, type: 'dateTime' }
      });
    }, 
    'it should return a function': function (Pool) {
      assert.isFunction(Pool);
    },
    'and then testing a valid slug': function (Pool) {
      assert.isTrue(Pool.valid('slug', 'valid-slug'));
    },
    'and then getting a uri': function (Pool) {
      assert.equal(Pool.uri({ slug: 'valid-slug' }), 'http://poolrs.org/id/pool/valid-slug');
    },
    'and then creating a valid object of that type': {
      topic: function (Pool) {
        return new Pool({ slug: 'valid-slug', title: 'Valid Title', modified: new Date('February 13, 2011 16:57:00') });
      }, 
      'it should return an object': function (pool) {
        assert.isObject(pool);
      },
      'it should have a type of Pool': function (pool) {
        assert.equal(pool.type.uri(), POOLRS.Pool);
      },
      'it should have a slug of `valid-slug`': function (pool) {
        assert.equal(pool.slug, 'valid-slug');
      },
      'it should have a title of `Valid Title`': function (pool) {
        assert.equal(pool.title, 'Valid Title');
      },
      'its description should be undefined': function (pool) {
        assert.isUndefined(pool.description);
      },
      'its slug should be valid': function (pool) {
        assert.isTrue(pool.valid('slug'));
      },
      'its title should be valid': function (pool) {
        assert.isTrue(pool.valid('title'));
      },
      'its description should be valid': function (pool) {
        assert.isTrue(pool.valid('description'));
      },
      'its modified should be a date': function (pool) {
        assert.instanceOf(pool.modified, Date);
      },
      'its uri should be `http://poolrs.org/id/pool/valid-slug`': function (pool) {
        assert.equal(pool.uri(), 'http://poolrs.org/id/pool/valid-slug');
      },
      'its relative uri should be `/id/pool/valid-slug`': function (pool) {
        assert.equal(pool.relativeUri(), '/id/pool/valid-slug');
      },
      'it shouldn\'t create any errors': function (pool) {
        assert.isEmpty(pool.errors);
      },
      'the Turtle should be correct': function (pool) {
        assert.equal(pool.toTurtle(), '<http://poolrs.org/id/pool/valid-slug> <' + RDF.type + '> <' + POOLRS.Pool + '> ; <' + DCT.identifier + '> "valid-slug" ; <' + DCT.title + '> "Valid Title"@en ; <' + DCT.modified + '> "2011-02-13T16:57:00.000Z"^^<' + XSD.dateTime + '> .');
      },
      'then saving that object': {
        topic: function (pool) {
          pool.save(queryEndpoint, updateEndpoint, this.callback);
        },
        'the callback should be called without an error': function (err, savedPool) {
          assert.isNull(err);
        },
        'the saved pool should have the current time as its created time': function (err, savedPool) {
          assert.equal(savedPool.created.toString(), new Date().toString());
        },
        'then changing that object and saving it': {
          topic: function (pool) {
            pool.title = 'Another Valid Title';
            pool.save(queryEndpoint, updateEndpoint, this.callback);
          },
          'the callback should be called without an error': function (err, savedPool) {
            assert.isNull(err);
          },
          'the saved pool should have the current time as its modified time': function (err, savedPool) {
            assert.equal(savedPool.modified.toString(), new Date().toString());
          }
        }
      }
    },
    'and then creating an object with an invalid slug': {
      topic: function (Pool) {
        return new Pool({ slug: 'invalid slug', title: 'Valid Title', modified: new Date('February 13, 2011 16:57:00') })
      },
      'it should have a slug of `invalid slug`': function (pool) {
        assert.equal(pool.slug, 'invalid slug');
      },
      'its slug should be invalid': function (pool) {
        assert.isFalse(pool.valid('slug'));
      },
      'it should be invalid': function (pool) {
        assert.isFalse(pool.valid());
      },
      'it should have a uri': function (pool) {
        assert.equal(pool.uri(), 'http://poolrs.org/id/pool/invalid slug');
      },
      'it should create errors': function (pool) {
        assert.include(pool.errors(), 'invalid slug');
      }
    },
    'and then describing an object with an object property': {
      topic: function (Pool) {
        return rdf.describe({ _uriTemplate: 'http://poolrs.org/id/funnel/{pool.slug}'
        , type: { predicate: RDF.type, value: POOLRS.Funnel, type: 'uri' }
        , pattern: { predicate: POOLRS.pattern }
        , pool: { predicate: POOLRS.funnelsTo, type: Pool }
        });
      }, 
      'and creating an instance of that object where the nested object doesn\'t exist and is invalid': {
        topic: function (Funnel) {
          return new Funnel({ pattern: 'foo', pool: { slug: 'foo' } })
        },
        'its pool property should be a Pool object': function (funnel) {
          assert.isObject(funnel.pool);
        },
        'it should have a uri of `/id/funnel/foo`': function (funnel) {
          assert.equal(funnel.uri(), 'http://poolrs.org/id/funnel/foo');
        },
        'then saving that object': {
          topic: function (funnel) {
            funnel.save(queryEndpoint, updateEndpoint, this.callback);
          },
          'it should give an error': function (err, newFunnel) {
            assert.isObject(err);
          }
        }
      }
    }
  }
});
