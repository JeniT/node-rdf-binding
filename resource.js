var config = require('../config')
  , date = require('datejs');

var associate = function (path, objectType) {
  var steps = path.split('/');
  var kind = steps[1];
  return function (app) {
    app.get('/' + kind, list(kind, objectType));
    app.post('/' + kind, save(kind, objectType));
    app.get(path, get(kind, objectType));
    app.post(path, save(kind, objectType));
    app.del(path, del(kind, objectType));
    app.get('/id' + path, redirectTo(kind, objectType));
  };
};

function buildProps (steps, value, props) {
  props[steps[0]] = steps.length > 1 ? buildProps(steps.slice(1), value, props[steps[0]] || {}) : value;
  return props;
};

function searchObject (req) {
  var props = {};
  for (var p in req.params) {
    props = buildProps(p.split('_'), req.params[p], props);
  }
  return props;
};

function list (kind, objectType) {
  return function (req, res) {
    objectType.get({ deleted: null }, config.queryEndpoint, function (err, items) {
      res.render(kind + '/index', {
        locals: {
          pageClass: kind
        , items: items
        , constraints: objectType.constraints()
        }
      });
    });
  };
}

function get (kind, objectType) {
  return function (req, res) {
    var search = searchObject(req);
    var item;
    console.log('SEARCHING FOR:');
    console.log(search);
    objectType.get(search, config.queryEndpoint, function (err, items) {
      if (err || items.length === 0) {
        res.render('error', {
          status: 404,
          locals: {
            pageClass: 'error'
          , title: 'Not Found'
          }
        });
      } else if (items[0].deleted) {
        item = items[0];
        objectType.get({ deleted: null }, config.queryEndpoint, function (err, items) {
          if (err || items.length === 0) {
            res.render('error', {
              status: 404,
              locals: {
                pageClass: 'error'
              , title: 'Not Found'
              }
            });
          } else {
            res.render(kind + '/' + kind, {
              locals: {
                pageClass: kind
              , item: item
              , items: items
              , constraints: objectType.constraints()
              }
            });
          }
        });
      } else {
        res.render(kind + '/' + kind, {
          locals: {
            pageClass: kind
          , item: items[0]
          , constraints: objectType.constraints()
          , changed: items[0].modified || items[0].created
          }
        });
      }
    });
  };
}

function save (kind, objectType) {
  return function (req, res) {
    var search = searchObject(req);
    var props = req.body;
    for (var p in search) {
      props[p] = search[p];
    }
    var item = new objectType(props);
    item.save(config.queryEndpoint, config.updateEndpoint, function (err, newItem) {
      if (err) {
        objectType.get({ deleted: null }, config.queryEndpoint, function (err, items) {
          res.render(kind + '/index', {
            status: 400
          , locals: {
              pageClass: kind
            , items: items
            , constraints: objectType.constraints()
            , newItem: item
            , error: 'Unable to save the ' + kind
            }
          });
        });
      } else {
        res.redirect(item.relativeUri(), 303);
      }
    });
  };
}

function del (kind, objectType) {
  return function (req, res) {
    var search = searchObject(req);
    var old = new objectType(search);
    old.deleted = new Date();
    old.save(config.queryEndpoint, config.updateEndpoint, function (err, savedItem) {
      if (err) {
        res.render('error', {
          status: 500
        , locals: {
            pageClass: 'error'
          , title: 'Internal Server Error'
          }
        });
      } else {
        objectType.get({ deleted: null }, config.queryEndpoint, function (err, items) {
          res.render(kind + '/' + kind, {
            locals: {
              pageClass: kind
            , item: savedItem
            , items: items
            , constraints: objectType.constraints()
            , changed: old.deleted
            , message: 'Successfully deleted'
            }
          });
        });
      }
    });
  };
}

function redirectTo (kind, objectType) {
  return function (req, res) {
    var search = searchObject(req);
    var item = new objectType(search);
    objectType.get(item, config.queryEndpoint, function (err, items) {
      if (err || items.length === 0) {
        res.render('error', {
          status: 404,
          locals: {
            pageClass: 'error'
          , title: 'Not Found'
          }
        });
      } else {
        res.redirect(items[0].relativeUri().replace('/id/', '/'), 303);
      }
    });
  };
}

module.exports.associate = associate;