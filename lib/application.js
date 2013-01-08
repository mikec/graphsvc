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
	this.entityRules = [];
	this.connectionRules = [];
	this.neorequest = new NeoRequest(this.neo4j_url);
};

app.entity = function(path, entityName) {
	var entity = getEntityFromPath(path, entityName);
	
	//check if entity has already been added
	var existingEntity = _.find(this.entities, function(itm) { return itm.name == entity.name });
	if(existingEntity) throw new Error("Entity '" + entity.name + "' has already been added!");
	
	this.entities.push(entity);
	this.neorequest.entities = this.entities;
	
	//create routes for...
	//CREATE node
	this.post('/' + entity.indexName, nodeCreateHandler);	
	
	//GET node
	this.get('/' + entity.indexName + '/:keyvalue', nodeGetHandler);		
	
	//UPDATE node
	this.put('/' + entity.indexName + '/:keyvalue', nodeUpdateHandler);
	
	//DELETE node
	this.delete('/' + entity.indexName + '/:keyvalue', nodeDeleteHandler);
	
	return this.entities;	
}

app.connection = function(relationshipName, startPath, endPath) {
	if(!endPath) endPath = startPath;
	
	var startConn = parsePath(startPath);
	var startEntity = _.find(this.entities, function(itm) { return itm.indexName == startConn.index });
	var endConn = parsePath(endPath);
	var endEntity = _.find(this.entities, function(itm) { return itm.indexName == endConn.index });
	
	if(!startEntity) throw new Error("Entity for '" + startConn.index + "' does not exist");
	if(!endEntity) throw new Error("Entity for '" + endConn.index + "' does not exist");
	
	//TODO: check if connection exists, throw an error if it does
	var connection = {"relationshipName": relationshipName, "start": startConn, "end": endConn};
	this.connections.push(connection);
	this.connections.entities = this.connections;
	
	//routes for start entity
	this.post('/' + startConn.index + '/:keyvalue/' + startConn.connection, relationshipCreateHandler);
	this.get('/' + startConn.index + '/:keyvalue/' + startConn.connection, relationshipGetHandler);
	this.delete('/' + startConn.index + '/:keyvalue/' + startConn.connection + '/:connectionkeyvalue', relationshipDeleteHandler);
	
	//routes for end entity
	this.post('/' + endConn.index + '/:keyvalue/' + endConn.connection, relationshipCreateHandler);
	this.get('/' + endConn.index + '/:keyvalue/' + endConn.connection, relationshipGetHandler);
	this.delete('/' + endConn.index + '/:keyvalue/' + endConn.connection + '/:connectionkeyvalue', relationshipDeleteHandler);
	
	return this.connections;
}


app.entityRule = function(method, entityIndexName, func, respondWithError) {
	var rule = {
		method: method,
		index: entityIndexName,
		func: func,
		respondWithError: respondWithError
	};
	this.entityRules.push(rule);
	return this.entityRules;
}

//Handler for node GET
//handles all GET requests for a node with a specific keyvalue (e.g. GET requests to '/songs/123' to find song where key=123
function nodeGetHandler(req, res) {

	var reqInfo = new RequestInfo(req);
	var success = runRules("GET", reqInfo, req, res);
	if(!success) return;
	
	//get the node
	__app.neorequest.getIndexedNode(req.params.keyvalue, reqInfo.index).then(function(s) {
		var nodeData = (s.body && s.body[0] && s.body[0].data ? s.body[0].data : {});
		
		var host = req.protocol + '://' + req.headers.host;
		
		var getRelatedNodeCallParams = [];
		
		//add connection urls to node data
		//create a list of included connections calls
		for(var i in reqInfo.connections) {
			if(!nodeData.connections) nodeData.connections = {};
			var cObj = reqInfo.connections[i];
			nodeData.connections[cObj.urlName] = host + '/' + reqInfo.index + '/' + req.params.keyvalue + '/' + cObj.urlName;
			if(_.contains(reqInfo.includes, cObj.urlName)) {
				getRelatedNodeCallParams.push(cObj);
			}
		}
		
		//if there are any included connections, get their nodes and add them to the nodeData object
		if(getRelatedNodeCallParams.length > 0) {
			var result = Q.resolve();
			getRelatedNodeCallParams.forEach(function (connObj) {
				result = result.then(function() {
					return getRelatedNodes(req.params.keyvalue, reqInfo.index, connObj.relationshipName, connObj.dir).then(function(relatedNodes) {
						nodeData.connections[connObj.urlName] = relatedNodes;
						return Q.fcall(function() { return nodeData; });
					});
				});
			});
			return result;
		} else {
			return Q.fcall(function() { return nodeData; });
		}
		
	}).then(function(r) {
		res.send(r);
	}, function(err) {
		res.send(errorResp(err));
	});
}

//Handler for node UPDATE
//handles all PUT requests for a node with a specific keyvalue (e.g. PUT requests to '/songs/123' to update song where key=123
function nodeUpdateHandler(req, res) {
	
	var reqInfo = new RequestInfo(req);
	var success = runRules("PUT", reqInfo, req, res);
	if(!success) return;
	
	//convert key to int
	req.body[reqInfo.keyProperty] = (parseInt(req.params.keyvalue) > 0 ? parseInt(req.params.keyvalue) : req.params.keyvalue); 
	
	//update the requested node
	__app.neorequest.updateIndexedNode(req.body, reqInfo.index).then(function(s) {
		//respond with successful response
		var nodeData = (s.body && s.body[0] && s.body[0].data ? s.body[0].data : {});
		res.send(nodeData);
	}, function(err) {
		//respond with an error
		res.send(errorResp(err));
	}).done();
}

//Handler for node DELETE
//handles all DELETE requests for a node with a specific keyvalue (e.g. DELETE requests to '/songs/123' to delete song where key=123
function nodeDeleteHandler(req, res) {
	
	var reqInfo = new RequestInfo(req);
	var success = runRules("DELETE", reqInfo, req, res);
	if(!success) return;
	
	//delete the requested node
	__app.neorequest.deleteIndexedNode(req.params.keyvalue, reqInfo.index).then(function(s) {
		//respond with successful response
		res.send(true);
	}, function(err) {
		//respond with an error
		res.send(errorResp(err));
	}).done();
}

//Handler for node CREATE
//handles all POST requests to a nodeType's endpoint (e.g. POST requests to '/songs' for creation of a nodeType 'song')
function nodeCreateHandler(req, res) {
	
	var reqInfo = new RequestInfo(req);
	var success = runRules("POST", reqInfo, req, res);
	if(!success) return;
	
	//create a new node and add it to the index with indexName
	__app.neorequest.createIndexedNode(req.body, reqInfo.index).then(function(s) {
		//respond with successful response, containing a service url for accessing the new node
		var host = req.protocol + '://' + req.headers.host;
		res.send({ 
			"url": host + '/' + reqInfo.index + '/' + __app.neorequest.getNodeKeyValue(req.body, reqInfo.index)
		});
	}, function(err) {
		//respond with an error
		res.send(errorResp(err));
	}).done();
	
}

//Handler for relationship GET
function relationshipGetHandler(req, res) {
		
	var reqInfo = new RequestInfo(req);
	var success = runRules("GET", reqInfo, req, res);
	if(!success) return;
	
	getRelatedNodes(req.params.keyvalue, reqInfo.index, reqInfo.connection.relationshipName, reqInfo.connection.direction).then(function(r) {
		res.send(r);
	}, function(err) {
		res.send(errorResp(err));
	}).done();
}

//Handler for relationship DELETE
function relationshipDeleteHandler(req, res) {
	var reqInfo = new RequestInfo(req);
	var success = runRules("DELETE", reqInfo, req, res);
	if(!success) return;
	
	__app.neorequest.deleteRelationship(
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
		res.send(errorResp(err));
	}).done();
}

//Handler for relationship CREATE
//handles all POST requests to a connection endpoint (e.g. POST requests to '/bands/101/members')
function relationshipCreateHandler(req, res) {
		
	var reqInfo = new RequestInfo(req);
	var success = runRules("POST", reqInfo, req, res);
	if(!success) return;
	
	var endNode = ((reqInfo.connection.direction == "out" || reqInfo.connection.direction == "all") ? reqInfo.connection.end : reqInfo.connection.start);
	__app.neorequest.createRelationship(
		reqInfo.index, 
		req.params.keyvalue, 
		endNode.index, 
		req.body, 
		reqInfo.connection.relationshipName, 
		reqInfo.connection.direction
	).then(function(r) {
		res.send(true);
	}, function(err) {
		res.send(errorResp(err));
	}).done();
}

function getRelatedNodes(nodeKeyValue, nodeIndex, relationshipName, dir) {
	return __app.neorequest.getRelatedNodes(nodeKeyValue, nodeIndex, relationshipName, dir).then(function(r) {
		var nodesWithRelData = [];
		if(r && r.body && r.body.data) {
			for(var i in r.body.data) {
				var d = r.body.data[i];
				var rel = d[0].data;
				var node = d[1].data;
				var numRelProps = 0;
				if(rel) {
					for(var j in rel) numRelProps++;
				}
				if(numRelProps > 0) node.relationship = rel;
				nodesWithRelData.push(node);
			}
		}
		return Q.fcall(function() { return nodesWithRelData });
	});
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

function RequestInfo(req) {
	var $this = this;
	
	//parse the request URL
	var pathObj = parsePath(req.url);
	this.index = pathObj.index;
	this.keyValue = pathObj.key;
	this.connection = pathObj.connection;
	this.query = pathObj.query;
	
	var ent = _.find(__app.entities, function(itm) {
		return (itm.indexName == $this.index);
	});
	this.entityName = ent.name;
	this.keyProperty = ent.key;
	
	this.baseEntity = new Entity(pathObj.index, ent.key, pathObj.key);
	
	/*if(this.connection) this.type = "connection";
	else if(this.keyvalue) this.type = "entity";
	else this.type = "entitySet";*/
	
	if(pathObj.connection) { // if the request is for a connection
		this.connection = _.find(__app.connections, function(itm) {
			return (
				(itm.start.index == $this.index && itm.start.connection == pathObj.connection) ||
				(itm.end.index == $this.index && itm.end.connection == pathObj.connection)
			);
		});
		
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
		
	} else { // if the request is for an entity
		var conns = _.filter(__app.connections, function(itm) {
			return (itm.start.index == $this.index) || (itm.end.index == $this.index);
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
	} 
	
	//requested connections to include
	this.includes = [];
	if(req.query && req.query.include) this.includes = req.query.include.split(',');
}

function runRules(method, reqInfo, req, res) {
	var applicableRules = _.filter(__app.entityRules, function(rule) {
		return (rule.method == method, rule.index == reqInfo.index);
	});
	//run the rules, and pass in all data from the request
	reqInfo.request = req;
	reqInfo.response = res;
	applicableRules.forEach(function(rule) {
		//if the rule throws and error, respond with the error and cancel the request
		try 
		{
			rule.func(reqInfo);
		} 
		catch(err) 
		{
			if(rule.respondWithError) {
				res.send(errorResp(err));
			} else {
				res.send({});
			}
			return false;
		}
	});
	return true;
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

