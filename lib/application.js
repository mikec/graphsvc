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
	this.neorequest = new NeoRequest(this.neo4j_url);
};

app.entity = function(path) {
	var entity = getEntityFromPath(path);
	
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
	this.delete('/' + startConn.index + '/:keyvalue/' + startConn.connection, relationshipDeleteHandler);
	
	//routes for end entity
	this.post('/' + endConn.index + '/:keyvalue/' + endConn.connection, relationshipCreateHandler);
	this.get('/' + endConn.index + '/:keyvalue/' + endConn.connection, relationshipGetHandler);
	this.delete('/' + endConn.index + '/:keyvalue/' + endConn.connection, relationshipDeleteHandler);
	
	return this.connections;
}

//Handler for node GET
//handles all GET requests for a node with a specific keyvalue (e.g. GET requests to '/songs/123' to find song where key=123
function nodeGetHandler(req, res) {

	//parse the index name out of the request URL
	var indexName = getIndexNameFromUrl(req.url);
	
	var conns = _.filter(__app.connections, function(itm) {
		return (itm.start.index == indexName) || (itm.end.index == indexName);
	});
	
	//requested connections to include
	var includes = [];
	if(req.query && req.query.include) includes = req.query.include.split(',');
	
	//get an array of connections for this node
	var connections = [];
	for(var i in conns) {
		var c = conns[i];
		var connObj = {
			"urlName": (c.start.index == indexName ? c.start.connection : c.end.connection),
			"relationshipName": c.relationshipName
		}
		var dir = (c.start.index == pathObj.index ? "out" : "in");
		if(c.start.index == c.end.index) dir = "all";
		connObj.dir = dir;
		connections.push(connObj);
	}
	
	__app.neorequest.getIndexedNode(req.params.keyvalue, indexName).then(function(s) {
		//respond with node data
		var nodeData = (s.body && s.body[0] && s.body[0].data ? s.body[0].data : {});
		
		var host = req.protocol + '://' + req.headers.host;
		
		var funcsForIncludedConns = [];
		
		//add connections to node data
		for(var i in connections) {
			if(!nodeData.connections) nodeData.connections = {};
			var cObj = connections[i];
			nodeData.connections[cObj.urlName] = host + '/' + indexName + '/' + req.params.keyvalue + '/' + cObj.urlName;
			if(_.contains(includes, cObj.urlName)) {
				var f = getRelatedNodes;
				f.connObj = cObj;
				funcsForIncludedConns.push(f);
			}
		}
		
		
		//TODO: seems to be working for one include, but not multiple?  also check includes with no data
		//TODO: also, something is wrong with the direction .. this is only working for users/friends, which is a two way...
		//get nodes for included connections
		if(funcsForIncludedConns.length > 0) {
			var result = Q.resolve();
			funcsForIncludedConns.forEach(function (f) {
				result = result.then(function() {
					return f(req.params.keyvalue, indexName, f.connObj.relationshipName, f.connObj.dir).then(function(relatedNodes) {
						nodeData.connections[f.connObj.urlName] = relatedNodes;
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
		//respond with error
		res.send(errorResp(err));
	});
}

//Handler for node UPDATE
//handles all PUT requests for a node with a specific keyvalue (e.g. PUT requests to '/songs/123' to update song where key=123
function nodeUpdateHandler(req, res) {

	//parse the index name out of the request URL
	var indexName = getIndexNameFromUrl(req.url);
	var entity = _.find(__app.entities, function(itm) { return itm.indexName == indexName; }); 
	req.body[entity.key] = (parseInt(req.params.keyvalue) > 0 ? parseInt(req.params.keyvalue) : req.params.keyvalue); //convert to int if the key is a valid int
	
	//update the requested node
	__app.neorequest.updateIndexedNode(req.body, indexName).then(function(s) {
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

	//parse the index name out of the request URL
	var indexName = getIndexNameFromUrl(req.url);
	
	//delete the requested node
	__app.neorequest.deleteIndexedNode(req.params.keyvalue, indexName).then(function(s) {
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

	//parse the index name out of the request URL
	var indexName = getIndexNameFromUrl(req.url);
	
	//create a new node and add it to the index with indexName
	__app.neorequest.createIndexedNode(req.body, indexName).then(function(s) {
		//respond with successful response, containing a service url for accessing the new node
		var host = req.protocol + '://' + req.headers.host;
		res.send({ 
			"url": host + '/' + indexName + '/' + __app.neorequest.getNodeKeyValue(req.body, indexName)
		});
	}, function(err) {
		//respond with an error
		res.send(errorResp(err));
	}).done();
	
}

//Handler for relationship GET
function relationshipGetHandler(req, res) {
	var pathObj = parsePath(req.url);
	var conn = _.find(__app.connections, function(itm) {
		return (
			(itm.start.index == pathObj.index && itm.start.connection == pathObj.connection) ||
			(itm.end.index == pathObj.index && itm.end.connection == pathObj.connection)
		);
	});
	var dir = (conn.start.index == pathObj.index ? "out" : "in");
	if(conn.start.index == conn.end.index) dir = "all";
	
	getRelatedNodes(pathObj.key, pathObj.index, conn.relationshipName, dir).then(function(r) {
		res.send(r);
	}, function(err) {
		res.send(errorResp(err));
	}).done();
}

//Handler for relationship DELETE
function relationshipDeleteHandler(req, res) {

}

//Handler for relationship CREATE
//handles all POST requests to a connection endpoint (e.g. POST requests to '/bands/101/members')
function relationshipCreateHandler(req, res) {
	var pathObj = parsePath(req.url);
	var conn = _.find(__app.connections, function(itm) {
		return (
			(itm.start.index == pathObj.index && itm.start.connection == pathObj.connection) ||
			(itm.end.index == pathObj.index && itm.end.connection == pathObj.connection)
		);
	});
	var dir = (conn.start.index == pathObj.index ? "out" : "in");
	if(conn.start.index == conn.end.index) dir = "all";
	var endNode = ((dir == "out" || dir == "all") ? conn.end : conn.start);
	__app.neorequest.createRelationship(pathObj.index, pathObj.key, endNode.index, req.body, conn.relationshipName, dir).then(function(r) {
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
	pathObj = parsePath(path);
	entity.indexName = pathObj.index;
	entity.name = (entityName ? entityName : singularize(pathObj.index));
	entity.key = pathObj.key;
	return entity;
}

//parses a path into it's three parts (index/:key/connection)
//TODO: check format somewhere and throw an error if it doesn't match...
function parsePath(path) {
	pathRet = {"index":null, "key":null, "connection":null};
	//trim leading slash
	if(path.substr(0,1) == '/') path = path.substr(1, path.length - 1);
	parts = path.split('/');
	pathRet.index = parts[0];
	pathRet.key = parts[1];
	pathRet.connection = (parts[2] || null);
	return pathRet;
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

//Error Response Object
function errorResp(errMsg) {
	return { "error" : errMsg.toString() };
}

