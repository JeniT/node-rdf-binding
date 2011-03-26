var url = require('url')
  , http = require('http')
  , querystring = require('querystring');

var createPrefixes = function (prefixes) {
  var sparql = '';
  for (p in prefixes) {
    sparql += 'PREFIX ' + p + ': <' + prefixes[p] + '>\n';
  }
  return sparql;
};

var Endpoint = function (uri, prefixes) {
  this.url = url.parse(uri);
  this.prefixes = prefixes || {};
  this.client = http.createClient(this.url.port, this.url.hostname);
};

Endpoint.prototype = {
  
  query: function (sparql, accept, callback) {
    var query = { 'query': sparql };
    var req = this.client.request('GET', this.url.pathname + '?' + querystring.stringify(query), { 
      'host': this.url.hostname,
      'accept': accept
    });
    req.end();
    //console.log('\nSPARQL QUERY to ' + this.url.href + ':\n\n' + sparql + '\n');
    req.on('response', function (res) {
      var body = '';
      res.on('data', function (chunk) {
        body += chunk;
      });
      res.on('end', function () {
        callback(null, body, res);
      });
    });
  },
  
  ask: function (where, pass, fail) {
    var sparql = createPrefixes(this.prefixes) + ' ASK { ' + where + '}';
    var result;
    this.query(sparql, 'application/sparql-results+json', function (err, body, res) {
      if (err) {
        fail(err);
      } else if (res.statusCode >= 400) {
        fail(new Error(body));
      } else {
        var js = JSON.parse(body);
        if (res.headers['server'] === '4s-httpd/v1.0.5'
            && js.warnings) {
          fail(new Error(js.warnings.join('\n')));
        } else if (!js.boolean) {
          fail(null);
        } else {
          pass(null);
        }
      }
    });
  },
  
  select: function (sparql, callback) {
    sparql = createPrefixes(this.prefixes) + sparql;
    this.query(sparql, 'application/sparql-results+json', function (err, body, res) {
      var js = JSON.parse(body);
      if (res.headers['server'] === '4s-httpd/v1.0.5'
          && js.warnings) {
        res.statusCode = 400;
        callback(null, js.warnings.join('\n'), res);
      } else {
        callback(null, js, res);
      }
    });
  },
  
  update: function (sparql, callback) {
    var query = { 'update': sparql };
    var body = querystring.stringify(query);
    var req = this.client.request('POST', this.url.pathname, { 
      'host': this.url.hostname
      , 'content-type': 'application/x-www-form-urlencoded'
      , 'content-length': body.length
    });
    req.end(body);
    //console.log('\nSPARQL UPDATE to ' + this.url.href + ':\n\n' + sparql + '\n');
    req.on('response', function (res) {
      var body = '';
      res.on('data', function (chunk) {
        body += chunk;
      });
      res.on('end', function () {
        /* When the SPARQL isn't parseable, 4store throws back a 200 anyway, but sends back text */
        if (res.headers['server'] === '4s-httpd/v1.0.5' 
            && res.headers['content-type'] === 'text/plain; charset=utf-8'
            && body.replace(/\s/, '') !== '') {
          res.statusCode = 400;
        }
        callback(null, body, res);
      });
    });
  },
  
  insertData: function (rdf, graph, callback) {
    if (!callback && typeof graph === 'function') {
      callback = graph;
      graph = null;
    }
    var sparql = createPrefixes(this.prefixes);
    sparql += 'INSERT DATA {\n';
    if (graph) {
      sparql += 'GRAPH <' + graph + '> {\n';
      sparql += rdf;
      sparql += '}';
    } else {
      sparql += rdf;
    }
    sparql += '}';
    this.update(sparql, callback);
  },
  
  deleteData: function (rdf, graph, callback) {
    if (!callback && typeof graph === 'function') {
      callback = graph;
      graph = null;
    }
    var sparql = createPrefixes(this.prefixes);
    sparql += 'DELETE DATA {\n';
    if (graph) {
      sparql += 'GRAPH <' + graph + '> {\n';
      sparql += rdf;
      sparql += '}';
    } else {
      sparql += rdf;
    }
    sparql += '}';
    this.update(sparql, callback);
  }
  
}

module.exports.Endpoint = Endpoint;