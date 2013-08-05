var express = require('express')
  , connect = require('connect')
  , _ = require('underscore')
  , Q = require('q')
  , url = require('url')
  , utils = connect.utils
  , NeoRequest = require('./neorequest');

var app = exports = module.exports = {};
__app = null;

app.init = function(options){
	__app = this;
	this.entities = [];
	this.connections = [];
	this.customProperties = [];
	this.customEndpoints = [];
	this.accessRules = [];
	this.afterProcessingFns = [];
	this.beforeProcessingFns = [];
	this.neorequest = new NeoRequest(this.neo4j_url, this);
	this.q = Q;
}

app.endpoint = function(arg1, arg2, arg3) {
	if(typeof(arg2) == 'function' || typeof(arg3) == 'function') {
		if(arg1.indexOf('.') > 0) {
			this.addCustomProperty(arg1, arg2, arg3);
		} else {
			this.addCustomEndpoint(arg1, arg2);
		}
	} else if(arg1.indexOf('.') > 0) this.addConnection(arg1, arg2, arg3);
	else this.addEntity(arg1, arg2);
	return this;
}

app.addEntity = function(entityName, options) {

	//config info
	this.get('/config', function(req, res) {
		res.send({
			entities: __app.entities,
			connections: __app.connections,
			customProperties: __app.customProperties,
			customEndpoints: __app.customEndpoints
		});
	});

	var entity = {};
	entity.name = entityName;
	entity.indexName = (options && options.collectionName ? options.collectionName : entityName + 's');
	entity.key = (options && options.key ? options.key : 'id');
	
	//check if entity has already been added
	var existingEntity = _.find(this.entities, function(itm) { return itm.name == entity.name });
	if(existingEntity) throw new Error("Entity '" + entity.name + "' has already been added!");
	
	this.entities.push(entity);
	this.neorequest.entities = this.entities;
	
	//create routes for...
	//CREATE node
	this.post('/' + entity.indexName, nodeCreateHandler);
	this.post('/' + entity.indexName + '/:keyvalue', nodeCreateHandler);
	
	//GET node
	this.get('/' + entity.indexName + '/:keyvalue', nodeGetHandler);		
	
	//UPDATE node
	this.put('/' + entity.indexName + '/:keyvalue', nodeUpdateHandler);
	
	//DELETE node
	this.delete('/' + entity.indexName + '/:keyvalue', nodeDeleteHandler);
	
	return this;	
}

app.addConnection = function(a, b, c) {
	var endpoint1, endpoint2, connectionName;
	endpoint1 = a;
	if(!c) {
		endpoint2 = a;
		connectionName = b;
	} else {
		endpoint2 = b;
		connectionName = c;
	}
	var endpoint1Parts = endpoint1.split('.');
	var endpoint2Parts = endpoint2.split('.');
	var startEntName = endpoint1Parts[0];
	var endEntName = endpoint2Parts[0];
	
	var startEntity = _.find(this.entities, function(itm) { return itm.name == startEntName });
	var endEntity = _.find(this.entities, function(itm) { return itm.name == endEntName });
	
	var startConn = {
		"index": startEntity.indexName,
		"key": startEntity.key,
		"connection" : endpoint1Parts[1],
		"entity": startEntity
	}; var endConn = {
		"index": endEntity.indexName,
		"key": endEntity.key,
		"connection" : endpoint2Parts[1],
		"entity": endEntity
	};
	
	if(!startEntity) throw new Error("Entity for '" + startConn.index + "' does not exist");
	if(!endEntity) throw new Error("Entity for '" + endConn.index + "' does not exist");
	
	//TODO: check if connection exists, throw an error if it does
	var connection = {
		"relationshipName": connectionName, 
		"outboundPath": startEntity.name + "." + startConn.connection,
		"inboundPath": endEntity.name + "." + endConn.connection,
		"start": startConn, 
		"end": endConn
	};
	this.connections.push(connection);
	//this.connections.entities = this.connections;
	
	//routes for start entity
	this.post('/' + startConn.index + '/:keyvalue/' + startConn.connection, relationshipCreateHandler);
	this.get('/' + startConn.index + '/:keyvalue/' + startConn.connection, relationshipGetHandler);
	this.delete('/' + startConn.index + '/:keyvalue/' + startConn.connection + '/:connectionkeyvalue', relationshipDeleteHandler);
	
	//routes for end entity
	this.post('/' + endConn.index + '/:keyvalue/' + endConn.connection, relationshipCreateHandler);
	this.get('/' + endConn.index + '/:keyvalue/' + endConn.connection, relationshipGetHandler);
	this.delete('/' + endConn.index + '/:keyvalue/' + endConn.connection + '/:connectionkeyvalue', relationshipDeleteHandler);

	return this;
}

app.addCustomProperty = function() {
	var baseEntityName, returnEntityName, propertyName, fn;
	baseEntityName = arguments[0].split('.')[0];
	propertyName = arguments[0].split('.')[1];
	if(typeof(arguments[1]) == 'function') fn = arguments[1];
	else {
		returnEntityName = arguments[1];
		fn = arguments[2];
	}

	var customProp = {
		property: propertyName,
		fn: fn
	};

	customProp.baseEntity = _.find(this.entities, function(itm) { return itm.name == baseEntityName; });
	if(!customProp.baseEntity) throw new Error("Entity for '" + baseEntityName + "' does not exist");

	if(returnEntityName) {
		customProp.returnEntity = _.find(this.entities, function(itm) { return itm.name == returnEntityName; });
		if(!customProp.returnEntity ) throw new Error("Entity for '" + returnEntityName + "' does not exist");
	}

	this.customProperties.push(customProp);

	//routes for custom property
	this.get('/' + customProp.baseEntity.indexName + '/:keyvalue/' + customProp.property, function(req, res) {
		var reqInfo = new RequestInfo(req, res);
		var neoReq = new NeoRequest(__app.neo4j_url, __app, reqInfo);
		fn(reqInfo, neoReq).then(function(r) {
			res.send(r);
		}, function(err) {
			res.statusCode = 500;
			res.send(errorResp(err));
		});
	});

}

app.addCustomEndpoint = function(endpointName, fn) {

	this.customEndpoints.push(endpointName);

	this.get('/' + endpointName, function(req, res) {
		var reqInfo = new RequestInfo(req, res);
		var neoReq = new NeoRequest(__app.neo4j_url, __app, reqInfo);
		fn(reqInfo, neoReq).then(function(r) {
			res.send(r);
		}, function(err) {
			res.statusCode = 500;
			res.send(errorResp(err));
		});
	});
}

app.after = function(operations, path, func) {
	return this.processingFunc(false, operations, path, func);
}

app.before = function(operations, path, func) {
	return this.processingFunc(true, operations, path, func);
}

app.processingFunc = function(before, operations, path, func) {
	var processStore = (before ? this.beforeProcessingFns : this.afterProcessingFns);
	var ops = operations.split(',');
	for(var i in ops) {
		var op = ops[i];
		var fnObj = {
			operation: op,
			path: path,
			func: func
		}
		processStore.push(fnObj);
	}
	return this;
}

app.accessRule = function(operations, path, func) {
	var pathParts = path.split('.');	
	var paths = [];
	paths.push(path);
	if(pathParts.length > 1) { //the access rule is for a connection
		//find the path for the inverse of the connection (i.e. if the path is user.bands, find band.members.  the same rules will be applied to both)
		var inversePath;
		var conn = this.getConnection(path);
		if(!conn) throw new Error("Connection '" + path + "' doesn't exist");
		if(conn.start.entity.name == pathParts[0]) inversePath = conn.inboundPath;
		else if(conn.end.entity.name == pathParts[0]) inversePath = conn.outboundPath;
		if(path != inversePath) paths.push(inversePath);
	}
	
	var ops = operations.split(',');
	for(var i in ops) {
		var op = ops[i];
		for(var j in paths) {
			var p = paths[j];
			var rule = {
				operation: op,
				path: p,
				func: func
			}
			this.accessRules.push(rule);
		}
	}
	return this;
}

app.getEntity = function(indexName) { return _.find(this.entities, function(itm) { return itm.indexName == indexName; }); }
app.getConnection = function(pathOrName, startEntityName, endEntityName) {
	if(pathOrName.indexOf(".") > -1) {
		return _.find(this.connections, function(itm) { return (itm.outboundPath == pathOrName || itm.inboundPath == pathOrName); });
	} else {
		return _.find(this.connections, function(itm) { 
			return (
				itm.relationshipName == pathOrName &&
				itm.start.entity.name == startEntityName &&
				itm.end.entity.name == endEntityName
			); 
		});
	}
}

/*//Handler for GET by ID
//handles all GET requests for a node with a specific ID (e.g. GET requests to '/123')
function idGetHandler(req, res) {
	var reqInfo = new RequestInfo(req, res);
	res.send({'id':req.params.id});
}*/

//Handler for node GET
//handles all GET requests for a node with a specific keyvalue (e.g. GET requests to '/songs/123' to find song where key=123
function nodeGetHandler(req, res) {

	var reqInfo = new RequestInfo(req, res);
	
	//get the node
	var neoReq = new NeoRequest(__app.neo4j_url, __app, reqInfo);

	RunBeforeProcessing('read', null, reqInfo).then(function() {
		return neoReq.getIndexedNode(req.params.keyvalue, reqInfo.index);
	}).then(function(s) {
		var nodeData = (s.body && s.body[0] && s.body[0].data ? s.body[0].data : {});
		
		var host = req.protocol + '://' + req.headers.host;
		
		var getRelatedNodeCallParams = [];
		
		//add connection urls to node data
		//create a list of included connections calls
		for(var i in reqInfo.connections) {
			//if(!nodeData.connections) nodeData.connections = {};
			var cObj = reqInfo.connections[i];
			
			//add the url of each connection to the nodeData to be sent to the client
			//nodeData[cObj.urlName] = host + '/' + reqInfo.index + '/' + req.params.keyvalue + '/' + cObj.urlName;
			
			if(_.contains(reqInfo.includes, cObj.urlName)) {
				getRelatedNodeCallParams.push(cObj);
			}
		}

		for(var i in reqInfo.customProperties) {
			var cp = reqInfo.customProperties[i];
			cp.isCustomProperty = true;
			if(_.contains(reqInfo.includes, cp.property)) {
				getRelatedNodeCallParams.push(cp);
			}
		}
		
		//if there are any included connections, get their nodes and add them to the nodeData object
		if(getRelatedNodeCallParams.length > 0) {
			var result = Q.resolve();
			getRelatedNodeCallParams.forEach(function (connObj) {
				result = result.then(function() {
					if(connObj.isCustomProperty) {
						return connObj.fn(reqInfo, neoReq).then(function(data) {
							nodeData[connObj.property] = data;
							return Q.fcall(function() { return nodeData; });
						});
					} else {
						return neoReq.getRelatedNodes(req.params.keyvalue, reqInfo.index, connObj.relationshipName, connObj.dir).then(function(relatedNodes) {
							nodeData[connObj.urlName] = new PagedData(relatedNodes.data, relatedNodes.count, reqInfo);
							return Q.fcall(function() { return nodeData; });
						});
					}
				});
			});
			return result;
		} else {
			return Q.fcall(function() { return nodeData; });
		}
		
	}).then(function(r) {
		return RunAfterProcessing('read', r, reqInfo);
	}).then(function(r) {
		res.send(r);
	}, function(err) {
		res.statusCode = 500;
		res.send(errorResp(err));
	});
}

//Handler for node UPDATE
//handles all PUT requests for a node with a specific keyvalue (e.g. PUT requests to '/songs/123' to update song where key=123
function nodeUpdateHandler(req, res) {
	
	var reqInfo = new RequestInfo(req, res);
	
	//convert key to int
	req.body[reqInfo.keyProperty] = (parseInt(req.params.keyvalue) > 0 ? parseInt(req.params.keyvalue) : req.params.keyvalue); 
	
	//update the requested node
	var neoReq = new NeoRequest(__app.neo4j_url, __app, reqInfo);

	RunBeforeProcessing('update', req.body, reqInfo).then(function(r) {
		return neoReq.updateIndexedNode(r, reqInfo.index);
	}).then(function(r) {
		//respond with successful response
		var nodeData = (r.body && r.body[0] && r.body[0].data ? r.body[0].data : {});
		return RunAfterProcessing('update', nodeData, reqInfo);
	}).then(function(r) {
		res.send(r);
	}, function(err) {
		//respond with an error
		res.statusCode = 500;
		res.send(errorResp(err));
	}).done();
}

//Handler for node DELETE
//handles all DELETE requests for a node with a specific keyvalue (e.g. DELETE requests to '/songs/123' to delete song where key=123
function nodeDeleteHandler(req, res) {
	
	var reqInfo = new RequestInfo(req, res);
	
	//delete the requested node
	var neoReq = new NeoRequest(__app.neo4j_url, __app, reqInfo);

	RunBeforeProcessing('delete', null, reqInfo).then(function() {
		return neoReq.deleteIndexedNode(req.params.keyvalue, reqInfo.index);
	}).then(function(r) {
		return RunAfterProcessing('delete', r, reqInfo);
	}).then(function(r) {
		//respond with successful response
		res.send(true);
	}, function(err) {
		//respond with an error
		res.statusCode = 500;
		res.send(errorResp(err));
	}).done();
}

//Handler for node CREATE
//handles all POST requests to a nodeType's endpoint (e.g. POST requests to '/songs' for creation of a nodeType 'song')
function nodeCreateHandler(req, res) {
	
	var reqInfo = new RequestInfo(req, res);

	if(req.params && req.params.keyvalue) {
		req.body[reqInfo.keyProperty] = req.params.keyvalue;
	}
	
	//create a new node and add it to the index with indexName
	var neoReq = new NeoRequest(__app.neo4j_url, __app, reqInfo);

	var dataToSave;

	RunBeforeProcessing('create', req.body, reqInfo).then(function(r) {
		dataToSave = r;
		return neoReq.createIndexedNode(r, reqInfo.index);
	}).then(function(s) {
		//respond with successful response, containing a service url for accessing the new node
		var host = req.protocol + '://' + req.headers.host;
		var keyvalue = neoReq.getNodeKeyValue(s.body.data, reqInfo.index);
		var r = { 
			"key": keyvalue,
			"data": {}
			//"url": host + '/' + reqInfo.index + '/' + keyvalue
		};
		for(var p in dataToSave) {
			r.data[p] = dataToSave[p];
		}

		//respond with the node data
		//r = s.body.data;

		return RunAfterProcessing('create', r, reqInfo);

	}).then(function(r) {
		res.send(r);
	}, function(err) {
		//respond with an error
		res.statusCode = 500;
		res.send(errorResp(err));
	}).done();
	
}

//Handler for relationship GET
function relationshipGetHandler(req, res) {
		
	var reqInfo = new RequestInfo(req, res);	
	var neoReq = new NeoRequest(__app.neo4j_url, __app, reqInfo);
	
	neoReq.getRelatedNodes(req.params.keyvalue, reqInfo.index, reqInfo.connection.relationshipName, reqInfo.connection.direction).then(function(r) {		
		res.send(new PagedData(r.data, r.count, reqInfo));
	}, function(err) {
		res.statusCode = 500;
		res.send(errorResp(err));
	}).done();
}

//Handler for relationship DELETE
function relationshipDeleteHandler(req, res) {
	var reqInfo = new RequestInfo(req, res);
	
	var neoReq = new NeoRequest(__app.neo4j_url, __app, reqInfo);
	neoReq.deleteRelationship(
		reqInfo.baseEntity.index, 
		reqInfo.baseEntity.keyProperty,
		req.params.keyvalue,
		reqInfo.connectedEntity.index,
		reqInfo.connectedEntity.keyProperty,
		req.params.connectionkeyvalue,
		reqInfo.connection.relationshipName
	).then(function(r) {
		res.send(true);
	}, function(err) {
		res.statusCode = 500;
		res.send(errorResp(err));
	}).done();
}

//Handler for relationship CREATE
//handles all POST requests to a connection endpoint (e.g. POST requests to '/bands/101/members')
function relationshipCreateHandler(req, res) {
		
	var reqInfo = new RequestInfo(req, res);
	var neoReq = new NeoRequest(__app.neo4j_url, __app, reqInfo);
	
	var endNode = ((reqInfo.connection.direction == "out" || reqInfo.connection.direction == "all") ? reqInfo.connection.end : reqInfo.connection.start);
	neoReq.createRelationship(
		reqInfo.index, 
		req.params.keyvalue, 
		endNode.index, 
		req.body, 
		reqInfo.connection.relationshipName, 
		reqInfo.connection.direction
	).then(function(r) {
		res.send({
			connectedEntityKey: r,
			connectedEntityUrl: endNode.index + '/' + r
		});
	}, function(err) {
		res.statusCode = 500;
		res.send(errorResp(err));
	}).done();
}

//gets an entity object from the user defined path string, and entity name if provided
function getEntityFromPath(path, entityName) {
	var entity = { "name":null, "indexName":null, "key":null };
	if(!path) return entity;
	var pathObj = parsePath(path);
	entity.indexName = pathObj.index;
	entity.name = (entityName ? entityName : singularize(pathObj.index));
	entity.key = pathObj.key;
	return entity;
}

//parses a path into it's three parts (index/:key/connection)
//TODO: check format somewhere and throw an error if it doesn't match...
function parsePath(path) {
	var pathRet = {"index":null, "key":null, "connection":null};
	//trim leading slash
	if(path.substr(0,1) == '/') path = path.substr(1, path.length - 1);
	//separate querystring
	var parts = path.split('?');
	
	var segments = parts[0].split('/');
	pathRet.index = segments[0];
	pathRet.key = segments[1];
	pathRet.connection = (segments[2] || null);
	pathRet.connectionKey = (segments[3] || null);
	
	pathRet.query = (parts.length > 1 ? parts[1] : null);
	
	return pathRet;
}

function RequestInfo(req, res) {
	var $this = this;
	
	//parse the request URL
	var pathObj = parsePath(req.url);
	this.index = pathObj.index;
	this.keyValue = pathObj.key;
	this.connection = pathObj.connection;
	this.request = req;
	this.response = res;
	
	this.absoluteUrl = this.request.protocol + '://' + this.request.headers.host + this.request.url;
	
	var ent = _.find(__app.entities, function(itm) {
		return (itm.indexName == $this.index);
	});
	if(ent) {
		this.entityName = ent.name;
		this.keyProperty = ent.key;
		this.baseEntity = new Entity(pathObj.index, ent.key, pathObj.key);
	}
	
	if(pathObj.connection) { // if the request is for a connection
		this.connection = _.find(__app.connections, function(itm) {
			return (
				(itm.start.index == $this.index && itm.start.connection == pathObj.connection) ||
				(itm.end.index == $this.index && itm.end.connection == pathObj.connection)
			);
		});
		if(this.connection) {
			var connectedEntityIndex;
			if(this.connection.start.index == this.connection.end.index) {
				this.connection.direction = "all";
				connectedEntityIndex = this.connection.start.index;
			} else if(this.connection.start.index == this.index) {
				this.connection.direction = "out";
				connectedEntityIndex = this.connection.end.index;
			} else {
				this.connection.direction = "in";
				connectedEntityIndex = this.connection.start.index;
			}
			
			var connEntity = _.find(__app.entities, function(itm) {
				return (itm.indexName == connectedEntityIndex);
			});
			var connectedEntityKeyVal = (req.body && req.body[connEntity.key] ? req.body[connEntity.key] : null);
			if(!connectedEntityKeyVal && pathObj.connectedKey) connectedEntityKeyVal = pathObj.connectedKey;
			
			this.connectedEntity = new Entity(connEntity.indexName, connEntity.key, connectedEntityKeyVal);
		}
	} else { // if the request is for an entity
		//TODO: connections and custom props need to be part of the entity already - no need to do this on every new request
		var conns = _.filter(__app.connections, function(itm) {
			return (itm.start.index == $this.index) || (itm.end.index == $this.index);
		});
		var customProps = _.filter(__app.customProperties, function(itm) {
			return itm.baseEntity.indexName == $this.index;
		});
		//get an array of connections for this node
		this.connections = [];
		for(var i in conns) {
			var c = conns[i];
			var connObj = {
				"urlName": (c.start.index == pathObj.index ? c.start.connection : c.end.connection),
				"relationshipName": c.relationshipName
			}
			var dir = (c.start.index == pathObj.index ? "out" : "in");
			if(c.start.index == c.end.index) dir = "all";
			connObj.dir = dir;
			this.connections.push(connObj);
		}
		//get an array of custom properties for this node
		this.customProperties = [];
		for(var i in customProps) {
			var cp = customProps[i];
			this.customProperties.push(cp);
		}
	} 
	
	//requested connections to include
	this.includes = [];
	if(req.query && req.query.include) this.includes = req.query.include.split(',');
	
	//paging
	if(req.query && req.query.limit) this.limit = parseInt(req.query.limit);
	if(req.query && req.query.skip) this.skip = parseInt(req.query.skip);
	
}

function PagedData(data, count, reqInfo) {
	this.data = data;
	this.count = count;
	if(reqInfo.limit) {
		var url = reqInfo.absoluteUrl.split('?')[0] + '?';
		for(var param in reqInfo.request.query) {
			if(param != 'limit' && param != 'skip') {
				url += param + '=' + reqInfo.request.query[param] + '&';
			}
		}
		var curSkip = reqInfo.skip;
		if(!curSkip) curSkip = 0;
		var nextSkip = (curSkip + reqInfo.limit);
		var prevSkip = (curSkip > 0 ? curSkip - reqInfo.limit : null);
		if(prevSkip < 0) prevSkip = 0;
		var nextPageUrl = url + 'limit=' + reqInfo.limit + '&skip=' + nextSkip;
		var prevPageUrl;
		if(prevSkip || prevSkip == 0) {
			prevPageUrl = url + 'limit=' + reqInfo.limit + (prevSkip ? '&skip=' + prevSkip : '');
		}
		this.paging = {};
		this.paging.next = nextPageUrl;
		if(prevPageUrl) this.paging.previous = prevPageUrl;
	}
}

function RunAfterProcessing(operation, response, reqInfo) {
	return RunProcessing(false, operation, response, reqInfo);
}

function RunBeforeProcessing(operation, response, reqInfo) {
	return RunProcessing(true, operation, response, reqInfo);
}

function RunProcessing(before, operation, response, reqInfo) {
	var d = Q.defer();
	var processStore = (before ? __app.beforeProcessingFns : __app.afterProcessingFns);
	var path = reqInfo.entityName;

	var process = _.filter(processStore, function(itm) {
		return itm.operation == operation && itm.path == path;
	});

	if(!process || process.length == 0) {
		d.resolve(response);
	} else {
		process[0].func(response, reqInfo, __app.neorequest, function() { d.resolve(response); });
	}

	return d.promise;
}

function Entity(index, keyProperty, keyValue) {
	this.index = index;
	this.keyProperty = keyProperty;
	this.keyValue = keyValue;
}

//gets the indexName from a URL
function getIndexNameFromUrl(urlString) {
	var splitUrlPath = url.parse(urlString).pathname.split('/');
	for(var i in splitUrlPath) {
		if(splitUrlPath[i] && splitUrlPath[i] != "") return splitUrlPath[i];
	}
	return null;
}

function singularize(str) {
	var lastChar = str.substr(str.length-1,1);
	return (lastChar == 's' ? str.substr(0, str.length-1) : str);
}

//TODO: switch to turn verbose errors on/off
//Error Response Object
function errorResp(err) {
	return { 
		"error" : err.message,
		"stack" : err.stack
	};
}

