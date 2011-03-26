var url = require('url')
  , date = require('datejs');

var Namespace = function (ns, terms) {
  this._base = ns;
  for (var i = 0; i < terms.length; i++) {
    this[terms[i]] = ns + terms[i];
  }
  return this;
};

Namespace.prototype = {
  namespace: function () {
    return this._base;
  }
};

module.exports.Namespace = Namespace;

var XSD = new Namespace('http://www.w3.org/2001/XMLSchema#', [
  'boolean'
, 'double'
, 'float'
, 'decimal'
, 'integer'
, 'date'
, 'dateTime'
, 'time'
, 'yearMonthDuration'
, 'dayTimeDuration'
]);

module.exports.XSD = XSD;

var toTurtle = function (value, metadata) {
  var literal, uri, bnode;
  if (value.uri || typeof metadata.type === 'function') {
    uri = value.uri ? value.uri() : metadata.type.uri(value);
    if (uri) {
      return '<' + uri.replace(/\>/g, '\\>') + '>';
    } else {
      return null;
    }
  } else if (metadata.type === 'uri') {
    return '<' + value.replace(/\>/g, '\\>') + '>';
  } else if (value instanceof Date) {
    if (metadata.type === 'date') {
      return '"' + value.toString('yyyy-MM-dd') + '"^^<' + XSD.date + '>';
    } else if (metadata.type === 'time') {
      return '"' + value.toString('hh:mm:ss') + '"^^<' + XSD.time + '>';
    } else {
      return '"' + value.toISOString() + '"^^<' + XSD.dateTime + '>';
    }
  } else if (typeof value === 'object') {
    return null;
  } else if (typeof value === 'boolean') {
    return value.toString();
  } else if (typeof value === 'number') {
    return value + '';
  } else {
    literal = '"' + value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/"/g, '\"') + '"';
    if (metadata.lang) {
      literal += '@' + metadata.lang;
    }
    return literal;
  }
};

var whereClause = function (subject, template, search, prefix, types) {
  var where = '';
  var value, optional, constraints, turtleValue, visited;
  var querySubject = subject.substr(0, 1) === '?';
  var recurse = !querySubject;
  types = types || [];
  for (var property in template) {
    constraints = template[property];
    if (constraints.predicate && (!querySubject || !template[property].multiple)) {
      value = search[property] || constraints.value;
      optional = !constraints.required && !value;
      if (optional) {
        where += 'OPTIONAL {\n  ';
      }
      where += subject + ' ';
      where += '<' + constraints.predicate + '> ';
      turtleValue = value ? toTurtle(value, constraints) : null;
      if (turtleValue) {
        where += turtleValue + ' ';
      } else {
        where += '?' + prefix + property + ' '
      }
      where += '.\n';
      
      // recurse into object properties
      if (recurse && typeof constraints.type === 'function') {
        visited = false;
        for (var i = 0; i < types.length; i++) {
          if (types[i] === constraints.type) {
            visited = true;
            break;
          }
        }
        if (!visited) {
          where += whereClause(turtleValue ? turtleValue : '?' + prefix + property, constraints.type.constraints(), search[property] || {}, prefix + property + '_', types.concat([constraints.type]))
        }
      }
      
      // close OPTIONAL clause
      if (optional) {
        where += '}\n';
      }
      // negate properties where the search is for the null value
      if (search[property] === null) {
        where += 'FILTER (!BOUND(?' + prefix + property + '))\n';
      }
    }
  }
  return where;
};

var resolvePath = function (segments, value) {
  if (segments.length > 0 && value) {
    var property = segments[0],
      remaining = segments.slice(1);
    return resolvePath(remaining, value[property])
  } else {
    return value;
  }
};

var jsValue = function (rdfValue) {
  var value = rdfValue.value
    , datatype = rdfValue.datatype;
  var uri;
  if (rdfValue.type === 'uri') {
    uri = value;
    return {
      uri: function () {
        return uri;
      }
    }
  } else if (datatype === XSD.dateTime || datatype === XSD.date || datatype === XSD.time) {
    return new Date(value);
  } else if (datatype === XSD.double || datatype === XSD.float || datatype === XSD.decimal) {
    return Number.parseFloat(value);
  } else if (datatype === XSD.integer) {
    return Number.parseInt(value, 10);
  } else if (datatype === XSD.boolean) {
    return value === 'true';
  } else {
    return value;
  }
};

var emptyObject = function (object) {
  empty = true;
  for (var p in object) {
    return false;
  }
  return empty;
};

var setValue = function (props, constraints, binding, path) {
  var prop = path[0];
  var pLength = prop.length + 1;
  var newBinding = {};
  var value;
  constraints = constraints[prop];
  if (path.length > 1) {
    // create a new set of bindings only from properties that start with the first part of the path
    for (var p in binding) {
      if (p.substr(0, pLength) === prop + '_') {
        newBinding[p.substr(pLength)] = binding[p];
      }
    }
    if (!props[prop]) {
      props[prop] = {};
    }
    // recurse to add properties to the property
    setValue(props[prop], constraints.type.constraints(), newBinding, path.slice(1));
  } else if (!emptyObject(binding[prop])) {
    value = jsValue(binding[prop]);
    if (!props[prop] && constraints.multiple) {
      props[prop] = [];
    }
    if (constraints.multiple) {
      props[prop].push(value);
    } else {
      props[prop] = value;
    }
  }
};

var save = function (instance, constructor, queryEndpoint, updateEndpoint, callback) {
  constructor.exists(instance, queryEndpoint, function () {
    // if this already exists
    constructor.describe(instance.uri(), queryEndpoint, function (err, old) {
      var changed = false;
      var oldValue, newValue;
      if (err) {
        callback(err, null);
      } else {
        for (var p in instance) {
          if (!old[p]) {
            changed = true;
          }
        }
        for (var p in old) {
          if (instance[p]) {
            newValue = instance[p].uri ? instance[p].uri() : instance[p];
            oldValue = old[p].uri ? old[p].uri() : old[p];
            if (oldValue !== newValue) {
              changed = true;
              if (!instance[p]) {
                instance[p] = old[p];
              }
            }
          } else {
            instance[p] = old[p];
          }
        }
        if (changed) {
          instance.modified = new Date();
          old.del(updateEndpoint, function (err, body, res) {
            if (err) {
              callback(err);
            } else {
              updateEndpoint.insertData(instance.toTurtle(), function (err, body, res) {
                if (err) {
                  callback(err, null);
                } else if (res.statusCode >= 400) {
                  callback(new Error('Internal Server Error'), null);
                } else {
                  callback(null, instance);
                }
              });
            }
          });
        } else {
          callback(null, instance);
        }
      }
    });
  }, function () {
    // if this doesn't currently exist
    instance.created = new Date();
    if (instance.valid()) {
      updateEndpoint.insertData(instance.toTurtle(), function (err, body, res) {
        if (err) {
          callback(err, null);
        } else if (res.statusCode >= 400) {
          callback(new Error(body), null);
        } else {
          callback(null, instance);
        }
      });
    } else {
      callback(new Error('Cannot save invalid item'), null);
    }
  });
};

/*
 * This is for templating new objects, so that you can do:
 * var Pool = rdf.describe(template)
 * and the Pool class be set up according to the template.
 * The template looks something like:
 * { _uriTemplate: 'http://poolrs.org/id/pool/{slug}'
 * , slug: { property: DCT.identifier, required: true, pattern: /^[-_.a-zA-Z]+$/ }
 * , title: { property: DCT.title, required: true }
 * , description: { property: DCT.description }
 * }
 */

var describe = function (template) {
  var propertyMap = {};
  for (var property in template) {
    if (template[property].predicate) {
      propertyMap[template[property].predicate] = property;
    }
  }
  
  // this function returns an initialising function
  var constructor = function (props) {
    var value, uri;
    for (var property in template) {
      value = props[property] || template[property].value;
      if (property.substr(0, 1) !== '_' && !(typeof value === 'undefined')) {
        if (typeof template[property].type === 'function' || template[property].type === 'uri') {
          if (typeof value === 'object') {
            if (value.uri) {
              if (typeof value.uri === 'function') {
                this[property] = value;
              } else {
                uri = value.uri;
                // having a uri property implies that the object shouldn't be saved/deleted itself, 
                // only referenced in any generated RDF
                this[property] = value;
                this[property].uri = function () {
                  return uri;
                };
              }
            } else {
              this[property] = new (template[property].type)(value);
            }
          } else if (value) {
            uri = value;
            this[property] = {
              uri: function () {
                return uri;
              }
            }
          }
        } else {
          this[property] = value;
        }
      }
    }
    return this;
  };

  constructor.constraints = function (property) {
    if (property) {
      return template[property];
    } else {
      return template;
    }
  };

  // link together two types
  constructor.link = function (constraints) {
    var property = constraints.property;
    var inverse = {};
    template[property] = constraints;
    if (constraints.inverse && constraints.inverse.property) {
      // build the constraints for the inverse to get
      for (var p in constraints.inverse) {
        inverse[p] = constraints.inverse[p];
      }
      inverse.type = constructor;
      inverse.inverse = {};
      for (var p in constraints) {
        if (p !== 'property' && p !== 'inverse') {
          inverse.inverse[p] = constraints[p];
        }
      }
      // link it up
      constraints.type.link(inverse);
    }
    return this;
  };

  constructor.valid = function (property, value) {
    var constraints = template[property];
    if (constraints.required && !value) return false;
    if (constraints.pattern && !constraints.pattern.test(value)) return false;
    return true;
  };
  
  constructor.uri = function (props) {
    var uri = template._uriTemplate;
    uri = uri.replace(/\{[^}]+\}/g, function (match) {
      var replacement = resolvePath(match.substring(1, match.length - 1).split('.'), props);
      return replacement || match;
    });
    if (/\{/.test(uri)) {
      /* if it still contains {something} pattern then there's a field that's required for the uri
       * that hasn't been completed, so return null */
      return null;
    }
    return uri;
  };
  
  constructor.exists = function (search, endpoint, exists, empty) {
    var uri = constructor.uri(search);
    var sparql;
    if (uri) {
      sparql = '<' + uri + '> ?p ?o . ';
    } else {
      sparql = whereClause('?item', template, search, '', [constructor]);
    }
    endpoint.ask(sparql, exists, empty);
  };
  
  constructor.get = function (search, options, endpoint, callback) {
    if (arguments.length === 3) {
      callback = endpoint;
      endpoint = options;
      options = {};
    }
    var uri = constructor.uri(search);
    var subject, value;
    if (uri) {
      subject = '<' + uri + '>';
    } else {
      subject = '?item';
    }
    var where = whereClause(subject, template, search, '', [constructor]);
    var variables = where.match(/\?[_a-zA-Z0-9]+/g);
    var selects = {};
    for (var i = 0; i < variables.length; i++) {
      selects[variables[i]] = 1;
    }
    var sparql = 'SELECT DISTINCT ';
    for (var variable in selects) {
      sparql += variable + ' ';
    }
    sparql += '\n';
    sparql += 'WHERE { ';
    sparql += where;
    sparql += '}';
    if (options.limit) {
      sparql += ' LIMIT ' + options.limit;
    }
    if (options.orderBy) {
      sparql += ' ORDER BY ' + options.orderBy;
    }
    endpoint.select(sparql, function (err, body, res) {
      if (body.results) {
        var bindings = body.results.bindings;
        var items = [];
        var item, binding, props;
        for (var i = 0; i < bindings.length; i++) {
          props = {};
          for (var prop in search) {
            props[prop] = search[prop];
          }
          binding = bindings[i];
          for (var prop in binding) {
            if (prop !== 'item') {
              setValue(props, template, binding, prop.split('_'));
            }
          }
          item = new constructor(props);
          items.push(item);
        }
        callback(null, items);
      } else {
        callback(new Error('SPARQL select failed:\n' + sparql + '\n' + body), []);
      }
    })
  };
  
  constructor.describe = function (uri, endpoint, callback) {
    var sparql = 'SELECT DISTINCT ?p ?o WHERE { <' + uri + '> ?p ?o . }';
    endpoint.select(sparql, function (err, body, res) {
      if (body.results) {
        var property, binding, value;
        var props = {};
        var bindings = body.results.bindings;
        for (var i = 0; i < bindings.length; i++) {
          binding = bindings[i];
          property = propertyMap[binding.p.value];
          if (property) {
            value = jsValue(binding.o);
            if (template[property].multiple) {
              props[property] = props[property] || [];
              props[property].push(value);
            } else {
              props[property] = value;
            }
          }
        }
        callback(null, new constructor(props));
      } else {
        callback(new Error('SPARQL select failed:\n' + sparql + '\n' + body));
      }
    });
  };
  
  constructor.prototype = {
    properties: function () {
      var properties = {};
      for (var property in template) {
        if (property.substr(0, 1) !== '_') {
          properties[property] = this[property];
        }
      }
      return properties;
    },
    
    uri: function () {
      return constructor.uri(this.properties());
    },
    
    relativeUri: function () {
      var uri = url.parse(this.uri());
      return uri.pathname + (uri.search || '') + (uri.hash || '');
    },
    
    valid: function (property) {
      if (property) {
        return constructor.valid(property, this[property]);
      } else {
        for (var property in this.properties()) {
          if (!this.valid(property)) {
            return false;
          }
        }
        return true;
      }
    },
    
    errors: function () {
      var errors = [];
      for (var property in this.properties()) {
        if (!this.valid(property)) {
          errors.push('invalid ' + property);
        }
      }
      return errors;
    },
    
    toTurtle: function () {
      var constraints, value;
      var turtle = ''
      if (this.uri()) {
        turtle = '<' + this.uri().replace('>', '\>') + '> ';
        for (var property in this.properties()) {
          constraints = template[property];
          if (constraints.predicate && this[property]) {
            value = toTurtle(this[property], constraints);
            if (value) {
              turtle += '<' + constraints.predicate + '> ';
              turtle += value + ' ; ';
            }
          }
        }
        turtle = turtle.substring(0, turtle.length - 2) + '.';
        /*
        for (property in this.properties()) {
          if (this[property] && this[property].toTurtle) {
            turtle += this[property].toTurtle();
          }
        }
        */
      }
      return turtle;

    },
    
    save: function (queryEndpoint, updateEndpoint, callback) {
      var instance = this;
      
      var objectProps = [];
      for (var property in this.properties()) {
        if (typeof template[property].type === 'function' && this[property]) {
          objectProps.push(property);
        }
      }
      
      if (objectProps.length > 0) {
        var savedProps = [];
        var errorProps = [];
        var property;
        for (var i = 0; i < objectProps.length; i++) {
          property = objectProps[i];
          if (this[property].save) {
            this[property].save(queryEndpoint, updateEndpoint, function (err, saved) {
              savedProps.push(property);
              if (err) {
                errorProps.push(property);
              } else {
                this[property] = saved;
              }
              // when all the object properties have been saved, we can look at saving this
              if (savedProps.length === objectProps.length) {
                if (errorProps.length > 0) {
                  callback(new Error('Error saving properties of ' + instance.uri() + ': ' + errorProps.join('; ')), null);
                } else {
                  save(instance, constructor, queryEndpoint, updateEndpoint, callback);
                }
              }
            });
          } else {
            // assume that a reference is all that's needed
            savedProps.push(property);
            if (savedProps.length === objectProps.length) {
              if (errorProps.length > 0) {
                callback(new Error('Error saving properties of ' + this.uri() + ': ' + errorProps.join('; ')), null);
              } else {
                save(this, constructor, queryEndpoint, updateEndpoint, callback);
              }
            }
          }
        }      
      } else {
        save(instance, constructor, queryEndpoint, updateEndpoint, callback);
      }
    },
    
    del: function (endpoint, callback) {
      endpoint.deleteData(this.toTurtle(), callback);
    }
  };
  
  return constructor;
};

module.exports.describe = describe;

module.exports.RDF = new Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#', [
  'type'
, 'value'
, 'subject'
, 'predicate'
, 'object'
, 'first'
, 'rest'
, 'Property'
, 'Statement'
, 'Bag'
, 'Alt'
, 'Seq'
, 'List'
, 'PlainLiteral'
, 'XMLLiteral'
, 'nil'
]);

module.exports.RDFS = new Namespace('http://www.w3.org/2000/01/rdf-schema#', [
  'label'
, 'comment'
, 'subClassOf'
, 'subPropertyOf'
, 'domain'
, 'range'
, 'seeAlso'
, 'isDefinedBy'
, 'member'
, 'Resource'
, 'Class'
, 'Datatype'
, 'Container'
, 'Literal'
, 'ContainerMembershipProperty'
]);

module.exports.SKOS = new Namespace('http://www.w3.org/2004/02/skos/core#', [
  'Concept'
, 'ConceptScheme'
, 'Collection'
, 'OrderedCollection'
, 'inScheme'
, 'hasTopConcept'
, 'topConceptOf'
, 'prefLabel'
, 'altLabel'
, 'hiddenLabel'
, 'notation'
, 'note'
, 'changeNote'
, 'definition'
, 'editorialNote'
, 'example'
, 'historyNote'
, 'scopeNote'
, 'semanticRelation'
, 'broader'
, 'narrower'
, 'related'
, 'broaderTransitive'
, 'narrowerTransitive'
, 'member'
, 'memberList'
, 'mappingRelation'
, 'broadMatch'
, 'narrowMatch'
, 'relatedMatch'
, 'exactMatch'
, 'closeMatch'
]);

module.exports.DCT = new Namespace('http://purl.org/dc/terms/', [
  'title'
, 'creator'
, 'subject'
, 'description'
, 'publisher'
, 'contributor'
, 'date'
, 'type'
, 'format'
, 'identifier'
, 'source'
, 'language'
, 'relation'
, 'coverage'
, 'rights'
, 'audience'
, 'alternative'
, 'tableOfContents'
, 'abstract'
, 'created'
, 'valid'
, 'available'
, 'issued'
, 'modified'
, 'extent'
, 'medium'
, 'isVersionOf'
, 'hasVersion'
, 'isReplacedBy'
, 'replaces'
, 'isRequiredBy'
, 'requires'
, 'isPartOf'
, 'hasPart'
, 'isReferencedBy'
, 'references'
, 'isFormatOf'
, 'hasFormat'
, 'conformsTo'
, 'spatial'
, 'temporal'
, 'mediator'
, 'dateAccepted'
, 'dateCopyrighted'
, 'dateSubmitted'
, 'educationLevel'
, 'accessRights'
, 'bibliographicCitation'
, 'license'
, 'rightsHolder'
, 'provenance'
, 'instructionalMethod'
, 'accrualMethod'
, 'accrualPeriodicity'
, 'accrualPolicy'
, 'Agent'
, 'AgentClass'
, 'BibliographicResource'
, 'FileFormat'
, 'Frequency'
, 'Jurisdiction'
, 'LicenseDocument'
, 'LinguisticSystem'
, 'Location'
, 'LocationPeriodOrJurisdiction'
, 'MediaType'
, 'MediaTypeOrExtent'
, 'MethodOfInstruction'
, 'MethodOfAccrual'
, 'PeriodOfTime'
, 'PhysicalMedium'
, 'PhysicalResource'
, 'Policy'
, 'ProvenanceStatement'
, 'RightsStatement'
, 'SizeOrDuration'
, 'Standard'
, 'ISO639-2'
, 'RFC1766'
, 'URI'
, 'Point'
, 'ISO3166'
, 'Box'
, 'Period'
, 'W3CDTF'
, 'RFC3066'
, 'RFC5646'
, 'RFC4646'
, 'ISO639-3'
, 'LCSH'
, 'MESH'
, 'DDC'
, 'LCC'
, 'UDC'
, 'DCMIType'
, 'IMT'
, 'TGN'
, 'NLM'
]);

module.exports.OPMV = new Namespace('http://purl.org/net/opmv/ns#', [
  'Agent'
, 'Artifact'
, 'Process'
, 'used'
, 'wasControlledBy'
, 'wasDerivedFrom'
, 'wasEncodedBy'
, 'wasEndedAt'
, 'wasGeneratedAt'
, 'wasPerformedAt'
, 'wasStartedAt'
, 'wasTriggeredBy'
, 'wasUsedAt'
]);

module.exports.QB = new Namespace('http://purl.org/linked-data/cube#', [
  'Attachable'
, 'AttributeProperty'
, 'CodedProperty'
, 'ComponentProperty'
, 'ComponentSet'
, 'ComponentSpecification'
, 'DataSet'
, 'DataStructureDefinition'
, 'DimensionProperty'
, 'MeasureProperty'
, 'Observation'
, 'Slice'
, 'SliceKey'
, 'attribute'
, 'codeList'
, 'component'
, 'componentAttachment'
, 'componentProperty'
, 'componentRequired'
, 'concept'
, 'dataSet'
, 'dimension'
, 'measure'
, 'measureDimension'
, 'measureType'
, 'observation'
, 'order'
, 'slice'
, 'sliceKey'
, 'sliceStructure'
, 'structure'
, 'subSlice'
]);

module.exports.SIOC = new Namespace('http://rdfs.org/sioc/ns#', [
  'Community'
, 'Container'
, 'Forum'
, 'Item'
, 'Post'
, 'Role'
, 'Site'
, 'Space'
, 'Thread'
, 'UserAccount'
, 'Usergroup'
, 'about'
, 'account_of'
, 'addressed_to'
, 'administrator_of'
, 'attachment'
, 'avatar'
, 'container_of'
, 'content'
, 'creator_of'
, 'earlier_version'
, 'email'
, 'email_sha1'
, 'embeds_knowledge'
, 'feed'
, 'follows'
, 'function_of'
, 'has_administrator'
, 'has_container'
, 'has_creator'
, 'has_discussion'
, 'has_function'
, 'has_host'
, 'has_member'
, 'has_moderator'
, 'has_modifier'
, 'has_owner'
, 'has_parent'
, 'has_reply'
, 'has_scope'
, 'has_space'
, 'has_subscriber'
, 'has_usergroup'
, 'host_of'
, 'id'
, 'ip_address'
, 'last_activity_date'
, 'last_item_date'
, 'last_reply_date'
, 'later_version'
, 'latest_version'
, 'link'
, 'links_to'
, 'member_of'
, 'moderator_of'
, 'modifier_of'
, 'name'
, 'next_by_date'
, 'next_version'
, 'note'
, 'num_authors'
, 'num_items'
, 'num_replies'
, 'num_threads'
, 'num_views'
, 'owner_of'
, 'parent_of'
, 'previous_by_date'
, 'previous_version'
, 'related_to'
, 'reply_of'
, 'scope_of'
, 'sibling'
, 'space_of'
, 'subscriber_of'
, 'topic'
, 'usergroup_of'
]);



